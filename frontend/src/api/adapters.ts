/**
 * Adapters: convert the real FastAPI response shapes (backend/app/schemas) into
 * the structures the UI consumes (src/types). Pure functions, no I/O.
 *
 * Rules:
 *  - Structural problems throw ApiContractError; they are never replaced by
 *    empty objects or default values.
 *  - Nullable backend values stay null.
 *  - Backend datetimes are naive UTC ("2026-09-24T21:50:00"); they get a "Z"
 *    suffix so they parse as the correct instant everywhere.
 *  - Backend percentages (0..100) are converted to the fractions (0..1) the UI
 *    formats with `* 100`.
 */
import type {
  ComparisonSummary,
  CoverageFlags,
  DailySummary,
  DataMode,
  HeartRateSample,
  ImportResult,
  SleepSegment,
  SleepSession,
  SleepSessionWithSegments,
  SleepStageType,
  StudyConfig,
  SyncRun,
  WeeklySummary,
} from '../types';

export class ApiContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiContractError';
  }
}

type Rec = Record<string, unknown>;

function fail(path: string, expected: string, got: unknown): never {
  const kind = got === null ? 'null' : Array.isArray(got) ? 'an array' : typeof got;
  throw new ApiContractError(
    `Unexpected backend response: "${path}" should be ${expected} but was ${kind}.`
  );
}

export function asObject(v: unknown, path: string): Rec {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'an object', v);
  return v as Rec;
}

export function asArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'an array', v);
  return v as unknown[];
}

function asString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, 'a non-empty string', v);
  return v as string;
}

function asNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'a finite number', v);
  return v as number;
}

function asBool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'a boolean', v);
  return v as boolean;
}

function optNumber(v: unknown, path: string): number | null {
  if (v === null || v === undefined) return null;
  return asNumber(v, path);
}

/** Count fields: absent/null is tolerated as 0, wrong types are not. */
function countOr0(v: unknown, path: string): number {
  if (v === null || v === undefined) return 0;
  return asNumber(v, path);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function asIsoDate(v: unknown, path: string): string {
  const s = asString(v, path);
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    fail(path, 'a YYYY-MM-DD date', v);
  }
  return s;
}

const HAS_ZONE_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Naive backend datetimes are UTC; make that explicit. */
export function asUtcIso(v: unknown, path: string): string {
  const s = asString(v, path);
  const out = HAS_ZONE_RE.test(s) ? s : `${s}Z`;
  if (Number.isNaN(Date.parse(out))) fail(path, 'an ISO datetime', v);
  return out;
}

function optUtcIso(v: unknown, path: string): string | null {
  if (v === null || v === undefined) return null;
  return asUtcIso(v, path);
}

function dayDiff(later: string, earlier: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000
  );
}

