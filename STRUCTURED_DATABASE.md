# Structured health test database

The Supabase schema `health_analysis_test` separates unrelated metrics while
putting JSON and CSV fields in the same metric table. All supplied records are
assigned to participant P001 following explicit confirmation; the schema supports
additional participant codes. Source values are `Fitband` and `ManualInput`.

Tables: `participants`, `import_files`, `heart_rate`, `hrv`, `steps`, `sleep`,
`resting_heart_rate`, `morning_responses`, `evening_responses`, plus a provenance
table for each metric or form. The supplied `midday_response` file maps to the
morning form because its questions concern last night's sleep. Its actual midday
submission timestamp is retained; it is not changed to a morning timestamp.

For example, `heart_rate` has `json_heart_rate_beats_per_minute` and
`csv_heart_rate_beats_per_minute` on the same row where the measurement identity
matches. Both formats have their own extracted metadata columns. Missing formats
leave NULL fields, with `json_present` and `csv_present` indicating availability.

Each scalar source field is flattened into a typed PostgreSQL column. Numeric
measurements are numeric, time-series instants are timestamptz, time-only answers
are time, calendar components are integer, flags are boolean. Sleep stages,
short awakenings and stage summaries retain their arrays as JSONB; array members
are not discarded or reduced to a single stage. Long field names use a stable
suffix to stay within PostgreSQL's identifier limit. The generated
`backend/structured_column_mapping.json` documents every original field.

The identity combines participant, metric, source device, UTC measurement instant
or interval and principal measurement value; sleep additionally uses provider
name. Matching observations pair across JSON and CSV. Different principal values
at the same time remain distinct variants for inspection. Every source file row
has a provenance entry preserving all original flattened fields. If supplementary
fields change between imports, the comparison row shows the most recently imported
version per format, while provenance retains previous field values. File checksum
plus row number makes identical reimports idempotent.

Dates use Europe/Amsterdam. Sleep is assigned to its wake date. Questionnaire
submission times lack explicit offsets and are interpreted in the study timezone;
the original timestamp string is also retained. A form's study date is the date
of submission. `csv_previous_sleep_date` is the previous calendar date as a
reference for the question about yesterday's bedtime; it is not a confirmed
sleep session or a replacement for the morning response's study date.

Manual bedtime `12:15`, sleep onset `15:00`, and last meal `02:00` are preserved
literally. Their intended AM/PM and overnight dates require participant clarification.
The productivity response `28:00:00` is preserved in
`csv_productive_hours_original`; `csv_productive_hours` stays NULL until its
meaning is confirmed. No implausible 28-hour productive day is invented.

Measurements remain at their original granularity. A daily delivery can contain
many measurements; there is no one-measurement-per-day restriction. Missing data
stays NULL. The schema adds no 14-day storage limit. Questionnaire scores are
constrained to 1–10, with foreign keys and participant/date/time indexes.

## Reproduce and query

From the backend folder:

```powershell
.\.venv\Scripts\python.exe build_structured_test_db.py --participant P001
.\.venv\Scripts\python.exe build_structured_test_db.py --participant P001 --apply
```

The first validates source values and generates the executable
`backend/structured_test_schema.sql`. The second creates the isolated schema and
imports all files in a transaction. Existing application and raw test tables
are preserved. `backend/structured_test_queries.sql` demonstrates field comparisons,
participant/date retrieval, manual joins, source provenance and daily summaries.

Choose a single format for aggregate calculations: paired JSON and CSV are copies
of a measurement, not two readings. The example heart-rate average is an arithmetic
mean of observed samples, not a time-weighted average or resting heart rate.
The steps query excludes overlapping and midnight-crossing intervals, reporting
their counts; it does not claim that a partial total covers excluded intervals.
Source variants can require further reconciliation before scientific analysis.

All tables enable row level security without browser policies. Database-owner
access through SQL Editor/backend remains available. These tables are test data,
not anonymized records and not integrated into the dashboard API yet.

`backend/private_examples/representative_records.sql` contains executable sample
inserts from twelve actual format/metric examples. It is excluded from Git because
it contains participant data. Sample inserts do not reproduce every source-file
provenance row; the full importer does.
