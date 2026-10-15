"""Background sync, import, datetime normalisation and ingestion locking.

Every test runs against its own temporary SQLite file; nothing touches the
development database. No network, no Google Health calls.
"""
from __future__ import annotations

import json
import threading
from datetime import date, datetime, timedelta, timezone
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db.session import Base, get_db
from app.db.types import UTCDateTime, to_utc
from app.models.heart_rate import HeartRateSample
from app.models.ingestion_run import IngestionRun
from app.models.sleep_session import SleepSession
from app.models.study import Study

START = date(2026, 9, 24)
DAYS = 2  # keep demo generation fast


@pytest.fixture()
def temp_db(tmp_path, monkeypatch):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'lifecycle.db'}", connect_args={"check_same_thread": False}
    )
    import app.models  # noqa: F401  register tables

    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr("app.db.session.SessionLocal", factory)
    monkeypatch.setattr(settings, "STUDY_DAYS", DAYS)
    monkeypatch.setattr(settings, "STUDY_START_DATE", START)

    from app.main import app

    def _get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    try:
        yield factory
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


@pytest.fixture()
def client(temp_db) -> TestClient:
    from app.main import app

    return TestClient(app)


def _payload(**over):
    p = {
        "schema_version": "1",
        "participant_code": settings.PARTICIPANT_CODE,
        "sleep_sessions": [
            {
                "provider_session_key": "s1",
                # +02:00 offset: instant is 21:30Z the evening before
                "start_at": "2026-09-24T23:30:00+02:00",
                "end_at": "2026-09-25T07:00:00+02:00",
                "asleep_seconds": 25000,
                "in_bed_seconds": 27000,
                "is_main": True,
                "segments": [
                    {
                        "segment_key": "s1-a",
                        "start_at": "2026-09-24T21:30:00",  # naive == UTC
                        "end_at": "2026-09-24T22:30:00Z",
                        "stage_label": "light",
                    }
                ],
            }
        ],
        "heart_rate_samples": [
            {"provider_sample_key": "h1", "observed_at": "2026-09-24T22:00:00Z", "bpm": 60.0},
            {"provider_sample_key": "h2", "observed_at": "2026-09-25T00:30:00+02:00", "bpm": 62.0},
        ],
        "step_intervals": [
            {
                "provider_interval_key": "p1",
                "start_at": "2026-09-25T08:00:00",
                "end_at": "2026-09-25T08:30:00",
                "step_count": 400,
            }
        ],
    }
    p.update(over)
    return p


def _post_import(client: TestClient, payload: dict):
    return client.post(
        "/api/v1/import",
        files={"file": ("p.json", BytesIO(json.dumps(payload).encode()), "application/json")},
    )


def _runs(factory):
    with factory() as db:
        return db.query(IngestionRun).order_by(IngestionRun.started_at).all()


# --------------------------------------------------------------- datetimes


def test_utc_datetime_type_roundtrips_aware_utc(temp_db):
    from app.services.ingestion import create_ingestion_run, ensure_participant_and_study

    amsterdam_noon = datetime(2026, 7, 1, 12, 0, tzinfo=timezone(timedelta(hours=2)))
    with temp_db() as db:
        _, study = ensure_participant_and_study(db, "P001", START, DAYS)
        run = create_ingestion_run(db, study, "demo")
        run.finished_at = amsterdam_noon
        db.commit()
        rid = run.id
    with temp_db() as db:
        r = db.get(IngestionRun, rid)
        assert r.finished_at.tzinfo is not None
        assert r.finished_at == amsterdam_noon  # same instant
        assert r.finished_at.utcoffset() == timedelta(0)
        assert r.started_at.tzinfo is not None


def test_to_utc_treats_naive_as_utc_and_converts_offsets():
    assert to_utc(datetime(2026, 1, 1, 10, 0)).tzinfo == timezone.utc
    assert to_utc(datetime(2026, 1, 1, 10, 0)).hour == 10
    assert to_utc(datetime(2026, 1, 1, 10, 0, tzinfo=timezone(timedelta(hours=2)))).hour == 8
    assert UTCDateTime().cache_ok


