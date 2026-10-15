from __future__ import annotations

import logging
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_participant_and_study
from app.api.v1.participant_data import require_legacy_write
from app.config import settings
from app.db import session as db_session_module
from app.models.ingestion_run import IngestionRun
from app.schemas.sync import (
    SyncMetricStatus,
    SyncStartRequest,
    SyncStartResponse,
    SyncStatusResponse,
)
from app.services.ingestion import (
    IngestionAlreadyRunning,
    fail_run_by_id,
    run_demo_ingestion,
    run_google_health_ingestion,
    start_ingestion_run,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync")


def run_sync_job(
    run_id: UUID,
    mode: str,
    participant_code: str,
    start_date: date,
    study_days: int,
    timezone_str: str,
    calculation_version: str,
) -> None:
    """Background job body.

    Receives only stable identifiers/plain values and opens its own database
    session: the request-scoped session (and every ORM object loaded through
    it) is closed by the time a background task runs. Whatever happens, the
    run ends as success or failed, never left "running".
    """
    db = db_session_module.SessionLocal()
    try:
        try:
            if mode == "demo":
                run_demo_ingestion(
                    db, participant_code, start_date, study_days,
                    timezone_str, calculation_version, run_id=run_id,
                )
            elif mode in ("google", "google_health"):
                run_google_health_ingestion(
                    db, participant_code, start_date, study_days,
                    timezone_str, calculation_version, run_id=run_id,
                )
            else:
                fail_run_by_id(db, run_id, "UNKNOWN_MODE", f"Unknown mode: {mode}")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Sync job %s failed", run_id)
            fail_run_by_id(db, run_id, "BACKGROUND_EXCEPTION", str(exc))
        finally:
            # Safety net: no code path may leave the run in "running".
            fail_run_by_id(db, run_id, "JOB_ABORTED", "Job ended without recording a result.")
    except Exception:  # noqa: BLE001
        logger.exception("Could not record final status for sync job %s", run_id)
    finally:
        db.close()


@router.post("", status_code=202, response_model=SyncStartResponse, dependencies=[Depends(require_legacy_write)])
def start_sync(
    request: SyncStartRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    participant_and_study=Depends(get_current_participant_and_study),
):
    participant, study = participant_and_study
    mode = request.mode or settings.DATA_MODE

    try:
        run = start_ingestion_run(db, study, mode=mode, requested_range={"mode": mode})
    except IngestionAlreadyRunning as exc:
        raise HTTPException(status_code=409, detail=f"Sync already running: run_id={exc.run_id}. "
                            "Wait for it to complete or time out.")

    background_tasks.add_task(
        run_sync_job,
        run.id,
        mode,
        participant.participant_code,
        study.start_date,
        settings.STUDY_DAYS,
        study.timezone,
        study.calculation_version,
    )

    return SyncStartResponse(
        run_id=str(run.id),
        status="accepted",
        started_at=run.started_at,
        message=f"Sync {mode} started in background. Poll GET /api/v1/sync/{run.id} for status.",
    )


def _metric_status(run_status: str) -> str:
    if run_status == "running":
        return "running"
    if run_status == "success":
        return "completed"
    return "failed"


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

    run: Optional[IngestionRun] = (
        db.query(IngestionRun)
        .filter(
            IngestionRun.id == run_uuid,
            IngestionRun.study_id == study.id,
        )
        .one_or_none()
    )
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    metric = _metric_status(run.status)
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
            "sleep": SyncMetricStatus(name="sleep", status=metric),
            "heart_rate": SyncMetricStatus(name="heart_rate", status=metric),
            "steps": SyncMetricStatus(name="steps", status=metric),
        },
    )
