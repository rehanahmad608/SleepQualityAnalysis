from __future__ import annotations

from typing import Generator, Optional, Tuple

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.models.participant import Participant
from app.models.study import Study
from app.services.ingestion import ensure_participant_and_study


def get_current_participant_and_study(
    db: Session = Depends(get_db),
) -> Tuple[Participant, Study]:
    from datetime import date, timedelta
    start_date = settings.STUDY_START_DATE
    if start_date is None:
        start_date = date(2026, 9, 24)
    participant, study = ensure_participant_and_study(
        db,
        participant_code=settings.PARTICIPANT_CODE,
        start_date=start_date,
        study_days=settings.STUDY_DAYS,
        timezone_str=settings.STUDY_TIMEZONE,
        calculation_version=settings.CALCULATION_VERSION,
    )
    return participant, study


def get_study_only(
    db: Session = Depends(get_db),
    _participant_and_study=Depends(get_current_participant_and_study),
) -> Study:
    _, study = _participant_and_study
    return study


def parse_date_param(
    date_str: str = Query(..., alias="date", description="YYYY-MM-DD"),
) -> "date":
    from datetime import date as _date

    try:
        return _date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {date_str}. Expected YYYY-MM-DD")


def parse_week_param(week: int = Query(1, ge=1, le=2)) -> int:
    return week