def test_import_with_mixed_naive_and_aware_timestamps(client, temp_db):
    r = _post_import(client, _payload())
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True, body
    assert body["stats"]["sleep_sessions_upserted"] == 1
    with temp_db() as db:
        s = db.query(SleepSession).one()
        assert s.start_at == datetime(2026, 9, 24, 21, 30, tzinfo=timezone.utc)
        assert s.end_at == datetime(2026, 9, 25, 5, 0, tzinfo=timezone.utc)
        assert s.start_at.tzinfo is not None
        # wake date = Amsterdam local date of end_at (07:00 CEST on the 25th)
        assert s.wake_date == date(2026, 9, 25)
        hrs = {h.provider_sample_key: h.observed_at for h in db.query(HeartRateSample)}
        assert hrs["h2"] == datetime(2026, 9, 24, 22, 30, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    "end_utc,expected",
    [
        # CEST (UTC+2): 22:30Z is already 00:30 the next local day
        ("2026-07-01T22:30:00Z", date(2026, 7, 2)),
        # CET (UTC+1): 22:30Z is 23:30 the same local day
        ("2026-01-10T22:30:00Z", date(2026, 1, 10)),
        # night DST ends (2026-10-25 01:00Z): 22:30Z on the 24th is 00:30 CEST on the 25th
        ("2026-10-24T22:30:00Z", date(2026, 10, 25)),
    ],
)
def test_wake_date_uses_amsterdam_calendar_day(client, temp_db, end_utc, expected):
    end = datetime.fromisoformat(end_utc.replace("Z", "+00:00"))
    p = _payload(heart_rate_samples=[], step_intervals=[])
    p["sleep_sessions"] = [
        {
            "provider_session_key": "dst",
            "start_at": (end - timedelta(hours=7)).isoformat(),
            "end_at": end.isoformat(),
            "asleep_seconds": 20000,
            "is_main": True,
        }
    ]
    body = _post_import(client, p).json()
    assert body["success"] is True, body
    with temp_db() as db:
        assert db.query(SleepSession).one().wake_date == expected


# ---------------------------------------------------------- import behaviour


def test_reimport_identical_payload_is_idempotent(client, temp_db):
    first = _post_import(client, _payload()).json()
    second = _post_import(client, _payload()).json()
    assert first["success"] and second["success"]
    assert second["stats"]["sleep_sessions_upserted"] == 0
    assert second["stats"]["sleep_sessions_duplicate"] == 1
    assert second["stats"]["heart_rate_samples_duplicate"] == 2
    assert second["stats"]["step_intervals_duplicate"] == 1
    with temp_db() as db:
        assert db.query(SleepSession).count() == 1
        assert db.query(HeartRateSample).count() == 2


def test_reimport_with_changed_values_updates_record(client, temp_db):
    _post_import(client, _payload())
    changed = _payload()
    changed["heart_rate_samples"][0]["bpm"] = 71.5
    body = _post_import(client, changed).json()
    assert body["success"] is True
    assert body["stats"]["heart_rate_samples_upserted"] == 1
    assert body["stats"]["heart_rate_samples_duplicate"] == 1
    with temp_db() as db:
        h1 = db.query(HeartRateSample).filter_by(provider_sample_key="h1").one()
        assert h1.bpm == 71.5


def test_failed_import_leaves_no_partial_data_and_records_failed_run(client, temp_db, monkeypatch):
    from app.providers import json_importer

    real = json_importer.upsert_heart_rate_sample
    calls = {"n": 0}

    def flaky(ctx, hr, fetched_at):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("disk exploded")
        return real(ctx, hr, fetched_at)

    monkeypatch.setattr(json_importer, "upsert_heart_rate_sample", flaky)
    body = _post_import(client, _payload()).json()
    assert body["success"] is False
    assert any("disk exploded" in e for e in body["validation_errors"])
    with temp_db() as db:
        assert db.query(SleepSession).count() == 0  # rolled back with the failed import
        assert db.query(HeartRateSample).count() == 0
    runs = _runs(temp_db)
    assert [r.status for r in runs] == ["failed"]
    assert runs[0].error_code == "IMPORT_ERRORS"


