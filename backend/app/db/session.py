from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


def build_engine(database_url: str):
    url = make_url(database_url)
    if url.get_backend_name() == "sqlite":
        return create_engine(url, connect_args={"check_same_thread": False})
    connect_args = {}
    if url.get_driver_name() == "psycopg":
        connect_args = {"prepare_threshold": None, "connect_timeout": 10}
    if url.host and (url.host.endswith(".supabase.co") or url.host.endswith(".supabase.com")):
        if "sslmode" not in url.query:
            url = url.update_query_dict({"sslmode": "require"})
    return create_engine(url, connect_args=connect_args, poolclass=NullPool, pool_pre_ping=True)


engine = build_engine(settings.DATABASE_URL)

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
