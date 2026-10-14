CREATE SCHEMA IF NOT EXISTS health_analysis_test;

CREATE TABLE IF NOT EXISTS health_analysis_test.participants (
            participant_code text PRIMARY KEY, timezone text NOT NULL DEFAULT 'Europe/Amsterdam');

CREATE TABLE IF NOT EXISTS health_analysis_test.import_files (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES health_analysis_test.participants,
            source text NOT NULL CHECK (source IN ('Fitband','ManualInput')),
            format text NOT NULL CHECK (format IN ('json','csv')), filename text NOT NULL,
            sha256 text NOT NULL, row_count integer NOT NULL CHECK(row_count>=0),
            imported_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(participant_code, filename, sha256));

CREATE TABLE IF NOT EXISTS health_analysis_test.resting_heart_rate (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES health_analysis_test.participants,
            source text NOT NULL CHECK(source IN ('Fitband','ManualInput')),
            study_date date NOT NULL, observed_at timestamptz, end_at timestamptz,
            json_present boolean NOT NULL DEFAULT false, csv_present boolean NOT NULL DEFAULT false,
            "csv_daily_resting_heart_rate_beats_per_minute" numeric,
"csv_daily_resting_heart_rate_daily_resting_heart_r_4e45daed28" text,
"csv_daily_resting_heart_rate_date_day" integer,
"csv_daily_resting_heart_rate_date_month" integer,
"csv_daily_resting_heart_rate_date_year" integer,
"csv_data_source_device_display_name" text,
"csv_data_source_platform" text,
"csv_data_source_recording_method" text,
"json_daily_resting_heart_rate_beats_per_minute" numeric,
"json_daily_resting_heart_rate_daily_resting_heart_r_4e45daed28" text,
"json_daily_resting_heart_rate_date_day" integer,
"json_daily_resting_heart_rate_date_month" integer,
"json_daily_resting_heart_rate_date_year" integer,
"json_data_source_device_display_name" text,
"json_data_source_platform" text,
"json_data_source_recording_method" text, CHECK(end_at IS NULL OR end_at>observed_at));

CREATE INDEX IF NOT EXISTS resting_heart_rate_participant_date_idx ON health_analysis_test.resting_heart_rate(participant_code,study_date,observed_at);

CREATE TABLE IF NOT EXISTS health_analysis_test.resting_heart_rate_provenance (
            file_id uuid NOT NULL REFERENCES health_analysis_test.import_files,
            row_number integer NOT NULL CHECK(row_number>0),
            measurement_id uuid NOT NULL REFERENCES health_analysis_test.resting_heart_rate,
            original_flat_fields jsonb NOT NULL,
            PRIMARY KEY(file_id,row_number));

CREATE TABLE IF NOT EXISTS health_analysis_test.hrv (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES health_analysis_test.participants,
            source text NOT NULL CHECK(source IN ('Fitband','ManualInput')),
            study_date date NOT NULL, observed_at timestamptz, end_at timestamptz,
            json_present boolean NOT NULL DEFAULT false, csv_present boolean NOT NULL DEFAULT false,
            "csv_data_source_device_display_name" text,
"csv_data_source_platform" text,
"csv_data_source_recording_method" text,
"csv_heart_rate_variability_metadata_high_frequency_power" numeric,
"csv_heart_rate_variability_metadata_low_frequency_power" numeric,
"csv_heart_rate_variability_root_mean_square_of_suc_03f31fc985" numeric,
"csv_heart_rate_variability_sample_time_civil_time__dea2ed0e30" integer,
"csv_heart_rate_variability_sample_time_civil_time_date_day" integer,
"csv_heart_rate_variability_sample_time_civil_time_date_month" integer,
"csv_heart_rate_variability_sample_time_civil_time_date_year" integer,
"csv_heart_rate_variability_sample_time_civil_time_time_hours" integer,
"csv_heart_rate_variability_sample_time_physical_time" timestamptz,
"csv_heart_rate_variability_sample_time_utc_offset" text,
"json_data_source_device_display_name" text,
"json_data_source_platform" text,
"json_data_source_recording_method" text,
"json_heart_rate_variability_metadata_high_frequency_power" numeric,
"json_heart_rate_variability_metadata_low_frequency_power" numeric,
"json_heart_rate_variability_root_mean_square_of_suc_03f31fc985" numeric,
"json_heart_rate_variability_sample_time_civil_time__dea2ed0e30" integer,
"json_heart_rate_variability_sample_time_civil_time_date_day" integer,
"json_heart_rate_variability_sample_time_civil_time_date_month" integer,
"json_heart_rate_variability_sample_time_civil_time_date_year" integer,
"json_heart_rate_variability_sample_time_civil_time_time_hours" integer,
"json_heart_rate_variability_sample_time_physical_time" timestamptz,
"json_heart_rate_variability_sample_time_utc_offset" text, CHECK(end_at IS NULL OR end_at>observed_at));

