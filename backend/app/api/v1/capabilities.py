"""Availability gate and capability report for the legacy study features."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.security import auth_configured, writes_policy_problems
from app.services.legacy_schema import legacy_state

router = APIRouter()


def legacy_gate(db: Session = Depends(get_db)) -> None:
    """Refuse legacy routes cleanly (not a 500) when the legacy schema is unusable."""
    state = legacy_state(db.get_bind())
    if not state["available"]:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "legacy_study_unavailable",
                "message": "Legacy study data is not available in this deployment.",
                "reason": state["reason"],
            },
        )


@router.get("/capabilities")
def capabilities(db: Session = Depends(get_db)):
    """Non-sensitive feature flags so the UI can hide unavailable pages."""
    state = legacy_state(db.get_bind())
    return {
        "legacy_study": bool(state["available"]),
        "legacy_requested": bool(state["requested"]),
        "legacy_reason": state["reason"],
        "writes_enabled": bool(state["available"]) and not writes_policy_problems(),
        "auth_required": auth_configured() or not settings.DEV_ANONYMOUS_ACCESS,
    }
