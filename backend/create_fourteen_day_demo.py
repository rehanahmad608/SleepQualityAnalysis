"""Create a labelled P001_DEMO dataset, preserving P001 unchanged.

Copies 6–15 October, then repeats 6, 8, 11, 9 October on 16–19 October.
Run without --apply to inspect the plan. All writes use one transaction.
"""
import argparse
import hashlib
from datetime import date, timedelta
import uuid
from sqlalchemy import text
from app.config import settings
from app.db.session import build_engine

SCHEMA='health_analysis_test'
TARGET='P001_DEMO'
TABLES=('heart_rate','hrv','steps','sleep','resting_heart_rate','morning_responses','evening_responses')
PLAN=[(date(2026,10,d),date(2026,10,d)) for d in range(6,16)]+[(date(2026,10,s),date(2026,10,t)) for s,t in ((6,16),(8,17),(11,18),(9,19))]

SHIFT_JSON='''CREATE OR REPLACE FUNCTION pg_temp.shift_demo_json(v jsonb,n integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; k text; x jsonb; BEGIN
 IF jsonb_typeof(v)='array' THEN SELECT coalesce(jsonb_agg(pg_temp.shift_demo_json(value,n)),'[]'::jsonb) INTO result FROM jsonb_array_elements(v); RETURN result;
 ELSIF jsonb_typeof(v)='object' THEN
  result='{}'::jsonb;
  FOR k,x IN SELECT * FROM jsonb_each(v) LOOP
   IF k IN ('startTime','endTime','createTime','updateTime','physicalTime') AND jsonb_typeof(x)='string' AND (x#>>'{}') ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN
    x=to_jsonb(to_char(((x#>>'{}')::timestamptz+n*interval '1 day') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
   ELSE x=pg_temp.shift_demo_json(x,n); END IF;
   result=result||jsonb_build_object(k,x);
  END LOOP; RETURN result;
 ELSE RETURN v; END IF;
END $$'''


