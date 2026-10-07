# JSON Import Schema v1

This document describes the accepted contract for `POST /api/v1/import` uploads.
The backend validates every file against this contract before accepting records.
Files that fail validation are rejected with sanitized validation errors and are not
partially written.

## Root object

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `schema_version` | `"1"` | yes | Must be the exact string `"1"`. Reserved for future contracts. |
| `participant_code` | string | yes | Must match the study participant code configured on the backend (default `P001`). |
| `generated_at` | ISO 8601 datetime | no | Optional producer timestamp. |
| `sleep_sessions` | `ImportSleepSessionV1[]` | no | Sleep sessions keyed by wake date. |
| `heart_rate_samples` | `ImportHeartRateSampleV1[]` | no | Timestamped BPM observations. |
| `step_intervals` | `ImportStepIntervalV1[]` | no | Non-overlapping step interval deltas. |

## Sleep session (`ImportSleepSessionV1`)

| Field | Type | Required | Validation |
| ----- | ---- | -------- | ---------- |
| `provider_session_key` | string | yes | Stable unique key per (study + session). Duplicates trigger upsert + duplicate counter. |
| `source_id` | string | no | Optional upstream ID for traceability. |
| `start_at` | ISO 8601 datetime (UTC) | yes | Must be strictly less than `end_at`. |
| `end_at` | ISO 8601 datetime (UTC) | yes | Wake date is derived from `end_at` local to the study timezone unless `wake_date` is set. |
| `wake_date` | `YYYY-MM-DD` | no | Explicit override for the wake date grouping. |
| `asleep_seconds` | integer | no | Must be `>= 0` when provided. |
| `in_bed_seconds` | integer | no | Must be `>= 0` when provided. |
| `is_main` | boolean | no | If absent, the longest session ending on the same date is marked main with `classification_origin = derived`. |
| `classification_origin` | string | no | Defaults to `provider`. |
| `segments` | `ImportSleepSegmentV1[]` | no | Stages or short awakenings. Session segments are replaced atomically on upsert. |

### Sleep segment (`ImportSleepSegmentV1`)

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `segment_key` | string | yes | Unique within the session. |
| `start_at`, `end_at` | ISO 8601 datetime | yes | `end_at > start_at` required. |
| `stage_label` | string | yes | Example labels: `light`, `deep`, `rem`, `awake`. |
| `segment_kind` | string | no | `stage` or `awakening`. Defaults to `stage`. |

## Heart rate sample (`ImportHeartRateSampleV1`)

| Field | Type | Required | Validation |
| ----- | ---- | -------- | ---------- |
| `provider_sample_key` | string | yes | Stable unique key. |
| `source_id` | string | no | Optional upstream ID. |
| `observed_at` | ISO 8601 datetime (UTC) | yes | |
| `bpm` | number | yes | Must satisfy `0 < bpm <= 300`. |

## Step interval (`ImportStepIntervalV1`)

| Field | Type | Required | Validation |
| ----- | ---- | -------- | ---------- |
| `provider_interval_key` | string | yes | Stable unique key. |
| `source_id` | string | no | Optional upstream ID. |
| `start_at`, `end_at` | ISO 8601 datetime (UTC) | yes | `end_at > start_at` required. Intervals are summed by local day. |
| `step_count` | integer | yes | Must be `>= 0`. |

## Behavioural guarantees

1. **Versioned contract.** Only `schema_version = "1"` is accepted. Newer revisions
   will increment the version string and keep the legacy parser active during migration.
2. **Duplicate safety.** Each array element is keyed by its `provider_*_key` composite
   with the study. Identical payloads that re-upload increment the duplicate counters
   without inflating stored totals.
3. **Transactional import.** If any record fails after validation begins, the full
   transaction rolls back and no measurements are visible on the dashboard.
4. **Provider identity only.** No Google OAuth tokens or personal fields are stored via
   this endpoint. Restrict exports to the fields above before sharing with the backend.
5. **Derived wake date.** When `wake_date` is omitted the backend uses the study
   timezone (`Europe/Amsterdam`) local date of `end_at`, so overnight sessions correctly
   group with their morning date.

See `sample_import_v1.json` in this directory for a three-day example file.
