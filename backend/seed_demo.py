from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path


def seed_demo(
    participant_code: str = "P001",
    start_date_str: str | None = None,
    study_days: int = 14,
    timezone_str: str = "Europe/Amsterdam",
    calculation_version: str = "1",
    seed: int = 42,
) -> int:
    from app.config import settings
    from app.db.session import get_db_context, init_db
    from app.services.ingestion import run_demo_ingestion

    if settings.is_sqlite:
        init_db()

    start_date: date
    if start_date_str:
        start_date = date.fromisoformat(start_date_str)
    else:
        start_date = settings.STUDY_START_DATE or date(2026, 9, 24)

    print(f"[seed_demo] participant={participant_code} start={start_date} days={study_days} tz={timezone_str} seed={seed}")

    with get_db_context() as db:
        run, stats = run_demo_ingestion(
            db,
            participant_code=participant_code,
            start_date=start_date,
            study_days=study_days,
            timezone_str=timezone_str,
            calculation_version=calculation_version,
            seed=seed,
        )
        print(f"[seed_demo] run_id={run.id} status={run.status} rows={run.row_count}")
        if run.error_code:
            print(f"[seed_demo] error_code={run.error_code} detail={run.error_detail}")
        for k, v in stats.items():
            print(f"[seed_demo]   {k}={v}")

        if run.status == "success":
            print("[seed_demo] Database initialized. Daily summaries rebuilt.")
            from app.models.study import Study
            study = db.query(Study).filter_by(start_date=start_date).first()
            if study:
                from app.services.analytics import get_all_summaries
                summaries = get_all_summaries(db, study)
                print(f"[seed_demo] daily_summaries={len(summaries)} rows")
                for s in summaries[:3]:
                    print(
                        f"[seed_demo]   {s.local_date} steps={s.steps} main_sleep_h="
                        f"{(s.main_sleep_seconds / 3600 if s.main_sleep_seconds else None)} "
                        f"resting_bpm={s.resting_bpm} quality={s.data_quality}"
                    )
                if len(summaries) > 3:
                    print(f"[seed_demo]   ... plus {len(summaries) - 3} more days")

        return 0 if run.status == "success" else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed dev DB with deterministic demo data.")
    parser.add_argument("--participant", default=None, help="Override participant code.")
    parser.add_argument("--start-date", default=None, help="Override start date YYYY-MM-DD.")
    parser.add_argument("--days", type=int, default=14, help="Override study days.")
    parser.add_argument("--timezone", default="Europe/Amsterdam")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    from app.config import settings
    participant = args.participant or settings.PARTICIPANT_CODE
    return seed_demo(
        participant_code=participant,
        start_date_str=args.start_date,
        study_days=args.days,
        timezone_str=args.timezone,
        seed=args.seed,
    )


if __name__ == "__main__":
    sys.exit(main())
