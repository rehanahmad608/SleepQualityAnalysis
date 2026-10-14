from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.v1 import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.session import init_db
    if settings.AUTO_CREATE_TABLES and settings.is_sqlite:
        init_db()
    yield


app = FastAPI(
    title="Sleep Quality Dashboard Backend",
    description="Sleep, heart rate and steps analytics for a 14-day participant study",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
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
