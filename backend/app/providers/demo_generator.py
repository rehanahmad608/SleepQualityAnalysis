from __future__ import annotations

import hashlib
import json
import random
from datetime import date, datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import pytz

from app.schemas.imports import (
    ImportHeartRateSampleV1,
    ImportPayloadV1,
    ImportSleepSegmentV1,
    ImportSleepSessionV1,
    ImportStepIntervalV1,
)


AMSTERDAM = pytz.timezone("Europe/Amsterdam")
SLEEP_STAGES = ["light", "deep", "rem", "awake"]
STAGE_DISTRIBUTION = [("deep", 0.15), ("light", 0.50), ("rem", 0.25), ("awake", 0.10)]


def _to_utc(dt_ams: datetime) -> datetime:
    if dt_ams.tzinfo is None:
        dt_ams = AMSTERDAM.localize(dt_ams)
    return dt_ams.astimezone(timezone.utc)


def _ams_midnight(d: date) -> datetime:
    return AMSTERDAM.localize(datetime.combine(d, datetime.min.time()))


@dataclass
class DemoDay:
    study_day: int
    local_date: date
    has_sleep: bool = True
    has_heart_rate: bool = True
    has_steps: bool = True
    has_nap: bool = False
    observed_zero_steps: bool = False


@dataclass
class SyntheticDataset:
    start_date: date
    study_days: int
    timezone_str: str
    sleep_sessions: List[ImportSleepSessionV1] = field(default_factory=list)
    heart_rate_samples: List[ImportHeartRateSampleV1] = field(default_factory=list)
    step_intervals: List[ImportStepIntervalV1] = field(default_factory=list)
    daily_resting_bpm: dict = field(default_factory=dict)


def _generate_sleep_stages(
    rng: random.Random,
    start_utc: datetime,
    end_utc: datetime,
    prefix: str,
) -> Tuple[List[ImportSleepSegmentV1], int]:
    total_seconds = int((end_utc - start_utc).total_seconds())
    asleep_seconds = int(total_seconds * rng.uniform(0.88, 0.96))
    segments: List[ImportSleepSegmentV1] = []
    cursor = start_utc
    idx = 0
    remaining = total_seconds
    while remaining > 0:
        stage_label = rng.choices(
            [s for s, _ in STAGE_DISTRIBUTION],
            weights=[w for _, w in STAGE_DISTRIBUTION],
            k=1,
        )[0]
        min_seg = 300 if stage_label != "awake" else 60
        max_seg = 3600 if stage_label != "awake" else 900
        seg_secs = min(rng.randint(min_seg, max_seg), remaining)
        seg_end = cursor + timedelta(seconds=seg_secs)
        segments.append(
            ImportSleepSegmentV1(
                segment_key=f"{prefix}-seg-{idx}",
                start_at=cursor,
                end_at=seg_end,
                stage_label=stage_label,
                segment_kind="stage" if stage_label != "awake" else "awakening",
            )
        )
        cursor = seg_end
        remaining -= seg_secs
        idx += 1
    return segments, asleep_seconds


