from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.types import UTCDateTime
from app.models.base import Base, TimestampMixin, UUIDMixin


class StepInterval(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "step_intervals"
    __table_args__ = (
        UniqueConstraint("study_id", "provider_interval_key", name="uq_steps_study_provider"),
    )

    study_id: Mapped[UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("studies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_interval_key: Mapped[str] = mapped_column(String(255), nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    start_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    step_count: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_record_id: Mapped[Optional[UUID]] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("raw_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    study: Mapped["Study"] = relationship("Study", back_populates="step_intervals")