def test_import_naive_vs_aware_order_check_is_a_validation_error(client):
    p = _payload()
    p["sleep_sessions"][0]["end_at"] = "2026-09-24T21:00:00"  # before start (21:30Z)
    body = _post_import(client, p).json()
    assert body["success"] is False
    assert body["validation_errors"]


# ------------------------------------------------------------------ locking


def _study(factory):
    from app.services.ingestion import ensure_participant_and_study

    with factory() as db:
        _, study = ensure_participant_and_study(db, settings.PARTICIPANT_CODE, START, DAYS)
        db.commit()
        return study.id


def test_second_run_is_refused_while_one_is_active(temp_db):
    from app.services.ingestion import IngestionAlreadyRunning, start_ingestion_run

    sid = _study(temp_db)
    with temp_db() as db:
        study = db.get(Study, sid)
        first = start_ingestion_run(db, study, "demo")
        assert first.status == "running"
    with temp_db() as db:
        study = db.get(Study, sid)
        with pytest.raises(IngestionAlreadyRunning) as e:
            start_ingestion_run(db, study, "import")
        assert e.value.run_id == str(first.id)


def test_stale_run_is_failed_and_lock_released(temp_db):
    from app.services.ingestion import start_ingestion_run

    sid = _study(temp_db)
    with temp_db() as db:
        old = start_ingestion_run(db, db.get(Study, sid), "demo")
        old_id = old.id
        old.started_at = datetime.now(timezone.utc) - timedelta(
            seconds=settings.INGESTION_LOCK_TIMEOUT_SECONDS + 5
        )
        db.commit()
    with temp_db() as db:
        new = start_ingestion_run(db, db.get(Study, sid), "demo")
        assert new.id != old_id
    with temp_db() as db:
        r = db.get(IngestionRun, old_id)
        assert r.status == "failed"
        assert r.error_code == "TIMEOUT"
        assert r.finished_at is not None


