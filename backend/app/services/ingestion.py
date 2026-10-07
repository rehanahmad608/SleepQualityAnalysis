from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple
from uuid import uuid4

from sqlalchemy import and_
from sqlalchemy.orm import Session

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


def check_and_acquire_ingestion_lock(db: Session, study: Study) -> Optional[IngestionRun]:
    active_run = (
        db.query(IngestionRun)
        .filter(
            IngestionRun.study_id == study.id,
            IngestionRun.status == "running",
        )
        .order_by(IngestionRun.started_at.desc())
        .first()
    )
    if active_run is not None:
        age_seconds = (datetime.now(timezone.utc) - active_run.started_at).total_seconds()
        if age_seconds < 3600:
            return None
        active_run.status = "abandoned"
        active_run.finished_at = datetime.now(timezone.utc)
        active_run.error_code = "TIMEOUT"
        db.flush()
    return None


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
        started_at=datetime.now(timezone.utc),
        requested_range=requested_range or {},
        row_count=0,
    )
    db.add(run)
    db.flush()
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
    run.finished_at = datetime.now(timezone.utc)
    run.row_count = row_count
    run.error_code = error_code
    run.error_detail = error_detail
    db.flush()


def run_demo_ingestion(
    db: Session,
    participant_code: str,
    start_date,
    study_days: int,
    timezone_str: str,
    calculation_version: str,
    seed: int = 42,
) -> Tuple[IngestionRun, Dict[str, int]]:
    from app.providers.demo_generator import (
        dataset_to_import_payload,
        generate_demo_dataset,
    )
    from app.providers.json_importer import execute_import_transaction

    participant, study = ensure_participant_and_study(
        db, participant_code, start_date, study_days, timezone_str, calculation_version
    )
    check_and_acquire_ingestion_lock(db, study)
    run = create_ingestion_run(
        db,
        study,
        mode="demo",
        requested_range={
            "start_date": start_date.isoformat(),
            "end_date_exclusive": (start_date + timedelta(days=study_days)).isoformat(),
            "seed": seed,
        },
    )
    try:
        dataset = generate_demo_dataset(start_date, study_days, timezone_str, seed, participant_code)
        payload = dataset_to_import_payload(dataset, participant_code)
        stats, errors = execute_import_transaction(db, participant, study, run, payload)
        rebuild_all_daily_summaries(db, study, dataset.daily_resting_bpm)
        total_rows = (
            stats.sleep_sessions_upserted
            + stats.heart_rate_samples_upserted
            + stats.step_intervals_upserted
        )
        if errors:
            finalize_ingestion_run(db, run, False, total_rows, "IMPORT_ERRORS", "; ".join(errors))
        else:
            finalize_ingestion_run(db, run, True, total_rows)
        db.commit()
        return run, {
            "sleep_upserted": stats.sleep_sessions_upserted,
            "sleep_duplicates": stats.sleep_sessions_duplicate,
            "hr_upserted": stats.heart_rate_samples_upserted,
            "hr_duplicates": stats.heart_rate_samples_duplicate,
            "steps_upserted": stats.step_intervals_upserted,
            "steps_duplicates": stats.step_intervals_duplicate,
        }
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        run2 = db.query(IngestionRun).filter(IngestionRun.id == run.id).one_or_none()
        if run2 is not None:
            finalize_ingestion_run(db, run2, False, 0, "EXCEPTION", str(exc))
            db.commit()
        raise


def run_import_ingestion(
    db: Session,
    participant_code: str,
    start_date,
    study_days: int,
    timezone_str: str,
    calculation_version: str,
    payload: ImportPayloadV1,
) -> Tuple[IngestionRun, ImportResultStats]:
    from app.providers.json_importer import execute_import_transaction

    participant, study = ensure_participant_and_study(
        db, participant_code, start_date, study_days, timezone_str, calculation_version
    )
    check_and_acquire_ingestion_lock(db, study)
    run = create_ingestion_run(db, study, mode="import")
    try:
        stats, errors = execute_import_transaction(db, participant, study, run, payload)
        rebuild_all_daily_summaries(db, study)
        total_rows = (
            stats.sleep_sessions_upserted
            + stats.heart_rate_samples_upserted
            + stats.step_intervals_upserted
        )
        if errors:
            finalize_ingestion_run(db, run, False, total_rows, "IMPORT_ERRORS", "; ".join(errors))
        else:
            finalize_ingestion_run(db, run, True, total_rows)
        db.commit()
        return run, stats
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        run2 = db.query(IngestionRun).filter(IngestionRun.id == run.id).one_or_none()
        if run2 is not None:
            finalize_ingestion_run(db, run2, False, 0, "EXCEPTION", str(exc))
            db.commit()
        raise


def run_google_health_ingestion(
    db: Session,
    participant_code: str,
    start_date,
    study_days: int,
    timezone_str: str,
    calculation_version: str,
) -> IngestionRun:
    participant, study = ensure_participant_and_study(
        db, participant_code, start_date, study_days, timezone_str, calculation_version
    )
    check_and_acquire_ingestion_lock(db, study)
    run = create_ingestion_run(db, study, mode="google_health")
    try:
        from app.providers.google_health import STATUS_NOT_IMPLEMENTED, create_adapter_from_settings
        adapter = create_adapter_from_settings()
        raise NotImplementedError(
            f"Google Health ingestion not available. Adapter status: {STATUS_NOT_IMPLEMENTED}. "
            f"Use DATA_MODE=demo or POST /api/v1/import with JSON."
        )
    except Exception as exc:  # noqa: BLE001
        finalize_ingestion_run(db, run, False, 0, "NOT_IMPLEMENTED", str(exc))
        db.commit()
        return run
