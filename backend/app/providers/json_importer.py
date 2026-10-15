from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.connection import Connection
from app.models.daily_summary import DailySummary
from app.models.heart_rate import HeartRateSample
from app.models.ingestion_run import IngestionRun
from app.models.participant import Participant
from app.models.raw_record import RawRecord
from app.models.sleep_segment import SleepSegment
from app.models.sleep_session import SleepSession
from app.models.steps import StepInterval
from app.models.study import Study
from app.services.normalization import ams_local_date
from app.schemas.imports import (
    ImportHeartRateSampleV1,
    ImportPayloadV1,
    ImportResultStats,
    ImportSleepSegmentV1,
    ImportSleepSessionV1,
    ImportStepIntervalV1,
    ImportResponse,
)


@dataclass
class ImportContext:
    db: Session
    participant: Participant
    study: Study
    run: IngestionRun
    stats: ImportResultStats = field(default_factory=ImportResultStats)
    errors: List[str] = field(default_factory=list)


def _payload_hash(payload_dict: dict) -> str:
    encoded = json.dumps(payload_dict, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _is_unchanged(ctx: ImportContext, raw_record_id, payload_hash: str) -> bool:
    """True when the stored entity was last written from a payload with this exact hash."""
    if raw_record_id is None:
        return False
    current = (
        ctx.db.query(RawRecord.payload_hash).filter(RawRecord.id == raw_record_id).scalar()
    )
    return current == payload_hash


def _store_raw_record(ctx: ImportContext, resource_key: str, payload_obj: Any, fetched_at, source_updated_at=None) -> RawRecord:
    payload_dict = payload_obj if isinstance(payload_obj, dict) else json.loads(json.dumps(payload_obj, default=str))
    rr = RawRecord(
        run_id=ctx.run.id,
        provider="json_import",
        resource_key=resource_key,
        payload_hash=_payload_hash(payload_dict),
        fetched_at=fetched_at,
        source_updated_at=source_updated_at,
        schema_version="1",
        payload=payload_dict,
    )
    ctx.db.add(rr)
    ctx.db.flush()
    return rr


def _add_segments(ctx: ImportContext, session_id, segments) -> None:
    for seg in segments:
        ctx.db.add(
            SleepSegment(
                sleep_session_id=session_id,
                segment_key=seg.segment_key,
                start_at=seg.start_at,
                end_at=seg.end_at,
                stage_label=seg.stage_label,
                segment_kind=seg.segment_kind,
            )
        )


def upsert_sleep_session(
    ctx: ImportContext,
    s: ImportSleepSessionV1,
    fetched_at,
) -> None:
    existing = (
        ctx.db.query(SleepSession)
        .filter(
            SleepSession.study_id == ctx.study.id,
            SleepSession.provider_session_key == s.provider_session_key,
        )
        .one_or_none()
    )
    payload_dict = s.model_dump(mode="json")
    if existing is not None and _is_unchanged(ctx, existing.raw_record_id, _payload_hash(payload_dict)):
        ctx.stats.sleep_sessions_duplicate += 1
        return
    # Wake date is the study-local calendar date of the end instant (overnight sessions
    # belong to the morning they end on), unless the payload states it explicitly.
    wake_date = s.wake_date or ams_local_date(s.end_at, ctx.study.timezone)
    raw = _store_raw_record(ctx, f"sleep:{s.provider_session_key}", payload_dict, fetched_at)
    if existing is None:
        session = SleepSession(
            study_id=ctx.study.id,
            provider_session_key=s.provider_session_key,
            source_id=s.source_id,
            start_at=s.start_at,
            end_at=s.end_at,
            wake_date=wake_date,
            asleep_seconds=s.asleep_seconds,
            in_bed_seconds=s.in_bed_seconds,
            is_main=bool(s.is_main),
            classification_origin=s.classification_origin,
            raw_record_id=raw.id,
        )
        ctx.db.add(session)
        ctx.db.flush()
        _add_segments(ctx, session.id, s.segments)
    else:
        existing.start_at = s.start_at
        existing.end_at = s.end_at
        existing.wake_date = wake_date
        existing.asleep_seconds = s.asleep_seconds
        existing.in_bed_seconds = s.in_bed_seconds
        existing.is_main = bool(s.is_main)
        existing.classification_origin = s.classification_origin
        existing.raw_record_id = raw.id
        for old in list(existing.segments):
            ctx.db.delete(old)
        ctx.db.flush()
        _add_segments(ctx, existing.id, s.segments)
    ctx.stats.sleep_sessions_upserted += 1


def upsert_heart_rate_sample(
    ctx: ImportContext,
    hr: ImportHeartRateSampleV1,
    fetched_at,
) -> None:
    existing = (
        ctx.db.query(HeartRateSample)
        .filter(
            HeartRateSample.study_id == ctx.study.id,
            HeartRateSample.provider_sample_key == hr.provider_sample_key,
        )
        .one_or_none()
    )
    payload_dict = hr.model_dump(mode="json")
    if existing is not None and _is_unchanged(ctx, existing.raw_record_id, _payload_hash(payload_dict)):
        ctx.stats.heart_rate_samples_duplicate += 1
        return
    raw = _store_raw_record(ctx, f"hr:{hr.provider_sample_key}", payload_dict, fetched_at)
    if existing is None:
        ctx.db.add(
            HeartRateSample(
                study_id=ctx.study.id,
                provider_sample_key=hr.provider_sample_key,
                source_id=hr.source_id,
                observed_at=hr.observed_at,
                bpm=hr.bpm,
                raw_record_id=raw.id,
            )
        )
    else:
        existing.observed_at = hr.observed_at
        existing.bpm = hr.bpm
        existing.raw_record_id = raw.id
    ctx.stats.heart_rate_samples_upserted += 1


def upsert_step_interval(
    ctx: ImportContext,
    si: ImportStepIntervalV1,
    fetched_at,
) -> None:
    existing = (
        ctx.db.query(StepInterval)
        .filter(
            StepInterval.study_id == ctx.study.id,
            StepInterval.provider_interval_key == si.provider_interval_key,
        )
        .one_or_none()
    )
    payload_dict = si.model_dump(mode="json")
    if existing is not None and _is_unchanged(ctx, existing.raw_record_id, _payload_hash(payload_dict)):
        ctx.stats.step_intervals_duplicate += 1
        return
    raw = _store_raw_record(ctx, f"steps:{si.provider_interval_key}", payload_dict, fetched_at)
    if existing is None:
        ctx.db.add(
            StepInterval(
                study_id=ctx.study.id,
                provider_interval_key=si.provider_interval_key,
                source_id=si.source_id,
                start_at=si.start_at,
                end_at=si.end_at,
                step_count=si.step_count,
                raw_record_id=raw.id,
            )
        )
    else:
        existing.start_at = si.start_at
        existing.end_at = si.end_at
        existing.step_count = si.step_count
        existing.raw_record_id = raw.id
    ctx.stats.step_intervals_upserted += 1


def execute_import_transaction(
    db: Session,
    participant: Participant,
    study: Study,
    run: IngestionRun,
    payload: ImportPayloadV1,
) -> Tuple[ImportResultStats, List[str]]:
    ctx = ImportContext(db=db, participant=participant, study=study, run=run)
    fetched_at = run.started_at
    try:
        for s in payload.sleep_sessions:
            upsert_sleep_session(ctx, s, fetched_at)
        for hr in payload.heart_rate_samples:
            upsert_heart_rate_sample(ctx, hr, fetched_at)
        for si in payload.step_intervals:
            upsert_step_interval(ctx, si, fetched_at)
        ctx.db.flush()
    except Exception as exc:  # noqa: BLE001
        ctx.errors.append(f"import_failed: {exc}")
    return ctx.stats, ctx.errors


SUPPORTED_SCHEMA_VERSIONS = {"1", "1.0", "v1"}


def validate_import_json(raw_data: Any) -> Tuple[Optional[ImportPayloadV1], List[str]]:
    errors: List[str] = []
    if not isinstance(raw_data, dict):
        errors.append("JSON root must be an object")
        return None, errors
    raw_sv = raw_data.get("schema_version")
    if raw_sv is None:
        errors.append("Missing required field: schema_version (must be one of: 1)")
        return None, errors
    if str(raw_sv) not in SUPPORTED_SCHEMA_VERSIONS:
        errors.append(
            f"Unsupported schema_version '{raw_sv}'. Supported schema versions: {sorted(SUPPORTED_SCHEMA_VERSIONS)}"
        )
        return None, errors
    try:
        payload = ImportPayloadV1.model_validate(raw_data)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"schema validation error: {exc}")
        return None, errors
    seen_sleep = set()
    for s in payload.sleep_sessions:
        if s.provider_session_key in seen_sleep:
            errors.append(f"Duplicate provider_session_key: {s.provider_session_key}")
        seen_sleep.add(s.provider_session_key)
    seen_hr = set()
    for hr in payload.heart_rate_samples:
        if hr.provider_sample_key in seen_hr:
            errors.append(f"Duplicate provider_sample_key: {hr.provider_sample_key}")
        seen_hr.add(hr.provider_sample_key)
    seen_steps = set()
    for si in payload.step_intervals:
        if si.provider_interval_key in seen_steps:
            errors.append(f"Duplicate provider_interval_key: {si.provider_interval_key}")
        seen_steps.add(si.provider_interval_key)
    if errors:
        return None, errors
    return payload, []
