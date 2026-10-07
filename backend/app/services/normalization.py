from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import pytz


def ensure_tz_aware(dt: datetime, default_tz: str = "UTC") -> datetime:
    if dt.tzinfo is None:
        tz = pytz.timezone(default_tz)
        return tz.localize(dt).astimezone(timezone.utc)
    return dt.astimezone(timezone.utc)


def ams_local_date(dt: datetime, tz_str: str = "Europe/Amsterdam"):
    tz = pytz.timezone(tz_str)
    return dt.astimezone(tz).date()


def day_bounds_utc(local_date, tz_str: str = "Europe/Amsterdam"):
    tz = pytz.timezone(tz_str)
    start_local = tz.localize(datetime.combine(local_date, datetime.min.time()))
    end_local = tz.localize(datetime.combine(local_date + timedelta(days=1), datetime.min.time()))
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def seconds_to_hours(seconds: Optional[int]) -> Optional[float]:
    if seconds is None:
        return None
    return round(seconds / 3600.0, 3)


def compute_sleep_efficiency_pct(
    asleep_seconds: Optional[int],
    in_bed_seconds: Optional[int],
) -> Optional[float]:
    if asleep_seconds is None or in_bed_seconds is None:
        return None
    if in_bed_seconds <= 0:
        return None
    return round(100.0 * asleep_seconds / in_bed_seconds, 2)


def mean_or_none(values):
    valid = [v for v in values if v is not None]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 3)


def classify_main_sleep_for_day(db_sessions):
    if not db_sessions:
        return None, list(db_sessions)
    main_explicit = [s for s in db_sessions if s.is_main]
    sessions_sorted = sorted(
        db_sessions,
        key=lambda s: (s.asleep_seconds or int((s.end_at - s.start_at).total_seconds())),
        reverse=True,
    )
    if main_explicit:
        main = main_explicit[0]
        main.is_main = True
        main.classification_origin = main.classification_origin or "provider"
    else:
        main = sessions_sorted[0]
        main.is_main = True
        main.classification_origin = "derived"
    naps = [s for s in db_sessions if s.id != main.id]
    for n in naps:
        n.is_main = False
    return main, [main] + naps


def dedupe_sessions_by_wake_date(sessions):
    grouped = {}
    for s in sessions:
        grouped.setdefault(s.wake_date, []).append(s)
    return grouped
