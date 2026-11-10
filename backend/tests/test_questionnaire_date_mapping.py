from datetime import date, timezone
from remap_questionnaire_dates import mapped_submission


def test_shared_offset_keeps_relative_form_dates_and_original_clock_times():
    morning=mapped_submission('2026-10-21 13:53:25',-15)
    evening=mapped_submission('2026-10-22 08:03:42',-15)
    assert morning.date()==date(2026,10,6)
    assert evening.date()==date(2026,10,7)
    assert morning.strftime('%H:%M:%S')=='13:53:25'
    assert evening.strftime('%H:%M:%S')=='08:03:42'


def test_mapping_uses_local_calendar_days_across_dst():
    result=mapped_submission('2026-11-03 01:02:00',-15)
    assert result.date()==date(2026,10,19)
    assert result.hour==1
    assert result.astimezone(timezone.utc).isoformat()=='2026-10-18T23:02:00+00:00'
