from __future__ import annotations

import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterator, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.models.ingestion_run import IngestionRun
from app.models.participant import Participant
from app.models.study import Study
from app.schemas.imports import ImportPayloadV1, ImportResultStats
from app.services.analytics import rebuild_all_daily_summaries


def ensure_participant_and_study(
    db: Session,
    participant_code: str,
    start_date,
    study_days: int,
    timezone_str: str = "Europe/Amsterdam",
    calculation_version: str = "1",
) -> Tuple[Participant, Study]:
    participant = (
        db.query(Participant)
        .filter(Participant.participant_code == participant_code)
        .one_or_none()
    )
    if participant is None:
        participant = Participant(
            participant_code=participant_code,
            timezone=timezone_str,
        )
        db.add(participant)
        db.flush()

    end_date_exclusive = start_date + timedelta(days=study_days)
    study = (
        db.query(Study)
        .filter(
            Study.participant_id == participant.id,
            Study.start_date == start_date,
            Study.end_date_exclusive == end_date_exclusive,
        )
        .one_or_none()
    )
    if study is None:
        study = Study(
            participant_id=participant.id,
            start_date=start_date,
            end_date_exclusive=end_date_exclusive,
            timezone=timezone_str,
            status="active",
            calculation_version=calculation_version,
        )
        db.add(study)
        db.flush()
    return participant, study


class IngestionAlreadyRunning(Exception):
    """Another ingestion/import run for the same study is still active."""

    def __init__(self, run: IngestionRun):
        self.run_id = str(run.id)
        self.mode = run.mode
        super().__init__(
            f"Ingestion already running: run_id={self.run_id} (mode={self.mode}). "
            "Wait for it to complete or time out."
        )


# Serialises check-then-create within this process. Across processes the study
# row is additionally locked with SELECT ... FOR UPDATE (honoured by PostgreSQL;
# SQLite is single-writer anyway).
_LOCK_GUARD = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def reap_stale_runs(db: Session, study_id: Optional[UUID] = None) -> int:
    """Fail runs that have been "running" longer than the lock timeout.

    A job that died hard (process killed, machine restarted) can never mark
    itself finished; without this it would block new runs forever.
    Does not commit; the caller owns the transaction. Returns the number reaped.
    """
    cutoff = _now() - timedelta(seconds=settings.INGESTION_LOCK_TIMEOUT_SECONDS)
    q = db.query(IngestionRun).filter(
        IngestionRun.status == "running",
        IngestionRun.started_at < cutoff,
    )
    if study_id is not None:
        q = q.filter(IngestionRun.study_id == study_id)
    n = 0
    for run in q.all():
        run.status = "failed"
        run.finished_at = _now()
        run.error_code = "TIMEOUT"
        run.error_detail = (
            f"Run exceeded {settings.INGESTION_LOCK_TIMEOUT_SECONDS}s without finishing; "
            "assumed dead and failed automatically."
        )
        n += 1
    if n:
        db.flush()
    return n


def check_and_acquire_ingestion_lock(db: Session, study: Study) -> Optional[IngestionRun]:
    """Return the active (non-stale) run for the study, or None when free.

    Stale runs are failed first, so a crashed job cannot hold the lock.
    """
    reap_stale_runs(db, study.id)
    return (
        db.query(IngestionRun)
        .filter(IngestionRun.study_id == study.id, IngestionRun.status == "running")
        .order_by(IngestionRun.started_at.desc())
        .first()
    )


def create_ingestion_run(
    db: Session,
    study: Study,
    mode: str,
    requested_range: Optional[Dict[str, Any]] = None,
) -> IngestionRun:
    run = IngestionRun(
        study_id=study.id,
        mode=mode,
        status="running",
        started_at=_now(),
        requested_range=requested_range or {},
        row_count=0,
    )
    db.add(run)
    db.flush()
    return run


@contextmanager
def _exclusive_study(db: Session, study: Study) -> Iterator[None]:
    with _LOCK_GUARD:
        db.query(Study).filter(Study.id == study.id).with_for_update().one()
        yield


def start_ingestion_run(
    db: Session,
    study: Study,
    mode: str,
    requested_range: Optional[Dict[str, Any]] = None,
) -> IngestionRun:
    """Atomically check for an active run and create + commit a new one.

    Raises IngestionAlreadyRunning when another run is active. The run row is
    committed immediately so it is visible to other sessions and survives a
    later rollback of the data written by the run.
    """
    with _exclusive_study(db, study):
        active = check_and_acquire_ingestion_lock(db, study)
        if active is not None:
            exc = IngestionAlreadyRunning(active)
            db.commit()  # persist any stale runs reaped above; releases row lock
            raise exc
        run = create_ingestion_run(db, study, mode=mode, requested_range=requested_range)
        db.commit()
        return run


def finalize_ingestion_run(
    db: Session,
    run: IngestionRun,
    success: bool,
    row_count: int = 0,
    error_code: Optional[str] = None,
    error_detail: Optional[str] = None,
) -> None:
    run.status = "success" if success else "failed"
    run.finished_at = _now()
    run.row_count = row_count
    run.error_code = error_code
    run.error_detail = error_detail
    db.flush()


