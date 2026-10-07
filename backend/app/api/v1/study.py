from __future__ import annotations

from datetime import date
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_study_only
from app.config import settings
from app.models.ingestion_run import IngestionRun
from app.models.study import Study
from app.schemas.common import BaseResponse, FreshnessInfo
from app.services.analytics import get_last_successful_run, get_study_dates


router = APIRouter(prefix="/study")


class StudyStatusResponse(BaseResponse):
    participant_code: str
    study_id: str
    start_date: date
    end_date_exclusive: date
    study_days_count: int
    study_dates: List[date]
    timezone: str
    status: str
    calculation_version: str
    data_mode: str
    last_successful_run: Any = None


@router.get("", response_model=StudyStatusResponse)
def get_study(
    db: Session = Depends(get_db),
    study: Study = Depends(get_study_only),
):
    last_run = get_last_successful_run(db, study)
    freshness = FreshnessInfo(
        last_successful_fetch=last_run.finished_at if last_run else None,
        last_successful_run_id=str(last_run.id) if last_run else None,
        data_source=settings.DATA_MODE,
        is_stale=last_run is None,
    )
    dates = get_study_dates(study)
    last_run_info = None
    if last_run is not None:
        last_run_info = {
            "run_id": str(last_run.id),
            "mode": last_run.mode,
            "finished_at": last_run.finished_at,
            "row_count": last_run.row_count,
        }
    return StudyStatusResponse(
        schema_version=settings.SCHEMA_VERSION,
        timezone=study.timezone,
        calculation_version=study.calculation_version,
        freshness=freshness,
        participant_code=settings.PARTICIPANT_CODE,
        study_id=str(study.id),
        start_date=study.start_date,
        end_date_exclusive=study.end_date_exclusive,
        study_days_count=len(dates),
        study_dates=dates,
        status=study.status,
        data_mode=settings.DATA_MODE,
        last_successful_run=last_run_info,
    )
