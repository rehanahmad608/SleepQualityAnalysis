export type DataMode = 'demo' | 'import' | 'google';

export interface FreshnessInfo {
  last_successful_sync: string | null;
  is_stale: boolean;
  stale_hours: number | null;
}

export interface CoverageFlags {
  has_heart_rate: boolean;
  has_steps: boolean;
  has_sleep: boolean;
}

export interface StudyConfig {
  study_id: string;
  participant_label: string;
  start_date: string;
  end_date: string;
  days_total: number;
  /** IANA timezone of the study; all "local" times and dates are in this zone. */
  timezone: string;
  data_mode: DataMode;
  freshness: FreshnessInfo;
  /** null = not reported by the backend (GET /study does not expose it). */
  google_connected: boolean | null;
  /** null = not reported by the backend (GET /study does not expose it). */
  google_configured: boolean | null;
}

export interface DailySummary {
  date: string;
  day_number: number;
  main_sleep_seconds: number | null;
  main_sleep_start: string | null;
  main_sleep_end: string | null;
  nap_seconds: number | null;
  total_sleep_seconds: number | null;
  sleep_efficiency: number | null;
  resting_hr_bpm: number | null;
  observed_mean_hr_bpm: number | null;
  hr_sample_count: number | null;
  steps_count: number | null;
  steps_sample_count: number | null;
  is_provisional: boolean;
  coverage: CoverageFlags;
  source: string | null;
}

export interface WeeklySummary {
  week_number: 1 | 2;
  day_range_label: string;
  dates: string[];
  avg_main_sleep_seconds: number | null;
  avg_main_sleep_valid_days: number;
  total_nap_seconds: number | null;
  avg_resting_hr_bpm: number | null;
  avg_resting_hr_valid_days: number;
  avg_observed_mean_hr_bpm: number | null;
  avg_observed_mean_hr_valid_days: number;
  avg_steps_count: number | null;
  avg_steps_valid_days: number;
  daily_summaries: DailySummary[];
  completeness_percent: number;
}

export interface ComparisonSummary {
  week1: WeeklySummary;
  week2: WeeklySummary;
  delta_main_sleep_seconds: number | null;
  delta_main_sleep_pct: number | null;
  delta_nap_seconds: number | null;
  delta_nap_pct: number | null;
  delta_resting_hr_bpm: number | null;
  delta_resting_hr_pct: number | null;
  delta_observed_mean_hr_bpm: number | null;
  delta_observed_mean_hr_pct: number | null;
  delta_steps_count: number | null;
  delta_steps_pct: number | null;
}

export interface HeartRateSample {
  timestamp: string;
  local_time: string;
  bpm: number | null;
}

export type SleepStageType = 'awake' | 'light' | 'deep' | 'rem' | 'unknown';

export interface SleepSegment {
  stage: SleepStageType;
  start_time: string;
  local_start_time: string;
  end_time: string;
  local_end_time: string;
  duration_seconds: number;
}

export interface SleepSession {
  session_id: string;
  is_main: boolean;
  start_time: string;
  local_start_time: string;
  end_time: string;
  local_end_time: string;
  in_bed_seconds: number | null;
  asleep_seconds: number | null;
  /** Fraction 0..1 (the backend reports a percentage; converted by the adapter). */
  efficiency: number | null;
  stages: SleepSegment[];
  stage_totals_seconds: Record<SleepStageType, number> | null;
  source: string | null;
}

export interface SleepSessionWithSegments {
  date: string;
  sessions: SleepSession[];
}

export interface StepInterval {
  start_time: string;
  local_start_time: string;
  end_time: string;
  local_end_time: string;
  steps: number;
}

export interface SyncRun {
  run_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  finished_at: string | null;
  /** Not reported by the backend (always null). */
  records_attempted: number | null;
  /** Backend `row_count`: rows written by the run. */
  records_succeeded: number | null;
  /** Not reported by the backend (always null). */
  records_failed: number | null;
  error_message: string | null;
}

export interface ImportResult {
  accepted_records: number;
  rejected_records: number;
  rejected_reasons: Array<{ record_index: number; reason: string }>;
  warnings: string[];
  schema_version_valid: boolean;
}

export interface Capabilities {
  legacy_study: boolean;
  legacy_requested: boolean;
  legacy_reason: string | null;
  writes_enabled: boolean;
  auth_required: boolean;
}