def fail_run_by_id(db: Session, run_id: UUID, error_code: str, error_detail: str) -> None:
    """Best-effort: mark a still-running run failed in a clean transaction."""
    db.rollback()
    run = db.query(IngestionRun).filter(IngestionRun.id == run_id).one_or_none()
    if run is not None and run.status == "running":
        finalize_ingestion_run(db, run, False, 0, error_code, error_detail[:2000])
        db.commit()


def _obtain_run(
    db: Session,
    study: Study,
    mode: str,
    run_id: Optional[UUID],
    requested_range: Optional[Dict[str, Any]] = None,
) -> IngestionRun:
    """Use the pre-created run of a background job, or acquire the lock and create one."""
    if run_id is None:
        return start_ingestion_run(db, study, mode, requested_range)
    run = db.query(IngestionRun).filter(IngestionRun.id == run_id).one_or_none()
    if run is None:
        raise LookupError(f"Ingestion run {run_id} not found")
    if requested_range:
        run.requested_range = requested_range
    return run


def _apply_payload(
    db: Session,
    participant: Participant,
    study: Study,
    run: IngestionRun,
    payload: ImportPayloadV1,
    daily_resting_lookup: Optional[Dict[str, float]] = None,
) -> ImportResultStats:
    """Import inside a savepoint so a partial failure leaves no partial data behind."""
    from app.providers.json_importer import execute_import_transaction

    savepoint = db.begin_nested()
    stats, errors = execute_import_transaction(db, participant, study, run, payload)
    if errors:
        savepoint.rollback()
        finalize_ingestion_run(db, run, False, 0, "IMPORT_ERRORS", "; ".join(errors)[:2000])
        db.commit()
        return stats
    savepoint.commit()
    rebuild_all_daily_summaries(db, study, daily_resting_lookup)
    total = (
        stats.sleep_sessions_upserted
        + stats.heart_rate_samples_upserted
        + stats.step_intervals_upserted
    )
    finalize_ingestion_run(db, run, True, total)
    db.commit()
    return stats


def run_demo_ingestion(
    db: Session,
    participant_code: str,
    start_date,
    study_days: int,
    timezone_str: str,
    calculation_version: str,
    seed: int = 42,
    run_id: Optional[UUID] = None,
) -> Tuple[IngestionRun, Dict[str, int]]:
    from app.providers.demo_generator import dataset_to_import_payload, generate_demo_dataset

    participant, study = ensure_participant_and_study(
        db, participant_code, start_date, study_days, timezone_str, calculation_version
    )
    run = _obtain_run(
        db,
        study,
        "demo",
        run_id,
        {
            "start_date": start_date.isoformat(),
            "end_date_exclusive": (start_date + timedelta(days=study_days)).isoformat(),
            "seed": seed,
        },
    )
    rid = run.id
    try:
        dataset = generate_demo_dataset(start_date, study_days, timezone_str, seed, participant_code)
        payload = dataset_to_import_payload(dataset, participant_code)
        stats = _apply_payload(db, participant, study, run, payload, dataset.daily_resting_bpm)
        return run, {
            "sleep_upserted": stats.sleep_sessions_upserted,
            "sleep_duplicates": stats.sleep_sessions_duplicate,
            "hr_upserted": stats.heart_rate_samples_upserted,
            "hr_duplicates": stats.heart_rate_samples_duplicate,
            "steps_upserted": stats.step_intervals_upserted,
            "steps_duplicates": stats.step_intervals_duplicate,
        }
    except Exception as exc:  # noqa: BLE001
        fail_run_by_id(db, rid, "EXCEPTION", str(exc))
        raise


def run_import_ingestion(
    db: Session,
    participant_code: str,
    start_date,
    study_days: int,
    timezone_str: str,
    calculation_version: str,
    payload: ImportPayloadV1,
    run_id: Optional[UUID] = None,
) -> Tuple[IngestionRun, ImportResultStats]:
    participant, study = ensure_participant_and_study(
        db, participant_code, start_date, study_days, timezone_str, calculation_version
    )
    run = _obtain_run(db, study, "import", run_id)
    rid = run.id
    try:
        stats = _apply_payload(db, participant, study, run, payload)
        return run, stats
    except Exception as exc:  # noqa: BLE001
        fail_run_by_id(db, rid, "EXCEPTION", str(exc))
        raise


def run_google_health_ingestion(
    db: Session,
    participant_code: str,
    start_date,
    study_days: int,
    timezone_str: str,
    calculation_version: str,
    run_id: Optional[UUID] = None,
) -> IngestionRun:
    """The Google Health provider is not implemented; the run fails with NOT_IMPLEMENTED."""
    from app.providers.google_health import STATUS_NOT_IMPLEMENTED

    participant, study = ensure_participant_and_study(
        db, participant_code, start_date, study_days, timezone_str, calculation_version
    )
    run = _obtain_run(db, study, "google_health", run_id)
    rid = run.id
    fail_run_by_id(
        db,
        rid,
        "NOT_IMPLEMENTED",
        f"Google Health ingestion not available. Adapter status: {STATUS_NOT_IMPLEMENTED}. "
        "Use DATA_MODE=demo or POST /api/v1/import with JSON.",
    )
    return db.query(IngestionRun).filter(IngestionRun.id == rid).one()
