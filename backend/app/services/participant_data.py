"""Bounded read-only queries of the structured Supabase tables."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import text
from app.services.structured_columns import column_name


def hour_filter(alias,period):
    hour=f"EXTRACT(HOUR FROM {alias}.observed_at AT TIME ZONE 'Europe/Amsterdam')"
    return 'TRUE' if period=='all' else f'({hour}>=6 AND {hour}<22)' if period=='day' else f'({hour}<6 OR {hour}>=22)'


def fill_hourly_gaps(trend,start,end,period):
    zone=ZoneInfo('Europe/Amsterdam')
    cursor=datetime.combine(start,time.min,zone).astimezone(timezone.utc)
    stop=datetime.combine(end+timedelta(days=1),time.min,zone).astimezone(timezone.utc)
    indexed={r['timestamp'].astimezone(timezone.utc):r for r in trend}
    result=[]
    while cursor<stop:
        hour=cursor.astimezone(zone).hour
        included=period=='all' or (6<=hour<22 if period=='day' else hour<6 or hour>=22)
        result.append(indexed.get(cursor,{'timestamp':cursor,'bpm':None,'samples':0}) if included else {'timestamp':cursor,'bpm':None,'samples':0})
        cursor+=timedelta(hours=1)
    return result


def dashboard_data(db,code,start,end,fmt,period):
    if fmt not in ('json','csv') or period not in ('all','day','night'):
        raise ValueError('Invalid format or period')
    zone=ZoneInfo('Europe/Amsterdam')
    params={'code':code,'start':start,'end':end,'from_time':datetime.combine(start,time.min,zone),'to_time':datetime.combine(end+timedelta(days=1),time.min,zone)}
    variations=[]
    if code.endswith('_DEMO') and db.scalar(text("SELECT to_regclass('health_analysis_test.demo_variation')")):
        variations=list(db.execute(text('SELECT study_date,seed,parameters FROM health_analysis_test.demo_variation WHERE participant_code=:code AND study_date BETWEEN :start AND :end ORDER BY study_date'),params).mappings())
    for index,variation in enumerate(variations):
        params[f'vday{index}']=variation['study_date']
        params[f'vseed{index}']=str(variation['seed'])
        for key,value in variation['parameters'].items():params[f'v{index}_{key}']=value
    def setting(alias,key,default):
        branches=' '.join(f'WHEN {alias}.study_date=CAST(:vday{i} AS date) THEN :v{i}_{key}' for i in range(len(variations)))
        return f'(CASE {branches} ELSE {default} END)' if branches else str(default)
    def measure(alias,column,metric):
        original=f'{alias}."{column}"'
        if not variations:return original
        seed='(CASE '+' '.join(f'WHEN {alias}.study_date=CAST(:vday{i} AS date) THEN :vseed{i}' for i in range(len(variations)))+" ELSE '0' END)"
        noise=f"((('x'||substr(md5({alias}.id::text||{seed}),1,8))::bit(32)::bigint/4294967295.0-.5)*2)"
        factor=setting(alias,metric+'_factor',1)
        if metric=='heart_rate':
            changed=f'greatest(35,least(220,round(({original}*{factor}+{noise}*{setting(alias,"heart_rate_jitter",0)})::numeric)))'
        elif metric in ('steps','hrv'):
            value=f'{original}*{factor}*(1+{noise}*{setting(alias,metric+"_jitter",0)})'
            changed=f'greatest(0,round(({value})::numeric'+('))' if metric=='steps' else ',2))')
        elif metric=='resting':changed=f'round(({original}*{factor})::numeric)'
        else:changed=f'least(round(({original}*{factor})::numeric,1),extract(epoch from ({alias}.end_at-{alias}.observed_at))/60.0)'
        # Leave both missing values and dates without settings completely unchanged.
        dates=','.join(f'CAST(:vday{i} AS date)' for i in range(len(variations)))
        return f'(CASE WHEN {original} IS NULL THEN NULL WHEN {alias}.study_date IN ({dates}) THEN {changed} ELSE {original} END)'
    def rows(sql):
        return [dict(r) for r in db.execute(text(sql),params).mappings()]
    def base(alias):
        return f'{alias}.participant_code=:code AND {alias}.{fmt}_present AND {alias}.study_date BETWEEN :start AND :end'
    hr_value=measure('h',fmt+'_heart_rate_beats_per_minute','heart_rate')
    hr=rows(f'''SELECT h.study_date,avg({hr_value}) AS mean_bpm,
       min({hr_value}) AS min_bpm,max({hr_value}) AS max_bpm,
       count(*) AS samples FROM health_analysis_test.heart_rate h
       WHERE {base('h')} AND {hour_filter('h',period)} GROUP BY h.study_date''')
    trend=rows(f'''SELECT date_trunc('hour',h.observed_at) AS timestamp,
       avg({hr_value}) AS bpm,count(*) AS samples
       FROM health_analysis_test.heart_rate h WHERE {base('h')} AND {hour_filter('h',period)}
       GROUP BY date_trunc('hour',h.observed_at) ORDER BY timestamp''')
    trend=fill_hourly_gaps(trend,start,end,period)
    # Include only full step intervals inside one local day and selected period.
    # Overlaps, midnight crossings, and day/night boundary crossings are excluded.
    end_hour="EXTRACT(HOUR FROM (s.end_at-INTERVAL '1 microsecond') AT TIME ZONE 'Europe/Amsterdam')"
    start_hour="EXTRACT(HOUR FROM s.observed_at AT TIME ZONE 'Europe/Amsterdam')"
    duration="s.end_at-s.observed_at"
    period_interval='TRUE' if period=='all' else f'({start_hour}>=6 AND {end_hour}<22 AND {duration}<=INTERVAL \'16 hours\')' if period=='day' else f'(({start_hour}<6 AND {end_hour}<6) OR ({start_hour}>=22 AND {end_hour}>=22))'
    steps=rows(f'''WITH checked AS (
       SELECT s.*, ((s.end_at-INTERVAL '1 microsecond') AT TIME ZONE 'Europe/Amsterdam')::date=s.study_date
       AND s.end_at<=:to_time AND s.observed_at>=:from_time AND {period_interval}
       AND NOT EXISTS(SELECT 1 FROM health_analysis_test.steps o WHERE o.participant_code=s.participant_code
          AND o.{fmt}_present AND o.id<>s.id AND o.observed_at<s.end_at AND o.end_at>s.observed_at) AS safe
       FROM health_analysis_test.steps s WHERE {base('s')} AND {hour_filter('s',period)})
       SELECT study_date,sum({measure('checked',fmt+'_steps_count','steps')}) FILTER(WHERE safe) AS steps,
       count(*) FILTER(WHERE NOT safe) AS excluded_intervals FROM checked GROUP BY study_date''')
    sleep=rows(f'''SELECT s.study_date,sum({measure('s',fmt+'_sleep_summary_minutes_asleep','sleep')})/60.0 AS sleep_hours,
       count(*) AS sessions FROM health_analysis_test.sleep s WHERE {base('s')}
       GROUP BY s.study_date''')
    resting=rows(f'''SELECT r.study_date,avg({measure('r',fmt+'_daily_resting_heart_rate_beats_per_minute','resting')}) AS resting_bpm
       FROM health_analysis_test.resting_heart_rate r WHERE {base('r')} GROUP BY r.study_date''')
    # Column name is bounded by the schema generator's PostgreSQL identifier rules.
    hrv_column=fmt+'_'+column_name('heartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds')
    hrv=rows(f'''SELECT h.study_date,avg({measure('h',hrv_column,'hrv')}) AS hrv_rmssd_ms,count(*) AS hrv_samples
       FROM health_analysis_test.hrv h WHERE {base('h')} AND {hour_filter('h',period)} GROUP BY h.study_date''')
    morning=rows('''SELECT study_date,observed_at AS submitted_at,csv_energy_level AS energy,
       csv_sleep_quality AS sleep_quality,csv_bedtime AS bedtime,csv_fell_asleep_time AS fell_asleep_time,
       interpretation_notes FROM health_analysis_test.morning_responses
       WHERE participant_code=:code AND study_date BETWEEN :start AND :end ORDER BY observed_at''')
    evening=rows('''SELECT study_date,observed_at AS submitted_at,csv_energy_level AS energy,
       csv_productive_hours_original AS productivity_original,csv_productive_hours AS productive_hours,
       csv_last_meal_time AS last_meal_time,interpretation_notes FROM health_analysis_test.evening_responses
       WHERE participant_code=:code AND study_date BETWEEN :start AND :end ORDER BY observed_at''')
    daily={start+timedelta(days=i):{'date':start+timedelta(days=i),'mean_bpm':None,'min_bpm':None,'max_bpm':None,'samples':0,'steps':None,'excluded_intervals':0,'sleep_hours':None,'sessions':0,'resting_bpm':None,'hrv_rmssd_ms':None,'hrv_samples':0} for i in range((end-start).days+1)}
    for group in (hr,steps,sleep,resting,hrv):
        for row in group:
            day=row.pop('study_date')
            daily[day].update(row)
    samples=sum(d['samples'] for d in daily.values())
    valid_steps=[d['steps'] for d in daily.values() if d['steps'] is not None]
    valid_sleep=[d['sleep_hours'] for d in daily.values() if d['sleep_hours'] is not None]
    return {'participant_code':code,'timezone':'Europe/Amsterdam','start_date':start,'end_date':end,
       'synthetic_variation_dates':[v['study_date'] for v in variations],
       'format':fmt,'period':period,'day_hours':'06:00–22:00','night_hours':'22:00–06:00; calendar-date portions',
       'days':list(daily.values()),'heart_rate_trend':trend,'morning_responses':morning,'evening_responses':evening,
       'summary':{'mean_bpm':sum(d['mean_bpm']*d['samples'] for d in daily.values() if d['mean_bpm'] is not None)/samples if samples else None,
           'heart_rate_samples':samples,'steps':sum(valid_steps) if valid_steps else None,'valid_step_days':len(valid_steps),
           'excluded_step_intervals':sum(d['excluded_intervals'] for d in daily.values()),
           'mean_sleep_hours':sum(valid_sleep)/len(valid_sleep) if valid_sleep else None,'valid_sleep_days':len(valid_sleep)},
       'notes':['Sleep is grouped by wake date. Resting heart rate and questionnaires are daily and do not use the day/night filter.',
           'Heart rate is the arithmetic mean of observed samples, not a time-weighted mean.',
           'Step totals exclude overlapping or boundary-crossing intervals. Missing dates are not treated as zero.']}