def _build_sleep_session(
    rng: random.Random,
    study_day: int,
    wake_date_ams: date,
    is_main: bool,
    nap_day: bool,
    seed_offset: int,
) -> ImportSleepSessionV1:
    prefix = f"demo-sleep-d{study_day}-{'main' if is_main else 'nap'}"
    if is_main:
        start_hour = rng.uniform(21.5, 24.5)
        if start_hour >= 24:
            start_hour -= 24
            start_date_ams = wake_date_ams
        else:
            start_date_ams = wake_date_ams - timedelta(days=1)
        start_min = int((start_hour - int(start_hour)) * 60)
        start_dt_ams = AMSTERDAM.localize(
            datetime.combine(start_date_ams, datetime.min.time())
            + timedelta(hours=int(start_hour), minutes=start_min)
        )
        main_hours = rng.uniform(6.2, 8.4)
        end_dt_ams = start_dt_ams + timedelta(hours=main_hours)
    else:
        nap_start_hour = rng.uniform(13.0, 16.0)
        nap_date_ams = wake_date_ams if nap_day else wake_date_ams
        start_min = int((nap_start_hour - int(nap_start_hour)) * 60)
        start_dt_ams = AMSTERDAM.localize(
            datetime.combine(nap_date_ams, datetime.min.time())
            + timedelta(hours=int(nap_start_hour), minutes=start_min)
        )
        nap_hours = rng.uniform(0.4, 1.2)
        end_dt_ams = start_dt_ams + timedelta(hours=nap_hours)

    start_utc = start_dt_ams.astimezone(timezone.utc)
    end_utc = end_dt_ams.astimezone(timezone.utc)
    segments, asleep_seconds = _generate_sleep_stages(rng, start_utc, end_utc, prefix)
    in_bed_seconds = int((end_utc - start_utc).total_seconds())
    return ImportSleepSessionV1(
        provider_session_key=prefix,
        source_id=f"src-{prefix}",
        start_at=start_utc,
        end_at=end_utc,
        wake_date=wake_date_ams,
        asleep_seconds=asleep_seconds,
        in_bed_seconds=in_bed_seconds,
        is_main=is_main,
        classification_origin="provider",
        segments=segments,
    )


def _generate_heart_rate_for_day(
    rng: random.Random,
    local_date: date,
    study_day: int,
    resting_bpm: float,
) -> Tuple[List[ImportHeartRateSampleV1], float]:
    samples: List[ImportHeartRateSampleV1] = []
    midnight = _ams_midnight(local_date)
    observed_sum = 0.0
    observed_count = 0
    for minute in range(0, 24 * 60, rng.choice([1, 2, 5])):
        t_ams = midnight + timedelta(minutes=minute)
        hour = minute / 60.0
        if 0 <= hour < 7:
            bpm = resting_bpm + rng.uniform(-3, 5)
        elif 7 <= hour < 9 or 17 <= hour < 19:
            bpm = rng.uniform(90, 140) if rng.random() < 0.7 else resting_bpm + rng.uniform(10, 30)
        else:
            active_prob = 0.25
            if rng.random() < active_prob:
                bpm = rng.uniform(85, 125)
            else:
                bpm = resting_bpm + rng.uniform(8, 22)
        observed_sum += bpm
        observed_count += 1
        sample_key = f"demo-hr-d{study_day}-m{minute}"
        samples.append(
            ImportHeartRateSampleV1(
                provider_sample_key=sample_key,
                source_id=f"src-{sample_key}",
                observed_at=t_ams.astimezone(timezone.utc),
                bpm=round(bpm, 1),
            )
        )
    mean_observed = observed_sum / observed_count if observed_count else 0.0
    return samples, mean_observed