CREATE INDEX IF NOT EXISTS hrv_participant_date_idx ON health_analysis_test.hrv(participant_code,study_date,observed_at);

CREATE TABLE IF NOT EXISTS health_analysis_test.hrv_provenance (
            file_id uuid NOT NULL REFERENCES health_analysis_test.import_files,
            row_number integer NOT NULL CHECK(row_number>0),
            measurement_id uuid NOT NULL REFERENCES health_analysis_test.hrv,
            original_flat_fields jsonb NOT NULL,
            PRIMARY KEY(file_id,row_number));

CREATE TABLE IF NOT EXISTS health_analysis_test.heart_rate (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES health_analysis_test.participants,
            source text NOT NULL CHECK(source IN ('Fitband','ManualInput')),
            study_date date NOT NULL, observed_at timestamptz, end_at timestamptz,
            json_present boolean NOT NULL DEFAULT false, csv_present boolean NOT NULL DEFAULT false,
            "csv_data_source_device_display_name" text,
"csv_data_source_platform" text,
"csv_data_source_recording_method" text,
"csv_heart_rate_beats_per_minute" numeric,
"csv_heart_rate_sample_time_civil_time_date_day" integer,
"csv_heart_rate_sample_time_civil_time_date_month" integer,
"csv_heart_rate_sample_time_civil_time_date_year" integer,
"csv_heart_rate_sample_time_civil_time_time_hours" integer,
"csv_heart_rate_sample_time_civil_time_time_minutes" integer,
"csv_heart_rate_sample_time_civil_time_time_seconds" integer,
"csv_heart_rate_sample_time_physical_time" timestamptz,
"csv_heart_rate_sample_time_utc_offset" text,
"json_data_source_device_display_name" text,
"json_data_source_platform" text,
"json_data_source_recording_method" text,
"json_heart_rate_beats_per_minute" numeric,
"json_heart_rate_sample_time_civil_time_date_day" integer,
"json_heart_rate_sample_time_civil_time_date_month" integer,
"json_heart_rate_sample_time_civil_time_date_year" integer,
"json_heart_rate_sample_time_civil_time_time_hours" integer,
"json_heart_rate_sample_time_civil_time_time_minutes" integer,
"json_heart_rate_sample_time_civil_time_time_seconds" integer,
"json_heart_rate_sample_time_physical_time" timestamptz,
"json_heart_rate_sample_time_utc_offset" text, CHECK(end_at IS NULL OR end_at>observed_at));

CREATE INDEX IF NOT EXISTS heart_rate_participant_date_idx ON health_analysis_test.heart_rate(participant_code,study_date,observed_at);

CREATE TABLE IF NOT EXISTS health_analysis_test.heart_rate_provenance (
            file_id uuid NOT NULL REFERENCES health_analysis_test.import_files,
            row_number integer NOT NULL CHECK(row_number>0),
            measurement_id uuid NOT NULL REFERENCES health_analysis_test.heart_rate,
            original_flat_fields jsonb NOT NULL,
            PRIMARY KEY(file_id,row_number));

CREATE TABLE IF NOT EXISTS health_analysis_test.sleep (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES health_analysis_test.participants,
            source text NOT NULL CHECK(source IN ('Fitband','ManualInput')),
            study_date date NOT NULL, observed_at timestamptz, end_at timestamptz,
            json_present boolean NOT NULL DEFAULT false, csv_present boolean NOT NULL DEFAULT false,
            "csv_data_source_device_display_name" text,
"csv_data_source_platform" text,
"csv_data_source_recording_method" text,
"csv_name" text,
"csv_sleep_create_time" timestamptz,
"csv_sleep_interval_end_time" timestamptz,
"csv_sleep_interval_end_utc_offset" text,
"csv_sleep_interval_start_time" timestamptz,
"csv_sleep_interval_start_utc_offset" text,
"csv_sleep_metadata_main_sleep" boolean,
"csv_sleep_metadata_processed" boolean,
"csv_sleep_metadata_stages_status" text,
"csv_sleep_short_awakenings" jsonb,
"csv_sleep_stages" jsonb,
"csv_sleep_summary_minutes_after_wake_up" numeric,
"csv_sleep_summary_minutes_asleep" numeric,
"csv_sleep_summary_minutes_awake" numeric,
"csv_sleep_summary_minutes_in_sleep_period" numeric,
"csv_sleep_summary_minutes_to_fall_asleep" numeric,
"csv_sleep_summary_stages_summary" jsonb,
"csv_sleep_type" text,
"csv_sleep_update_time" timestamptz,
"json_data_source_device_display_name" text,
"json_data_source_platform" text,
"json_data_source_recording_method" text,
"json_name" text,
"json_sleep_create_time" timestamptz,
"json_sleep_interval_end_time" timestamptz,
"json_sleep_interval_end_utc_offset" text,
"json_sleep_interval_start_time" timestamptz,
"json_sleep_interval_start_utc_offset" text,
"json_sleep_metadata_main_sleep" boolean,
"json_sleep_metadata_processed" boolean,
"json_sleep_metadata_stages_status" text,
"json_sleep_short_awakenings" jsonb,
"json_sleep_stages" jsonb,
"json_sleep_summary_minutes_after_wake_up" numeric,
"json_sleep_summary_minutes_asleep" numeric,
"json_sleep_summary_minutes_awake" numeric,
"json_sleep_summary_minutes_in_sleep_period" numeric,
"json_sleep_summary_minutes_to_fall_asleep" numeric,
"json_sleep_summary_stages_summary" jsonb,
"json_sleep_type" text,
"json_sleep_update_time" timestamptz, CHECK(end_at IS NULL OR end_at>observed_at));

