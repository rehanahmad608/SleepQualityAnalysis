from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional


GOOGLE_HEALTH_ENDPOINT = "https://health.googleapis.com/v4"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

REQUIRED_SCOPES = [
    "https://www.googleapis.com/auth/health.sleep.read",
    "https://www.googleapis.com/auth/health.heart_rate.read",
    "https://www.googleapis.com/auth/health.activity.read",
    "https://www.googleapis.com/auth/health.body.read",
]

SLEEP_DATA_TYPE = "com.google.sleep.session"
HEART_RATE_DATA_TYPE = "com.google.heart_rate.bpm"
STEP_COUNT_DATA_TYPE = "com.google.step_count.delta"

STATUS_NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
STATUS_DISCONNECTED = "DISCONNECTED"


@dataclass
class GoogleHealthAdapter:
    client_id: str = ""
    client_secret: str = ""
    redirect_uri: str = ""
    project_id: str = ""
    status: str = STATUS_NOT_IMPLEMENTED
    last_error: Optional[str] = None

    def is_available(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)

    def get_authorization_url(self, state: str) -> str:
        scopes = "+".join(REQUIRED_SCOPES)
        return (
            f"{GOOGLE_AUTH_URL}?"
            f"client_id={self.client_id}&"
            f"redirect_uri={self.redirect_uri}&"
            f"response_type=code&"
            f"scope={scopes}&"
            f"state={state}&"
            f"access_type=offline&prompt=consent"
        )

    def can_connect(self) -> bool:
        if self.status == STATUS_NOT_IMPLEMENTED:
            return False
        return self.is_available()

    def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        raise NotImplementedError(
            "Google Health adapter is a stub. Real implementation requires project eligibility and "
            "the official Google OAuth client libraries. Status: NOT_IMPLEMENTED"
        )

    def fetch_sleep_sessions(
        self,
        access_token: str,
        user_id: str,
        start_time: datetime,
        end_time: datetime,
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError(
            f"Google Health sleep fetch stubbed. Endpoint would be: "
            f"{GOOGLE_HEALTH_ENDPOINT}/users/{user_id}/dataTypes/{SLEEP_DATA_TYPE}/dataPoints"
        )

    def fetch_heart_rate(
        self,
        access_token: str,
        user_id: str,
        start_time: datetime,
        end_time: datetime,
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError(
            f"Google Health heart rate fetch stubbed. Endpoint would be: "
            f"{GOOGLE_HEALTH_ENDPOINT}/users/{user_id}/dataTypes/{HEART_RATE_DATA_TYPE}/dataPoints"
        )

    def fetch_step_intervals(
        self,
        access_token: str,
        user_id: str,
        start_time: datetime,
        end_time: datetime,
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError(
            f"Google Health steps fetch stubbed. Endpoint would be: "
            f"{GOOGLE_HEALTH_ENDPOINT}/users/{user_id}/dataTypes/{STEP_COUNT_DATA_TYPE}/dataPoints"
        )

    def exchange_code_for_tokens(self, code: str) -> Dict[str, Any]:
        raise NotImplementedError(
            "Token exchange is stubbed. Real implementation would POST to: "
            f"{GOOGLE_TOKEN_URL}"
        )


def create_adapter_from_settings() -> GoogleHealthAdapter:
    from app.config import settings
    return GoogleHealthAdapter(
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
        project_id=settings.GOOGLE_PROJECT_ID,
    )
