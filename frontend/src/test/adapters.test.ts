import { describe, it, expect } from 'vitest';
import {
  ApiContractError,
  adaptComparison,
  adaptDaily,
  adaptHeartRate,
  adaptImport,
  adaptSleep,
  adaptStudy,
  adaptSyncStatus,
  adaptWeekly,
  isEmptyDay,
} from '../api/adapters';
import type { DailySummary } from '../types';

// ---- fixtures modelled on real GET responses from the FastAPI backend ----

const studyRaw = {
  schema_version: '1',
  timezone: 'Europe/Amsterdam',
  calculation_version: '1',
  freshness: {
    last_successful_fetch: '2026-10-07T21:30:30.599897',
    last_successful_run_id: 'run-1',
    data_source: 'demo',
    is_stale: false,
  },
  participant_code: 'P001',
  study_id: 'study-1',
  start_date: '2026-09-24',
  end_date_exclusive: '2026-10-08',
  study_days_count: 14,
  study_dates: Array.from({ length: 14 }, (_, i) =>
    new Date(Date.UTC(2026, 8, 24 + i)).toISOString().slice(0, 10)
  ),
  status: 'active',
  data_mode: 'demo',
};

function dailyRaw(date: string, over: Record<string, unknown> = {}) {
  return {
    schema_version: '1',
    timezone: 'Europe/Amsterdam',
    calculation_version: '1',
    freshness: { last_successful_fetch: null, data_source: 'database', is_stale: false },
    data: {
      date,
      sleep: {
        main_asleep_seconds: 26369,
        total_sleep_seconds: 28267,
        sleep_efficiency_pct: 91.35,
        main_sleep_start: null,
        main_sleep_end: null,
        nap_count: 1,
      },
      steps: { count: 7414, status: 'observed', intervals_count: 0 },
      heart_rate: { resting_bpm: 70.4, observed_mean_bpm: 87.271, sample_count: 1440 },
      coverage: { has_sleep: true, has_steps: true, has_heart_rate: true },
      is_provisional: false,
      data_quality: 'good',
      ...over,
    },
  };
}

const emptyDaily = (date: string) =>
  dailyRaw(date, {
    sleep: { main_asleep_seconds: null, total_sleep_seconds: null, sleep_efficiency_pct: null, nap_count: 0 },
    steps: { count: null, status: 'unknown', intervals_count: 0 },
    heart_rate: { resting_bpm: null, observed_mean_bpm: null, sample_count: 0 },
    coverage: { has_sleep: false, has_steps: false, has_heart_rate: false },
    data_quality: 'missing',
  });

describe('adaptStudy', () => {
  it('maps the backend study onto StudyConfig', () => {
    const s = adaptStudy(studyRaw);
    expect(s.study_id).toBe('study-1');
    expect(s.participant_label).toBe('P001');
    expect(s.start_date).toBe('2026-09-24');
    expect(s.end_date).toBe('2026-10-07'); // inclusive, backend end is exclusive
    expect(s.days_total).toBe(14);
    expect(s.timezone).toBe('Europe/Amsterdam');
    expect(s.data_mode).toBe('demo');
  });

  it('treats naive backend datetimes as UTC', () => {
    expect(adaptStudy(studyRaw).freshness.last_successful_sync).toBe('2026-10-07T21:30:30.599897Z');
  });

  it('keeps unknown Google state as null instead of inventing false', () => {
    const s = adaptStudy(studyRaw);
    expect(s.google_configured).toBeNull();
    expect(s.google_connected).toBeNull();
  });

  it('keeps a missing last sync as null', () => {
    const s = adaptStudy({
      ...studyRaw,
      freshness: { ...studyRaw.freshness, last_successful_fetch: null, is_stale: true },
    });
    expect(s.freshness.last_successful_sync).toBeNull();
    expect(s.freshness.is_stale).toBe(true);
  });

  it('derives days from the exclusive end when study_dates is absent', () => {
    const { study_dates: _omit, study_days_count: _omit2, ...rest } = studyRaw;
    const s = adaptStudy(rest);
    expect(s.days_total).toBe(14);
    expect(s.end_date).toBe('2026-10-07');
  });

  it('throws a contract error for missing or malformed fields', () => {
    const { start_date: _s, ...noStart } = studyRaw;
    expect(() => adaptStudy(noStart)).toThrow(ApiContractError);
    expect(() => adaptStudy({ ...studyRaw, start_date: '24/09/2026' })).toThrow(ApiContractError);
    expect(() => adaptStudy({ ...studyRaw, data_mode: 'mystery' })).toThrow(ApiContractError);
    expect(() => adaptStudy('<html>oops</html>')).toThrow(ApiContractError);
    expect(() => adaptStudy(null)).toThrow(ApiContractError);
  });
});

