"""Import the two questionnaire XLSX exports without changing their dates.

No spreadsheet dependency is required: the generated flat XLSX tables are read
using their standard XML representation. Defaults to dry-run; --apply writes in
one transaction. Existing responses with conflicting values are never overwritten.
"""
import argparse
from datetime import date, datetime, timedelta, timezone, time
from decimal import Decimal
import hashlib
import json
from pathlib import Path, PurePosixPath
import uuid
import xml.etree.ElementTree as ET
from zipfile import ZipFile
from zoneinfo import ZoneInfo

from sqlalchemy import text
from app.config import settings
from app.db.session import build_engine

NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
ZONE=ZoneInfo('Europe/Amsterdam')
SCHEMA='health_analysis_test'
FIELDS={
 'Timestamp':'csv_submitted_at_original',
 'Rate your current energy level':'csv_energy_level',
 'Rate your sleep quality last night':'csv_sleep_quality',
 'What time did you go to bed yesterday?':'csv_bedtime',
 'What time do you think you actually fell asleep yesterday?':'csv_fell_asleep_time',
 'How many hours were you productive today, including studying, working, hobbies, or other meaningful activities?':'csv_productive_hours_original',
 'What time did you consume your last meal today?':'csv_last_meal_time',
}


def read_workbook(path,form):
    with ZipFile(path) as archive:
        strings=[]
        if 'xl/sharedStrings.xml' in archive.namelist():
            root=ET.fromstring(archive.read('xl/sharedStrings.xml'))
            strings=[''.join(t.text or '' for t in si.iterfind('.//s:t',NS)) for si in root.findall('s:si',NS)]
        workbook=ET.fromstring(archive.read('xl/workbook.xml'))
        sheets=workbook.find('s:sheets',NS)
        if len(sheets)!=1:raise ValueError('Expected one form per workbook.')
        sheet=sheets[0];rid=sheet.attrib['{'+REL+'}id']
        rels=ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        target=next(r.attrib['Target'] for r in rels if r.attrib['Id']==rid)
        sheet_path=target.lstrip('/') if target.startswith('/') else str(PurePosixPath('xl')/target)
        root=ET.fromstring(archive.read(sheet_path))
        headers=None;records=[]
        for row in root.findall('s:sheetData/s:row',NS):
            cells={}
            for cell in row.findall('s:c',NS):
                col=''.join(c for c in cell.attrib['r'] if c.isalpha())
                typ=cell.attrib.get('t');v=cell.find('s:v',NS)
                raw=v.text if v is not None else None
                if typ=='s':value=strings[int(raw)]
                elif typ=='inlineStr':value=''.join(t.text or '' for t in cell.iterfind('.//s:t',NS))
                elif typ in ('str','d'):value=raw
                elif raw is not None:value=Decimal(raw)
                else:value=None
                cells[col]=value
            if 'Timestamp' in cells.values() and 'Email Address' in cells.values():
                headers={k:v.strip() for k,v in cells.items() if isinstance(v,str)}
                continue
            if headers is None:continue
            values={name:cells.get(col) for col,name in headers.items()}
            if values.get('Timestamp') is None:continue
            expected={'Timestamp','Email Address','Rate your current energy level'}
            expected.update(('Rate your sleep quality last night','What time did you go to bed yesterday?','What time do you think you actually fell asleep yesterday?') if form=='morning' else ('How many hours were you productive today, including studying, working, hobbies, or other meaningful activities?','What time did you consume your last meal today?'))
            if not expected.issubset(values):raise ValueError('Expected questionnaire fields are missing.')
            records.append((int(row.attrib['r']),values))
        if not records:raise ValueError('No questionnaire responses found.')
        return sheet.attrib['name'],records


def excel_timestamp(value):
    if isinstance(value,Decimal):
        return datetime(1899,12,30)+timedelta(seconds=round(value*Decimal(86400)))
    return datetime.fromisoformat(str(value))


