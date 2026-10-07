from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class SleepSegment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "sleep_segments"
    __table_args__ = (
        UniqueConstraint("sleep_session_id", "segment_key", name="uq_sleep_segment_session_key"),
    )

    sleep_session_id: Mapped[UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("sleep_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    segment_key: Mapped[str] = mapped_column(String(255), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stage_label: Mapped[str] = mapped_column(String(32), nullable=False)
    segment_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="stage")

    session: Mapped["SleepSession"] = relationship("SleepSession", back_populates="segments")
