from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Float, ForeignKey, String, UniqueConstraint, UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.types import UTCDateTime
from app.models.base import Base, TimestampMixin, UUIDMixin


class HeartRateSample(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "heart_rate_samples"
    __table_args__ = (
        UniqueConstraint("study_id", "provider_sample_key", name="uq_hr_study_provider"),
    )

    study_id: Mapped[UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("studies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_sample_key: Mapped[str] = mapped_column(String(255), nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    bpm: Mapped[float] = mapped_column(Float, nullable=False)
    raw_record_id: Mapped[Optional[UUID]] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("raw_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    study: Mapped["Study"] = relationship("Study", back_populates="heart_rate_samples")
