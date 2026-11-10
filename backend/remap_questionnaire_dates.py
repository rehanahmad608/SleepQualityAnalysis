"""Align XLSX questionnaire study dates on a labelled demo participant.

Only the two imported response workbooks are affected. Original timestamps stay
in csv_submitted_at_original and provenance. Stable response IDs are retained.
"""
import argparse
from datetime import date, datetime, timedelta, timezone
import json
from zoneinfo import ZoneInfo
from sqlalchemy import text
from app.config import settings
from app.db.session import build_engine

ZONE=ZoneInfo('Europe/Amsterdam')
WORKBOOKS={
 'morning_responses':'questionnaire_workbooks/Form_1_Midday_Sleep_and_Energy_Check_in.xlsx',
 'evening_responses':'questionnaire_workbooks/Form_2_Daily_Energy_and_Productivity_Check_in.xlsx',
}


def mapped_submission(original,offset):
    value=datetime.fromisoformat(original)
    if value.tzinfo is not None:value=value.astimezone(ZONE).replace(tzinfo=None)
    result=(value+timedelta(days=offset)).replace(tzinfo=ZONE)
    if result.astimezone(timezone.utc).astimezone(ZONE).replace(tzinfo=None)!=result.replace(tzinfo=None):
        raise ValueError('Mapped time does not exist in study timezone.')
    if result.utcoffset()!=result.replace(fold=1).utcoffset():raise ValueError('Mapped time is ambiguous in study timezone.')
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--participant',default='P001_DEMO')
    parser.add_argument('--source-start',type=date.fromisoformat,default=date(2026,10,21))
    parser.add_argument('--target-start',type=date.fromisoformat,default=date(2026,10,6))
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args();offset=(args.target_start-args.source_start).days
    engine=build_engine(settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL)
    with engine.begin() as c:
        if not c.scalar(text('SELECT 1 FROM health_analysis_test.demo_datasets WHERE participant_code=:code'),{'code':args.participant}):
            raise ValueError('Date alignment is restricted to a labelled demo dataset.')
        for table,filename in WORKBOOKS.items():
            rows=c.execute(text(f'''SELECT m.*,p.file_id,p.row_number,p.original_flat_fields
                FROM health_analysis_test.{table} m
                JOIN health_analysis_test.{table}_provenance p ON p.measurement_id=m.id
                JOIN health_analysis_test.import_files f ON f.id=p.file_id
                WHERE m.participant_code=:code AND f.participant_code=:code AND f.format='xlsx' AND f.filename=:filename
                ORDER BY m.observed_at'''),{'code':args.participant,'filename':filename}).mappings().all()
            if not rows:raise ValueError('No matching imported workbook responses found.')
            ids=[r['id'] for r in rows]
            # A compact exact snapshot protects original P001 and unrelated demo responses.
            def unrelated():
                return c.execute(text(f'''SELECT id,md5(m::text) FROM health_analysis_test.{table} m
                    WHERE participant_code='P001' OR (participant_code=:code AND id<>ALL(CAST(:ids AS uuid[]))) ORDER BY id'''),
                    {'code':args.participant,'ids':ids}).all()
            before=unrelated();dates=[];updated=0
            for row in rows:
                mapped=mapped_submission(row['csv_submitted_at_original'],offset)
                dates.append(mapped.date())
                original=row['original_flat_fields'] or {}
                prior=original.get('_study_date_mapping')
                if prior:
                    if prior['offset_days']!=offset or row['observed_at']!=mapped:raise ValueError('Different existing mapping requires explicit review.')
                    continue
                collision=c.scalar(text(f'''SELECT 1 FROM health_analysis_test.{table}
                    WHERE participant_code=:code AND observed_at=:stamp AND id<>:id'''),
                    {'code':args.participant,'stamp':mapped,'id':row['id']})
                if collision:raise ValueError('Mapped response collides with an existing submission.')
                if not args.apply:continue
                previous=mapped.date()-timedelta(days=1) if table=='morning_responses' else row['csv_previous_sleep_date']
                note=(row['interpretation_notes'] or '')+' Study date aligned for demo analysis; original submission timestamp preserved in csv_submitted_at_original and provenance.'
                c.execute(text(f'''UPDATE health_analysis_test.{table}
                    SET study_date=:day,observed_at=:stamp,csv_previous_sleep_date=:previous,interpretation_notes=:note
                    WHERE id=:id AND participant_code=:code'''),
                    {'day':mapped.date(),'stamp':mapped,'previous':previous,'note':note,'id':row['id'],'code':args.participant})
                mapping={'source_start':str(args.source_start),'target_start':str(args.target_start),'offset_days':offset,
                    'original_submitted_at':row['csv_submitted_at_original'],'mapped_study_timestamp':mapped.isoformat(),
                    'timezone':'Europe/Amsterdam','purpose':'Requested demo study-date alignment; original source is preserved.'}
                c.execute(text(f'''UPDATE health_analysis_test.{table}_provenance
                    SET original_flat_fields=original_flat_fields||jsonb_build_object('_study_date_mapping',CAST(:mapping AS jsonb))
                    WHERE file_id=:file AND row_number=:row'''),
                    {'mapping':json.dumps(mapping),'file':row['file_id'],'row':row['row_number']})
                updated+=1
            if unrelated()!=before:raise ValueError('Unrelated responses changed; rolling back.')
            print(f'{table}: {len(rows)} responses; {min(dates)} to {max(dates)}; {updated} updated.',flush=True)
    print('Mapping committed; original timestamps and unrelated data preserved.' if args.apply else 'Dry run complete; no changes.',flush=True)
    engine.dispose()


if __name__=='__main__':main()
