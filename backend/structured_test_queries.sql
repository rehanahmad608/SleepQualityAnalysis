-- Inspect actual numeric JSON and CSV fields side by side.
SELECT participant_code, observed_at,
       json_heart_rate_beats_per_minute AS json_bpm,
       csv_heart_rate_beats_per_minute AS csv_bpm,
       json_present, csv_present
FROM health_analysis_test.heart_rate
WHERE participant_code='P001'
  AND study_date >= DATE '2026-10-09' AND study_date < DATE '2026-10-14'
ORDER BY observed_at LIMIT 100;

-- Join daily wearable summaries to questionnaire responses without multiplying
-- every heart-rate reading by every response. Each response remains its own row.
-- Select JSON only for this example; do not add JSON and CSV copies together.
WITH daily_hr AS (
 SELECT participant_code, study_date,
        avg(json_heart_rate_beats_per_minute) AS sampled_mean_bpm,
        count(*) AS sample_count
 FROM health_analysis_test.heart_rate
 WHERE json_present
 GROUP BY participant_code,study_date
)
SELECT p.participant_code, h.study_date, h.sampled_mean_bpm, h.sample_count,
       m.observed_at AS morning_submitted_at, m.csv_sleep_quality,
       m.csv_energy_level AS morning_energy,
       e.observed_at AS evening_submitted_at, e.csv_energy_level AS evening_energy
FROM health_analysis_test.participants p
JOIN daily_hr h USING(participant_code)
LEFT JOIN health_analysis_test.morning_responses m
  ON m.participant_code=h.participant_code AND m.study_date=h.study_date
LEFT JOIN health_analysis_test.evening_responses e
  ON e.participant_code=h.participant_code AND e.study_date=h.study_date
WHERE p.participant_code='P001'
ORDER BY h.study_date;

-- Daily steps from nonoverlapping JSON intervals entirely within one Amsterdam
-- date. Overlaps and intervals crossing midnight are reported as exclusions,
-- rather than summed or apportioned without knowing their internal distribution.
WITH candidates AS (
 SELECT s.*, NOT EXISTS (
   SELECT 1 FROM health_analysis_test.steps other
   WHERE other.participant_code=s.participant_code AND other.json_present
     AND other.id<>s.id
     AND other.observed_at<s.end_at AND other.end_at>s.observed_at
 ) AND (s.end_at-INTERVAL '1 microsecond') AT TIME ZONE 'Europe/Amsterdam'
           >= s.study_date::timestamp
   AND (s.end_at-INTERVAL '1 microsecond') AT TIME ZONE 'Europe/Amsterdam'
           < (s.study_date+1)::timestamp AS safe_to_sum
 FROM health_analysis_test.steps s WHERE s.json_present
)
SELECT participant_code,study_date,
 sum(json_steps_count) FILTER(WHERE safe_to_sum) AS nonoverlapping_step_total,
 count(*) FILTER(WHERE NOT safe_to_sum) AS excluded_intervals
FROM candidates
GROUP BY participant_code,study_date ORDER BY study_date;

-- See responses even when wearable measurements are missing for that date.
SELECT participant_code,study_date,observed_at,csv_sleep_quality,
       csv_bedtime,csv_fell_asleep_time,interpretation_notes
FROM health_analysis_test.morning_responses ORDER BY observed_at;

SELECT participant_code,study_date,observed_at,csv_productive_hours_original,
       csv_productive_hours,interpretation_notes
FROM health_analysis_test.evening_responses ORDER BY observed_at;

-- Source file provenance, including historical field values before pairing.
SELECT f.filename, f.format, f.source, p.row_number, p.original_flat_fields
FROM health_analysis_test.heart_rate_provenance p
JOIN health_analysis_test.import_files f ON f.id=p.file_id
ORDER BY f.filename,p.row_number LIMIT 20;
