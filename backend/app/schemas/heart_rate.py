from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from app.schemas.common import BaseResponse


class HeartRateSampleItem(BaseModel):
    id: str
    observed_at: datetime
    bpm: float


class HeartRateBucket(BaseModel):
    bucket_start: datetime
    bucket_end: datetime
    min_bpm: Optional[float] = None
    max_bpm: Optional[float] = None
    mean_bpm: Optional[float] = None
    sample_count: int = 0


class DailyRestingItem(BaseModel):
    date: date
    resting_bpm: Optional[float] = None
    source: str = "provider"


class HeartRateResponse(BaseResponse):
    date: date
    samples: List[HeartRateSampleItem] = Field(default_factory=list)
    buckets: List[HeartRateBucket] = Field(default_factory=list)
    total_samples: int = 0
    daily_resting: Optional[DailyRestingItem] = None
    observed_mean_bpm: Optional[float] = None
    observed_min_bpm: Optional[float] = None
    observed_max_bpm: Optional[float] = None
