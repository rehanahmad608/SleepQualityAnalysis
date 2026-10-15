from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Date, Float, ForeignKey, Integer, JSON, String, UniqueConstraint, UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.types import UTCDateTime
from app.models.base import Base, TimestampMixin


class DailySummary(Base, TimestampMixin):
    __tablename__ = "daily_summaries"
    __table_args__ = (
        UniqueConstraint("study_id", "local_date", name="uq_daily_summary_study_date"),
    )

    study_id: Mapped[UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("studies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    local_date: Mapped[date] = mapped_column(Date, primary_key=True)
    steps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    main_sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_sleep_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resting_bpm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    observed_mean_bpm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    heart_rate_samples: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sleep_efficiency_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    coverage_flags: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_provisional: Mapped[bool] = mapped_column(nullable=False, default=False)
    data_quality: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    calculated_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)

    study: Mapped["Study"] = relationship("Study", back_populates="daily_summaries")
