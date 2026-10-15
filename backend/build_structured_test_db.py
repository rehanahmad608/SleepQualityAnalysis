"""Build typed JSON/CSV comparison tables in health_analysis_test.

Run with --participant P001 to generate SQL and validate, then --apply to import.
Original raw test tables and application tables are preserved.
"""
import argparse
import csv
import hashlib
import json
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from psycopg import sql
from psycopg.types.json import Jsonb

from app.config import settings
from app.db.session import build_engine

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = 'health_analysis_test'
ZONE = ZoneInfo('Europe/Amsterdam')
METRICS = {'heart-rate': 'heart_rate', 'heart-rate-variability': 'hrv',
           'steps': 'steps', 'sleep': 'sleep', 'daily-resting-heart-rate': 'resting_heart_rate'}
NUMERIC = ('beatsPerMinute', 'count', 'rootMeanSquareOfSuccessiveDifferencesMilliseconds',
           'highFrequencyPower', 'lowFrequencyPower', 'minutesInSleepPeriod',
           'minutesAfterWakeUp', 'minutesToFallAsleep', 'minutesAsleep', 'minutesAwake')
ARRAYS = ('sleep.stages', 'sleep.shortAwakenings', 'sleep.summary.stagesSummary')
from app.services.structured_columns import MANUAL, column_name  # noqa: E402,F401


def flatten(value, prefix=''):
    result = {}
    for key, item in value.items():
        path = f'{prefix}.{key}' if prefix else key
        if isinstance(item, dict):
            result.update(flatten(item, path))
        else:
            result[path] = item
    return result


def field_type(path):
    if path in ('Rate your current energy level', 'Rate your sleep quality last night'):
        return 'integer'
    if path in ARRAYS:
        return 'jsonb'
    if path.split('.')[-1] in NUMERIC:
        return 'numeric'
    if path.endswith(('.processed', '.mainSleep')):
        return 'boolean'
    if path.endswith(('physicalTime', '.startTime', '.endTime', '.createTime', '.updateTime')):
        return 'timestamptz'
    if path in ('What time did you go to bed yesterday?', 'What time do you think you actually fell asleep yesterday?', 'What time did you consume your last meal today?'):
        return 'time'
    if path.split('.')[-1] in ('year', 'month', 'day', 'hours', 'minutes', 'seconds'):
        return 'integer'
    return 'text'


def convert(path, value):
    if value is None or value == '':
        return None
    kind = field_type(path)
    if kind == 'jsonb':
        return json.loads(value) if isinstance(value, str) else value
    if kind == 'numeric':
        from decimal import Decimal
        return Decimal(str(value))
    if kind == 'integer':
        return int(value)
    if kind == 'boolean':
        if str(value).lower() not in ('true', 'false'):
            raise ValueError('Invalid boolean')
        return str(value).lower() == 'true'
    if kind == 'timestamptz':
        stamp = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            raise ValueError('Wearable timestamp lacks an offset')
        return stamp.astimezone(timezone.utc)
    if kind == 'time':
        from datetime import time
        return time.fromisoformat(str(value))
    return str(value)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, separators=(',', ':')).encode()).hexdigest()


def identify(metric, data):
    if metric in ('morning_responses', 'evening_responses'):
        stamp = datetime.fromisoformat(data['Timestamp']).replace(tzinfo=ZONE)
        return stamp, None, stamp.date(), [metric, stamp.isoformat()]
    if metric == 'resting_heart_rate':
        day = date(*(int(data[f'dailyRestingHeartRate.date.{part}']) for part in ('year', 'month', 'day')))
        return None, None, day, [metric, str(day), data.get('dataSource.device.displayName'), str(convert('dailyRestingHeartRate.beatsPerMinute', data['dailyRestingHeartRate.beatsPerMinute']))]
    base = {'heart_rate': 'heartRate', 'hrv': 'heartRateVariability', 'steps': 'steps', 'sleep': 'sleep'}[metric]
    start_key = base + ('.sampleTime.physicalTime' if metric in ('heart_rate', 'hrv') else '.interval.startTime')
    start = convert(start_key, data[start_key])
    end_key = base + '.interval.endTime'
    end = convert(end_key, data[end_key]) if end_key in data else None
    day = (end if metric == 'sleep' else start).astimezone(ZONE).date()
    value_key = {'heart_rate': 'heartRate.beatsPerMinute', 'hrv': 'heartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds', 'steps': 'steps.count', 'sleep': 'sleep.summary.minutesAsleep'}[metric]
    identity = [metric, str(start), str(end), data.get('dataSource.device.displayName'), str(convert(value_key, data.get(value_key)))]
    if metric == 'sleep':
        identity.append(data.get('name'))
    return start, end, day, identity


