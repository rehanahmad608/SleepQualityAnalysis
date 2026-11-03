# Fourteen-day copied-data demonstration

Participant `P001_DEMO` is a separate demonstration dataset for 6–19 October
2026. It is not new participant evidence and must not be presented as real
measurements recorded on generated dates. P001 is preserved unchanged.

The baseline copies P001's 6–15 October observations. The remaining dates are:

| Demo date | Copied source date |
|---|---|
| 16 October | 6 October |
| 17 October | 8 October |
| 18 October | 11 October |
| 19 October | 9 October |

These are copies of measurements, not averages or newly generated sensor readings.
Observation timestamps, interval endpoints, date components and nested sleep-stage
timestamps are shifted to the target dates. Clock times and measurement values
are retained. All these dates precede the autumn DST transition. No questionnaire
answers are invented for the additional dates.

The `demo_datasets` and `demo_day_sources` tables identify the dataset and each
day's origin. Each copied metric row has a provenance reference to its original
P001 measurement ID. Manifest entries with `.database-copy` filenames describe
generated database copies, not original files on disk. Existing JSON and CSV
columns are retained where the source date had them; JSON has the fuller coverage.

Select **Participant Data v2** in the dashboard (internal code P001_DEMO),
View **14 days**, start date **2026-10-06**, and **JSON export**.
A small Demo indicator identifies the demonstration dataset.
The original P001 is still selectable separately.

## Reproducible synthetic variation on 16–19 October

`backend/randomize_demo_view.py` stores four day profiles in
`health_analysis_test.demo_variation`, using seed 20261103. The API applies them
only to P001_DEMO on those dates. Repeated requests return the same values.
Earlier demo dates, all original P001 records and the underlying copied rows
are untouched. The API identifies the affected dates in `synthetic_variation_dates`.

Heart rate uses a daily factor and deterministic per-reading jitter; steps use
daily and per-interval factors; HRV uses daily and per-sample factors. Resting HR
and sleep duration use day-specific factors. Step counts are rounded to integers,
missing values remain missing, and synthetic sleep duration cannot exceed its
recorded session interval. This is visual demonstration data, not a validated
physiological simulation. Sample timestamps/counts and sleep-stage arrays remain
the baseline copies; sleep-stage detail should not be interpreted as a newly
simulated stage timeline. Only dashboard summary durations are varied.

The dashboard retains its small Demo indicator. The source mapping is preserved
for provenance even when displayed values have synthetic variation.

Local anonymous access can expose this demo participant only when the existing
loopback development mode is explicitly enabled and
`DEV_DEMO_PARTICIPANT_CODE=P001_DEMO` is set for that process. Production users
need explicit participant grants. This does not change global authentication.

The creation script is `backend/create_fourteen_day_demo.py`. It refuses to
overwrite an existing demo participant and commits all changes in one transaction.
It refuses a full overwrite. A single demo date can be explicitly replaced with
`--replace-day YYYY-MM-DD --source-day YYYY-MM-DD --apply`. This verifies checksums
of all original P001 rows and the other demo dates before committing. The UI date
range request remains read-only.