describe('adaptDaily', () => {
  it('maps a complete day with unit conversions', () => {
    const d = adaptDaily(dailyRaw('2026-09-26'), '2026-09-24');
    expect(d.date).toBe('2026-09-26');
    expect(d.day_number).toBe(3);
    expect(d.main_sleep_seconds).toBe(26369);
    expect(d.total_sleep_seconds).toBe(28267);
    expect(d.nap_seconds).toBe(28267 - 26369);
    expect(d.sleep_efficiency).toBeCloseTo(0.9135, 6); // percent -> fraction
    expect(d.steps_count).toBe(7414);
    expect(d.resting_hr_bpm).toBe(70.4);
    expect(d.observed_mean_hr_bpm).toBe(87.271);
    expect(d.hr_sample_count).toBe(1440);
    expect(d.coverage).toEqual({ has_sleep: true, has_steps: true, has_heart_rate: true });
    expect(d.source).toBe('database');
    expect(isEmptyDay(d)).toBe(false);
  });

  it('does not report steps sample counts the backend never populates', () => {
    expect(adaptDaily(dailyRaw('2026-09-26'), '2026-09-24').steps_sample_count).toBeNull();
  });

  it('keeps nulls for a partially covered day', () => {
    const d = adaptDaily(
      dailyRaw('2026-09-27', {
        sleep: { main_asleep_seconds: null, total_sleep_seconds: null, sleep_efficiency_pct: null, nap_count: 0 },
        coverage: { has_sleep: false, has_steps: true, has_heart_rate: true },
      }),
      '2026-09-24'
    );
    expect(d.main_sleep_seconds).toBeNull();
    expect(d.nap_seconds).toBeNull();
    expect(d.sleep_efficiency).toBeNull();
    expect(d.steps_count).toBe(7414);
    expect(isEmptyDay(d)).toBe(false);
  });

  it('flags a day with no recorded observations as empty (not an error)', () => {
    const d = adaptDaily(emptyDaily('2026-09-28'), '2026-09-24');
    expect(d.main_sleep_seconds).toBeNull();
    expect(d.steps_count).toBeNull();
    expect(d.resting_hr_bpm).toBeNull();
    expect(d.hr_sample_count).toBe(0);
    expect(isEmptyDay(d)).toBe(true);
  });

  it('keeps zero steps as a real observation', () => {
    const d = adaptDaily(
      dailyRaw('2026-09-28', { steps: { count: 0, status: 'observed', intervals_count: 0 } }),
      '2026-09-24'
    );
    expect(d.steps_count).toBe(0);
  });

  it('rejects incorrect or missing fields', () => {
    expect(() => adaptDaily({}, '2026-09-24')).toThrow(ApiContractError);
    expect(() => adaptDaily({ data: { date: 'nope' } }, '2026-09-24')).toThrow(ApiContractError);
    expect(() =>
      adaptDaily(dailyRaw('2026-09-26', { sleep: { main_asleep_seconds: 'lots' } }), '2026-09-24')
    ).toThrow(ApiContractError);
    expect(() =>
      adaptDaily(dailyRaw('2026-09-26', { coverage: { has_sleep: true } }), '2026-09-24')
    ).toThrow(ApiContractError);
  });
});

