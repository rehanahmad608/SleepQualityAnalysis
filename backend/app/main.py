from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.v1 import api_router
from app.security import cors_origins

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.session import SessionLocal, engine, init_db
    from app.security import validate_startup_security
    from app.services.legacy_schema import legacy_available

    validate_startup_security()  # refuses an unsafe anonymous-access configuration
    if settings.AUTO_CREATE_TABLES and settings.is_sqlite:
        init_db()
    # Fail runs orphaned by a crash/restart, but only where the legacy schema is
    # complete; this must never block startup of a structured-only deployment.
    try:
        if legacy_available(engine, use_cache=False):
            from app.services.ingestion import reap_stale_runs

            db = SessionLocal()
            try:
                if reap_stale_runs(db):
                    db.commit()
            finally:
                db.close()
    except Exception:  # noqa: BLE001
        logger.warning("Skipped stale-run recovery at startup", exc_info=False)
    yield


app = FastAPI(
    title="Sleep Quality Dashboard Backend",
    description="Sleep, heart rate and steps analytics for a 14-day participant study",
    version="1.0.0",
    lifespan=lifespan,
)

if settings.DEV_ANONYMOUS_ACCESS:
    from starlette.middleware.trustedhost import TrustedHostMiddleware

    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(settings.cors_origins_list),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/healthz", tags=["health"])
def health_check():
    return {
        "status": "ok",
        "schema_version": settings.SCHEMA_VERSION,
        "calculation_version": settings.CALCULATION_VERSION,
        "data_mode": settings.DATA_MODE,
        "timezone": settings.STUDY_TIMEZONE,
    }


@app.get("/", tags=["root"])
def root():
    return {
        "name": "Sleep Quality Dashboard API",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "health": "/healthz",
    }
