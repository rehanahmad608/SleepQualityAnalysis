from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import UUID, Column, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.session import Base
from app.db.types import UTCDateTime


def utcnow() -> datetime:
    return datetime.utcnow()


def new_uuid() -> uuid.UUID:
    """uuid4 that is safe to store in SQLite's UUID-typed (NUMERIC-affinity) columns.

    The schema declares ids as ``UUID``; SQLite gives that name NUMERIC affinity,
    so a stored hex id made only of digits with a single "e" (e.g. ``12e4...``)
    is silently converted to a float and later cannot be read back. Such ids are
    skipped. PostgreSQL (native uuid) is unaffected. No schema change involved.
    """
    while True:
        candidate = uuid.uuid4()
        try:
            float(candidate.hex)
        except ValueError:
            return candidate


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=new_uuid,
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