def load_files():
    files = []
    for folder in ('health-export9oct', 'health-export10oct'):
        for path in sorted((ROOT/folder).glob('*.json')):
            if path.stem not in METRICS:
                continue
            records = json.loads(path.read_text(encoding='utf-8-sig'))['dataPoints']
            files.append((path, 'json', METRICS[path.stem], [flatten(row) for row in records]))
    for path in sorted((ROOT/'Data Files').rglob('*.csv')):
        metric = METRICS.get(path.stem)
        if metric is None:
            metric = 'evening_responses' if path.stem.startswith('evening_response') else 'morning_responses' if path.stem.startswith('midday_response') else None
        if metric is None:
            raise ValueError(f'Unrecognized CSV file: {path.name}')
        with path.open(encoding='utf-8-sig', newline='') as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or len(set(h.strip() for h in reader.fieldnames)) != len(reader.fieldnames):
                raise ValueError('Duplicate CSV headers')
            records = []
            for row in reader:
                if None in row or any(v is None for v in row.values()):
                    raise ValueError('CSV column count mismatch')
                records.append({k.strip(): v for k, v in row.items()})
        files.append((path, 'csv', metric, records))
    return files


def build_columns(files):
    columns = {}
    for _, fmt, metric, rows in files:
        fields = columns.setdefault(metric, {})
        for row in rows:
            for path, value in row.items():
                name = fmt + '_' + column_name(path)
                if name in fields and fields[name][0] != path:
                    raise ValueError('Column name collision')
                fields[name] = (path, field_type(path))
                convert(path, value)
            identify(metric, row)
    return columns


def make_schema(columns):
    statements = [f'CREATE SCHEMA IF NOT EXISTS {SCHEMA}',
        f'''CREATE TABLE IF NOT EXISTS {SCHEMA}.participants (
            participant_code text PRIMARY KEY, timezone text NOT NULL DEFAULT 'Europe/Amsterdam')''',
        f'''CREATE TABLE IF NOT EXISTS {SCHEMA}.import_files (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES {SCHEMA}.participants,
            source text NOT NULL CHECK (source IN ('Fitband','ManualInput')),
            format text NOT NULL CHECK (format IN ('json','csv')), filename text NOT NULL,
            sha256 text NOT NULL, row_count integer NOT NULL CHECK(row_count>=0),
            imported_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(participant_code, filename, sha256))''']
    for metric, fields in columns.items():
        typed = ',\n'.join(f'"{name}" {kind}' for name, (_, kind) in sorted(fields.items()))
        statements.append(f'''CREATE TABLE IF NOT EXISTS {SCHEMA}.{metric} (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES {SCHEMA}.participants,
            source text NOT NULL CHECK(source IN ('Fitband','ManualInput')),
            study_date date NOT NULL, observed_at timestamptz, end_at timestamptz,
            json_present boolean NOT NULL DEFAULT false, csv_present boolean NOT NULL DEFAULT false,
            {typed}, CHECK(end_at IS NULL OR end_at>observed_at))''')
        statements.append(f'CREATE INDEX IF NOT EXISTS {metric}_participant_date_idx ON {SCHEMA}.{metric}(participant_code,study_date,observed_at)')
        if metric.endswith('_responses'):
            statements.append(f'ALTER TABLE {SCHEMA}.{metric} ADD COLUMN IF NOT EXISTS csv_previous_sleep_date date')
            statements.append(f'ALTER TABLE {SCHEMA}.{metric} ADD COLUMN IF NOT EXISTS csv_productive_hours numeric')
            statements.append(f'ALTER TABLE {SCHEMA}.{metric} ADD COLUMN IF NOT EXISTS interpretation_notes text')
            for score in ('csv_energy_level', 'csv_sleep_quality'):
                if score in fields:
                    statements.append(f'''DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='{metric}_{score}_range' AND connamespace='{SCHEMA}'::regnamespace) THEN
                        ALTER TABLE {SCHEMA}.{metric} ADD CONSTRAINT {metric}_{score}_range CHECK({score} BETWEEN 1 AND 10); END IF; END $$''')
        statements.append(f'''CREATE TABLE IF NOT EXISTS {SCHEMA}.{metric}_provenance (
            file_id uuid NOT NULL REFERENCES {SCHEMA}.import_files,
            row_number integer NOT NULL CHECK(row_number>0),
            measurement_id uuid NOT NULL REFERENCES {SCHEMA}.{metric},
            original_flat_fields jsonb NOT NULL,
            PRIMARY KEY(file_id,row_number))''')
    tables = ['participants', 'import_files'] + list(columns) + [m+'_provenance' for m in columns]
    for table in tables:
        statements.append(f'ALTER TABLE {SCHEMA}.{table} ENABLE ROW LEVEL SECURITY')
    statements += [f'REVOKE ALL ON SCHEMA {SCHEMA} FROM PUBLIC', f'REVOKE ALL ON ALL TABLES IN SCHEMA {SCHEMA} FROM PUBLIC']
    return statements


