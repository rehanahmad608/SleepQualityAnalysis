from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint, UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.types import UTCDateTime
from app.models.base import Base, TimestampMixin, UUIDMixin


class SleepSession(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "sleep_sessions"
    __table_args__ = (
        UniqueConstraint("study_id", "provider_session_key", name="uq_sleep_session_study_provider"),
    )

    study_id: Mapped[UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("studies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_session_key: Mapped[str] = mapped_column(String(255), nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    start_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    wake_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    asleep_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    in_bed_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_main: Mapped[bool] = mapped_column(nullable=False, default=False)
    classification_origin: Mapped[str] = mapped_column(String(32), nullable=False, default="provider")
    raw_record_id: Mapped[Optional[UUID]] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("raw_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    study: Mapped["Study"] = relationship("Study", back_populates="sleep_sessions")
    segments: Mapped[list["SleepSegment"]] = relationship(
        "SleepSegment",
        back_populates="session",
        cascade="all, delete-orphan",
    )
