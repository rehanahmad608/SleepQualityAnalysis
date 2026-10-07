from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class RawRecord(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "raw_records"

    run_id: Mapped[UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("ingestion_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    resource_key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    payload_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    schema_version: Mapped[str] = mapped_column(String(16), nullable=False, default="1")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)

    __table_args__ = (
        # composite unique on run + resource_key + payload_hash to track revisions
    )

    run: Mapped["IngestionRun"] = relationship("IngestionRun", back_populates="raw_records")