def excel_time(value):
    if value is None:return None
    if isinstance(value,Decimal):
        seconds=round((value%1)*Decimal(86400))%86400
        return time(seconds//3600,(seconds%3600)//60,seconds%60)
    return time.fromisoformat(str(value))


def make_response(values,participant,table):
    stamp=excel_timestamp(values['Timestamp'])
    if stamp.tzinfo is not None:raise ValueError('Expected a local questionnaire timestamp.')
    aware=stamp.replace(tzinfo=ZONE)
    if aware.astimezone(timezone.utc).astimezone(ZONE).replace(tzinfo=None)!=stamp:
        raise ValueError('Submission falls in a nonexistent local clock time.')
    if aware.utcoffset()!=stamp.replace(tzinfo=ZONE,fold=1).utcoffset():
        raise ValueError('Submission falls in an ambiguous local clock time.')
    digest=hashlib.sha256(json.dumps([table,aware.isoformat()],sort_keys=True,separators=(',',':')).encode()).hexdigest()
    result={'id':uuid.uuid5(uuid.NAMESPACE_URL,participant+digest),'participant_code':participant,
        'source':'ManualInput','study_date':stamp.date(),'observed_at':aware,'end_at':None,
        'json_present':False,'csv_present':True,
        'csv_submitted_at_original':stamp.isoformat(sep=' '),
        'interpretation_notes':'Imported from an Excel transcription of the supplied PDF. Clock times and scores are preserved as reported; no dates or AM/PM meanings are inferred.'}
    for question,column in FIELDS.items():
        if question not in values or question=='Timestamp':continue
        value=values[question]
        if column.endswith(('_bedtime','_fell_asleep_time','_last_meal_time')):value=excel_time(value)
        elif column in ('csv_energy_level','csv_sleep_quality'):
            if value is not None and (Decimal(str(value))!=int(value) or not 1<=int(value)<=5):raise ValueError('Questionnaire ratings must be whole numbers from 1 to 5.')
            value=int(value) if value is not None else None
        elif column=='csv_productive_hours_original':
            hours=Decimal(str(value)) if value is not None else None
            if hours is not None and not 0<=hours<=24:raise ValueError('Invalid daily productivity hours.')
            result['csv_productive_hours']=hours
            value=str(value) if value is not None else None
        result[column]=value
    if table=='morning_responses':result['csv_previous_sleep_date']=stamp.date()-timedelta(days=1)
    return result


def import_forms(connection,forms,participant):
    if not connection.scalar(text(f'SELECT 1 FROM {SCHEMA}.participants WHERE participant_code=:code'),{'code':participant}):
        raise ValueError('Target participant does not exist.')
    # Preserve the true source format in the file manifest, rather than labelling
    # an Excel workbook as a CSV. Existing JSON/CSV imports remain valid.
    constraints=connection.execute(text("SELECT conname FROM pg_constraint WHERE conrelid='health_analysis_test.import_files'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%format%'")).scalars().all()
    for constraint in constraints:
        quoted='"'+constraint.replace('"','""')+'"'
        connection.execute(text(f'ALTER TABLE {SCHEMA}.import_files DROP CONSTRAINT {quoted}'))
    connection.execute(text(f"ALTER TABLE {SCHEMA}.import_files ADD CONSTRAINT import_files_format_check CHECK(format IN ('json','csv','xlsx'))"))
    excluded_ids=set()
    has_exclusions=connection.scalar(text("SELECT 1 FROM information_schema.columns WHERE table_schema='health_analysis_test' AND table_name='import_files' AND column_name='excluded_rows'"))
    if has_exclusions:
        for exclusions in connection.execute(text(f'SELECT excluded_rows FROM {SCHEMA}.import_files WHERE participant_code=:code'),{'code':participant}).scalars():
            excluded_ids.update(entry['response_id'] for entry in (exclusions or {}).values() if isinstance(entry,dict) and entry.get('response_id'))
    for path,table,sheet,records in forms:
        checksum=hashlib.sha256(path.read_bytes()).hexdigest()
        file_id=uuid.uuid5(uuid.NAMESPACE_URL,participant+'|'+table+'|'+checksum)
        connection.execute(text(f'''INSERT INTO {SCHEMA}.import_files(id,participant_code,source,format,filename,sha256,row_count)
            VALUES (:id,:code,'ManualInput','xlsx',:filename,:checksum,:count) ON CONFLICT(id) DO NOTHING'''),
            {'id':file_id,'code':participant,'filename':'questionnaire_workbooks/'+path.name,'checksum':checksum,'count':len(records)})
        inserted=duplicates=excluded=0
        for row_number,values in records:
            data=make_response(values,participant,table)
            if str(data['id']) in excluded_ids:
                excluded+=1
                continue
            existing=connection.execute(text(f'SELECT * FROM {SCHEMA}.{table} WHERE id=:id'),{'id':data['id']}).mappings().first()
            prior_mapping=None
            if existing:
                prior_mapping=connection.scalar(text(f'''SELECT original_flat_fields->'_study_date_mapping'
                    FROM {SCHEMA}.{table}_provenance WHERE measurement_id=:id
                    AND original_flat_fields ? '_study_date_mapping' LIMIT 1'''),{'id':data['id']})
                if prior_mapping:
                    from remap_questionnaire_dates import mapped_submission
                    mapped=mapped_submission(data['csv_submitted_at_original'],prior_mapping['offset_days'])
                    data.update(study_date=mapped.date(),observed_at=mapped)
                    if table=='morning_responses':data['csv_previous_sleep_date']=mapped.date()-timedelta(days=1)
                if table=='morning_responses':
                    clock_date=connection.scalar(text(f'''SELECT original_flat_fields->'_reported_clock_date_alignment'->>'reported_sleep_date'
                        FROM {SCHEMA}.{table}_provenance WHERE measurement_id=:id
                        AND original_flat_fields ? '_reported_clock_date_alignment' LIMIT 1'''),{'id':data['id']})
                    if clock_date:data['csv_previous_sleep_date']=date.fromisoformat(clock_date)
                compare=[k for k in data if k not in ('interpretation_notes','csv_submitted_at_original')]
                if any(existing[k]!=data[k] for k in compare):raise ValueError('Conflicting response at an existing submission timestamp; no data overwritten.')
                duplicates+=1
            else:
                columns=','.join(data);placeholders=','.join(':'+k for k in data)
                connection.execute(text(f'INSERT INTO {SCHEMA}.{table} ({columns}) VALUES ({placeholders})'),data)
                inserted+=1
            original={k:str(v) if isinstance(v,Decimal) else v for k,v in values.items()}
            original.update({'_source_workbook':path.name,'_source_sheet':sheet,'_source_excel_row':row_number,
                '_source_pdf':'Jacks responses forms.pdf','_timestamp_interpretation':'Europe/Amsterdam'})
            if prior_mapping:original['_study_date_mapping']=prior_mapping
            # Keep user-confirmed clock-date corrections when refreshing provenance.
            if existing and table=='morning_responses' and clock_date:
                original['_reported_clock_date_alignment']=connection.scalar(text(f'''SELECT original_flat_fields->'_reported_clock_date_alignment'
                    FROM {SCHEMA}.{table}_provenance WHERE measurement_id=:id
                    AND original_flat_fields ? '_reported_clock_date_alignment' LIMIT 1'''),{'id':data['id']})
            connection.execute(text(f'''INSERT INTO {SCHEMA}.{table}_provenance(file_id,row_number,measurement_id,original_flat_fields)
                VALUES (:file,:row,:measurement,CAST(:original AS jsonb)) ON CONFLICT(file_id,row_number) DO NOTHING'''),
                {'file':file_id,'row':row_number,'measurement':data['id'],'original':json.dumps(original)})
        actual=connection.scalar(text(f'SELECT count(*) FROM {SCHEMA}.{table}_provenance WHERE file_id=:file'),{'file':file_id})
        if actual!=len(records)-excluded:raise ValueError('Imported provenance count does not match retained source rows.')
        print(f'{table}: {inserted} inserted; {duplicates} already present; {excluded} explicitly excluded; {actual} retained workbook rows verified.',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--participant',required=True)
    parser.add_argument('--morning',type=Path,required=True)
    parser.add_argument('--evening',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    forms=[]
    for path,form,table in ((args.morning,'morning','morning_responses'),(args.evening,'evening','evening_responses')):
        sheet,records=read_workbook(path,form)
        seen=set()
        for _,values in records:
            response=make_response(values,args.participant,table)
            if response['id'] in seen:raise ValueError('Duplicate submission timestamp inside a form; review source.')
            seen.add(response['id'])
        forms.append((path,table,sheet,records))
        print(f'{table}: validated {len(records)} source responses.',flush=True)
    if not args.apply:
        print('Dry run only; no database changes.');return
    with build_engine(settings.MIGRATION_DATABASE_URL or settings.DATABASE_URL).begin() as connection:
        import_forms(connection,forms,args.participant)
    print('Import committed for '+args.participant+'. Other participant records unchanged.',flush=True)


if __name__=='__main__':main()