CREATE INDEX IF NOT EXISTS sleep_participant_date_idx ON health_analysis_test.sleep(participant_code,study_date,observed_at);

CREATE TABLE IF NOT EXISTS health_analysis_test.sleep_provenance (
            file_id uuid NOT NULL REFERENCES health_analysis_test.import_files,
            row_number integer NOT NULL CHECK(row_number>0),
            measurement_id uuid NOT NULL REFERENCES health_analysis_test.sleep,
            original_flat_fields jsonb NOT NULL,
            PRIMARY KEY(file_id,row_number));

CREATE TABLE IF NOT EXISTS health_analysis_test.steps (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES health_analysis_test.participants,
            source text NOT NULL CHECK(source IN ('Fitband','ManualInput')),
            study_date date NOT NULL, observed_at timestamptz, end_at timestamptz,
            json_present boolean NOT NULL DEFAULT false, csv_present boolean NOT NULL DEFAULT false,
            "csv_data_source_device_display_name" text,
"csv_data_source_platform" text,
"csv_data_source_recording_method" text,
"csv_steps_count" numeric,
"csv_steps_interval_civil_end_time_date_day" integer,
"csv_steps_interval_civil_end_time_date_month" integer,
"csv_steps_interval_civil_end_time_date_year" integer,
"csv_steps_interval_civil_end_time_time_hours" integer,
"csv_steps_interval_civil_end_time_time_minutes" integer,
"csv_steps_interval_civil_start_time_date_day" integer,
"csv_steps_interval_civil_start_time_date_month" integer,
"csv_steps_interval_civil_start_time_date_year" integer,
"csv_steps_interval_civil_start_time_time_hours" integer,
"csv_steps_interval_civil_start_time_time_minutes" integer,
"csv_steps_interval_end_time" timestamptz,
"csv_steps_interval_end_utc_offset" text,
"csv_steps_interval_start_time" timestamptz,
"csv_steps_interval_start_utc_offset" text,
"json_data_source_device_display_name" text,
"json_data_source_platform" text,
"json_data_source_recording_method" text,
"json_steps_count" numeric,
"json_steps_interval_civil_end_time_date_day" integer,
"json_steps_interval_civil_end_time_date_month" integer,
"json_steps_interval_civil_end_time_date_year" integer,
"json_steps_interval_civil_end_time_time_hours" integer,
"json_steps_interval_civil_end_time_time_minutes" integer,
"json_steps_interval_civil_start_time_date_day" integer,
"json_steps_interval_civil_start_time_date_month" integer,
"json_steps_interval_civil_start_time_date_year" integer,
"json_steps_interval_civil_start_time_time_hours" integer,
"json_steps_interval_civil_start_time_time_minutes" integer,
"json_steps_interval_end_time" timestamptz,
"json_steps_interval_end_utc_offset" text,
"json_steps_interval_start_time" timestamptz,
"json_steps_interval_start_utc_offset" text, CHECK(end_at IS NULL OR end_at>observed_at));

CREATE INDEX IF NOT EXISTS steps_participant_date_idx ON health_analysis_test.steps(participant_code,study_date,observed_at);

CREATE TABLE IF NOT EXISTS health_analysis_test.steps_provenance (
            file_id uuid NOT NULL REFERENCES health_analysis_test.import_files,
            row_number integer NOT NULL CHECK(row_number>0),
            measurement_id uuid NOT NULL REFERENCES health_analysis_test.steps,
            original_flat_fields jsonb NOT NULL,
            PRIMARY KEY(file_id,row_number));

