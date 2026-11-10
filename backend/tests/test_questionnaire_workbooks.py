from datetime import datetime, timezone
from decimal import Decimal
import pytest
from import_questionnaire_workbooks import excel_timestamp,excel_time,make_response


def test_excel_dates_and_times_preserve_seconds_without_float_drift():
    assert excel_timestamp(Decimal('1.5'))==datetime(1899,12,31,12)
    assert excel_time(Decimal('0.1875')).isoformat()=='04:30:00'


def test_submission_uses_amsterdam_offset_on_both_sides_of_dst():
    def response(stamp):
        return make_response({'Timestamp':stamp,'Rate your current energy level':Decimal(3)},'P001_DEMO','evening_responses')
    assert response('2026-10-21 12:00')['observed_at'].astimezone(timezone.utc).hour==10
    assert response('2026-11-02 12:00')['observed_at'].astimezone(timezone.utc).hour==11
    assert response('2026-11-02 12:00')['participant_code']=='P001_DEMO'


def test_multiple_submissions_on_same_day_keep_distinct_stable_ids():
    first={'Timestamp':'2026-11-03 01:02','Rate your current energy level':Decimal(1)}
    second={**first,'Timestamp':'2026-11-03 22:58'}
    a=make_response(first,'P001_DEMO','evening_responses')
    b=make_response(second,'P001_DEMO','evening_responses')
    assert a['id']!=b['id']
    assert a['id']==make_response(first,'P001_DEMO','evening_responses')['id']


def test_nonexistent_or_ambiguous_submission_times_are_not_guessed():
    for stamp in ('2026-10-25 02:30','2026-03-29 02:30'):
        with pytest.raises(ValueError):
            make_response({'Timestamp':stamp},'P001_DEMO','evening_responses')


@pytest.mark.parametrize('field', ['Rate your current energy level', 'Rate your sleep quality last night'])
def test_questionnaire_ratings_use_a_five_point_scale(field):
    values = {'Timestamp': '2026-10-06 08:00', field: 5}
    make_response(values, 'P001_DEMO', 'morning_responses')
    for value in (0, 6, Decimal('3.5')):
        with pytest.raises(ValueError, match='1 to 5'):
            make_response({**values, field: value}, 'P001_DEMO', 'morning_responses')
