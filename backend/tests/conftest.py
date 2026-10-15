from __future__ import annotations

import os

# Isolate the test process BEFORE the application is imported: never read a
# developer's backend/.env database URL or Supabase/Auth settings, never reach a
# shared database. Environment variables take priority over the .env file.
for _key, _value in {
    "DATABASE_URL": "sqlite:///:memory:",
    "MIGRATION_DATABASE_URL": "",
    "SUPABASE_URL": "",
    "SUPABASE_ANON_KEY": "",
    "AUTH_PARTICIPANT_ACCESS": "{}",
    "AUTH_ADMIN_USERS": "[]",
    "APP_ENV": "",
    "DEV_ANONYMOUS_ACCESS": "false",
    "APP_BIND_HOST": "",
    "LEGACY_STUDY_ENABLED": "auto",
    "ALLOW_LEGACY_WRITES": "false",
    "PARTICIPANT_CODE": "P001",
}.items():
    os.environ[_key] = _value
for _marker in ("VERCEL", "VERCEL_ENV", "VERCEL_URL", "RENDER", "FLY_APP_NAME",
                "KUBERNETES_SERVICE_HOST", "WEBSITE_SITE_NAME", "DYNO", "K_SERVICE",
                "AWS_LAMBDA_FUNCTION_NAME", "AWS_EXECUTION_ENV", "RAILWAY_ENVIRONMENT", "NETLIFY"):
    os.environ.pop(_marker, None)

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


@pytest.fixture(autouse=True)
def _security_defaults(monkeypatch):
    """Tests exercise application logic as an authorised participant and admin.

    Authentication itself is covered by dedicated tests that call the real
    dependency functions (tests/test_access_policy.py).
    """
    from app.api.v1 import participant_data as pd
    from app.main import app as _app
    from app.services.legacy_schema import clear_cache

    clear_cache()
    pd.clear_token_cache()
    identity = pd.Identity(user_id="test-admin", participants=(_settings.PARTICIPANT_CODE,))
    monkeypatch.setattr(_settings, "APP_ENV", "local-dev")
    monkeypatch.setattr(_settings, "ALLOW_LEGACY_WRITES", True)
    monkeypatch.setattr(_settings, "AUTH_ADMIN_USERS", '["test-admin"]')
    _app.dependency_overrides[pd.allowed_participants] = lambda: [_settings.PARTICIPANT_CODE]
    _app.dependency_overrides[pd.current_identity] = lambda: identity
    yield
    _app.dependency_overrides.pop(pd.allowed_participants, None)
    _app.dependency_overrides.pop(pd.current_identity, None)
