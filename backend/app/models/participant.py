from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Participant(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "participants"

    participant_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Amsterdam")

    studies: Mapped[list["Study"]] = relationship("Study", back_populates="participant", cascade="all, delete-orphan")
    connections: Mapped[list["Connection"]] = relationship("Connection", back_populates="participant", cascade="all, delete-orphan")