function weeklyRaw(weekNumber: 1 | 2, dates: string[], valid = 7) {
  return {
    week_number: weekNumber,
    days: [],
    summary: {
      week_number: weekNumber,
      day_range: dates,
      total_steps: 50000,
      mean_steps_per_valid_day: 7142.86,
      valid_step_days: valid,
      mean_main_sleep_per_valid_night_seconds: 23000,
      mean_main_sleep_per_valid_night_hours: 6.39,
      valid_sleep_nights: valid,
      mean_resting_bpm: 66.1,
      valid_resting_days: valid,
      mean_observed_bpm: 84.2,
      valid_observed_days: valid,
      is_complete: valid === 7,
    },
  };
}

const week1Dates = studyRaw.study_dates.slice(0, 7);
const week2Dates = studyRaw.study_dates.slice(7);
const dailyFor = (dates: string[]): DailySummary[] =>
  dates.map((d) => adaptDaily(dailyRaw(d), '2026-09-24'));

describe('adaptWeekly', () => {
  it('maps a complete week', () => {
    const w = adaptWeekly(weeklyRaw(1, week1Dates), dailyFor(week1Dates));
    expect(w.week_number).toBe(1);
    expect(w.dates).toEqual(week1Dates);
    expect(w.avg_main_sleep_seconds).toBe(23000);
    expect(w.avg_main_sleep_valid_days).toBe(7);
    expect(w.avg_steps_count).toBe(7142.86);
    expect(w.avg_resting_hr_bpm).toBe(66.1);
    expect(w.avg_observed_mean_hr_bpm).toBe(84.2);
    expect(w.completeness_percent).toBe(100);
    expect(w.total_nap_seconds).toBe(7 * (28267 - 26369));
    expect(w.daily_summaries).toHaveLength(7);
    expect(w.day_range_label).toBe('Days 1–7');
  });

  it('computes partial completeness from valid metric-days', () => {
    const w = adaptWeekly(weeklyRaw(2, week2Dates, 3), dailyFor(week2Dates));
    expect(w.completeness_percent).toBeCloseTo((3 * 4 * 100) / 28, 6);
    expect(w.day_range_label).toBe('Days 8–14');
  });

  it('keeps null means when the week has no valid days', () => {
    const raw = weeklyRaw(1, week1Dates, 0);
    raw.summary.mean_steps_per_valid_day = null as unknown as number;
    raw.summary.mean_main_sleep_per_valid_night_seconds = null as unknown as number;
    raw.summary.mean_resting_bpm = null as unknown as number;
    raw.summary.mean_observed_bpm = null as unknown as number;
    const empty = week1Dates.map((d) => adaptDaily(emptyDaily(d), '2026-09-24'));
    const w = adaptWeekly(raw, empty);
    expect(w.avg_steps_count).toBeNull();
    expect(w.avg_main_sleep_seconds).toBeNull();
    expect(w.total_nap_seconds).toBeNull();
    expect(w.completeness_percent).toBe(0);
  });

  it('rejects daily data that does not match the week', () => {
    expect(() => adaptWeekly(weeklyRaw(1, week1Dates), dailyFor(week2Dates))).toThrow(
      ApiContractError
    );
    expect(() => adaptWeekly({ week_number: 1 }, [])).toThrow(ApiContractError);
  });
});

