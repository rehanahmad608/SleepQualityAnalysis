"""PostgreSQL-specific integration checks.

These run ONLY against a disposable local PostgreSQL database supplied through
``TEST_POSTGRES_URL``. They are never executed through SQLite and never against
Supabase: the fixture refuses non-loopback hosts, hosts containing "supabase",
and database names that do not contain "test".

Without ``TEST_POSTGRES_URL`` every test here is SKIPPED, and the skip reason is
"UNVERIFIED" so reports can state these checks were not run.
"""
from __future__ import annotations

import os
import threading
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

pytestmark = pytest.mark.postgres

URL = os.environ.get("TEST_POSTGRES_URL", "")
BACKEND = Path(__file__).resolve().parents[1]


def _guard(url_text: str) -> str:
    url = make_url(url_text)
    host = (url.host or "").lower()
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("TEST_POSTGRES_URL must be a PostgreSQL URL")
    if host not in ("localhost", "127.0.0.1", "::1"):
        raise RuntimeError("TEST_POSTGRES_URL must point at a loopback host")
    if "supabase" in host or "supabase" in url_text.lower():
        raise RuntimeError("Refusing to run PostgreSQL tests against Supabase")
    if "test" not in (url.database or "").lower():
        raise RuntimeError("TEST_POSTGRES_URL database name must contain 'test'")
    return url_text


@pytest.fixture(scope="module")
def pg_engine():
    if not URL:
        pytest.skip("UNVERIFIED: no disposable PostgreSQL available (set TEST_POSTGRES_URL)")
    engine = create_engine(_guard(URL))
    yield engine
    engine.dispose()


@pytest.fixture()
def structured(pg_engine):
    """health_analysis_test schema built from structured_test_schema.sql, emptied each test."""
    sql = (BACKEND / "structured_test_schema.sql").read_text(encoding="utf-8")
    with pg_engine.begin() as conn:
        conn.exec_driver_sql("DROP SCHEMA IF EXISTS health_analysis_test CASCADE")
        conn.exec_driver_sql(sql)
        conn.execute(
            text("INSERT INTO health_analysis_test.participants(participant_code,timezone) VALUES ('P001','Europe/Amsterdam')")
        )
    Session = sessionmaker(bind=pg_engine)
    with Session() as db:
        yield db


def _hr(db, when_utc: datetime, bpm: float, fmt="json", study_date=None):
    local_date = study_date or when_utc.astimezone(timezone(timedelta(hours=2))).date()
    db.execute(
        text(
            f"""INSERT INTO health_analysis_test.heart_rate
            (id, participant_code, source, study_date, observed_at, json_present, csv_present,
             {fmt}_heart_rate_beats_per_minute)
            VALUES (:id,'P001','Fitband',:d,:t,:j,:c,:bpm)"""
        ),
        {"id": str(uuid4()), "d": local_date, "t": when_utc, "j": fmt == "json", "c": fmt == "csv", "bpm": bpm},
    )


def test_structured_schema_applies_with_rls_on_every_table(pg_engine, structured):
    with pg_engine.connect() as conn:
        rows = conn.execute(
            text("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='health_analysis_test'")
        ).all()
    assert len(rows) == 16
    assert all(r.rowsecurity for r in rows)


def test_day_night_filters_use_amsterdam_clock_time(structured):
    from app.services.participant_data import dashboard_data

    base = datetime(2026, 10, 9, tzinfo=timezone.utc)
    # CEST = UTC+2: local 05:30, 06:00, 21:59, 22:00 on 2026-10-09
    for utc_hour, utc_min in ((3, 30), (4, 0), (19, 59), (20, 0)):
        _hr(structured, base.replace(hour=utc_hour, minute=utc_min), 60.0)
    structured.commit()
    day = dashboard_data(structured, "P001", date(2026, 10, 9), date(2026, 10, 9), "json", "day")
    night = dashboard_data(structured, "P001", date(2026, 10, 9), date(2026, 10, 9), "json", "night")
    assert day["summary"]["heart_rate_samples"] == 2
    assert night["summary"]["heart_rate_samples"] == 2


def test_dst_fall_back_date_has_25_hourly_buckets_without_invented_values(structured):
    from app.services.participant_data import dashboard_data

    out = dashboard_data(structured, "P001", date(2026, 10, 25), date(2026, 10, 25), "json", "all")
    trend = out["heart_rate_trend"]
    assert len(trend) == 25
    assert all(p["bpm"] is None and p["samples"] == 0 for p in trend)


