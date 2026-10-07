from __future__ import annotations

from datetime import date as _date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_study_only, parse_date_param, parse_week_param
from app.config import settings
from app.models.daily_summary import DailySummary
from app.models.study import Study
from app.schemas.common import FreshnessInfo
from app.schemas.dashboard import (
    ComparisonResponse,
    DailyDashboardItem,
    DailyDashboardResponse,
    FourteenDayPoint,
    HeartRateCard,
    CoverageInfo,
    SleepCard,
    StepsCard,
    WeeklyDashboardResponse,
)
from app.services.analytics import (
    build_fourteen_day_series,
    compute_comparison,
    compute_weekly_summary,
    get_all_summaries,
    get_last_successful_run,
    get_study_dates,
)
from app.services.normalization import seconds_to_hours


router = APIRouter(prefix="/dashboard")


def _card_from_summary(summary: Optional[DailySummary]) -> DailyDashboardItem:
    if summary is None:
        return DailyDashboardItem(
            date=_date.today(),
        )
    sleep_card = SleepCard(
        main_asleep_seconds=summary.main_sleep_seconds,
        main_asleep_hours=seconds_to_hours(summary.main_sleep_seconds),
        total_sleep_seconds=summary.total_sleep_seconds,
        total_sleep_hours=seconds_to_hours(summary.total_sleep_seconds),
        sleep_efficiency_pct=summary.sleep_efficiency_pct,
    )
    steps_card = StepsCard(
        count=summary.steps,
        status=(
            "provisional"
            if summary.is_provisional
            else ("observed" if summary.steps is not None else "missing")
        ),
    )
    hr_card = HeartRateCard(
        resting_bpm=summary.resting_bpm,
        observed_mean_bpm=summary.observed_mean_bpm,
        sample_count=summary.heart_rate_samples,
    )
    cov = summary.coverage_flags or {}
    coverage = CoverageInfo(
        has_sleep=cov.get("has_sleep_main", False),
        has_steps=cov.get("has_steps", False),
        has_heart_rate=cov.get("has_heart_rate", False),
        heart_rate_sample_count=cov.get("heart_rate_sample_count", 0),
    )
    return DailyDashboardItem(
        date=summary.local_date,
        sleep=sleep_card,
        steps=steps_card,
        heart_rate=hr_card,
        coverage=coverage,
        is_provisional=summary.is_provisional,
        data_quality=summary.data_quality,
    )


@router.get("/daily", response_model=DailyDashboardResponse)
def get_daily_dashboard(
    date_param=Depends(parse_date_param),
    db: Session = Depends(get_db),
    study: Study = Depends(get_study_only),
):
    study_dates = get_study_dates(study)
    if date_param not in study_dates:
        raise HTTPException(
            status_code=400,
            detail=f"Date {date_param} not in study window. Valid range: {study_dates[0]} to {study_dates[-1]}",
        )
    summary = (
        db.query(DailySummary)
        .filter(
            DailySummary.study_id == study.id,
            DailySummary.local_date == date_param,
        )
        .one_or_none()
    )
    last_run = get_last_successful_run(db, study)
    freshness = FreshnessInfo(
        last_successful_fetch=last_run.finished_at if last_run else None,
        last_successful_run_id=str(last_run.id) if last_run else None,
        is_stale=last_run is None,
    )
    item = _card_from_summary(summary)
    item.date = date_param
    return DailyDashboardResponse(
        schema_version=settings.SCHEMA_VERSION,
        timezone=study.timezone,
        calculation_version=study.calculation_version,
        freshness=freshness,
        data=item,
    )


@router.get("/weekly", response_model=WeeklyDashboardResponse)
def get_weekly_dashboard(
    week: int = Depends(parse_week_param),
    db: Session = Depends(get_db),
    study: Study = Depends(get_study_only),
):
    days, summary = compute_weekly_summary(db, study, week)
    last_run = get_last_successful_run(db, study)
    freshness = FreshnessInfo(
        last_successful_fetch=last_run.finished_at if last_run else None,
        last_successful_run_id=str(last_run.id) if last_run else None,
        is_stale=last_run is None,
    )
    return WeeklyDashboardResponse(
        schema_version=settings.SCHEMA_VERSION,
        timezone=study.timezone,
        calculation_version=study.calculation_version,
        freshness=freshness,
        week_number=week,
        days=days,
        summary=summary,
    )


@router.get("/comparison", response_model=ComparisonResponse)
def get_comparison(
    db: Session = Depends(get_db),
    study: Study = Depends(get_study_only),
):
    w1, w2, comparisons, study_dates = compute_comparison(db, study)
    last_run = get_last_successful_run(db, study)
    freshness = FreshnessInfo(
        last_successful_fetch=last_run.finished_at if last_run else None,
        last_successful_run_id=str(last_run.id) if last_run else None,
        is_stale=last_run is None,
    )
    return ComparisonResponse(
        schema_version=settings.SCHEMA_VERSION,
        timezone=study.timezone,
        calculation_version=study.calculation_version,
        freshness=freshness,
        week1=w1,
        week2=w2,
        comparisons=comparisons,
        study_dates=study_dates,
    )


@router.get("/overview", response_model=List[FourteenDayPoint])
def get_overview_series(
    db: Session = Depends(get_db),
    study: Study = Depends(get_study_only),
):
    return build_fourteen_day_series(db, study)