describe('adaptComparison', () => {
  const metrics = [
    { metric: 'mean_steps_per_valid_day', absolute_change: 500, percentage_change: 7.5 },
    { metric: 'total_steps', absolute_change: 3500, percentage_change: 7.5 },
    { metric: 'mean_main_sleep_hours', absolute_change: -0.2, percentage_change: -3.1 },
    { metric: 'mean_resting_bpm', absolute_change: 1.5, percentage_change: null },
    { metric: 'mean_observed_bpm', absolute_change: null, percentage_change: null },
  ];
  const raw = (over: Record<string, unknown> = {}) => ({
    week1: weeklyRaw(1, week1Dates).summary,
    week2: { ...weeklyRaw(2, week2Dates).summary, mean_main_sleep_per_valid_night_seconds: 22000 },
    comparisons: metrics,
    study_dates: studyRaw.study_dates,
    ...over,
  });
  const all = dailyFor(studyRaw.study_dates);

  it('maps deltas and keeps nulls', () => {
    const c = adaptComparison(raw(), all);
    expect(c.week1.dates).toEqual(week1Dates);
    expect(c.week2.dates).toEqual(week2Dates);
    expect(c.delta_main_sleep_seconds).toBe(-1000);
    expect(c.delta_main_sleep_pct).toBe(-3.1);
    expect(c.delta_steps_count).toBe(500);
    expect(c.delta_steps_pct).toBe(7.5);
    expect(c.delta_resting_hr_bpm).toBe(1.5);
    expect(c.delta_resting_hr_pct).toBeNull();
    expect(c.delta_observed_mean_hr_bpm).toBeNull();
    expect(c.delta_nap_seconds).toBe(0);
    expect(c.delta_nap_pct).toBe(0);
  });

  it('throws when a required metric or day is missing', () => {
    expect(() => adaptComparison(raw({ comparisons: metrics.slice(1) }), all)).toThrow(ApiContractError);
    expect(() => adaptComparison(raw(), all.slice(0, 10))).toThrow(ApiContractError);
  });
});

