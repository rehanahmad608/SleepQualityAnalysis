from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
import json

from app.api.deps import get_db, get_current_participant_and_study
from app.config import settings
from app.models.study import Study
from app.schemas.imports import ImportPayloadV1, ImportResponse, ImportResultStats
from app.providers.json_importer import validate_import_json
from app.services.ingestion import run_import_ingestion


router = APIRouter(prefix="/import")


MAX_BYTES = 10 * 1024 * 1024


@router.post("", response_model=ImportResponse)
async def import_json(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    participant_and_study=Depends(get_current_participant_and_study),
):
    participant, study = participant_and_study
    max_bytes = settings.MAX_IMPORT_SIZE_MB * 1024 * 1024
    raw_bytes = await file.read()
    if len(raw_bytes) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Import exceeds {settings.MAX_IMPORT_SIZE_MB}MB limit")

    try:
        raw_data = json.loads(raw_bytes.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        return ImportResponse(
            success=False,
            validation_errors=[f"Invalid JSON: {exc}"],
            message="JSON parse failed",
        )

    payload, errors = validate_import_json(raw_data)
    if payload is None or errors:
        return ImportResponse(
            success=False,
            validation_errors=errors,
            message="Schema validation failed",
        )

    if payload.participant_code != participant.participant_code:
        errors.append(
            f"Payload participant_code '{payload.participant_code}' does not match configured '{participant.participant_code}'"
        )
        return ImportResponse(
            success=False,
            validation_errors=errors,
            message="Participant code mismatch",
        )

    try:
        run, stats = run_import_ingestion(
            db,
            participant.participant_code,
            study.start_date,
            settings.STUDY_DAYS,
            study.timezone,
            study.calculation_version,
            payload,
        )
        return ImportResponse(
            success=(run.status == "success"),
            run_id=str(run.id),
            validation_errors=[],
            stats=stats,
            message=f"Import complete. Status: {run.status}",
        )
    except Exception as exc:  # noqa: BLE001
        return ImportResponse(
            success=False,
            validation_errors=[f"Import transaction failed: {exc}"],
            message="Import exception",
        )
