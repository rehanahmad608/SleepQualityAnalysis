from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class SyncStartRequest(BaseModel):
    mode: str = "google_health"
    force_full_refresh: bool = False


class SyncStartResponse(BaseModel):
    run_id: str
    status: str = "accepted"
    started_at: datetime
    message: str = ""


class SyncMetricStatus(BaseModel):
    name: str
    status: str = "pending"
    rows_upserted: int = 0
    rows_skipped: int = 0
    error: Optional[str] = None


class SyncStatusResponse(BaseModel):
    schema_version: str = "1"
    run_id: str
    mode: str
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    row_count: int = 0
    error_code: Optional[str] = None
    error_detail: Optional[str] = None
    requested_range: Optional[Dict[str, Any]] = None
    metric_statuses: Dict[str, SyncMetricStatus] = Field(default_factory=dict)
