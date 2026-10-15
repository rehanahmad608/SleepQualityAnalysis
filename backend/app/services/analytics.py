from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

import pytz

from app.models.daily_summary import DailySummary
from app.models.heart_rate import HeartRateSample
from app.models.ingestion_run import IngestionRun
from app.models.sleep_session import SleepSession
from app.models.steps import StepInterval
from app.models.study import Study
from app.services.normalization import (
    classify_main_sleep_for_day,
    compute_sleep_efficiency_pct,
    day_bounds_utc,
    mean_or_none,
    seconds_to_hours,
)


STUDY_DAYS_DEFAULT = 14


def get_study_dates(study: Study) -> List[date]:
    dates: List[date] = []
    cursor = study.start_date
    while cursor < study.end_date_exclusive:
        dates.append(cursor)
        cursor += timedelta(days=1)
    return dates


def week_for_study_day(study_day_1based: int) -> Optional[int]:
    if 1 <= study_day_1based <= 7:
        return 1
    if 8 <= study_day_1based <= 14:
        return 2
    return None


def get_last_successful_run(db: Session, study: Study) -> Optional[IngestionRun]:
    return (
        db.query(IngestionRun)
        .filter(
            IngestionRun.study_id == study.id,
            IngestionRun.status == "success",
        )
        .order_by(IngestionRun.finished_at.desc())
        .first()
    )


def _sum_steps_for_day(db: Session, study_id, day_start_utc, day_end_utc) -> Optional[int]:
    rows = db.execute(
        select(func.coalesce(func.sum(StepInterval.step_count), 0)).where(
            StepInterval.study_id == study_id,
            StepInterval.end_at > day_start_utc,
            StepInterval.start_at < day_end_utc,
        )
    ).scalar_one()
    total = int(rows or 0)
    has_any = (
        db.query(StepInterval.id)
        .filter(
            StepInterval.study_id == study_id,
            StepInterval.end_at > day_start_utc,
            StepInterval.start_at < day_end_utc,
        )
        .first()
        is not None
    )
    if not has_any:
        return None
    return total


def _sleep_sessions_for_day(db: Session, study_id, wake_date):
    return (
        db.query(SleepSession)
        .filter(
            SleepSession.study_id == study_id,
            SleepSession.wake_date == wake_date,
        )
        .all()
    )


def _heart_rate_stats_for_day(db: Session, study_id, day_start_utc, day_end_utc):
    samples = (
        db.query(HeartRateSample)
        .filter(
            HeartRateSample.study_id == study_id,
            HeartRateSample.observed_at >= day_start_utc,
            HeartRateSample.observed_at < day_end_utc,
        )
        .all()
    )
    count = len(samples)
    if count == 0:
        return None, None, 0
    bpms = [s.bpm for s in samples]
    mean_bpm = round(sum(bpms) / count, 3)
    return None, mean_bpm, count


def _determine_data_quality(
    steps: Optional[int],
    main_sleep_seconds: Optional[int],
    hr_count: int,
    is_provisional: bool,
) -> str:
    metrics_present = sum([steps is not None, main_sleep_seconds is not None, hr_count > 0])
    if metrics_present == 0:
        return "missing"
    if is_provisional:
        return "provisional"
    if metrics_present == 3 and hr_count >= 200:
        return "good"
    if metrics_present >= 2:
        return "partial"
    return "poor"


def _coverage_flags(steps, sleep_main, hr_count):
    return {
        "has_steps": steps is not None,
        "has_sleep_main": sleep_main is not None,
        "has_heart_rate": hr_count > 0,
        "heart_rate_sample_count": hr_count,
    }


