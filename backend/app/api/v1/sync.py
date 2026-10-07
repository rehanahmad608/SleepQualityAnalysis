from __future__ import annotations

from datetime import timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_participant_and_study
from app.config import settings
from app.models.ingestion_run import IngestionRun
from app.models.participant import Participant
from app.models.study import Study
from app.schemas.sync import (
    SyncMetricStatus,
    SyncStartRequest,
    SyncStartResponse,
    SyncStatusResponse,
)


router = APIRouter(prefix="/sync")


def _run_sync_job(db: Session, study: Study, participant: Participant, mode: str, run_id: UUID):
    from app.services.ingestion import run_demo_ingestion, run_google_health_ingestion, finalize_ingestion_run
    from datetime import date, timedelta
    import datetime as _dt

    start_date = study.start_date
    study_days = settings.STUDY_DAYS

    try:
        with db.begin_nested():
            if mode == "demo":
                run_demo_ingestion(
                    db,
                    participant.participant_code,
                    start_date,
                    study_days,
                    study.timezone,
                    study.calculation_version,
                )
            elif mode == "google" or mode == "google_health":
                run_google_health_ingestion(
                    db,
                    participant.participant_code,
                    start_date,
                    study_days,
                    study.timezone,
                    study.calculation_version,
                )
            else:
                run = db.query(IngestionRun).filter(IngestionRun.id == run_id).one_or_none()
                if run is not None:
                    finalize_ingestion_run(db, run, False, 0, "UNKNOWN_MODE", f"Unknown mode: {mode}")
                db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        run = db.query(IngestionRun).filter(IngestionRun.id == run_id).one_or_none()
        if run is not None:
            finalize_ingestion_run(db, run, False, 0, "BACKGROUND_EXCEPTION", str(exc))
            db.commit()


@router.post("", status_code=202, response_model=SyncStartResponse)
def start_sync(
    request: SyncStartRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    participant_and_study=Depends(get_current_participant_and_study),
):
    participant, study = participant_and_study
    from app.services.ingestion import create_ingestion_run, check_and_acquire_ingestion_lock

    existing = check_and_acquire_ingestion_lock(db, study)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Sync already running: run_id={existing.id}. Wait for it to complete or time out.",
        )

    mode = request.mode or settings.DATA_MODE
    run = create_ingestion_run(db, study, mode=mode)
    db.commit()

    background_tasks.add_task(_run_sync_job, db, study, participant, mode, run.id)

    return SyncStartResponse(
        run_id=str(run.id),
        status="accepted",
        started_at=run.started_at,
        message=f"Sync {mode} started in background. Poll GET /api/v1/sync/{run.id} for status.",
    )


@router.get("/{run_id}", response_model=SyncStatusResponse)
def get_sync_status(
    run_id: str,
    db: Session = Depends(get_db),
    participant_and_study=Depends(get_current_participant_and_study),
):
    _, study = participant_and_study
    try:
        run_uuid = UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid run_id format: {run_id}")

    run = (
        db.query(IngestionRun)
        .filter(
            IngestionRun.id == run_uuid,
            IngestionRun.study_id == study.id,
        )
        .one_or_none()
    )
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    return SyncStatusResponse(
        schema_version=settings.SCHEMA_VERSION,
        run_id=str(run.id),
        mode=run.mode,
        status=run.status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        row_count=run.row_count,
        error_code=run.error_code,
        error_detail=run.error_detail,
        requested_range=run.requested_range,
        metric_statuses={
            "sleep": SyncMetricStatus(name="sleep", status="completed"),
            "heart_rate": SyncMetricStatus(name="heart_rate", status="completed"),
            "steps": SyncMetricStatus(name="steps", status="completed"),
        },
    )