def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--apply',action='store_true')
 parser.add_argument('--replace-day',type=date.fromisoformat)
 parser.add_argument('--source-day',type=date.fromisoformat)
 args=parser.parse_args()
 if bool(args.replace_day)!=bool(args.source_day):parser.error('Supply both --replace-day and --source-day.')
 if args.replace_day and not date(2026,10,6)<=args.replace_day<=date(2026,10,19):parser.error('Replacement date must be in the demo window.')
 plan=[(args.source_day,args.replace_day)] if args.replace_day else PLAN
 for source,target in plan:print(f'{target} <- {source}'+(' (repeated demo day)' if source!=target else ' (baseline copy)'),flush=True)
 if not args.apply:return 0
 engine=build_engine(settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL)
 with engine.begin() as c:
  exists=c.scalar(text(f'SELECT 1 FROM {SCHEMA}.participants WHERE participant_code=:code'),{'code':TARGET})
  if exists and not args.replace_day:
   raise ValueError('Demo participant already exists; refusing to overwrite it.')
  if args.replace_day and not exists:raise ValueError('No existing demo participant to update.')
  if not exists:c.execute(text(f"INSERT INTO {SCHEMA}.participants(participant_code,timezone) VALUES (:code,'Europe/Amsterdam')"),{'code':TARGET})
  def unchanged_snapshot():
   return {table:c.execute(text(f'''SELECT count(*),md5(coalesce(string_agg(md5(s::text),'' ORDER BY id),''))
      FROM {SCHEMA}.{table} s WHERE participant_code='P001' OR (participant_code=:code AND study_date<>:day)'''),{'code':TARGET,'day':args.replace_day}).one() for table in TABLES}
  before=unchanged_snapshot() if args.replace_day else None
  if args.replace_day:
   if not c.scalar(text(f"SELECT count(*) FROM {SCHEMA}.heart_rate WHERE participant_code='P001' AND study_date=:day"),{'day':args.source_day}):raise ValueError('Source date has no heart-rate data.')
   params={'code':TARGET,'day':args.replace_day}
   for table in TABLES:
    c.execute(text(f'CREATE INDEX IF NOT EXISTS {table}_provenance_measurement_idx ON {SCHEMA}.{table}_provenance(measurement_id)'))
    c.execute(text(f'DELETE FROM {SCHEMA}.{table}_provenance p USING {SCHEMA}.{table} m WHERE p.measurement_id=m.id AND m.participant_code=:code AND m.study_date=:day'),params)
    c.execute(text(f'DELETE FROM {SCHEMA}.{table} WHERE participant_code=:code AND study_date=:day'),params)
   c.execute(text(f'DELETE FROM {SCHEMA}.import_files WHERE participant_code=:code AND filename LIKE :prefix'),{'code':TARGET,'prefix':f'demo/{TARGET}/{args.replace_day}/%'})
   c.execute(text(f'DELETE FROM {SCHEMA}.demo_day_sources WHERE participant_code=:code AND target_date=:day'),params)
  c.execute(text(f'''CREATE TABLE IF NOT EXISTS {SCHEMA}.demo_datasets (
   participant_code text PRIMARY KEY REFERENCES {SCHEMA}.participants,
   source_participant text NOT NULL REFERENCES {SCHEMA}.participants,
   start_date date NOT NULL,end_date date NOT NULL,description text NOT NULL,
   created_at timestamptz NOT NULL DEFAULT now())'''))
  c.execute(text(f'''CREATE TABLE IF NOT EXISTS {SCHEMA}.demo_day_sources (
   participant_code text NOT NULL REFERENCES {SCHEMA}.demo_datasets,
   target_date date NOT NULL,source_date date NOT NULL,
   repeated_day boolean NOT NULL,PRIMARY KEY(participant_code,target_date))'''))
  for table in ('demo_datasets','demo_day_sources'):
   c.execute(text(f'ALTER TABLE {SCHEMA}.{table} ENABLE ROW LEVEL SECURITY'))
   c.execute(text(f'REVOKE ALL ON {SCHEMA}.{table} FROM PUBLIC'))
  description='DEMONSTRATION ONLY. Copied P001 data, not newly recorded health data. 6–15 Oct baseline; 16←6, 17←8, 18←11, 19←9 Oct.'
  if not args.replace_day:c.execute(text(f'INSERT INTO {SCHEMA}.demo_datasets VALUES (:code,\'P001\',\'2026-10-06\',\'2026-10-19\',:note,now())'),{'code':TARGET,'note':description})
  c.execute(text(SHIFT_JSON))
  for source,target in plan:
   shift=(target-source).days
   c.execute(text(f'INSERT INTO {SCHEMA}.demo_day_sources VALUES (:code,:target,:source,:repeated)'),{'code':TARGET,'target':target,'source':source,'repeated':source!=target})
   for table in TABLES:
    columns=c.execute(text('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=:schema AND table_name=:table ORDER BY ordinal_position'),{'schema':SCHEMA,'table':table}).all()
    names={name for name,_ in columns}
    expressions=[]
    for name,kind in columns:
     field=f's."{name}"'
     if name=='id':value="md5(s.id::text || ':' || :code || ':' || CAST(:target AS text))::uuid"
     elif name=='participant_code':value=':code'
     elif name=='study_date':value='CAST(:target AS date)'
     elif kind in ('timestamp with time zone','timestamp without time zone'):value=f"{field}+:shift*interval '1 day'"
     elif kind=='date':value=f'{field}+:shift'
     elif kind=='jsonb':value=f'pg_temp.shift_demo_json({field},:shift)'
     elif any(name.endswith('_date_'+part) for part in ('year','month','day')):
      prefix,part=name.rsplit('_',1)
      if all(prefix+'_'+p in names for p in ('year','month','day')):
       value=f'''extract({part} from make_date(s."{prefix}_year"::int,s."{prefix}_month"::int,s."{prefix}_day"::int)+:shift*interval '1 day')::int'''
      else:value=field
     else:value=field
     expressions.append(value)
    params={'code':TARGET,'target':target,'source':source,'shift':shift}
    column_sql=','.join('"'+name+'"' for name,_ in columns)
    c.execute(text(f'INSERT INTO {SCHEMA}.{table} ({column_sql}) SELECT '+','.join(expressions)+f" FROM {SCHEMA}.{table} s WHERE s.participant_code='P001' AND s.study_date=:source"),params)
    copied=c.scalar(text(f'SELECT count(*) FROM {SCHEMA}.{table} WHERE participant_code=:code AND study_date=:target'),params)
    expected=c.scalar(text(f"SELECT count(*) FROM {SCHEMA}.{table} WHERE participant_code='P001' AND study_date=:source"),params)
    if copied!=expected:raise ValueError('Copy verification failed')
    if not copied:continue
    filename=f'demo/{TARGET}/{target}/{table}-copied-from-{source}.database-copy'
    file_id=uuid.uuid5(uuid.NAMESPACE_URL,filename)
    checksum=hashlib.sha256(filename.encode()).hexdigest()
    c.execute(text(f'''INSERT INTO {SCHEMA}.import_files(id,participant_code,source,format,filename,sha256,row_count)
     VALUES (:id,:code,:kind,'json',:filename,:checksum,:count)'''),{'id':file_id,'code':TARGET,'kind':'ManualInput' if table.endswith('_responses') else 'Fitband','filename':filename,'checksum':checksum,'count':copied})
    c.execute(text(f'''INSERT INTO {SCHEMA}.{table}_provenance(file_id,row_number,measurement_id,original_flat_fields)
     SELECT :file,row_number() over(order by s.id),md5(s.id::text||':'||:code||':'||CAST(:target AS text))::uuid,
      jsonb_build_object('is_demo',true,'source_participant','P001','source_measurement_id',s.id,'source_date',CAST(:source AS text),'target_date',CAST(:target AS text),'note','Generated database copy, not an original export file. Both format fields retained where available.')
     FROM {SCHEMA}.{table} s WHERE s.participant_code='P001' AND s.study_date=:source'''),{**params,'file':file_id})
   print(f'Verified {target} from {source}',flush=True)
  if args.replace_day:
   if unchanged_snapshot()!=before:raise ValueError('Unrelated data changed; rolling back.')
   sources=c.execute(text(f'SELECT target_date,source_date FROM {SCHEMA}.demo_day_sources WHERE participant_code=:code AND repeated_day ORDER BY target_date'),{'code':TARGET}).all()
   description='DEMONSTRATION ONLY. Copied P001 data, not newly recorded health data. 6–15 Oct baseline; '+', '.join(f'{t.day}←{s.day}' for t,s in sources)+' Oct.'
   c.execute(text(f'UPDATE {SCHEMA}.demo_datasets SET description=:note WHERE participant_code=:code'),{'note':description,'code':TARGET})
   print('Verified original P001 and all other demo dates are byte-for-byte unchanged.',flush=True)
  for table in TABLES:
   print(table,c.scalar(text(f'SELECT count(*) FROM {SCHEMA}.{table} WHERE participant_code=:code'),{'code':TARGET}),flush=True)
 print('Demo committed; original P001 unchanged.',flush=True)
 engine.dispose()
 return 0


if __name__=='__main__':raise SystemExit(main())
