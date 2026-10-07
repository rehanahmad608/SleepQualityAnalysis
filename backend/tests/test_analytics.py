from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session


def test_duplicate_demo_ingestion_idempotent(db_session: Session, study_start):
    from app.services.ingestion import run_demo_ingestion
    from app.models.sleep_session import SleepSession
    from app.models.heart_rate import HeartRateSample
    from app.models.steps import StepInterval

    run1, stats1 = run_demo_ingestion(
        db_session, "P001", study_start, 14, "Europe/Amsterdam", "1", 42
    )
    assert run1.status == "success"
    sleep1 = db_session.query(SleepSession).count()
    hr1 = db_session.query(HeartRateSample).count()
    steps1 = db_session.query(StepInterval).count()
    assert sleep1 > 0 and hr1 > 0

    run2, stats2 = run_demo_ingestion(
        db_session, "P001", study_start, 14, "Europe/Amsterdam", "1", 42
    )
    assert run2.status == "success"
    sleep2 = db_session.query(SleepSession).count()
    hr2 = db_session.query(HeartRateSample).count()
    steps2 = db_session.query(StepInterval).count()
    assert sleep1 == sleep2, f"Duplicate run inflated sleep: {sleep1} -> {sleep2}"
    assert hr1 == hr2, f"Duplicate run inflated HR: {hr1} -> {hr2}"
    assert steps1 == steps2


def test_overnight_wake_date_classification(db_session: Session, study_start):
    from app.services.ingestion import run_demo_ingestion
    from app.models.sleep_session import SleepSession
    from app.models.study import Study

    run_demo_ingestion(db_session, "P001", study_start, 14, "Europe/Amsterdam", "1", 42)
    study = db_session.query(Study).filter_by(start_date=study_start).one()
    sessions = db_session.query(SleepSession).filter_by(study_id=study.id).all()
    for s in sessions:
        assert s.wake_date is not None
        assert s.start_at < s.end_at
        local_wake = s.end_at.astimezone(__import__("pytz").timezone("Europe/Amsterdam")).date()
        assert s.wake_date == local_wake, (
            f"Session {s.id} wake_date mismatch: db={s.wake_date} computed={local_wake}"
        )


def test_missing_values_are_null_not_zero(db_session: Session, study_start):
    from app.services.ingestion import run_demo_ingestion
    from app.models.daily_summary import DailySummary

    run_demo_ingestion(db_session, "P001", study_start, 14, "Europe/Amsterdam", "1", 42)
    day9 = study_start + timedelta(days=8)
    summary = db_session.query(DailySummary).filter_by(local_date=day9).one_or_none()
    assert summary is not None, "Day 9 summary should exist (null fields, not missing row)"
    assert summary.main_sleep_seconds is None, "Missing sleep should be None"
    assert summary.total_sleep_seconds is None
    assert summary.resting_bpm is None
    assert summary.observed_mean_bpm is None
    assert summary.heart_rate_samples == 0


def test_zero_steps_preserved_not_filled(db_session: Session, study_start):
    from app.services.ingestion import run_demo_ingestion
    from app.models.daily_summary import DailySummary

    run_demo_ingestion(db_session, "P001", study_start, 14, "Europe/Amsterdam", "1", 42)
    day5 = study_start + timedelta(days=4)
    summary = db_session.query(DailySummary).filter_by(local_date=day5).one_or_none()
    assert summary is not None
    assert summary.steps == 0, f"Day5 observed zero steps should be 0, got {summary.steps}"
    assert summary.coverage_flags.get("has_steps") is True


def test_weekly_averages_use_valid_counts_not_7(db_session: Session, study_start):
    from app.services.ingestion import run_demo_ingestion
    from app.services.analytics import compute_weekly_summary, compute_comparison
    from app.models.study import Study

    run_demo_ingestion(db_session, "P001", study_start, 14, "Europe/Amsterdam", "1", 42)
    study = db_session.query(Study).filter_by(start_date=study_start).one()
    _, week1 = compute_weekly_summary(db_session, study, 1)
    _, week2 = compute_weekly_summary(db_session, study, 2)

    assert 0 <= week1.valid_step_days <= 7
    assert 0 <= week2.valid_step_days <= 7
    assert week1.valid_sleep_nights <= 7
    assert week2.valid_sleep_nights <= 7

    if week1.valid_step_days > 0:
        assert week1.mean_steps_per_valid_day == pytest.approx(
            week1.total_steps / week1.valid_step_days, rel=0.05
        )

    w1, w2, comparisons, _ = compute_comparison(db_session, study)
    for c in comparisons:
        if c.metric == "mean_steps_per_valid_day":
            assert c.week1_valid_count == w1.valid_step_days
            assert c.week2_valid_count == w2.valid_step_days


def test_percentage_change_suppressed_when_baseline_zero(db_session: Session, study_start):
    from app.services.analytics import compute_comparison
    from app.models.study import Study
    from app.services.ingestion import run_demo_ingestion

    run_demo_ingestion(db_session, "P001", study_start, 14, "Europe/Amsterdam", "1", 42)
    study = db_session.query(Study).filter_by(start_date=study_start).one()
    w1, w2, comparisons, _ = compute_comparison(db_session, study)
    for c in comparisons:
        if c.week1 == 0 and c.week2 == 0:
            continue
        if c.week1 == 0:
            assert c.percentage_change is None, (
                f"{c.metric}: percentage should be None when baseline week1=0"
            )


def test_dst_transition_day_boundaries_correct():
    from app.services.normalization import day_bounds_utc
    # 2026 Amsterdam DST transitions: last Sunday of March and October
    # Testing Oct 25, 2026 (end of DST)
    tz = "Europe/Amsterdam"
    pre_dst = date(2026, 10, 24)
    dst_day = date(2026, 10, 25)
    post_dst = date(2026, 10, 26)
    for d in [pre_dst, dst_day, post_dst]:
        s, e = day_bounds_utc(d, tz)
        assert e > s
        dur = (e - s).total_seconds()
        assert dur in (82800, 86400, 90000), f"Unexpected day length for {d}: {dur}"


def test_fourteen_day_coverage_includes_all_dates(db_session: Session, study_start):
    from app.services.ingestion import run_demo_ingestion
    from app.services.analytics import build_fourteen_day_series, get_study_dates
    from app.models.study import Study

    run_demo_ingestion(db_session, "P001", study_start, 14, "Europe/Amsterdam", "1", 42)
    study = db_session.query(Study).filter_by(start_date=study_start).one()
    dates = get_study_dates(study)
    assert len(dates) == 14
    series = build_fourteen_day_series(db_session, study)
    assert len(series) == 14
    series_dates = [p.date for p in series]
    assert series_dates == dates
    for idx, p in enumerate(series, 1):
        assert p.study_day == idx
        assert p.is_week1 == (1 <= idx <= 7)
        assert p.is_week2 == (8 <= idx <= 14)


def test_study_does_not_exceed_window(db_session: Session, study_start):
    from app.services.ingestion import run_demo_ingestion
    from app.services.analytics import get_study_dates
    from app.models.study import Study

    run_demo_ingestion(db_session, "P001", study_start, 14, "Europe/Amsterdam", "1", 42)
    study = db_session.query(Study).filter_by(start_date=study_start).one()
    dates = get_study_dates(study)
    assert study.end_date_exclusive == study_start + timedelta(days=14)
    assert dates[0] == study_start
    assert dates[-1] == study_start + timedelta(days=13)
