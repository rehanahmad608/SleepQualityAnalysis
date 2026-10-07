from __future__ import annotations

import argparse
import sys
from datetime import date

from app.config import settings
from app.db.session import get_db_context


def main() -> int:
    parser = argparse.ArgumentParser(description="Run bounded ingestion for the sleep quality study.")
    parser.add_argument(
        "--mode",
        choices=["demo", "import", "google"],
        default=settings.DATA_MODE,
        help="Ingestion mode. Defaults to DATA_MODE from env.",
    )
    parser.add_argument(
        "--start-date",
        type=lambda s: date.fromisoformat(s) if s else None,
        default=None,
        help="Override study start date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=settings.STUDY_DAYS,
        help=f"Override study days (default: {settings.STUDY_DAYS}).",
    )
    parser.add_argument(
        "--participant",
        type=str,
        default=settings.PARTICIPANT_CODE,
        help=f"Override participant code (default: {settings.PARTICIPANT_CODE}).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="RNG seed for demo mode. Default 42.",
    )
    parser.add_argument(
        "--import-file",
        type=str,
        default=None,
        help="Path to JSON import file for --mode import.",
    )
    args = parser.parse_args()

    start_date = args.start_date or settings.STUDY_START_DATE or date(2026, 9, 24)
    with get_db_context() as db:
        from app.services.ingestion import run_demo_ingestion, run_google_health_ingestion, run_import_ingestion

        if args.mode == "demo":
            print(f"[ingestion] Running demo mode seed={args.seed} start={start_date} days={args.days}")
            run, stats = run_demo_ingestion(
                db,
                args.participant,
                start_date,
                args.days,
                settings.STUDY_TIMEZONE,
                settings.CALCULATION_VERSION,
                args.seed,
            )
            print(f"[ingestion] run_id={run.id} status={run.status} rows={run.row_count}")
            print(f"[ingestion] stats: {stats}")
            return 0 if run.status == "success" else 1

        if args.mode == "google":
            print(f"[ingestion] Running google_health mode start={start_date} days={args.days}")
            run = run_google_health_ingestion(
                db,
                args.participant,
                start_date,
                args.days,
                settings.STUDY_TIMEZONE,
                settings.CALCULATION_VERSION,
            )
            print(f"[ingestion] run_id={run.id} status={run.status} error={run.error_code}")
            print(f"[ingestion] detail: {run.error_detail}")
            return 0 if run.status == "success" else 2

        if args.mode == "import":
            if not args.import_file:
                print("[ingestion] --import-file required for --mode import", file=sys.stderr)
                return 2
            import json
            from app.providers.json_importer import validate_import_json
            with open(args.import_file, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
            payload, errors = validate_import_json(raw_data)
            if payload is None or errors:
                print(f"[ingestion] validation failed: {errors}", file=sys.stderr)
                return 3
            print(f"[ingestion] Running import mode file={args.import_file}")
            run, stats = run_import_ingestion(
                db,
                args.participant,
                start_date,
                args.days,
                settings.STUDY_TIMEZONE,
                settings.CALCULATION_VERSION,
                payload,
            )
            print(
                f"[ingestion] run_id={run.id} status={run.status} "
                f"sleep={stats.sleep_sessions_upserted} hr={stats.heart_rate_samples_upserted} "
                f"steps={stats.step_intervals_upserted}"
            )
            return 0 if run.status == "success" else 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
