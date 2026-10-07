from __future__ import annotations

from datetime import datetime, date
from typing import Any, Optional
from pydantic import BaseModel, Field


class FreshnessInfo(BaseModel):
    last_successful_fetch: Optional[datetime] = None
    last_successful_run_id: Optional[str] = None
    data_source: str = "database"
    is_stale: bool = False


class BaseResponse(BaseModel):
    schema_version: str = "1"
    timezone: str = "Europe/Amsterdam"
    calculation_version: str = "1"
    freshness: FreshnessInfo = Field(default_factory=FreshnessInfo)


class PaginationInfo(BaseModel):
    total: int = 0
    page: int = 1
    per_page: int = 100


class DateRange(BaseModel):
    start_date: date
    end_date_exclusive: date
