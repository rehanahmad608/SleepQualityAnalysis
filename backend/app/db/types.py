"""Custom column types.

UTCDateTime keeps the same physical column as ``DateTime(timezone=True)`` (no
schema change, no migration) but guarantees the Python side always sees
timezone-aware UTC datetimes. SQLite drops tzinfo and returns naive values
while PostgreSQL returns aware ones; without this the two backends disagree and
code that compares or converts instants breaks on one of them.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


def to_utc(value: datetime) -> datetime:
    """Aware -> converted to UTC. Naive -> interpreted as UTC (the storage convention)."""
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class UTCDateTime(TypeDecorator):
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: Optional[datetime], dialect):
        if value is None:
            return None
        if not isinstance(value, datetime):
            raise TypeError(f"UTCDateTime expects a datetime, got {type(value).__name__}")
        return to_utc(value)

    def process_result_value(self, value: Optional[datetime], dialect):
        if value is None:
            return None
        return to_utc(value)
