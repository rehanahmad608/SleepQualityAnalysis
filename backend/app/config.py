from __future__ import annotations

from datetime import date
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    DATABASE_URL: str = "sqlite:///./sleep_quality_dev.db"

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
