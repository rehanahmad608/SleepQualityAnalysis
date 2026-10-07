from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from io import BytesIO
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def _build_sample_payload(participant_code: str = "P001", seed: int = 1):
    import random
    rng = random.Random(seed)
    payload = {
        "schema_version": "1",
        "participant_code": participant_code,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sleep_sessions": [],
        "heart_rate_samples": [],
        "step_intervals": [],
    }
    for d in range(3):
        day = date(2026, 9, 24) + timedelta(days=d)
        ss_key = f"import-d{d + 1}-main"
        start_ams = datetime.combine(day - timedelta(days=1), datetime.min.time()) + timedelta(hours=23, minutes=15 + rng.randint(0, 40))
        import pytz
        ams = pytz.timezone("Europe/Amsterdam")
        start_utc = ams.localize(start_ams).astimezone(timezone.utc)
        hours = rng.uniform(6.5, 8.0)
        end_utc = start_utc + timedelta(hours=hours)
        payload["sleep_sessions"].append({
            "provider_session_key": ss_key,
            "source_id": f"src-{ss_key}",
            "start_at": start_utc.isoformat(),
            "end_at": end_utc.isoformat(),
            "wake_date": day.isoformat(),
            "asleep_seconds": int(hours * 3600 * 0.92),
            "in_bed_seconds": int(hours * 3600),
            "is_main": True,
            "classification_origin": "provider",
            "segments": [
                {
                    "segment_key": f"{ss_key}-s{i}",
                    "start_at": (start_utc + timedelta(minutes=i * 30)).isoformat(),
                    "end_at": (start_utc + timedelta(minutes=(i + 1) * 30)).isoformat(),
                    "stage_label": rng.choice(["light", "deep", "rem", "awake"]),
                    "segment_kind": "stage",
                }
                for i in range(max(1, int(hours * 2)))
            ],
        })
        for m in range(0, 24 * 60, 5):
            sample_key = f"hr-{d + 1}-{m}"
            t_ams = ams.localize(datetime.combine(day, datetime.min.time()) + timedelta(minutes=m))
            payload["heart_rate_samples"].append({
                "provider_sample_key": sample_key,
                "source_id": f"src-{sample_key}",
                "observed_at": t_ams.astimezone(timezone.utc).isoformat(),
                "bpm": round(rng.uniform(58, 110), 1),
            })
        for h in range(8, 22, 3):
            iv_key = f"steps-{d + 1}-{h}"
            s_ams = ams.localize(datetime.combine(day, datetime.min.time()) + timedelta(hours=h))
            payload["step_intervals"].append({
                "provider_interval_key": iv_key,
                "source_id": f"src-{iv_key}",
                "start_at": s_ams.astimezone(timezone.utc).isoformat(),
                "end_at": (s_ams + timedelta(minutes=30)).astimezone(timezone.utc).isoformat(),
                "step_count": rng.randint(100, 800),
            })
    return payload


def test_invalid_json_rejected(client: TestClient):
    data = b"this is not valid json {{"
    resp = client.post(
        "/api/v1/import",
        files={"file": ("bad.json", BytesIO(data), "application/json")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert len(body["validation_errors"]) >= 1


def test_invalid_schema_rejected(client: TestClient):
    bad_payload = {"schema_version": "999", "participant_code": "P001", "sleep_sessions": [{}]}
    data = json.dumps(bad_payload).encode()
    resp = client.post(
        "/api/v1/import",
        files={"file": ("bad.json", BytesIO(data), "application/json")},
    )
    body = resp.json()
    assert body["success"] is False
    assert any("schema" in e.lower() or "schema_version" in e for e in body["validation_errors"])


def test_valid_import_succeeds(client: TestClient):
    payload = _build_sample_payload()
    data = json.dumps(payload).encode()
    resp = client.post(
        "/api/v1/import",
        files={"file": ("good.json", BytesIO(data), "application/json")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True, f"Import failed: {body}"
    assert body["stats"]["sleep_sessions_upserted"] == 3
    assert body["stats"]["heart_rate_samples_upserted"] > 0
    assert body["stats"]["step_intervals_upserted"] > 0


def test_duplicate_import_does_not_inflate(client: TestClient):
    payload = _build_sample_payload(seed=7)
    data = json.dumps(payload).encode()
    r1 = client.post(
        "/api/v1/import",
        files={"file": ("a.json", BytesIO(data), "application/json")},
    ).json()
    assert r1["success"] is True
    first_sleep_up = r1["stats"]["sleep_sessions_upserted"]
    first_sleep_dup = r1["stats"]["sleep_sessions_duplicate"]

    r2 = client.post(
        "/api/v1/import",
        files={"file": ("b.json", BytesIO(data), "application/json")},
    ).json()
    assert r2["success"] is True
    assert r2["stats"]["sleep_sessions_upserted"] <= first_sleep_up
    assert r2["stats"]["sleep_sessions_duplicate"] >= first_sleep_dup + first_sleep_up - r2["stats"]["sleep_sessions_upserted"]


def test_invalid_sleep_end_before_start_rejected(client: TestClient):
    payload = _build_sample_payload(seed=3)
    payload["sleep_sessions"][0]["end_at"] = payload["sleep_sessions"][0]["start_at"]
    data = json.dumps(payload).encode()
    resp = client.post(
        "/api/v1/import",
        files={"file": ("x.json", BytesIO(data), "application/json")},
    )
    body = resp.json()
    assert body["success"] is False


def test_participant_mismatch_rejected(client: TestClient):
    payload = _build_sample_payload(participant_code="WRONG_CODE", seed=5)
    data = json.dumps(payload).encode()
    resp = client.post(
        "/api/v1/import",
        files={"file": ("y.json", BytesIO(data), "application/json")},
    )
    body = resp.json()
    assert body["success"] is False
    assert any("participant" in e or "Participant" in e for e in body["validation_errors"])