CREATE TABLE IF NOT EXISTS health_analysis_test.evening_responses (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES health_analysis_test.participants,
            source text NOT NULL CHECK(source IN ('Fitband','ManualInput')),
            study_date date NOT NULL, observed_at timestamptz, end_at timestamptz,
            json_present boolean NOT NULL DEFAULT false, csv_present boolean NOT NULL DEFAULT false,
            "csv_energy_level" integer,
"csv_last_meal_time" time,
"csv_productive_hours_original" text,
"csv_submitted_at_original" text, CHECK(end_at IS NULL OR end_at>observed_at));

CREATE INDEX IF NOT EXISTS evening_responses_participant_date_idx ON health_analysis_test.evening_responses(participant_code,study_date,observed_at);

ALTER TABLE health_analysis_test.evening_responses ADD COLUMN IF NOT EXISTS csv_previous_sleep_date date;

ALTER TABLE health_analysis_test.evening_responses ADD COLUMN IF NOT EXISTS csv_productive_hours numeric;

ALTER TABLE health_analysis_test.evening_responses ADD COLUMN IF NOT EXISTS interpretation_notes text;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='evening_responses_csv_energy_level_range' AND connamespace='health_analysis_test'::regnamespace) THEN
                        ALTER TABLE health_analysis_test.evening_responses ADD CONSTRAINT evening_responses_csv_energy_level_range CHECK(csv_energy_level BETWEEN 1 AND 10); END IF; END $$;

CREATE TABLE IF NOT EXISTS health_analysis_test.evening_responses_provenance (
            file_id uuid NOT NULL REFERENCES health_analysis_test.import_files,
            row_number integer NOT NULL CHECK(row_number>0),
            measurement_id uuid NOT NULL REFERENCES health_analysis_test.evening_responses,
            original_flat_fields jsonb NOT NULL,
            PRIMARY KEY(file_id,row_number));

CREATE TABLE IF NOT EXISTS health_analysis_test.morning_responses (
            id uuid PRIMARY KEY, participant_code text NOT NULL REFERENCES health_analysis_test.participants,
            source text NOT NULL CHECK(source IN ('Fitband','ManualInput')),
            study_date date NOT NULL, observed_at timestamptz, end_at timestamptz,
            json_present boolean NOT NULL DEFAULT false, csv_present boolean NOT NULL DEFAULT false,
            "csv_bedtime" time,
"csv_energy_level" integer,
"csv_fell_asleep_time" time,
"csv_sleep_quality" integer,
"csv_submitted_at_original" text, CHECK(end_at IS NULL OR end_at>observed_at));

CREATE INDEX IF NOT EXISTS morning_responses_participant_date_idx ON health_analysis_test.morning_responses(participant_code,study_date,observed_at);

ALTER TABLE health_analysis_test.morning_responses ADD COLUMN IF NOT EXISTS csv_previous_sleep_date date;

ALTER TABLE health_analysis_test.morning_responses ADD COLUMN IF NOT EXISTS csv_productive_hours numeric;

ALTER TABLE health_analysis_test.morning_responses ADD COLUMN IF NOT EXISTS interpretation_notes text;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='morning_responses_csv_energy_level_range' AND connamespace='health_analysis_test'::regnamespace) THEN
                        ALTER TABLE health_analysis_test.morning_responses ADD CONSTRAINT morning_responses_csv_energy_level_range CHECK(csv_energy_level BETWEEN 1 AND 10); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='morning_responses_csv_sleep_quality_range' AND connamespace='health_analysis_test'::regnamespace) THEN
                        ALTER TABLE health_analysis_test.morning_responses ADD CONSTRAINT morning_responses_csv_sleep_quality_range CHECK(csv_sleep_quality BETWEEN 1 AND 10); END IF; END $$;

CREATE TABLE IF NOT EXISTS health_analysis_test.morning_responses_provenance (
            file_id uuid NOT NULL REFERENCES health_analysis_test.import_files,
            row_number integer NOT NULL CHECK(row_number>0),
            measurement_id uuid NOT NULL REFERENCES health_analysis_test.morning_responses,
            original_flat_fields jsonb NOT NULL,
            PRIMARY KEY(file_id,row_number));

ALTER TABLE health_analysis_test.participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.import_files ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.resting_heart_rate ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.hrv ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.heart_rate ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.sleep ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.steps ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.evening_responses ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.morning_responses ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.resting_heart_rate_provenance ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.hrv_provenance ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.heart_rate_provenance ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.sleep_provenance ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.steps_provenance ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.evening_responses_provenance ENABLE ROW LEVEL SECURITY;

ALTER TABLE health_analysis_test.morning_responses_provenance ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA health_analysis_test FROM PUBLIC;

REVOKE ALL ON ALL TABLES IN SCHEMA health_analysis_test FROM PUBLIC;
