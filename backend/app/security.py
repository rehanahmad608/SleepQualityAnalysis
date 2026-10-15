"""Request-security helpers: default-deny, isolated local-development mode, write guard.

Anonymous access is NOT inferred from a loopback address. It exists only as an
explicit, isolated local-development mode that requires every one of:

* ``DEV_ANONYMOUS_ACCESS=true`` and ``APP_ENV=local-dev``
* no shared-host environment marker (Vercel, Render, Kubernetes, ...)
* Supabase Auth not configured
* the process bound to loopback only (``APP_BIND_HOST`` is 127.0.0.1 or ::1)
* per request: loopback socket peer, no proxy/forwarding header, and a
  loopback ``Host`` header (blocks reverse proxies, tunnels and DNS rebinding)

Anonymous mode only ever yields the single configured participant, read-only.
"""
from __future__ import annotations

import logging
import os
from typing import Iterable, Mapping, Optional

from app.config import settings

logger = logging.getLogger(__name__)

LOCAL_DEV_ENV = "local-dev"

# Presence of any of these means "this is a shared / hosted runtime".
SHARED_HOST_MARKERS = (
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "RENDER",
    "FLY_APP_NAME",
    "KUBERNETES_SERVICE_HOST",
    "WEBSITE_SITE_NAME",
    "DYNO",
    "K_SERVICE",
    "AWS_LAMBDA_FUNCTION_NAME",
    "AWS_EXECUTION_ENV",
    "RAILWAY_ENVIRONMENT",
    "NETLIFY",
)

LOOPBACK_PEERS = ("127.0.0.1", "::1")
LOOPBACK_BIND_HOSTS = ("127.0.0.1", "::1", "localhost")
LOOPBACK_HOST_NAMES = ("127.0.0.1", "localhost", "[::1]", "::1")

FORWARDING_HEADERS = (
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-port",
    "x-real-ip",
    "via",
    "cf-connecting-ip",
    "true-client-ip",
    "x-original-forwarded-for",
    "x-client-ip",
)


def shared_host_detected(environ: Optional[Mapping[str, str]] = None) -> bool:
    env = os.environ if environ is None else environ
    return any(env.get(marker) for marker in SHARED_HOST_MARKERS)


def auth_configured() -> bool:
    return bool(settings.SUPABASE_URL)


def is_local_dev_environment() -> bool:
    return settings.APP_ENV.strip().lower() == LOCAL_DEV_ENV and not shared_host_detected()


def anonymous_mode_problems() -> list[str]:
    """Reasons anonymous development access cannot be enabled (empty = allowed)."""
    problems: list[str] = []
    if settings.APP_ENV.strip().lower() != LOCAL_DEV_ENV:
        problems.append("APP_ENV must be 'local-dev'")
    if shared_host_detected():
        problems.append("a shared-host environment marker is present")
    if auth_configured():
        problems.append("Supabase Auth is configured (use real sign-in)")
    if settings.APP_BIND_HOST.strip().lower() not in LOOPBACK_BIND_HOSTS:
        problems.append("APP_BIND_HOST must be 127.0.0.1 or ::1 (loopback only)")
    return problems


def validate_startup_security() -> None:
    """Abort startup rather than run an unsafe anonymous configuration."""
    if not settings.DEV_ANONYMOUS_ACCESS:
        return
    problems = anonymous_mode_problems()
    if problems:
        raise RuntimeError(
            "DEV_ANONYMOUS_ACCESS=true refused: " + "; ".join(problems) + ". "
            "Anonymous access is only available in an isolated local-development "
            "process bound to loopback."
        )
    logger.warning(
        "DEV_ANONYMOUS_ACCESS is ACTIVE: unauthenticated loopback requests can read "
        "participant %s. Never use this on a shared host.",
        settings.PARTICIPANT_CODE,
    )


def _host_without_port(host_header: str) -> str:
    host = host_header.strip().lower()
    if host.startswith("["):  # [::1]:8000
        end = host.find("]")
        return host[: end + 1] if end != -1 else host
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def anonymous_request_allowed(
    peer_host: Optional[str],
    headers: Mapping[str, str],
) -> bool:
    """Per-request check for isolated local-development anonymous access."""
    if not settings.DEV_ANONYMOUS_ACCESS or anonymous_mode_problems():
        return False
    if peer_host not in LOOPBACK_PEERS:
        return False
    lowered = {k.lower() for k in headers.keys()}
    if any(h in lowered for h in FORWARDING_HEADERS):
        return False
    host = headers.get("host") or headers.get("Host") or ""
    return _host_without_port(host) in LOOPBACK_HOST_NAMES


def parse_json_list(raw: str) -> list[str]:
    import json

    try:
        value = json.loads(raw or "[]")
    except ValueError:
        return []
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        return []
    return value


def admin_user_ids() -> set[str]:
    return set(parse_json_list(settings.AUTH_ADMIN_USERS))


def writes_policy_problems() -> list[str]:
    """Reasons legacy write operations (sync/import/regenerate) are disabled."""
    problems: list[str] = []
    if not is_local_dev_environment():
        problems.append("writes are disabled outside an isolated local-development environment")
    if not settings.ALLOW_LEGACY_WRITES:
        problems.append("ALLOW_LEGACY_WRITES is not enabled")
    return problems


def cors_origins(origins: Iterable[str]) -> list[str]:
    """Credentialed CORS must never accept a wildcard origin."""
    cleaned = [o for o in origins if o and o != "*"]
    if len(cleaned) != len(list(origins)):
        logger.warning("Ignoring wildcard/empty CORS origins; credentials are allowed.")
    return cleaned
