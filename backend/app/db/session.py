from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, pool_pre_ping=not settings.is_sqlite)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    import app.models as _models  # noqa: F401  registers all concrete model classes on Base.metadata
    Base.metadata.create_all(bind=engine)
