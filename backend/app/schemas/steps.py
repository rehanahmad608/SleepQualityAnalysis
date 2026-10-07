from __future__ import annotations

from datetime import date, datetime
from typing import List
from pydantic import BaseModel, Field

from app.schemas.common import BaseResponse


class StepIntervalItem(BaseModel):
    id: str
    start_at: datetime
    end_at: datetime
    step_count: int
    duration_seconds: int


class HourlySteps(BaseModel):
    hour: int
    steps: int = 0
    intervals_count: int = 0


class StepsResponse(BaseResponse):
    date: date
    intervals: List[StepIntervalItem] = Field(default_factory=list)
    hourly: List[HourlySteps] = Field(default_factory=list)
    total_steps: int = 0
    total_intervals: int = 0
