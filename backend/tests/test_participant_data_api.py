from datetime import date
import pytest
from fastapi import HTTPException
from app.api.v1.participant_data import allowed_participants, get_data
from app.config import settings
from app.services.participant_data import hour_filter, fill_hourly_gaps


def test_unauthorized_participant_rejected_before_database_query():
    with pytest.raises(HTTPException) as exc:
        get_data('P002',date(2026,10,9),date(2026,10,9),'json','all',None,['P001'])
    assert exc.value.status_code==403


def test_reversed_and_unbounded_ranges_rejected():
    for start,end in [(date(2026,10,10),date(2026,10,9)),(date(2026,1,1),date(2026,10,9))]:
        with pytest.raises(HTTPException) as exc:
            get_data('P001',start,end,'json','all',None,['P001'])
        assert exc.value.status_code==422


def test_vercel_fails_closed_without_auth(monkeypatch):
    monkeypatch.setenv('VERCEL','1')
    monkeypatch.setattr(settings,'SUPABASE_URL','')
    with pytest.raises(HTTPException) as exc:
        allowed_participants(None)
    assert exc.value.status_code==503


def test_auth_required_when_supabase_configured(monkeypatch):
    monkeypatch.setattr(settings,'SUPABASE_URL','https://example.supabase.co')
    monkeypatch.setattr(settings,'SUPABASE_ANON_KEY','public-key')
    with pytest.raises(HTTPException) as exc:
        allowed_participants(None)
    assert exc.value.status_code==401


def test_verified_identity_uses_only_server_owned_grants(monkeypatch):
    monkeypatch.setattr(settings,'SUPABASE_URL','https://example.supabase.co')
    monkeypatch.setattr(settings,'SUPABASE_ANON_KEY','public-key')
    monkeypatch.setattr(settings,'AUTH_PARTICIPANT_ACCESS','{"user-one":["P001"]}')
    class Response:
        status_code=200
        def json(self):return {'id':'user-one','user_metadata':{'participant_code':'P002'}}
    monkeypatch.setattr('app.api.v1.participant_data.httpx.get',lambda *a,**kw:Response())
    assert allowed_participants('Bearer test')==['P001']


def test_day_night_filters_use_study_timezone():
    assert "Europe/Amsterdam" in hour_filter('h','day')
    assert '>=6' in hour_filter('h','day') and '<22' in hour_filter('h','day')
    assert '<6' in hour_filter('h','night') and '>=22' in hour_filter('h','night')


def test_chart_missing_hours_and_dst_fallback_are_not_invented():
    buckets=fill_hourly_gaps([],date(2026,10,25),date(2026,10,25),'all')
    assert len(buckets)==25
    assert all(b['bpm'] is None and b['samples']==0 for b in buckets)


def test_minute_heart_rate_keeps_dst_gaps_without_generating_readings():
    buckets=fill_hourly_gaps([],date(2026,10,25),date(2026,10,25),'all',step_minutes=1)
    assert len(buckets)==1500
    assert all(b['bpm'] is None and b['samples']==0 for b in buckets)


def test_sleep_comparison_is_bounded_to_one_overnight_window(monkeypatch):
    from app.api.v1 import participant_data
    calls=[]
    monkeypatch.setattr(participant_data,'get_data',lambda *a,**kw:calls.append((a,kw)))
    participant_data.sleep_comparison('P001',date(2026,10,6),None,['P001'])
    args,kwargs=calls[0]
    assert args[1:3]==(date(2026,10,5),date(2026,10,6))
    assert kwargs['trend_resolution']=='minute'


def test_minute_resolution_cannot_query_an_unbounded_date_range():
    from app.services.participant_data import dashboard_data
    with pytest.raises(ValueError,match='two calendar days'):
        dashboard_data(None,'P001',date(2026,10,5),date(2026,10,8),'json','all',trend_resolution='minute')
