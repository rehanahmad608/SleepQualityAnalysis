# Questionnaire workbook import and study-date alignment

## Current demo state (10 November 2026)

The initial mappings described below were subsequently adjusted at the owner's request:

- P001_DEMO morning responses now cover 6, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18 and 19 October. Dates 7 and 9 remain empty (12 of 14 days, 85.7%).
- The nine original morning workbook submissions were mapped, in source order, to 6, 11, 12, 14, 15, 16, 17, 18 and 19 October. The earlier 13 October response was retained, and two additional user-provided responses filled 8 and 10 October.
- Early-morning reported times refer to their mapped study date, as explicitly confirmed by the owner. Previous dates remain in provenance; reimports honor these corrections.
- Evening responses cover every study date from 6 through 25 October after the requested removals and manual additions. Seven user-supplied responses filled 6, 10, 14, 17, 21, 24 and 25 October. These are manually supplied demo records, not new wearable observations.
- The 13 October morning sleep-quality and energy ratings were corrected from 10 to 5, on a five-point scale.
- The evening productive-hours entry paired with the night of 11 October (study date 12 October) was corrected from 17 to 7 hours. Both numeric and display fields were updated, with the previous value retained in provenance.
- The live dashboard shows only study/wake dates 6–19 October. Later evening records stay in Supabase. The night-based weeks start on 5 and 12 October.

These changes were applied directly to Supabase. GitHub contains the import tools and application code, not a database snapshot, source response workbooks, email addresses or connection credentials. Original P001 data is separate and was not changed by these demo corrections. The earlier import history below is retained for context.

Form 1 (Midday Sleep & Energy Check-in) supplies morning responses; Form 2
(Daily Energy & Productivity Check-in) supplies evening responses. The two
Excel files were transcribed from the supplied single-page PDF and checked
against all source values. Nine morning and seventeen evening submissions
were imported for P001_DEMO, not P001. The earlier October 13 responses remain.

The workbook importer preserves submission times in Europe/Amsterdam, scores,
reported clock times, productivity hours and separate submissions on the same
date. Original workbook, sheet, row, email and field values are retained in
provenance. File manifests use the actual `xlsx` format. Reimporting unchanged
submissions keeps stable IDs and does not create duplicates; conflicting values
are rejected rather than silently overwritten.

At the owner's request, the newly imported responses use study dates shifted
back 15 local calendar days: 21 October becomes 6 October. The first evening
response on 22 October becomes 7 October, preserving alignment between forms.
Morning dates span 6–24 October; evening dates span 7–23 October. Gaps and multiple
daily submissions are preserved, not compressed into consecutive days.

Only the two workbook imports were shifted. Original P001 responses, earlier
P001_DEMO responses and all wearable observations are unchanged. Original actual
submission timestamps remain in `csv_submitted_at_original` and provenance;
the API's `submitted_at` reports the aligned study time. Demo questionnaire tables
therefore label this column Study time. The mapping is recorded per provenance
row in `_study_date_mapping`, including the offset and both timestamps. Reimports
honour this mapping rather than resetting the study dates. The demo's 6–19 October
wearable window is unchanged; questionnaire coverage extends beyond it.

Five repetitive evening responses were explicitly removed at the owner's request:
8 October 07:17, 13 October 13:24, 15 October 05:34, 19 October 01:02 and 23 October 10:42, in
Europe/Amsterdam study time. Their response rows and provenance links were deleted.
Exclusion markers in `import_files.excluded_rows` retain only the response identity,
study time and reason, so the workbook importer does not recreate those responses.
Source-file row counts continue to describe the unchanged original files; retained
provenance counts exclude the deliberately removed rows.

Commands are in `backend/import_questionnaire_workbooks.py` (explicit workbook
paths required) and `backend/remap_questionnaire_dates.py`. Each defaults to a
dry run and uses a transaction for `--apply`. Remapping is restricted to a labelled
demo participant and verifies that unrelated questionnaire rows do not change.
