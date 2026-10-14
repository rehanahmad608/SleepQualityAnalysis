"""Copy the existing SQLite data into an empty, migrated PostgreSQL database.

Run from backend: python migrate_sqlite.py --source sleep_quality_dev.db
Dry run by default; --apply copies data in a single transaction.
"""
import argparse
from pathlib import Path
from datetime import datetime, timezone

from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import URL

from app.config import settings
from app.db.session import Base, build_engine
import app.models  # noqa: F401


def copy_data(source_engine, target_engine, apply=False):
    counts = {}
    with source_engine.connect() as source, target_engine.begin() as target:
        tables = Base.metadata.sorted_tables
        for table in tables:
            if target.scalar(select(func.count()).select_from(table)):
                raise ValueError(f"Target table {table.name} is not empty; no data copied.")
        for table in tables:
            counts[table.name] = source.scalar(select(func.count()).select_from(table))
            if apply:
                result = source.execute(select(table))
                while rows := result.fetchmany(1000):
                    batch = []
                    for row in rows:
                        values = dict(row._mapping)
                        for column in table.columns:
                            value = values[column.name]
                            # SQLite strips offsets from the app's UTC timestamps.
                            if isinstance(value, datetime) and getattr(column.type, "timezone", False) and value.tzinfo is None:
                                values[column.name] = value.replace(tzinfo=timezone.utc)
                        batch.append(values)
                    target.execute(table.insert(), batch)
                actual = target.scalar(select(func.count()).select_from(table))
                if actual != counts[table.name]:
                    raise ValueError(f"Row count mismatch for {table.name}; rolling back.")
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="sleep_quality_dev.db")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    path = Path(args.source).resolve()
    if not path.is_file():
        parser.error("Source SQLite file does not exist.")
    if not settings.is_postgres:
        parser.error("Set DATABASE_URL to the target Supabase PostgreSQL database first.")
    source = create_engine(URL.create("sqlite", database=str(path)))
    target = build_engine(settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL)
    try:
        for name, count in copy_data(source, target, args.apply).items():
            print(f"{name}: {count} rows")
        print("Copy committed." if args.apply else "Dry run complete. Use --apply to copy.")
    except Exception:
        # Driver exceptions can include health record values or connection details.
        print("Migration failed; transaction rolled back. Check connectivity, migrations and an empty target.")
        return 1
    finally:
        source.dispose()
        target.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
