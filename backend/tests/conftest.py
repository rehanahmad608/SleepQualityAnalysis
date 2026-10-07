from __future__ import annotations

from datetime import date
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings as _settings
from app.db.session import Base, get_db


TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    from app.models import participant, study, connection, ingestion_run, raw_record
    from app.models import sleep_session, sleep_segment, heart_rate, steps, daily_summary
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def db_session(db_engine) -> Generator[Session, None, None]:
    connection = db_engine.connect()
    transaction = connection.begin()
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def app(db_session):
    from app.main import app as _app
    def _override_db():
        yield db_session
    _app.dependency_overrides[get_db] = _override_db
    try:
        yield _app
    finally:
        _app.dependency_overrides.clear()


@pytest.fixture()
def client(app) -> TestClient:
    return TestClient(app)


@pytest.fixture()
def study_start() -> date:
    return date(2026, 9, 24)


@pytest.fixture()
def seeded_demo(db_session, study_start):
    from app.services.ingestion import run_demo_ingestion
    run, stats = run_demo_ingestion(
        db_session,
        participant_code="P001",
        start_date=study_start,
        study_days=14,
        timezone_str="Europe/Amsterdam",
        calculation_version="1",
        seed=42,
    )
    assert run.status == "success", f"Seeding failed: {run.error_code} {run.error_detail}"
    db_session.expire_all()
    return run, stats