def build_daily_summary(
    db: Session,
    study: Study,
    local_date: date,
    existing_daily_resting: Optional[Dict[str, float]] = None,
) -> DailySummary:
    day_start_utc, day_end_utc = day_bounds_utc(local_date, study.timezone)

    steps = _sum_steps_for_day(db, study.id, day_start_utc, day_end_utc)
    sessions = _sleep_sessions_for_day(db, study.id, local_date)
    main_session, ordered_sessions = classify_main_sleep_for_day(sessions)

    main_sleep_seconds: Optional[int] = None
    total_sleep_seconds: Optional[int] = None
    in_bed_main: Optional[int] = None
    efficiency: Optional[float] = None
    if ordered_sessions:
        asleep_values = [
            (s.asleep_seconds if s.asleep_seconds is not None else int((s.end_at - s.start_at).total_seconds()))
            for s in ordered_sessions
        ]
        total_sleep_seconds = sum(asleep_values)
        if main_session is not None:
            main_sleep_seconds = (
                main_session.asleep_seconds
                if main_session.asleep_seconds is not None
                else int((main_session.end_at - main_session.start_at).total_seconds())
            )
            in_bed_main = main_session.in_bed_seconds or int(
                (main_session.end_at - main_session.start_at).total_seconds()
            )
            efficiency = compute_sleep_efficiency_pct(main_sleep_seconds, in_bed_main)

    resting_bpm, observed_mean, hr_count = _heart_rate_stats_for_day(
        db, study.id, day_start_utc, day_end_utc
    )
    if existing_daily_resting and local_date.isoformat() in existing_daily_resting:
        resting_bpm = existing_daily_resting[local_date.isoformat()]

    # Provisional until the study-local calendar day has fully ended.
    study_today = datetime.now(pytz.timezone(study.timezone)).date()
    is_provisional = local_date >= study_today
    coverage_flags = _coverage_flags(steps, main_sleep_seconds, hr_count)
    data_quality = _determine_data_quality(steps, main_sleep_seconds, hr_count, is_provisional)

    return DailySummary(
        study_id=study.id,
        local_date=local_date,
        steps=steps,
        main_sleep_seconds=main_sleep_seconds,
        total_sleep_seconds=total_sleep_seconds,
        resting_bpm=resting_bpm,
        observed_mean_bpm=observed_mean,
        heart_rate_samples=hr_count,
        sleep_efficiency_pct=efficiency,
        coverage_flags=coverage_flags,
        is_provisional=is_provisional,
        data_quality=data_quality,
        revision=1,
        calculated_at=datetime.now(timezone.utc),
    )


def rebuild_all_daily_summaries(
    db: Session,
    study: Study,
    daily_resting_lookup: Optional[Dict[str, float]] = None,
) -> List[DailySummary]:
    study_dates = get_study_dates(study)
    results: List[DailySummary] = []
    for d in study_dates:
        existing = (
            db.query(DailySummary)
            .filter(
                DailySummary.study_id == study.id,
                DailySummary.local_date == d,
            )
            .one_or_none()
        )
        new_summary = build_daily_summary(db, study, d, daily_resting_lookup)
        if existing is None:
            db.add(new_summary)
            results.append(new_summary)
        else:
            existing.steps = new_summary.steps
            existing.main_sleep_seconds = new_summary.main_sleep_seconds
            existing.total_sleep_seconds = new_summary.total_sleep_seconds
            existing.resting_bpm = new_summary.resting_bpm
            existing.observed_mean_bpm = new_summary.observed_mean_bpm
            existing.heart_rate_samples = new_summary.heart_rate_samples
            existing.sleep_efficiency_pct = new_summary.sleep_efficiency_pct
            existing.coverage_flags = new_summary.coverage_flags
            existing.is_provisional = new_summary.is_provisional
            existing.data_quality = new_summary.data_quality
            existing.revision += 1
            existing.calculated_at = new_summary.calculated_at
            results.append(existing)
    db.flush()
    return results


def get_all_summaries(db: Session, study: Study) -> List[DailySummary]:
    return (
        db.query(DailySummary)
        .filter(DailySummary.study_id == study.id)
        .order_by(DailySummary.local_date.asc())
        .all()
    )


