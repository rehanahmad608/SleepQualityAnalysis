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
    def rows(sql):
        return [dict(r) for r in db.execute(text(sql),params).mappings()]
    def base(alias):
        return f'{alias}.participant_code=:code AND {alias}.{fmt}_present AND {alias}.study_date BETWEEN :start AND :end'
    hr=rows(f'''SELECT h.study_date,avg(h.{fmt}_heart_rate_beats_per_minute) AS mean_bpm,
       min(h.{fmt}_heart_rate_beats_per_minute) AS min_bpm,max(h.{fmt}_heart_rate_beats_per_minute) AS max_bpm,
       count(*) AS samples FROM health_analysis_test.heart_rate h
       WHERE {base('h')} AND {hour_filter('h',period)} GROUP BY h.study_date''')
    trend=rows(f'''SELECT date_trunc('hour',h.observed_at) AS timestamp,
       avg(h.{fmt}_heart_rate_beats_per_minute) AS bpm,count(*) AS samples
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
       SELECT study_date,sum({fmt}_steps_count) FILTER(WHERE safe) AS steps,
       count(*) FILTER(WHERE NOT safe) AS excluded_intervals FROM checked GROUP BY study_date''')
    sleep=rows(f'''SELECT s.study_date,sum(s.{fmt}_sleep_summary_minutes_asleep)/60.0 AS sleep_hours,
       count(*) AS sessions FROM health_analysis_test.sleep s WHERE {base('s')}
       GROUP BY s.study_date''')
    resting=rows(f'''SELECT r.study_date,avg(r.{fmt}_daily_resting_heart_rate_beats_per_minute) AS resting_bpm
       FROM health_analysis_test.resting_heart_rate r WHERE {base('r')} GROUP BY r.study_date''')
    # Column name is bounded by the schema generator's PostgreSQL identifier rules.
    hrv_column=fmt+'_'+column_name('heartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds')
    hrv=rows(f'''SELECT h.study_date,avg(h."{hrv_column}") AS hrv_rmssd_ms,count(*) AS hrv_samples
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
       'format':fmt,'period':period,'day_hours':'06:00–22:00','night_hours':'22:00–06:00; calendar-date portions',
       'days':list(daily.values()),'heart_rate_trend':trend,'morning_responses':morning,'evening_responses':evening,
       'summary':{'mean_bpm':sum(d['mean_bpm']*d['samples'] for d in daily.values() if d['mean_bpm'] is not None)/samples if samples else None,
           'heart_rate_samples':samples,'steps':sum(valid_steps) if valid_steps else None,'valid_step_days':len(valid_steps),
           'excluded_step_intervals':sum(d['excluded_intervals'] for d in daily.values()),
           'mean_sleep_hours':sum(valid_sleep)/len(valid_sleep) if valid_sleep else None,'valid_sleep_days':len(valid_sleep)},
       'notes':['Sleep is grouped by wake date. Resting heart rate and questionnaires are daily and do not use the day/night filter.',
           'Heart rate is the arithmetic mean of observed samples, not a time-weighted mean.',
           'Step totals exclude overlapping or boundary-crossing intervals. Missing dates are not treated as zero.']}
