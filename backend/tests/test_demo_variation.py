from datetime import date
from randomize_demo_view import profiles


def test_demo_variation_is_reproducible_and_limited_to_four_requested_dates():
    first=profiles()
    assert first==profiles()
    assert [day for day,_ in first]==[date(2026,10,d) for d in range(16,20)]
    assert len({p['heart_rate_factor'] for _,p in first})==4
    for _,p in first:
        assert .94<=p['heart_rate_factor']<=1.06
        assert .82<=p['steps_factor']<=1.18
        assert .92<=p['sleep_factor']<=1.08
