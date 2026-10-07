from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import UUID, Column, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.session import Base


def utcnow() -> datetime:
    return datetime.utcnow()


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
