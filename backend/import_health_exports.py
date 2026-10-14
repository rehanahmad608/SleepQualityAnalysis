"""Import original health JSON into an isolated Supabase test schema.

Dry run: python import_health_exports.py
Cloud import: python import_health_exports.py --apply
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

from sqlalchemy import text
from psycopg.types.json import Jsonb

from app.config import settings
from app.db.session import build_engine

SCHEMA_SQL = '''
CREATE SCHEMA IF NOT EXISTS health_export_test;
CREATE TABLE IF NOT EXISTS health_export_test.exports (
    export_name text PRIMARY KEY,
    report jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS health_export_test.records (
    metric text NOT NULL,
    record_hash text NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (metric, record_hash)
);
CREATE TABLE IF NOT EXISTS health_export_test.export_records (
    export_name text NOT NULL REFERENCES health_export_test.exports(export_name),
    metric text NOT NULL,
    record_hash text NOT NULL,
    PRIMARY KEY (export_name, metric, record_hash),
    FOREIGN KEY (metric, record_hash) REFERENCES health_export_test.records(metric, record_hash)
);
CREATE TABLE IF NOT EXISTS health_export_test.csv_records (
    source_file text NOT NULL,
    record_hash text NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (source_file, record_hash)
);
ALTER TABLE health_export_test.exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_export_test.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_export_test.export_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_export_test.csv_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA health_export_test FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA health_export_test FROM PUBLIC;
'''


def fingerprint(record):
    return hashlib.sha256(json.dumps(record, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()


def read_exports(folders):
    exports = []
    for folder in folders:
        report = json.loads((folder / 'report.json').read_text(encoding='utf-8-sig'))
        metrics = {}
        for path in sorted(folder.glob('*.json')):
            if path.name == 'report.json':
                continue
            data = json.loads(path.read_text(encoding='utf-8-sig'))
            if not isinstance(data, dict) or not isinstance(data.get('dataPoints'), list):
                raise ValueError(f'Expected dataPoints list in {path.name}')
            records = data['dataPoints']
            if not all(isinstance(record, dict) for record in records):
                raise ValueError(f'Expected object records in {path.name}')
            metrics[path.stem] = records
        exports.append((folder.name, report, metrics))
    return exports


def read_csv_exports(folder):
    files = []
    for path in sorted(folder.rglob('*.csv')):
        with path.open(encoding='utf-8-sig', newline='') as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
                raise ValueError(f'Invalid or duplicate CSV headers in {path.name}')
            rows = list(reader)
            if any(None in row or any(v is None for v in row.values()) for row in rows):
                raise ValueError(f'CSV column count mismatch in {path.name}')
            files.append((path.relative_to(folder).as_posix(), rows))
    return files


def import_exports(connection, exports, csv_files=()):
    with connection.cursor() as cursor:
        for statement in SCHEMA_SQL.split(';'):
            if statement.strip():
                cursor.execute(statement)
        for name, report, metrics in exports:
            cursor.execute('INSERT INTO health_export_test.exports(export_name, report) VALUES (%s,%s) ON CONFLICT (export_name) DO NOTHING', (name, Jsonb(report)))
            for metric, records in metrics.items():
                hashes = set()
                for offset in range(0, len(records), 1000):
                    batch = [(metric, fingerprint(r), Jsonb(r)) for r in records[offset:offset+1000]]
                    cursor.executemany('INSERT INTO health_export_test.records(metric,record_hash,payload) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING', batch)
                    cursor.executemany('INSERT INTO health_export_test.export_records(export_name,metric,record_hash) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING', [(name,m,h) for m,h,_ in batch])
                    hashes.update(h for _,h,_ in batch)
                cursor.execute('SELECT count(*) FROM health_export_test.export_records WHERE export_name=%s AND metric=%s', (name, metric))
                if cursor.fetchone()[0] != len(hashes):
                    raise ValueError('Export count mismatch; use a new folder name for modified exports.')
                print(f'{name} / {metric}: verified {len(hashes)} unique records', flush=True)
        cursor.execute('SELECT metric,count(*) FROM health_export_test.records GROUP BY metric ORDER BY metric')
        print('Unique records across both exports:', flush=True)
        for metric, count in cursor.fetchall():
            print(f'  {metric}: {count}', flush=True)
        for filename, rows in csv_files:
            hashes = {fingerprint(row) for row in rows}
            for offset in range(0, len(rows), 1000):
                cursor.executemany('INSERT INTO health_export_test.csv_records(source_file,record_hash,payload) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING', [(filename, fingerprint(row), Jsonb(row)) for row in rows[offset:offset+1000]])
            cursor.execute('SELECT count(*) FROM health_export_test.csv_records WHERE source_file=%s', (filename,))
            if cursor.fetchone()[0] != len(hashes):
                raise ValueError('CSV count mismatch; use a new filename for modified exports.')
            print(f'CSV {filename}: verified {len(hashes)} unique records', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folders', nargs='*', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--csv-folder', type=Path, help='Also import CSV rows as separate raw test records.')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    folders = args.folders or [root/'health-export9oct', root/'health-export10oct']
    exports = read_exports(folders)
    csv_files = read_csv_exports(args.csv_folder) if args.csv_folder else []
    for filename, rows in csv_files:
        print(f'CSV {filename}: {len(rows)} source rows', flush=True)
    for name, _, metrics in exports:
        for metric, records in metrics.items():
            print(f'{name} / {metric}: {len(records)} source records', flush=True)
    if not args.apply:
        print('Dry run complete; no database changes. Add --apply to import.')
        return 0
    url = settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL
    if not url.startswith('postgres'):
        parser.error('Configure a PostgreSQL connection before importing.')
    engine = build_engine(url)
    try:
        with engine.connect() as conn:
            raw = conn.connection.driver_connection
            with raw.transaction():
                import_exports(raw, exports, csv_files)
        print('Import committed. Existing application tables were untouched.')
    except Exception as exc:
        # Do not expose record values, passwords or connection strings.
        print(f'Import failed ({type(exc).__name__}); no partial import committed.')
        return 1
    finally:
        engine.dispose()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
