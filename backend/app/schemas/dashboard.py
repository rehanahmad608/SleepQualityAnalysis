from __future__ import annotations

from datetime import date, datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field

from app.schemas.common import BaseResponse, FreshnessInfo


class SleepCard(BaseModel):
    main_asleep_seconds: Optional[int] = None
    main_asleep_hours: Optional[float] = None
    total_sleep_seconds: Optional[int] = None
    total_sleep_hours: Optional[float] = None
    sleep_efficiency_pct: Optional[float] = None
    main_sleep_start: Optional[datetime] = None
    main_sleep_end: Optional[datetime] = None
    is_main_classification_derived: bool = False
    nap_count: int = 0


class StepsCard(BaseModel):
    count: Optional[int] = None
    status: str = "unknown"
    intervals_count: int = 0


class HeartRateCard(BaseModel):
    resting_bpm: Optional[float] = None
    observed_mean_bpm: Optional[float] = None
    sample_count: int = 0
    source_of_resting: str = "provider"


class CoverageInfo(BaseModel):
    has_sleep: bool = False
    has_steps: bool = False
    has_heart_rate: bool = False
    heart_rate_sample_count: int = 0
    step_intervals_count: int = 0
    sleep_sessions_count: int = 0


class DailyDashboardItem(BaseModel):
    date: date
    sleep: SleepCard = Field(default_factory=SleepCard)
    steps: StepsCard = Field(default_factory=StepsCard)
    heart_rate: HeartRateCard = Field(default_factory=HeartRateCard)
    coverage: CoverageInfo = Field(default_factory=CoverageInfo)
    is_provisional: bool = False
    data_quality: str = "unknown"


class DailyDashboardResponse(BaseResponse):
    data: DailyDashboardItem


class WeeklyDayPoint(BaseModel):
    date: date
    study_day: int
    weekday: str
    steps: Optional[int] = None
    main_sleep_seconds: Optional[int] = None
    total_sleep_seconds: Optional[int] = None
    resting_bpm: Optional[float] = None
    observed_mean_bpm: Optional[float] = None
    heart_rate_samples: int = 0
    has_data: bool = False


class WeeklySummary(BaseModel):
    week_number: int
    day_range: List[date]
    total_steps: Optional[int] = None
    mean_steps_per_valid_day: Optional[float] = None
    valid_step_days: int = 0
    mean_main_sleep_per_valid_night_seconds: Optional[int] = None
    mean_main_sleep_per_valid_night_hours: Optional[float] = None
    valid_sleep_nights: int = 0
    mean_resting_bpm: Optional[float] = None
    valid_resting_days: int = 0
    mean_observed_bpm: Optional[float] = None
    valid_observed_days: int = 0
    is_complete: bool = False


class WeeklyDashboardResponse(BaseResponse):
    week_number: int
    days: List[WeeklyDayPoint] = Field(default_factory=list)
    summary: WeeklySummary


class ComparisonSummary(BaseModel):
    metric: str
    week1: Optional[float] = None
    week2: Optional[float] = None
    absolute_change: Optional[float] = None
    percentage_change: Optional[float] = None
    week1_valid_count: int = 0
    week2_valid_count: int = 0
    unit: str = ""
    note: Optional[str] = None


class ComparisonResponse(BaseResponse):
    week1: WeeklySummary
    week2: WeeklySummary
    comparisons: List[ComparisonSummary] = Field(default_factory=list)
    study_dates: List[date] = Field(default_factory=list)


class FourteenDayPoint(BaseModel):
    date: date
    study_day: int
    is_week1: bool
    is_week2: bool
    steps: Optional[int] = None
    main_sleep_hours: Optional[float] = None
    total_sleep_hours: Optional[float] = None
    resting_bpm: Optional[float] = None
    observed_mean_bpm: Optional[float] = None
    heart_rate_samples: int = 0
    has_any_data: bool = False
    is_provisional: bool = False
    data_quality: str = "unknown"