def _generate_steps_for_day(
    rng: random.Random,
    local_date: date,
    study_day: int,
    is_weekend: bool,
    observed_zero: bool,
) -> Tuple[List[ImportStepIntervalV1], int]:
    intervals: List[ImportStepIntervalV1] = []
    midnight = _ams_midnight(local_date)
    if observed_zero:
        key = f"demo-steps-d{study_day}-zero-obs"
        intervals.append(
            ImportStepIntervalV1(
                provider_interval_key=key,
                source_id=f"src-{key}",
                start_at=midnight.astimezone(timezone.utc),
                end_at=(midnight + timedelta(hours=23, minutes=59)).astimezone(timezone.utc),
                step_count=0,
            )
        )
        return intervals, 0
    daily_total = rng.randint(4000, 12000)
    if is_weekend:
        daily_total = int(daily_total * rng.uniform(0.85, 1.15))
    midnight = _ams_midnight(local_date)
    active_blocks = [
        (8, 10, 0.18),
        (12, 14, 0.14),
        (17, 19, 0.25),
        (19, 21, 0.18),
        (10, 12, 0.10),
        (14, 17, 0.10),
        (21, 23, 0.05),
    ]
    remaining = daily_total
    idx = 0
    for start_h, end_h, weight in active_blocks:
        if remaining <= 0:
            break
        block_total = int(daily_total * weight * rng.uniform(0.8, 1.2))
        block_total = min(block_total, remaining)
        cursor_h = start_h * 60
        end_m = end_h * 60
        block_remaining = block_total
        while block_remaining > 0 and cursor_h < end_m:
            chunk_steps = min(block_remaining, rng.randint(50, 250))
            chunk_mins = max(1, rng.randint(1, 15))
            s_ams = midnight + timedelta(minutes=cursor_h)
            e_ams = midnight + timedelta(minutes=min(cursor_h + chunk_mins, end_m))
            key = f"demo-steps-d{study_day}-{idx}"
            intervals.append(
                ImportStepIntervalV1(
                    provider_interval_key=key,
                    source_id=f"src-{key}",
                    start_at=s_ams.astimezone(timezone.utc),
                    end_at=e_ams.astimezone(timezone.utc),
                    step_count=chunk_steps,
                )
            )
            block_remaining -= chunk_steps
            remaining -= chunk_steps
            cursor_h += chunk_mins
            idx += 1
    if remaining > 0:
        key = f"demo-steps-d{study_day}-{idx}"
        s_ams = midnight + timedelta(hours=20)
        e_ams = s_ams + timedelta(minutes=30)
        intervals.append(
            ImportStepIntervalV1(
                provider_interval_key=key,
                source_id=f"src-{key}",
                start_at=s_ams.astimezone(timezone.utc),
                end_at=e_ams.astimezone(timezone.utc),
                step_count=remaining,
            )
        )
    total = sum(i.step_count for i in intervals)
    return intervals, total


def generate_demo_dataset(
    start_date: date,
    study_days: int = 14,
    timezone_str: str = "Europe/Amsterdam",
    seed: int = 42,
    participant_code: str = "P001",
) -> SyntheticDataset:
    rng = random.Random(seed)
    tz = pytz.timezone(timezone_str)
    dataset = SyntheticDataset(
        start_date=start_date,
        study_days=study_days,
        timezone_str=timezone_str,
    )
    day_specs: List[DemoDay] = []
    for i in range(study_days):
        ld = start_date + timedelta(days=i)
        day = DemoDay(study_day=i + 1, local_date=ld)
        if (i + 1) == 5:
            day.observed_zero_steps = True
        if (i + 1) == 9:
            day.has_sleep = False
            day.has_heart_rate = False
        if (i + 1) == 3 or (i + 1) == 11:
            day.has_nap = True
        if (i + 1) == 12:
            if rng.random() < 0.5:
                day.has_sleep = False
        day_specs.append(day)

    for day in day_specs:
        weekday = day.local_date.weekday()
        is_weekend = weekday >= 5

        if day.has_sleep:
            dataset.sleep_sessions.append(
                _build_sleep_session(rng, day.study_day, day.local_date, True, False, seed)
            )
            if day.has_nap:
                dataset.sleep_sessions.append(
                    _build_sleep_session(rng, day.study_day, day.local_date, False, True, seed + day.study_day)
                )

        if day.has_heart_rate:
            resting_bpm = round(rng.uniform(58, 72), 1)
            dataset.daily_resting_bpm[day.local_date.isoformat()] = resting_bpm
            samples, _ = _generate_heart_rate_for_day(rng, day.local_date, day.study_day, resting_bpm)
            dataset.heart_rate_samples.extend(samples)

        if day.has_steps:
            intervals, _ = _generate_steps_for_day(rng, day.local_date, day.study_day, is_weekend, day.observed_zero_steps)
            dataset.step_intervals.extend(intervals)

    return dataset


def dataset_to_import_payload(
    dataset: SyntheticDataset,
    participant_code: str,
) -> ImportPayloadV1:
    return ImportPayloadV1(
        schema_version="1",
        participant_code=participant_code,
        generated_at=datetime.now(timezone.utc),
        sleep_sessions=dataset.sleep_sessions,
        heart_rate_samples=dataset.heart_rate_samples,
        step_intervals=dataset.step_intervals,
    )


def dataset_to_json_dict(dataset: SyntheticDataset, participant_code: str) -> dict:
    payload = dataset_to_import_payload(dataset, participant_code)
    return payload.model_dump(mode="json")
