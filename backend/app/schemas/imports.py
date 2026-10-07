from __future__ import annotations

from datetime import date, datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field, ValidationError, model_validator


class ImportSleepSegmentV1(BaseModel):
    segment_key: str
    start_at: datetime
    end_at: datetime
    stage_label: str
    segment_kind: str = "stage"

    @model_validator(mode="after")
    def check_order(self) -> "ImportSleepSegmentV1":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class ImportSleepSessionV1(BaseModel):
    provider_session_key: str
    source_id: Optional[str] = None
    start_at: datetime
    end_at: datetime
    wake_date: Optional[date] = None
    asleep_seconds: Optional[int] = None
    in_bed_seconds: Optional[int] = None
    is_main: Optional[bool] = None
    classification_origin: str = "provider"
    segments: List[ImportSleepSegmentV1] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_order(self) -> "ImportSleepSessionV1":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        if self.asleep_seconds is not None and self.asleep_seconds < 0:
            raise ValueError("asleep_seconds must be >= 0")
        if self.in_bed_seconds is not None and self.in_bed_seconds < 0:
            raise ValueError("in_bed_seconds must be >= 0")
        return self


class ImportHeartRateSampleV1(BaseModel):
    provider_sample_key: str
    source_id: Optional[str] = None
    observed_at: datetime
    bpm: float

    @model_validator(mode="after")
    def check_bpm(self) -> "ImportHeartRateSampleV1":
        if self.bpm <= 0 or self.bpm > 300:
            raise ValueError("bpm out of realistic range")
        return self


class ImportStepIntervalV1(BaseModel):
    provider_interval_key: str
    source_id: Optional[str] = None
    start_at: datetime
    end_at: datetime
    step_count: int

    @model_validator(mode="after")
    def check(self) -> "ImportStepIntervalV1":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        if self.step_count < 0:
            raise ValueError("step_count must be >= 0")
        return self


class ImportPayloadV1(BaseModel):
    schema_version: str = "1"
    participant_code: str
    generated_at: Optional[datetime] = None
    sleep_sessions: List[ImportSleepSessionV1] = Field(default_factory=list)
    heart_rate_samples: List[ImportHeartRateSampleV1] = Field(default_factory=list)
    step_intervals: List[ImportStepIntervalV1] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_schema_version(self) -> "ImportPayloadV1":
        if self.schema_version != "1":
            raise ValueError("Only schema_version=1 is supported")
        return self


class ImportRequestV1(BaseModel):
    payload: ImportPayloadV1


class ImportResultStats(BaseModel):
    sleep_sessions_upserted: int = 0
    sleep_sessions_duplicate: int = 0
    heart_rate_samples_upserted: int = 0
    heart_rate_samples_duplicate: int = 0
    step_intervals_upserted: int = 0
    step_intervals_duplicate: int = 0


class ImportResponse(BaseModel):
    success: bool
    run_id: Optional[str] = None
    validation_errors: List[str] = Field(default_factory=list)
    stats: ImportResultStats = Field(default_factory=ImportResultStats)
    message: str = ""
