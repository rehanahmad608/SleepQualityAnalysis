from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Integer, String, UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Study(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "studies"

    participant_id: Mapped[UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date_exclusive: Mapped[date] = mapped_column(Date, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Amsterdam")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    calculation_version: Mapped[str] = mapped_column(String(16), nullable=False, default="1")

    participant: Mapped["Participant"] = relationship("Participant", back_populates="studies")
    ingestion_runs: Mapped[list["IngestionRun"]] = relationship("IngestionRun", back_populates="study", cascade="all, delete-orphan")
    sleep_sessions: Mapped[list["SleepSession"]] = relationship("SleepSession", back_populates="study", cascade="all, delete-orphan")
    heart_rate_samples: Mapped[list["HeartRateSample"]] = relationship("HeartRateSample", back_populates="study", cascade="all, delete-orphan")
    step_intervals: Mapped[list["StepInterval"]] = relationship("StepInterval", back_populates="study", cascade="all, delete-orphan")
    daily_summaries: Mapped[list["DailySummary"]] = relationship("DailySummary", back_populates="study", cascade="all, delete-orphan")
