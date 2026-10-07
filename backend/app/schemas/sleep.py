from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from app.schemas.common import BaseResponse


class SleepSegmentItem(BaseModel):
    id: str
    start_at: datetime
    end_at: datetime
    stage_label: str
    segment_kind: str
    duration_seconds: int


class SleepSessionItem(BaseModel):
    id: str
    provider_session_key: str
    start_at: datetime
    end_at: datetime
    wake_date: date
    duration_seconds: int
    asleep_seconds: Optional[int] = None
    in_bed_seconds: Optional[int] = None
    is_main: bool = False
    classification_origin: str = "provider"
    sleep_efficiency_pct: Optional[float] = None
    segments: List[SleepSegmentItem] = Field(default_factory=list)


class SleepResponse(BaseResponse):
    date: date
    sessions: List[SleepSessionItem] = Field(default_factory=list)
    total_sessions: int = 0