function addDaysIso(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ study */

const MODE_MAP: Record<string, DataMode> = {
  demo: 'demo',
  import: 'import',
  google: 'google',
  google_health: 'google',
};

export function adaptStudy(raw: unknown): StudyConfig {
  const r = asObject(raw, 'study');
  const start = asIsoDate(r.start_date, 'study.start_date');
  const endExclusive = asIsoDate(r.end_date_exclusive, 'study.end_date_exclusive');
  const dates =
    r.study_dates === undefined
      ? []
      : asArray(r.study_dates, 'study.study_dates').map((d, i) =>
          asIsoDate(d, `study.study_dates[${i}]`)
        );
  const daysTotal = dates.length > 0 ? dates.length : dayDiff(endExclusive, start);
  if (daysTotal <= 0) fail('study.end_date_exclusive', 'after study.start_date', endExclusive);
  const modeRaw = asString(r.data_mode, 'study.data_mode');
  const mode = MODE_MAP[modeRaw];
  if (!mode) fail('study.data_mode', 'one of demo | import | google', modeRaw);
  const f = asObject(r.freshness, 'study.freshness');

  return {
    study_id: asString(r.study_id, 'study.study_id'),
    participant_label: asString(r.participant_code, 'study.participant_code'),
    start_date: start,
    // The backend end is exclusive; the UI shows an inclusive last day.
    end_date: dates.length > 0 ? dates[dates.length - 1] : addDaysIso(endExclusive, -1),
    days_total: daysTotal,
    timezone: asString(r.timezone, 'study.timezone'),
    data_mode: mode,
    freshness: {
      last_successful_sync: optUtcIso(
        f.last_successful_fetch,
        'study.freshness.last_successful_fetch'
      ),
      is_stale: asBool(f.is_stale, 'study.freshness.is_stale'),
      stale_hours: null, // not reported by the backend
    },
    // GET /study does not expose Google OAuth state.
    google_configured: null,
    google_connected: null,
  };
}

/* ------------------------------------------------------------ daily summary */

export function adaptDaily(raw: unknown, studyStartDate: string): DailySummary {
  const root = asObject(raw, 'daily');
  const d = asObject(root.data, 'daily.data');
  const freshness = root.freshness === undefined ? null : asObject(root.freshness, 'daily.freshness');
  const date = asIsoDate(d.date, 'daily.data.date');
  const sleep = asObject(d.sleep, 'daily.data.sleep');
  const steps = asObject(d.steps, 'daily.data.steps');
  const hr = asObject(d.heart_rate, 'daily.data.heart_rate');
  const cov = asObject(d.coverage, 'daily.data.coverage');

  const main = optNumber(sleep.main_asleep_seconds, 'sleep.main_asleep_seconds');
  const total = optNumber(sleep.total_sleep_seconds, 'sleep.total_sleep_seconds');
  const eff = optNumber(sleep.sleep_efficiency_pct, 'sleep.sleep_efficiency_pct');
  const stepCount = optNumber(steps.count, 'steps.count');
  const stepIntervals = countOr0(steps.intervals_count, 'steps.intervals_count');
  const source =
    freshness && typeof freshness.data_source === 'string' ? freshness.data_source : null;

  const coverage: CoverageFlags = {
    has_sleep: asBool(cov.has_sleep, 'coverage.has_sleep'),
    has_steps: asBool(cov.has_steps, 'coverage.has_steps'),
    has_heart_rate: asBool(cov.has_heart_rate, 'coverage.has_heart_rate'),
  };

  return {
    date,
    day_number: dayDiff(date, studyStartDate) + 1,
    main_sleep_seconds: main,
    main_sleep_start: optUtcIso(sleep.main_sleep_start, 'sleep.main_sleep_start'),
    main_sleep_end: optUtcIso(sleep.main_sleep_end, 'sleep.main_sleep_end'),
    // Naps = all asleep time minus the main session (the backend sums every
    // session into total_sleep_seconds), so this is exact.
    nap_seconds: main !== null && total !== null ? total - main : null,
    total_sleep_seconds: total,
    sleep_efficiency: eff === null ? null : eff / 100,
    resting_hr_bpm: optNumber(hr.resting_bpm, 'heart_rate.resting_bpm'),
    observed_mean_hr_bpm: optNumber(hr.observed_mean_bpm, 'heart_rate.observed_mean_bpm'),
    hr_sample_count: countOr0(hr.sample_count, 'heart_rate.sample_count'),
    steps_count: stepCount,
    // The backend never populates steps.intervals_count (always 0); a 0 next to
    // a real step count would be misleading, so that case means "not reported".
    steps_sample_count: stepCount !== null && stepIntervals === 0 ? null : stepIntervals,
    is_provisional: asBool(d.is_provisional, 'daily.data.is_provisional'),
    coverage,
    source,
  };
}

/** True when the backend confirmed the day has no recorded observations at all. */
export function isEmptyDay(s: DailySummary): boolean {
  return (
    !s.coverage.has_sleep &&
    !s.coverage.has_steps &&
    !s.coverage.has_heart_rate &&
    s.main_sleep_seconds === null &&
    s.steps_count === null &&
    s.resting_hr_bpm === null &&
    s.observed_mean_hr_bpm === null
  );
}

/* ------------------------------------------------------------------- weekly */

function sumNaps(days: DailySummary[]): number | null {
  let sum = 0;
  let n = 0;
  for (const d of days) {
    if (d.nap_seconds !== null) {
      sum += d.nap_seconds;
      n += 1;
    }
  }
  return n > 0 ? sum : null;
}

interface WeekBlock {
  week_number: 1 | 2;
  dates: string[];
  avg_main_sleep_seconds: number | null;
  avg_main_sleep_valid_days: number;
  avg_resting_hr_bpm: number | null;
  avg_resting_hr_valid_days: number;
  avg_observed_mean_hr_bpm: number | null;
  avg_observed_mean_hr_valid_days: number;
  avg_steps_count: number | null;
  avg_steps_valid_days: number;
}

function adaptWeekBlock(raw: unknown, path: string): WeekBlock {
  const s = asObject(raw, path);
  const wn = asNumber(s.week_number, `${path}.week_number`);
  if (wn !== 1 && wn !== 2) fail(`${path}.week_number`, '1 or 2', wn);
  const dates = asArray(s.day_range, `${path}.day_range`).map((d, i) =>
    asIsoDate(d, `${path}.day_range[${i}]`)
  );
  return {
    week_number: wn,
    dates,
    avg_main_sleep_seconds: optNumber(
      s.mean_main_sleep_per_valid_night_seconds,
      `${path}.mean_main_sleep_per_valid_night_seconds`
    ),
    avg_main_sleep_valid_days: countOr0(s.valid_sleep_nights, `${path}.valid_sleep_nights`),
    avg_resting_hr_bpm: optNumber(s.mean_resting_bpm, `${path}.mean_resting_bpm`),
    avg_resting_hr_valid_days: countOr0(s.valid_resting_days, `${path}.valid_resting_days`),
    avg_observed_mean_hr_bpm: optNumber(s.mean_observed_bpm, `${path}.mean_observed_bpm`),
    avg_observed_mean_hr_valid_days: countOr0(s.valid_observed_days, `${path}.valid_observed_days`),
    avg_steps_count: optNumber(s.mean_steps_per_valid_day, `${path}.mean_steps_per_valid_day`),
    avg_steps_valid_days: countOr0(s.valid_step_days, `${path}.valid_step_days`),
  };
}

/**
 * Completeness = valid metric-days / possible metric-days over the four
 * backend-validated metrics (steps, main sleep, resting HR, observed HR).
 * It is 100 exactly when the backend's own `is_complete` is true.
 */
function completeness(w: WeekBlock): number {
  const possible = w.dates.length * 4;
  if (possible === 0) return 0;
  const valid =
    w.avg_steps_valid_days +
    w.avg_main_sleep_valid_days +
    w.avg_resting_hr_valid_days +
    w.avg_observed_mean_hr_valid_days;
  return (valid / possible) * 100;
}

function dayLabel(days: DailySummary[]): string {
  if (days.length === 0) return '';
  const nums = days.map((d) => d.day_number);
  return `Days ${Math.min(...nums)}–${Math.max(...nums)}`;
}

function toWeekly(block: WeekBlock, days: DailySummary[]): WeeklySummary {
  return {
    ...block,
    day_range_label: dayLabel(days),
    total_nap_seconds: sumNaps(days),
    daily_summaries: days,
    completeness_percent: completeness(block),
  };
}

/** The dates of the week named by a GET /dashboard/weekly response. */
export function weekDatesFromWeekly(raw: unknown): string[] {
  const r = asObject(raw, 'weekly');
  return adaptWeekBlock(r.summary, 'weekly.summary').dates;
}

export function adaptWeekly(raw: unknown, days: DailySummary[]): WeeklySummary {
  const r = asObject(raw, 'weekly');
  const block = adaptWeekBlock(r.summary, 'weekly.summary');
  const wn = asNumber(r.week_number, 'weekly.week_number');
  if (wn !== block.week_number) {
    fail('weekly.week_number', `equal to summary.week_number (${block.week_number})`, wn);
  }
  if (days.length !== block.dates.length || days.some((d, i) => d.date !== block.dates[i])) {
    throw new ApiContractError(
      "Unexpected backend response: daily data does not match the week's date range."
    );
  }
  return toWeekly(block, days);
}

/* --------------------------------------------------------------- comparison */

interface BackendMetric {
  absolute_change: number | null;
  percentage_change: number | null;
}

function metricByName(list: unknown, name: string): BackendMetric {
  const arr = asArray(list, 'comparison.comparisons');
  for (let i = 0; i < arr.length; i++) {
    const m = asObject(arr[i], `comparison.comparisons[${i}]`);
    if (m.metric === name) {
      return {
        absolute_change: optNumber(m.absolute_change, `comparison.comparisons[${i}].absolute_change`),
        percentage_change: optNumber(
          m.percentage_change,
          `comparison.comparisons[${i}].percentage_change`
        ),
      };
    }
  }
  throw new ApiContractError(`Unexpected backend response: comparison metric "${name}" is missing.`);
}

export function adaptComparison(raw: unknown, allDays: DailySummary[]): ComparisonSummary {
  const r = asObject(raw, 'comparison');
  const b1 = adaptWeekBlock(r.week1, 'comparison.week1');
  const b2 = adaptWeekBlock(r.week2, 'comparison.week2');
  const byDate = new Map(allDays.map((d) => [d.date, d] as const));
  const pick = (dates: string[], label: string) =>
    dates.map((dt) => {
      const d = byDate.get(dt);
      if (!d) throw new ApiContractError(`Unexpected backend response: ${label} has no daily data for ${dt}.`);
      return d;
    });
  const w1 = toWeekly(b1, pick(b1.dates, 'week1'));
  const w2 = toWeekly(b2, pick(b2.dates, 'week2'));

  const sleepHours = metricByName(r.comparisons, 'mean_main_sleep_hours');
  const steps = metricByName(r.comparisons, 'mean_steps_per_valid_day');
  const rhr = metricByName(r.comparisons, 'mean_resting_bpm');
  const obs = metricByName(r.comparisons, 'mean_observed_bpm');

  const diff = (a: number | null, b: number | null) => (a !== null && b !== null ? b - a : null);
  const pct = (a: number | null, b: number | null) =>
    a !== null && b !== null && a !== 0 ? (100 * (b - a)) / a : null;

  return {
    week1: w1,
    week2: w2,
    // Seconds come from the backend's exact weekly means (its own change is in rounded hours).
    delta_main_sleep_seconds: diff(w1.avg_main_sleep_seconds, w2.avg_main_sleep_seconds),
    delta_main_sleep_pct: sleepHours.percentage_change,
    // The backend has no nap comparison; derived from per-day (total - main).
    delta_nap_seconds: diff(w1.total_nap_seconds, w2.total_nap_seconds),
    delta_nap_pct: pct(w1.total_nap_seconds, w2.total_nap_seconds),
    delta_resting_hr_bpm: rhr.absolute_change,
    delta_resting_hr_pct: rhr.percentage_change,
    delta_observed_mean_hr_bpm: obs.absolute_change,
    delta_observed_mean_hr_pct: obs.percentage_change,
    delta_steps_count: steps.absolute_change,
    delta_steps_pct: steps.percentage_change,
  };
}

/* --------------------------------------------------------------- heart rate */

export function adaptHeartRate(raw: unknown): HeartRateSample[] {
  const r = asObject(raw, 'heart-rate');
  return asArray(r.samples, 'heart-rate.samples').map((s, i) => {
    const o = asObject(s, `heart-rate.samples[${i}]`);
    const at = asUtcIso(o.observed_at, `heart-rate.samples[${i}].observed_at`);
    return {
      timestamp: at,
      // Same instant; rendering converts it to the study timezone (utils/format).
      local_time: at,
      bpm: optNumber(o.bpm, `heart-rate.samples[${i}].bpm`),
    };
  });
}

/* -------------------------------------------------------------------- sleep */

const STAGES: Record<string, SleepStageType> = {
  awake: 'awake',
  wake: 'awake',
  light: 'light',
  deep: 'deep',
  rem: 'rem',
};

export function adaptSleep(raw: unknown): SleepSessionWithSegments {
  const r = asObject(raw, 'sleep');
  const date = asIsoDate(r.date, 'sleep.date');
  const sessions: SleepSession[] = asArray(r.sessions, 'sleep.sessions').map((s, i) => {
    const p = `sleep.sessions[${i}]`;
    const o = asObject(s, p);
    const start = asUtcIso(o.start_at, `${p}.start_at`);
    const end = asUtcIso(o.end_at, `${p}.end_at`);
    const segs: SleepSegment[] = asArray(o.segments ?? [], `${p}.segments`).map((g, j) => {
      const sp = `${p}.segments[${j}]`;
      const so = asObject(g, sp);
      const ss = asUtcIso(so.start_at, `${sp}.start_at`);
      const se = asUtcIso(so.end_at, `${sp}.end_at`);
      return {
        stage: STAGES[String(so.stage_label).toLowerCase()] ?? 'unknown',
        start_time: ss,
        local_start_time: ss,
        end_time: se,
        local_end_time: se,
        duration_seconds: asNumber(so.duration_seconds, `${sp}.duration_seconds`),
      };
    });
    let totals: SleepSession['stage_totals_seconds'] = null;
    if (segs.length > 0) {
      totals = { awake: 0, light: 0, deep: 0, rem: 0, unknown: 0 };
      for (const g of segs) totals[g.stage] += g.duration_seconds;
    }
    const eff = optNumber(o.sleep_efficiency_pct, `${p}.sleep_efficiency_pct`);
    return {
      session_id: asString(o.id, `${p}.id`),
      is_main: asBool(o.is_main, `${p}.is_main`),
      start_time: start,
      local_start_time: start,
      end_time: end,
      local_end_time: end,
      in_bed_seconds: optNumber(o.in_bed_seconds, `${p}.in_bed_seconds`),
      asleep_seconds: optNumber(o.asleep_seconds, `${p}.asleep_seconds`),
      efficiency: eff === null ? null : eff / 100,
      stages: segs,
      stage_totals_seconds: totals,
      source: null, // not reported per session
    };
  });
  return { date, sessions };
}

/* ------------------------------------------------------------- sync / import */

export function adaptSyncStart(raw: unknown): SyncRun {
  const r = asObject(raw, 'sync');
  return {
    run_id: asString(r.run_id, 'sync.run_id'),
    status: 'pending',
    started_at: optUtcIso(r.started_at, 'sync.started_at'),
    finished_at: null,
    records_attempted: null,
    records_succeeded: null,
    records_failed: null,
    error_message: null,
  };
}

const RUN_STATUS: Record<string, SyncRun['status']> = {
  accepted: 'pending',
  pending: 'pending',
  running: 'running',
  success: 'completed',
  failed: 'failed',
  abandoned: 'failed',
};

export function adaptSyncStatus(raw: unknown): SyncRun {
  const r = asObject(raw, 'sync');
  const backendStatus = asString(r.status, 'sync.status');
  const status = RUN_STATUS[backendStatus];
  if (!status) fail('sync.status', 'a known run status', backendStatus);
  const detail = typeof r.error_detail === 'string' ? r.error_detail : null;
  const code = typeof r.error_code === 'string' ? r.error_code : null;
  let error: string | null = null;
  if (status === 'failed') {
    error =
      [code, detail].filter(Boolean).join(': ') ||
      (backendStatus === 'abandoned' ? 'Run was abandoned (timed out).' : 'Run failed.');
  }
  return {
    run_id: asString(r.run_id, 'sync.run_id'),
    status,
    started_at: optUtcIso(r.started_at, 'sync.started_at'),
    finished_at: optUtcIso(r.finished_at, 'sync.finished_at'),
    records_attempted: null,
    records_succeeded: optNumber(r.row_count, 'sync.row_count'),
    records_failed: null,
    error_message: error,
  };
}

export function adaptImport(raw: unknown): ImportResult {
  const r = asObject(raw, 'import');
  const success = asBool(r.success, 'import.success');
  const errors = asArray(r.validation_errors ?? [], 'import.validation_errors').map((e, i) =>
    asString(e, `import.validation_errors[${i}]`)
  );
  const st = asObject(r.stats ?? {}, 'import.stats');
  const n = (k: string) => countOr0(st[k], `import.stats.${k}`);
  const accepted =
    n('sleep_sessions_upserted') + n('heart_rate_samples_upserted') + n('step_intervals_upserted');
  const duplicates =
    n('sleep_sessions_duplicate') + n('heart_rate_samples_duplicate') + n('step_intervals_duplicate');
  const warnings: string[] = [];
  if (duplicates > 0) {
    warnings.push(`${duplicates} duplicate record(s) were already present and skipped.`);
  }
  if (!success && errors.length === 0) {
    warnings.push(typeof r.message === 'string' && r.message ? r.message : 'Import failed.');
  }
  return {
    accepted_records: success ? accepted : 0,
    rejected_records: errors.length,
    // The backend validates the whole file at once; there is no per-record index.
    rejected_reasons: errors.map((reason, i) => ({ record_index: i + 1, reason })),
    warnings,
    schema_version_valid: !errors.some((e) => /schema_version/i.test(e)),
  };
}
