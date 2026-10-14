from datetime import date, timezone

from build_structured_test_db import flatten, column_name, convert, identify, make_schema


def test_json_csv_identity_matches_numeric_strings_and_offsets():
    json_row = flatten({'dataSource': {'device': {'displayName':'test'}}, 'heartRate': {'beatsPerMinute':'65', 'sampleTime': {'physicalTime':'2026-10-09T00:00:00Z'}}})
    csv_row = dict(json_row, **{'heartRate.beatsPerMinute':65, 'heartRate.sampleTime.physicalTime':'2026-10-09T02:00:00+02:00'})
    assert identify('heart_rate', json_row)[3] == identify('heart_rate', csv_row)[3]
    assert identify('heart_rate', json_row)[2] == date(2026,10,9)


def test_sleep_uses_wake_date_and_timestamps_remain_utc():
    row = {'sleep.interval.startTime':'2026-10-09T22:00:00+02:00','sleep.interval.endTime':'2026-10-10T06:00:00+02:00','sleep.summary.minutesAsleep':'400','name':'test'}
    start, _, day, _ = identify('sleep',row)
    assert day == date(2026,10,10)
    assert start.tzinfo == timezone.utc


def test_long_column_names_fit_postgres_and_remain_distinct():
    a=column_name('heartRateVariability.'+'x'*80+'a')
    b=column_name('heartRateVariability.'+'x'*80+'b')
    assert len('json_'+a)<=63
    assert a!=b


def test_nested_stages_and_manual_times_preserve_values():
    assert convert('sleep.stages','[{"type":"REM"}]') == [{'type':'REM'}]
    assert str(convert('What time did you go to bed yesterday?','12:15')) == '12:15:00'
    assert convert('How many hours were you productive today, including studying, working, hobbies, or other meaningful activities?','28:00:00') == '28:00:00'