def test_concurrent_starts_admit_exactly_one(temp_db):
    from app.services.ingestion import IngestionAlreadyRunning, start_ingestion_run

    sid = _study(temp_db)
    results: list[str] = []
    barrier = threading.Barrier(6)

    def worker():
        with temp_db() as db:
            study = db.get(Study, sid)
            barrier.wait()
            try:
                start_ingestion_run(db, study, "demo")
                results.append("started")
            except IngestionAlreadyRunning:
                results.append("refused")

    threads = [threading.Thread(target=worker) for _ in range(6)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count("started") == 1
    assert results.count("refused") == 5
    assert len([r for r in _runs(temp_db) if r.status == "running"]) == 1


def test_startup_reaper_fails_only_stale_runs(temp_db):
    from app.services.ingestion import reap_stale_runs, start_ingestion_run

    sid = _study(temp_db)
    with temp_db() as db:
        run = start_ingestion_run(db, db.get(Study, sid), "demo")
        assert reap_stale_runs(db) == 0  # fresh run untouched
        run.started_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
        assert reap_stale_runs(db) == 1
        db.commit()
        assert db.get(IngestionRun, run.id).status == "failed"


# --------------------------------------------------------- sync endpoints


def _wait_status(client: TestClient, run_id: str) -> dict:
    # TestClient executes background tasks before returning the response
    r = client.get(f"/api/v1/sync/{run_id}")
    assert r.status_code == 200
    return r.json()


def test_demo_sync_runs_in_its_own_session_and_completes(client, temp_db):
    r = client.post("/api/v1/sync", json={"mode": "demo"})
    assert r.status_code == 202
    run_id = r.json()["run_id"]
    status = _wait_status(client, run_id)
    assert status["status"] == "success", status
    assert status["row_count"] > 0
    assert status["finished_at"] is not None
    assert status["error_code"] is None
    with temp_db() as db:
        assert db.query(SleepSession).count() > 0
        assert db.query(HeartRateSample).count() > 0
    # exactly one run row: the job reused the pre-created run
    assert len(_runs(temp_db)) == 1


def test_repeated_demo_sync_is_idempotent(client, temp_db):
    r1 = client.post("/api/v1/sync", json={"mode": "demo"}).json()["run_id"]
    assert _wait_status(client, r1)["status"] == "success"
    with temp_db() as db:
        before = (db.query(SleepSession).count(), db.query(HeartRateSample).count())
    r2 = client.post("/api/v1/sync", json={"mode": "demo"}).json()["run_id"]
    assert _wait_status(client, r2)["status"] == "success"
    with temp_db() as db:
        assert (db.query(SleepSession).count(), db.query(HeartRateSample).count()) == before


def test_sync_refused_with_409_while_another_run_is_active(client, temp_db):
    from app.services.ingestion import start_ingestion_run

    sid = _study(temp_db)
    with temp_db() as db:
        start_ingestion_run(db, db.get(Study, sid), "demo")
    r = client.post("/api/v1/sync", json={"mode": "demo"})
    assert r.status_code == 409
    assert "already running" in r.json()["detail"]
    imp = _post_import(client, _payload())
    assert imp.status_code == 409


def test_unknown_mode_fails_the_run(client):
    run_id = client.post("/api/v1/sync", json={"mode": "carrier-pigeon"}).json()["run_id"]
    status = _wait_status(client, run_id)
    assert status["status"] == "failed"
    assert status["error_code"] == "UNKNOWN_MODE"


def test_google_health_run_fails_as_not_implemented(client):
    run_id = client.post("/api/v1/sync", json={"mode": "google_health"}).json()["run_id"]
    status = _wait_status(client, run_id)
    assert status["status"] == "failed"
    assert status["error_code"] == "NOT_IMPLEMENTED"


def test_job_exception_is_recorded_not_left_running(client, monkeypatch):
    import app.api.v1.sync as sync_mod

    def boom(*a, **k):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(sync_mod, "run_demo_ingestion", boom)
    run_id = client.post("/api/v1/sync", json={"mode": "demo"}).json()["run_id"]
    status = _wait_status(client, run_id)
    assert status["status"] == "failed"
    assert status["error_code"] == "BACKGROUND_EXCEPTION"
    assert "provider exploded" in status["error_detail"]


def test_job_that_returns_without_finishing_is_aborted(client, monkeypatch):
    import app.api.v1.sync as sync_mod

    monkeypatch.setattr(sync_mod, "run_demo_ingestion", lambda *a, **k: None)
    run_id = client.post("/api/v1/sync", json={"mode": "demo"}).json()["run_id"]
    status = _wait_status(client, run_id)
    assert status["status"] == "failed"
    assert status["error_code"] == "JOB_ABORTED"


def test_sync_status_unknown_and_invalid_ids(client):
    assert client.get("/api/v1/sync/not-a-uuid").status_code == 400
    assert client.get("/api/v1/sync/00000000-0000-0000-0000-000000000000").status_code == 404


# ----------------------------------------------------- SQLite id safety


def test_generated_ids_never_look_numeric_to_sqlite():
    from app.models.base import new_uuid

    for _ in range(2000):
        with pytest.raises(ValueError):
            float(new_uuid().hex)


def test_numeric_looking_uuid_is_corrupted_by_sqlite_but_new_uuid_avoids_it(temp_db):
    """Documents the root cause of the formerly flaky ingestion tests."""
    from sqlalchemy import text

    with temp_db() as db:
        db.execute(text("create table _probe (id UUID)"))
        db.execute(text("insert into _probe values ('1234567890e12345678901234567890')"))
        assert db.execute(text("select typeof(id) from _probe")).scalar() == "real"
