from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, JSON, String, Text, UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.types import UTCDateTime
from app.models.base import Base, TimestampMixin, UUIDMixin


class IngestionRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ingestion_runs"

    study_id: Mapped[UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("studies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime(), nullable=True)
    requested_range: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    study: Mapped["Study"] = relationship("Study", back_populates="ingestion_runs")
    raw_records: Mapped[list["RawRecord"]] = relationship("RawRecord", back_populates="run", cascade="all, delete-orphan")