def _safe_count_valid(values):
    return sum(1 for v in values if v is not None)


def _safe_mean(values):
    valid = [v for v in values if v is not None]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 3)


def compute_weekly_summary(db: Session, study: Study, week_number: int):
    from app.schemas.dashboard import WeeklyDayPoint, WeeklySummary

    all_dates = get_study_dates(study)
    summaries = {s.local_date: s for s in get_all_summaries(db, study)}
    study_start = study.start_date
    week_dates: List[date] = []
    for idx, d in enumerate(all_dates):
        study_day = idx + 1
        if week_for_study_day(study_day) == week_number:
            week_dates.append(d)

    points: List[WeeklyDayPoint] = []
    step_values = []
    sleep_main_values = []
    resting_values = []
    observed_values = []
    total_steps = 0
    valid_step_days = 0
    valid_sleep = 0
    valid_rest = 0
    valid_obs = 0

    for d in week_dates:
        study_day = (d - study_start).days + 1
        summary = summaries.get(d)
        p = WeeklyDayPoint(
            date=d,
            study_day=study_day,
            weekday=d.strftime("%A"),
        )
        if summary is not None:
            p.steps = summary.steps
            p.main_sleep_seconds = summary.main_sleep_seconds
            p.total_sleep_seconds = summary.total_sleep_seconds
            p.resting_bpm = summary.resting_bpm
            p.observed_mean_bpm = summary.observed_mean_bpm
            p.heart_rate_samples = summary.heart_rate_samples
            p.has_data = (
                summary.steps is not None
                or summary.main_sleep_seconds is not None
                or summary.heart_rate_samples > 0
            )
            if summary.steps is not None:
                total_steps += summary.steps
                valid_step_days += 1
                step_values.append(summary.steps)
            if summary.main_sleep_seconds is not None:
                valid_sleep += 1
                sleep_main_values.append(summary.main_sleep_seconds)
            if summary.resting_bpm is not None:
                valid_rest += 1
                resting_values.append(summary.resting_bpm)
            if summary.observed_mean_bpm is not None:
                valid_obs += 1
                observed_values.append(summary.observed_mean_bpm)
        points.append(p)

    summary_obj = WeeklySummary(
        week_number=week_number,
        day_range=week_dates,
        total_steps=total_steps if valid_step_days > 0 else None,
        mean_steps_per_valid_day=(round(total_steps / valid_step_days, 2) if valid_step_days > 0 else None),
        valid_step_days=valid_step_days,
        mean_main_sleep_per_valid_night_seconds=(
            int(round(sum(sleep_main_values) / valid_sleep)) if valid_sleep > 0 else None
        ),
        mean_main_sleep_per_valid_night_hours=(
            seconds_to_hours(int(round(sum(sleep_main_values) / valid_sleep))) if valid_sleep > 0 else None
        ),
        valid_sleep_nights=valid_sleep,
        mean_resting_bpm=_safe_mean(resting_values),
        valid_resting_days=valid_rest,
        mean_observed_bpm=_safe_mean(observed_values),
        valid_observed_days=valid_obs,
        is_complete=(
            valid_step_days == 7
            and valid_sleep == 7
            and valid_rest == 7
            and valid_obs == 7
        ),
    )
    return points, summary_obj


