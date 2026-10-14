from __future__ import annotations

from datetime import date
from typing import List, Optional
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[1] / ".env", case_sensitive=True, extra="ignore")

    DATABASE_URL: str = "sqlite:///./sleep_quality_dev.db"
    MIGRATION_DATABASE_URL: str = ""
    AUTO_CREATE_TABLES: bool = True

    @field_validator("DATABASE_URL", "MIGRATION_DATABASE_URL")
    @classmethod
    def use_psycopg(cls, value: str) -> str:
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value

    STUDY_START_DATE: Optional[date] = None
    STUDY_TIMEZONE: str = "Europe/Amsterdam"
    STUDY_DAYS: int = 14
    CALCULATION_VERSION: str = "1"
    SCHEMA_VERSION: str = "1"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""
    GOOGLE_PROJECT_ID: str = ""

    FRONTEND_ORIGIN: str = "http://localhost:5173"
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    SECRET_KEY: str = "change-me"
    TOKEN_ENCRYPTION_KEY: str = "change-this-32-byte-encryption-key-0000"

    DATA_MODE: str = "demo"
    PARTICIPANT_CODE: str = "P001"

    MAX_IMPORT_SIZE_MB: int = 10
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    # Server-owned mapping: {"supabase-auth-user-id": ["P001"]}.
    AUTH_PARTICIPANT_ACCESS: str = "{}"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgres")


settings = Settings()
