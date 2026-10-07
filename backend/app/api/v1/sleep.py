from __future__ import annotations

from datetime import timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_study_only, parse_date_param
from app.config import settings
from app.models.sleep_session import SleepSession
from app.models.study import Study
from app.schemas.common import FreshnessInfo
from app.schemas.sleep import SleepResponse, SleepSegmentItem, SleepSessionItem
from app.services.analytics import get_last_successful_run, get_study_dates
from app.services.normalization import classify_main_sleep_for_day, compute_sleep_efficiency_pct


router = APIRouter(prefix="/sleep")


@router.get("", response_model=SleepResponse)
def get_sleep_for_date(
    date_param=Depends(parse_date_param),
    db: Session = Depends(get_db),
    study: Study = Depends(get_study_only),
):
    study_dates = get_study_dates(study)
    if date_param not in study_dates:
        raise HTTPException(status_code=400, detail=f"Date {date_param} not in study window")
    sessions = (
        db.query(SleepSession)
        .filter(
            SleepSession.study_id == study.id,
            SleepSession.wake_date == date_param,
        )
        .all()
    )
    main, ordered = classify_main_sleep_for_day(sessions)
    session_items: List[SleepSessionItem] = []
    for s in ordered:
        duration = int((s.end_at - s.start_at).total_seconds())
        asleep = s.asleep_seconds or duration
        efficiency = compute_sleep_efficiency_pct(asleep, s.in_bed_seconds or duration)
        segments = []
        for seg in sorted(s.segments, key=lambda x: x.start_at):
            seg_dur = int((seg.end_at - seg.start_at).total_seconds())
            segments.append(
                SleepSegmentItem(
                    id=str(seg.id),
                    start_at=seg.start_at,
                    end_at=seg.end_at,
                    stage_label=seg.stage_label,
                    segment_kind=seg.segment_kind,
                    duration_seconds=seg_dur,
                )
            )
        session_items.append(
            SleepSessionItem(
                id=str(s.id),
                provider_session_key=s.provider_session_key,
                start_at=s.start_at,
                end_at=s.end_at,
                wake_date=s.wake_date,
                duration_seconds=duration,
                asleep_seconds=s.asleep_seconds,
                in_bed_seconds=s.in_bed_seconds,
                is_main=s.is_main,
                classification_origin=s.classification_origin,
                sleep_efficiency_pct=efficiency,
                segments=segments,
            )
        )

    last_run = get_last_successful_run(db, study)
    freshness = FreshnessInfo(
        last_successful_fetch=last_run.finished_at if last_run else None,
        last_successful_run_id=str(last_run.id) if last_run else None,
        is_stale=last_run is None,
    )
    return SleepResponse(
        schema_version=settings.SCHEMA_VERSION,
        timezone=study.timezone,
        calculation_version=study.calculation_version,
        freshness=freshness,
        date=date_param,
        sessions=session_items,
        total_sessions=len(session_items),
    )
