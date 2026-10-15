"""Default-deny access policy, isolated local-development mode, write guard,
legacy-schema availability gate. No network, no real database."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import security
from app.api.v1 import participant_data as pd
from app.config import settings
from app.db.session import Base, get_db


def _request(host="127.0.0.1", peer="127.0.0.1", **headers):
    hdrs = {"host": f"{host}:8000"}
    hdrs.update({k.replace("_", "-"): v for k, v in headers.items()})
    return SimpleNamespace(client=SimpleNamespace(host=peer), headers=hdrs)


@pytest.fixture(autouse=True)
def _reset_db_override():
    yield
    from app.main import app

    app.dependency_overrides.pop(get_db, None)


@pytest.fixture()
def dev_mode(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "local-dev")
    monkeypatch.setattr(settings, "DEV_ANONYMOUS_ACCESS", True)
    monkeypatch.setattr(settings, "APP_BIND_HOST", "127.0.0.1")
    monkeypatch.setattr(settings, "SUPABASE_URL", "")


# ------------------------------------------------------------ default deny


def test_nothing_configured_is_denied_even_for_loopback(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "")
    monkeypatch.setattr(settings, "DEV_ANONYMOUS_ACCESS", False)
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    with pytest.raises(HTTPException) as e:
        pd.current_identity(None, _request())
    assert e.value.status_code == 503
    with pytest.raises(HTTPException):
        pd.allowed_participants(None, _request())


def test_loopback_address_alone_is_not_enough(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "DEV_ANONYMOUS_ACCESS", True)
    monkeypatch.setattr(settings, "APP_ENV", "")  # not marked local-dev
    monkeypatch.setattr(settings, "APP_BIND_HOST", "127.0.0.1")
    with pytest.raises(HTTPException) as e:
        pd.current_identity(None, _request())
    assert e.value.status_code in (401, 503)


def test_auth_configured_requires_bearer(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "public")
    with pytest.raises(HTTPException) as e:
        pd.current_identity(None, _request())
    assert e.value.status_code == 401


# --------------------------------------------------- isolated dev mode


def test_anonymous_allowed_only_when_every_condition_holds(dev_mode):
    ident = pd.current_identity(None, _request())
    assert ident.anonymous is True
    assert ident.participants == (settings.PARTICIPANT_CODE,)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda m: m.setattr(settings, "APP_ENV", "production"),
        lambda m: m.setattr(settings, "APP_BIND_HOST", "0.0.0.0"),
        lambda m: m.setattr(settings, "APP_BIND_HOST", "::"),
        lambda m: m.setattr(settings, "APP_BIND_HOST", ""),
        lambda m: m.setenv("VERCEL", "1"),
        lambda m: m.setenv("KUBERNETES_SERVICE_HOST", "10.0.0.1"),
        lambda m: m.setattr(settings, "SUPABASE_URL", "https://example.supabase.co"),
    ],
)
def test_anonymous_refused_when_any_environment_condition_fails(dev_mode, monkeypatch, mutate):
    mutate(monkeypatch)
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "public")
    with pytest.raises(HTTPException):
        pd.current_identity(None, _request())


@pytest.mark.parametrize(
    "request_obj",
    [
        _request(peer="203.0.113.7"),
        _request(peer="::ffff:10.1.2.3"),
        _request(host="example.com"),
        _request(host="127.0.0.1.evil.test"),
        _request(x_forwarded_for="198.51.100.4"),
        _request(forwarded="for=198.51.100.4"),
        _request(x_real_ip="198.51.100.4"),
        _request(via="1.1 proxy"),
        _request(x_forwarded_host="app.example.com"),
        _request(cf_connecting_ip="198.51.100.4"),
    ],
)
def test_anonymous_refused_for_proxied_or_remote_requests(dev_mode, request_obj):
    with pytest.raises(HTTPException):
        pd.current_identity(None, request_obj)


def test_ipv6_loopback_and_localhost_host_are_accepted(dev_mode):
    assert pd.current_identity(None, _request(host="localhost", peer="::1")).anonymous
    assert pd.current_identity(None, _request(host="[::1]", peer="::1")).anonymous


def test_startup_refuses_unsafe_anonymous_configuration(dev_mode, monkeypatch):
    security.validate_startup_security()  # safe configuration passes
    monkeypatch.setattr(settings, "APP_BIND_HOST", "0.0.0.0")
    with pytest.raises(RuntimeError, match="loopback"):
        security.validate_startup_security()
    monkeypatch.setattr(settings, "APP_BIND_HOST", "127.0.0.1")
    monkeypatch.setenv("RENDER", "true")
    with pytest.raises(RuntimeError, match="shared-host"):
        security.validate_startup_security()


def test_startup_is_quiet_when_anonymous_mode_is_off(monkeypatch):
    monkeypatch.setattr(settings, "DEV_ANONYMOUS_ACCESS", False)
    security.validate_startup_security()


# -------------------------------------------------------------- write guard


@pytest.fixture()
def writes_enabled(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "local-dev")
    monkeypatch.setattr(settings, "ALLOW_LEGACY_WRITES", True)
    monkeypatch.setattr(settings, "AUTH_ADMIN_USERS", '["admin-1"]')


def _ident(user="admin-1", anonymous=False, codes=None):
    return pd.Identity(user_id=user, participants=tuple(codes or [settings.PARTICIPANT_CODE]), anonymous=anonymous)


def test_admin_may_write_in_enabled_local_dev(writes_enabled):
    pd.require_legacy_write(_ident())


@pytest.mark.parametrize(
    "case",
    ["non-admin", "anonymous", "flag-off", "not-local-dev", "shared-host", "wrong-participant"],
)
def test_writes_denied(writes_enabled, monkeypatch, case):
    ident = _ident()
    if case == "non-admin":
        ident = _ident(user="someone-else")
    elif case == "anonymous":
        ident = _ident(user=None, anonymous=True)
    elif case == "flag-off":
        monkeypatch.setattr(settings, "ALLOW_LEGACY_WRITES", False)
    elif case == "not-local-dev":
        monkeypatch.setattr(settings, "APP_ENV", "production")
    elif case == "shared-host":
        monkeypatch.setenv("VERCEL", "1")
    elif case == "wrong-participant":
        ident = _ident(codes=["P999"])
    with pytest.raises(HTTPException) as e:
        pd.require_legacy_write(ident)
    assert e.value.status_code == 403


def test_cors_wildcard_is_dropped_for_credentialed_requests():
    assert security.cors_origins(["*", "http://localhost:5173"]) == ["http://localhost:5173"]


# ----------------------------------------------- HTTP-level enforcement


def _empty_db_client(create_tables=None):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    import app.models  # noqa: F401

    if create_tables == "all":
        Base.metadata.create_all(bind=engine)
    elif create_tables:
        with engine.begin() as c:
            for t in create_tables:
                c.execute(text(f"CREATE TABLE {t} (id INTEGER PRIMARY KEY)"))
    factory = sessionmaker(bind=engine, autoflush=False)

    def _db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    from app.main import app

    app.dependency_overrides[get_db] = _db
    return TestClient(app), engine


@pytest.fixture()
def real_auth():
    """Remove the suite-wide identity override so the real dependency runs."""
    from app.main import app

    app.dependency_overrides.pop(pd.allowed_participants, None)
    app.dependency_overrides.pop(pd.current_identity, None)
    yield app


def test_http_default_deny_without_auth(real_auth):
    client, _ = _empty_db_client("all")
    assert client.get("/api/v1/participants").status_code == 503
    assert client.get("/api/v1/study").status_code == 503
    assert client.post("/api/v1/sync", json={"mode": "demo"}).status_code in (401, 403, 503)


def test_http_requires_bearer_when_auth_configured(real_auth, monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "public")
    client, _ = _empty_db_client("all")
    assert client.get("/api/v1/participants").status_code == 401
    assert client.get("/api/v1/study").status_code == 401


def test_http_testclient_host_is_not_loopback_so_dev_mode_is_refused(real_auth, dev_mode):
    client, _ = _empty_db_client("all")
    # TestClient presents Host "testserver" and a non-loopback peer.
    assert client.get("/api/v1/participants").status_code in (401, 503)


def test_http_writes_denied_for_non_admin_even_when_enabled(writes_enabled, real_auth, monkeypatch):
    from app.main import app

    app.dependency_overrides[pd.current_identity] = lambda: _ident(user="viewer")
    app.dependency_overrides[pd.allowed_participants] = lambda: [settings.PARTICIPANT_CODE]
    client, _ = _empty_db_client("all")
    assert client.post("/api/v1/sync", json={"mode": "demo"}).status_code == 403
    r = client.post("/api/v1/import", files={"file": ("x.json", b"{}", "application/json")})
    assert r.status_code == 403


# ------------------------------------------------- legacy availability gate


@pytest.mark.parametrize(
    "tables,why",
    [
        (None, "no tables"),
        (["studies"], "only studies"),
        (["participants", "studies", "connections", "ingestion_runs"], "partial"),
    ],
)
def test_legacy_disabled_for_missing_or_partial_schema(tables, why):
    from app.services.legacy_schema import clear_cache

    clear_cache()
    client, _ = _empty_db_client(tables)
    r = client.get("/api/v1/study")
    assert r.status_code == 503, why
    assert r.json()["detail"]["code"] == "legacy_study_unavailable"
    cap = client.get("/api/v1/capabilities").json()
    assert cap["legacy_study"] is False
    assert cap["writes_enabled"] is False


def test_explicit_true_cannot_enable_unavailable_legacy(monkeypatch):
    from app.services.legacy_schema import clear_cache

    monkeypatch.setattr(settings, "LEGACY_STUDY_ENABLED", "true")
    clear_cache()
    client, _ = _empty_db_client(["studies"])
    cap = client.get("/api/v1/capabilities").json()
    assert cap["legacy_study"] is False
    assert cap["legacy_requested"] is True
    assert cap["legacy_reason"] == "missing_schema"
    assert client.get("/api/v1/study").status_code == 503


def test_missing_column_counts_as_unavailable():
    from app.services.legacy_schema import clear_cache, legacy_schema_status

    clear_cache()
    client, engine = _empty_db_client("all")
    with engine.begin() as c:
        c.execute(text("ALTER TABLE studies DROP COLUMN calculation_version"))
    clear_cache()
    status = legacy_schema_status(engine, use_cache=False)
    assert status["available"] is False
    assert "calculation_version" in status["missing_columns"]["studies"]


def test_complete_schema_enables_legacy_and_setting_can_disable(monkeypatch):
    from app.services.legacy_schema import clear_cache

    clear_cache()
    client, _ = _empty_db_client("all")
    assert client.get("/api/v1/capabilities").json()["legacy_study"] is True
    monkeypatch.setattr(settings, "LEGACY_STUDY_ENABLED", "false")
    clear_cache()
    assert client.get("/api/v1/capabilities").json()["legacy_study"] is False
    assert client.get("/api/v1/study").status_code == 503


def test_capabilities_reports_no_secrets():
    client, _ = _empty_db_client("all")
    body = client.get("/api/v1/capabilities").json()
    assert set(body) == {"legacy_study", "legacy_requested", "legacy_reason", "writes_enabled", "auth_required"}


def test_startup_succeeds_on_structured_only_database(monkeypatch):
    """A Supabase-style database without legacy tables must not break startup."""
    monkeypatch.setattr(settings, "AUTO_CREATE_TABLES", False)
    from app.main import app

    with TestClient(app) as client:  # runs lifespan
        assert client.get("/healthz").status_code == 200
