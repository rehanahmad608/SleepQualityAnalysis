from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_study_only
from app.models.study import Study
from app.services.analytics import build_csv_rows


router = APIRouter(prefix="/export")


@router.get("")
def export_csv(
    db: Session = Depends(get_db),
    study: Study = Depends(get_study_only),
):
    rows = build_csv_rows(db, study)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerows(rows)
    buffer.seek(0)
    filename = f"sleep_quality_{study.start_date}_{study.end_date_exclusive}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
