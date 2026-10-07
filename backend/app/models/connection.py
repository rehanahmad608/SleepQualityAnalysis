from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text, UUID as SA_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Connection(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "connections"

    participant_id: Mapped[UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="google_health")
    provider_user_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    granted_scopes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    encrypted_refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    connection_status: Mapped[str] = mapped_column(String(32), nullable=False, default="NOT_CONNECTED")

    participant: Mapped["Participant"] = relationship("Participant", back_populates="connections")