describe('adaptHeartRate', () => {
  it('maps samples, marks naive timestamps as UTC and keeps null bpm', () => {
    const out = adaptHeartRate({
      date: '2026-09-25',
      samples: [
        { id: 'a', observed_at: '2026-09-24T22:00:00', bpm: 59.3 },
        { id: 'b', observed_at: '2026-09-24T22:01:00', bpm: null },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].timestamp).toBe('2026-09-24T22:00:00Z');
    expect(out[0].bpm).toBe(59.3);
    expect(out[1].bpm).toBeNull();
  });

  it('returns an empty list only for a genuinely empty samples array', () => {
    expect(adaptHeartRate({ date: '2026-09-25', samples: [] })).toEqual([]);
    expect(() => adaptHeartRate({ date: '2026-09-25' })).toThrow(ApiContractError);
  });
});

describe('adaptSleep', () => {
  const session = {
    id: 's1',
    start_at: '2026-09-24T21:50:00',
    end_at: '2026-09-25T05:08:23.020997',
    wake_date: '2026-09-25',
    duration_seconds: 26303,
    asleep_seconds: 24027,
    in_bed_seconds: 26303,
    is_main: true,
    sleep_efficiency_pct: 91.35,
    segments: [
      { id: 'g1', start_at: '2026-09-24T21:50:00', end_at: '2026-09-24T22:08:37', stage_label: 'light', duration_seconds: 1117 },
      { id: 'g2', start_at: '2026-09-24T22:08:37', end_at: '2026-09-24T22:23:03', stage_label: 'rem', duration_seconds: 866 },
      { id: 'g3', start_at: '2026-09-24T22:23:03', end_at: '2026-09-24T22:30:00', stage_label: 'mystery', duration_seconds: 417 },
    ],
  };

  it('maps sessions, stages and unit conversions', () => {
    const out = adaptSleep({ date: '2026-09-25', sessions: [session], total_sessions: 1 });
    const s = out.sessions[0];
    expect(s.session_id).toBe('s1');
    expect(s.is_main).toBe(true);
    expect(s.start_time).toBe('2026-09-24T21:50:00Z');
    expect(s.asleep_seconds).toBe(24027);
    expect(s.in_bed_seconds).toBe(26303);
    expect(s.efficiency).toBeCloseTo(0.9135, 6);
    expect(s.stages.map((g) => g.stage)).toEqual(['light', 'rem', 'unknown']);
    expect(s.stage_totals_seconds).toEqual({ awake: 0, light: 1117, deep: 0, rem: 866, unknown: 417 });
  });

  it('keeps null in-bed / asleep / efficiency and no-segment totals', () => {
    const out = adaptSleep({
      date: '2026-09-25',
      sessions: [{ ...session, asleep_seconds: null, in_bed_seconds: null, sleep_efficiency_pct: null, segments: [] }],
    });
    const s = out.sessions[0];
    expect(s.asleep_seconds).toBeNull();
    expect(s.in_bed_seconds).toBeNull();
    expect(s.efficiency).toBeNull();
    expect(s.stage_totals_seconds).toBeNull();
  });

  it('distinguishes no sessions from a malformed response', () => {
    expect(adaptSleep({ date: '2026-09-25', sessions: [] }).sessions).toEqual([]);
    expect(() => adaptSleep({ date: '2026-09-25' })).toThrow(ApiContractError);
    expect(() => adaptSleep({ date: '2026-09-25', sessions: [{ id: 'x' }] })).toThrow(ApiContractError);
  });
});

describe('adaptSyncStatus', () => {
  const base = {
    run_id: 'r1',
    mode: 'demo',
    started_at: '2026-10-12T10:00:00',
    finished_at: null,
    row_count: 0,
  };
  it('maps backend statuses', () => {
    expect(adaptSyncStatus({ ...base, status: 'running' }).status).toBe('running');
    const ok = adaptSyncStatus({ ...base, status: 'success', finished_at: '2026-10-12T10:00:05', row_count: 120 });
    expect(ok.status).toBe('completed');
    expect(ok.records_succeeded).toBe(120);
    expect(ok.finished_at).toBe('2026-10-12T10:00:05Z');
    const bad = adaptSyncStatus({ ...base, status: 'failed', error_code: 'X', error_detail: 'boom' });
    expect(bad.status).toBe('failed');
    expect(bad.error_message).toBe('X: boom');
    expect(adaptSyncStatus({ ...base, status: 'abandoned' }).status).toBe('failed');
  });
  it('rejects unknown statuses', () => {
    expect(() => adaptSyncStatus({ ...base, status: 'sideways' })).toThrow(ApiContractError);
  });
});

describe('adaptImport', () => {
  it('maps a successful import', () => {
    const r = adaptImport({
      success: true,
      run_id: 'r',
      validation_errors: [],
      stats: {
        sleep_sessions_upserted: 2,
        sleep_sessions_duplicate: 1,
        heart_rate_samples_upserted: 100,
        heart_rate_samples_duplicate: 0,
        step_intervals_upserted: 10,
        step_intervals_duplicate: 0,
      },
      message: 'ok',
    });
    expect(r.accepted_records).toBe(112);
    expect(r.rejected_records).toBe(0);
    expect(r.schema_version_valid).toBe(true);
    expect(r.warnings[0]).toMatch(/1 duplicate/);
  });

  it('maps validation failures to rejections', () => {
    const r = adaptImport({
      success: false,
      validation_errors: ["Unsupported schema_version '9'."],
      stats: {},
      message: 'Schema validation failed',
    });
    expect(r.accepted_records).toBe(0);
    expect(r.rejected_records).toBe(1);
    expect(r.rejected_reasons[0].reason).toMatch(/schema_version/);
    expect(r.schema_version_valid).toBe(false);
  });

  it('surfaces a failed import without errors via warnings', () => {
    const r = adaptImport({ success: false, validation_errors: [], message: 'Import exception' });
    expect(r.warnings).toContain('Import exception');
  });

  it('rejects malformed responses', () => {
    expect(() => adaptImport({})).toThrow(ApiContractError);
  });
});