def apply(connection, files, columns, participant):
    with connection.cursor() as cur:
        for statement in make_schema(columns):
            cur.execute(statement)
        cur.execute(f'INSERT INTO {SCHEMA}.participants(participant_code) VALUES (%s) ON CONFLICT DO NOTHING', (participant,))
        for path, fmt, metric, rows in files:
            filename = path.relative_to(ROOT).as_posix()
            checksum = hashlib.sha256(path.read_bytes()).hexdigest()
            file_id = uuid.uuid5(uuid.NAMESPACE_URL, participant+filename+checksum)
            source = 'ManualInput' if metric.endswith('_responses') else 'Fitband'
            cur.execute(f'INSERT INTO {SCHEMA}.import_files(id,participant_code,source,format,filename,sha256,row_count) VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING', (file_id, participant, source, fmt, filename, checksum, len(rows)))
            selected = [(name, p) for name, (p, _) in sorted(columns[metric].items()) if name.startswith(fmt+'_')]
            names = ['id','participant_code','source','study_date','observed_at','end_at',fmt+'_present']+[name for name,_ in selected]
            extras = ['csv_previous_sleep_date','csv_productive_hours','interpretation_notes'] if metric.endswith('_responses') else []
            names += extras
            update = [n for n in names if n not in ('id','participant_code','source','study_date','observed_at','end_at')]
            statement = sql.SQL('INSERT INTO {}.{} ({}) VALUES ({}) ON CONFLICT(id) DO UPDATE SET {}').format(
                sql.Identifier(SCHEMA), sql.Identifier(metric), sql.SQL(',').join(map(sql.Identifier,names)),
                sql.SQL(',').join(sql.Placeholder() for _ in names),
                sql.SQL(',').join(sql.SQL('{}=EXCLUDED.{}').format(sql.Identifier(n),sql.Identifier(n)) for n in update))
            for offset in range(0,len(rows),1000):
                batch, provenance = [], []
                for index,row in enumerate(rows[offset:offset+1000],start=offset+1):
                    start,end,day,identity = identify(metric,row)
                    mid = uuid.uuid5(uuid.NAMESPACE_URL, participant+digest(identity))
                    values = [mid,participant,source,day,start,end,True]
                    for _,p in selected:
                        value = convert(p,row.get(p))
                        values.append(Jsonb(value) if field_type(p)=='jsonb' and value is not None else value)
                    if extras:
                        # Ambiguous clock times and invalid durations are preserved, never guessed.
                        values += [day-timedelta(days=1) if metric=='morning_responses' else None, None,
                            'Time-only answers are literal; AM/PM and overnight dates require confirmation. Productivity response is not assumed to be hours.']
                    batch.append(values)
                    provenance.append((file_id,index,mid,Jsonb(row)))
                cur.executemany(statement,batch)
                cur.executemany(f'INSERT INTO {SCHEMA}.{metric}_provenance(file_id,row_number,measurement_id,original_flat_fields) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING',provenance)
            cur.execute(f'SELECT count(*) FROM {SCHEMA}.{metric}_provenance WHERE file_id=%s',(file_id,))
            if cur.fetchone()[0] != len(rows):
                raise ValueError('Imported row count mismatch')
            print(f'{filename}: verified {len(rows)} source rows',flush=True)
        for metric in columns:
            cur.execute(f'SELECT count(*), count(*) FILTER(WHERE json_present AND csv_present) FROM {SCHEMA}.{metric}')
            count,matched = cur.fetchone()
            print(f'{metric}: {count} measurements, {matched} with JSON and CSV side by side',flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--participant',required=True)
    parser.add_argument('--apply',action='store_true')
    args = parser.parse_args()
    files = load_files()
    columns = build_columns(files)
    out = ROOT/'backend'/'structured_test_schema.sql'
    out.write_text(';\n\n'.join(make_schema(columns))+';\n',encoding='utf-8')
    mapping = {metric:{name:{'original_field':p,'sql_type':kind} for name,(p,kind) in fields.items()} for metric,fields in columns.items()}
    (ROOT/'backend'/'structured_column_mapping.json').write_text(json.dumps(mapping,indent=2),encoding='utf-8')
    print(f'Validated {len(files)} files and {sum(len(r) for _,_,_,r in files)} rows.',flush=True)
    if not args.apply:
        print('Schema and column mapping generated. No database changes.')
        return 0
    engine = build_engine(settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL)
    try:
        with engine.connect() as conn:
            with conn.connection.driver_connection.transaction():
                apply(conn.connection.driver_connection,files,columns,args.participant)
        print('Structured test import committed.',flush=True)
    except Exception as exc:
        print(f'Import failed ({type(exc).__name__}); transaction rolled back. Details withheld to protect source records.')
        return 1
    finally:
        engine.dispose()
    return 0


if __name__=='__main__':
    raise SystemExit(main())