def test_json_and_csv_columns_are_selected_independently(structured):
    from app.services.participant_data import dashboard_data

    t = datetime(2026, 10, 9, 10, 0, tzinfo=timezone.utc)
    _hr(structured, t, 61.0, "json")
    _hr(structured, t + timedelta(minutes=1), 80.0, "csv")
    structured.commit()
    js = dashboard_data(structured, "P001", date(2026, 10, 9), date(2026, 10, 9), "json", "all")
    cs = dashboard_data(structured, "P001", date(2026, 10, 9), date(2026, 10, 9), "csv", "all")
    assert js["summary"]["heart_rate_samples"] == 1 and float(js["days"][0]["mean_bpm"]) == 61.0
    assert cs["summary"]["heart_rate_samples"] == 1 and float(cs["days"][0]["mean_bpm"]) == 80.0


def test_jsonb_arrays_and_timestamptz_round_trip(pg_engine, structured):
    from app.services.structured_columns import column_name

    col = "json_" + column_name("sleep.stages")
    instant = datetime(2026, 10, 9, 20, 30, 15, tzinfo=timezone.utc)
    structured.execute(
        text(
            f"""INSERT INTO health_analysis_test.sleep
            (id, participant_code, source, study_date, observed_at, end_at, json_present, csv_present, "{col}")
            VALUES (:id,'P001','Fitband','2026-10-10',:s,:e,true,false, CAST(:stages AS jsonb))"""
        ),
        {"id": str(uuid4()), "s": instant, "e": instant + timedelta(hours=8), "stages": '[{"type":"REM"},{"type":"DEEP"}]'},
    )
    structured.commit()
    row = structured.execute(
        text(f'SELECT observed_at, jsonb_typeof("{col}") AS t, jsonb_array_length("{col}") AS n FROM health_analysis_test.sleep')
    ).one()
    assert row.observed_at == instant
    assert row.observed_at.utcoffset() == timedelta(0)
    assert (row.t, row.n) == ("array", 2)


# ---------------------------------------------------------- legacy schema


@pytest.fixture()
def legacy_tables(pg_engine):
    import app.models  # noqa: F401
    from app.db.session import Base

    Base.metadata.drop_all(bind=pg_engine)
    Base.metadata.create_all(bind=pg_engine)
    yield pg_engine
    Base.metadata.drop_all(bind=pg_engine)


def test_legacy_schema_detection_on_postgresql(legacy_tables):
    from app.services.legacy_schema import clear_cache, legacy_schema_status

    clear_cache()
    assert legacy_schema_status(legacy_tables, use_cache=False)["available"] is True
    with legacy_tables.begin() as conn:
        conn.exec_driver_sql("DROP TABLE daily_summaries")
    status = legacy_schema_status(legacy_tables, use_cache=False)
    assert status["available"] is False
    assert "daily_summaries" in status["missing_tables"]


def test_legacy_ids_are_native_uuid_and_datetimes_are_timestamptz(legacy_tables):
    with legacy_tables.connect() as conn:
        types = dict(
            conn.execute(
                text(
                    "SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_name='ingestion_runs' AND column_name IN ('id','started_at')"
                )
            ).all()
        )
    assert types["id"] == "uuid"
    assert types["started_at"] == "timestamp with time zone"


# ---------------------------------------------------------- locking


def _study(factory):
    from app.config import settings
    from app.services.ingestion import ensure_participant_and_study

    with factory() as db:
        _, study = ensure_participant_and_study(db, settings.PARTICIPANT_CODE, date(2026, 9, 24), 14)
        db.commit()
        return study.id


def test_concurrent_run_starts_admit_exactly_one_on_postgresql(legacy_tables):
    from app.models.study import Study
    from app.services.ingestion import IngestionAlreadyRunning, start_ingestion_run

    factory = sessionmaker(bind=legacy_tables)
    sid = _study(factory)
    results: list[str] = []
    barrier = threading.Barrier(6)

    def worker():
        with factory() as db:
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


def test_study_row_lock_blocks_a_second_session(legacy_tables):
    """SELECT ... FOR UPDATE on the study row really serialises sessions on PostgreSQL."""
    from sqlalchemy.exc import OperationalError

    factory = sessionmaker(bind=legacy_tables)
    sid = _study(factory)
    holder = factory()
    holder.execute(text("SELECT id FROM studies WHERE id = :i FOR UPDATE"), {"i": str(sid)})
    contender = factory()
    try:
        contender.execute(text("SET LOCAL lock_timeout = '500ms'"))
        with pytest.raises(OperationalError):
            contender.execute(text("SELECT id FROM studies WHERE id = :i FOR UPDATE"), {"i": str(sid)})
    finally:
        contender.rollback()
        contender.close()
        holder.rollback()
        holder.close()