def compute_comparison(db: Session, study: Study):
    from app.schemas.dashboard import ComparisonSummary, ComparisonResponse, WeeklySummary

    _, w1 = compute_weekly_summary(db, study, 1)
    _, w2 = compute_weekly_summary(db, study, 2)
    study_dates = get_study_dates(study)

    comparisons: List[ComparisonSummary] = []

    def _cmp(name, v1, v2, unit, c1, c2, note=None):
        abs_change = None
        pct_change = None
        if v1 is not None and v2 is not None:
            abs_change = round(v2 - v1, 3)
            if v1 != 0:
                pct_change = round(100.0 * (v2 - v1) / v1, 2)
            else:
                note = note or "Baseline is zero; percentage change suppressed"
        return ComparisonSummary(
            metric=name,
            week1=v1,
            week2=v2,
            absolute_change=abs_change,
            percentage_change=pct_change,
            week1_valid_count=c1,
            week2_valid_count=c2,
            unit=unit,
            note=note,
        )

    comparisons.append(
        _cmp(
            "mean_steps_per_valid_day",
            w1.mean_steps_per_valid_day,
            w2.mean_steps_per_valid_day,
            "steps/day",
            w1.valid_step_days,
            w2.valid_step_days,
        )
    )
    comparisons.append(
        _cmp(
            "total_steps",
            float(w1.total_steps) if w1.total_steps is not None else None,
            float(w2.total_steps) if w2.total_steps is not None else None,
            "steps",
            w1.valid_step_days,
            w2.valid_step_days,
        )
    )
    comparisons.append(
        _cmp(
            "mean_main_sleep_hours",
            w1.mean_main_sleep_per_valid_night_hours,
            w2.mean_main_sleep_per_valid_night_hours,
            "hours/night",
            w1.valid_sleep_nights,
            w2.valid_sleep_nights,
        )
    )
    comparisons.append(
        _cmp(
            "mean_resting_bpm",
            w1.mean_resting_bpm,
            w2.mean_resting_bpm,
            "bpm",
            w1.valid_resting_days,
            w2.valid_resting_days,
        )
    )
    comparisons.append(
        _cmp(
            "mean_observed_bpm",
            w1.mean_observed_bpm,
            w2.mean_observed_bpm,
            "bpm",
            w1.valid_observed_days,
            w2.valid_observed_days,
        )
    )
    return w1, w2, comparisons, study_dates


def build_fourteen_day_series(db: Session, study: Study):
    from app.schemas.dashboard import FourteenDayPoint

    all_dates = get_study_dates(study)
    summaries = {s.local_date: s for s in get_all_summaries(db, study)}
    series = []
    study_start = study.start_date
    for idx, d in enumerate(all_dates):
        study_day = idx + 1
        week = week_for_study_day(study_day)
        summary = summaries.get(d)
        p = FourteenDayPoint(
            date=d,
            study_day=study_day,
            is_week1=(week == 1),
            is_week2=(week == 2),
        )
        if summary is not None:
            p.steps = summary.steps
            p.main_sleep_hours = seconds_to_hours(summary.main_sleep_seconds)
            p.total_sleep_hours = seconds_to_hours(summary.total_sleep_seconds)
            p.resting_bpm = summary.resting_bpm
            p.observed_mean_bpm = summary.observed_mean_bpm
            p.heart_rate_samples = summary.heart_rate_samples
            p.has_any_data = (
                summary.steps is not None
                or summary.main_sleep_seconds is not None
                or summary.heart_rate_samples > 0
            )
            p.is_provisional = summary.is_provisional
            p.data_quality = summary.data_quality
        series.append(p)
    return series


def build_csv_rows(db: Session, study: Study) -> List[List[Any]]:
    series = build_fourteen_day_series(db, study)
    header = [
        "date",
        "steps",
        "main_sleep_hours",
        "total_sleep_hours",
        "resting_bpm",
        "observed_mean_bpm",
        "heart_rate_samples",
        "is_provisional",
        "data_quality",
    ]
    rows = [header]
    for p in series:
        rows.append([
            p.date.isoformat(),
            "" if p.steps is None else p.steps,
            "" if p.main_sleep_hours is None else p.main_sleep_hours,
            "" if p.total_sleep_hours is None else p.total_sleep_hours,
            "" if p.resting_bpm is None else p.resting_bpm,
            "" if p.observed_mean_bpm is None else p.observed_mean_bpm,
            p.heart_rate_samples,
            "true" if p.is_provisional else "false",
            p.data_quality,
        ])
    return rows
