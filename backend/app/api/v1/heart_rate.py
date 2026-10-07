from __future__ import annotations

from datetime import date as _date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_study_only, parse_date_param
from app.config import settings
from app.models.heart_rate import HeartRateSample
from app.models.study import Study
from app.schemas.common import FreshnessInfo
from app.schemas.heart_rate import (
    DailyRestingItem,
    HeartRateBucket,
    HeartRateResponse,
    HeartRateSampleItem,
)
from app.services.analytics import get_last_successful_run, get_study_dates
from app.services.normalization import day_bounds_utc


router = APIRouter(prefix="/heart-rate")


@router.get("", response_model=HeartRateResponse)
def get_heart_rate_for_date(
    date_param=Depends(parse_date_param),
    db: Session = Depends(get_db),
    study: Study = Depends(get_study_only),
):
    study_dates = get_study_dates(study)
    if date_param not in study_dates:
        raise HTTPException(
            status_code=400,
            detail=f"Date {date_param} not in study window",
        )
    day_start_utc, day_end_utc = day_bounds_utc(date_param, study.timezone)
    samples = (
        db.query(HeartRateSample)
        .filter(
            HeartRateSample.study_id == study.id,
            HeartRateSample.observed_at >= day_start_utc,
            HeartRateSample.observed_at < day_end_utc,
        )
        .order_by(HeartRateSample.observed_at.asc())
        .all()
    )
    items: List[HeartRateSampleItem] = []
    buckets = {}
    bpms = []
    for s in samples:
        items.append(
            HeartRateSampleItem(
                id=str(s.id),
                observed_at=s.observed_at,
                bpm=s.bpm,
            )
        )
        bpms.append(s.bpm)
        hour_idx = s.observed_at.astimezone(day_start_utc.tzinfo or _date).replace(
            minute=0, second=0, microsecond=0
        )
        bucket = buckets.setdefault(
            hour_idx,
            HeartRateBucket(
                bucket_start=hour_idx,
                bucket_end=hour_idx.replace(minute=0, second=0, microsecond=0),
                sample_count=0,
            ),
        )
        bucket.sample_count += 1
        bucket.min_bpm = s.bpm if bucket.min_bpm is None else min(bucket.min_bpm, s.bpm)
        bucket.max_bpm = s.bpm if bucket.max_bpm is None else max(bucket.max_bpm, s.bpm)
        bucket.mean_bpm = s.bpm if bucket.mean_bpm is None else bucket.mean_bpm

    for b in buckets.values():
        if b.sample_count > 0:
            b.mean_bpm = round(
                sum(
                    s.bpm
                    for s in samples
                    if s.observed_at.astimezone(day_start_utc.tzinfo or _date).replace(
                        minute=0, second=0, microsecond=0
                    )
                    == b.bucket_start
                )
                / b.sample_count,
                2,
            )
            b.bucket_end = b.bucket_start.replace(minute=59, second=59)

    daily_resting = None
    from app.models.daily_summary import DailySummary
    summary = (
        db.query(DailySummary)
        .filter(
            DailySummary.study_id == study.id,
            DailySummary.local_date == date_param,
        )
        .one_or_none()
    )
    if summary is not None and summary.resting_bpm is not None:
        daily_resting = DailyRestingItem(date=date_param, resting_bpm=summary.resting_bpm)

    observed_mean = round(sum(bpms) / len(bpms), 2) if bpms else None
    observed_min = min(bpms) if bpms else None
    observed_max = max(bpms) if bpms else None

    last_run = get_last_successful_run(db, study)
    freshness = FreshnessInfo(
        last_successful_fetch=last_run.finished_at if last_run else None,
        last_successful_run_id=str(last_run.id) if last_run else None,
        is_stale=last_run is None,
    )
    return HeartRateResponse(
        schema_version=settings.SCHEMA_VERSION,
        timezone=study.timezone,
        calculation_version=study.calculation_version,
        freshness=freshness,
        date=date_param,
        samples=items,
        buckets=sorted(buckets.values(), key=lambda b: b.bucket_start),
        total_samples=len(items),
        daily_resting=daily_resting,
        observed_mean_bpm=observed_mean,
        observed_min_bpm=observed_min,
        observed_max_bpm=observed_max,
    )
