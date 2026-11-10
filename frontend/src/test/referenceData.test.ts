import { describe, it, expect } from 'vitest';
import { civilMinute, RangeData, referenceRows } from '../dashboard/referenceData';

function dataset(): RangeData {
  return {
    days: [{ date: '2026-10-06', steps: 2000, sleep_hours: 7 }],
    heart_rate_trend: [
      { timestamp: '2026-10-05T20:00:00Z', bpm: 60, peak_bpm: 80, samples: 3 },
      { timestamp: '2026-10-06T02:00:00Z', bpm: 80, peak_bpm: 100, samples: 1 },
      { timestamp: '2026-10-06T10:00:00Z', bpm: 90, peak_bpm: 120, samples: 2 },
    ],
    sleep_sessions: [{ study_date: '2026-10-06', start_at: '2026-10-05T22:00:00Z', end_at: '2026-10-06T06:00:00Z', minutes_asleep: 420, minutes_awake: 30, minutes_to_fall_asleep: 0, main_sleep: true,
      stages: [
        { type: 'AWAKE', startTime: '2026-10-05T22:00:00Z', endTime: '2026-10-05T22:20:00Z' },
        { type: 'LIGHT', startTime: '2026-10-05T22:20:00Z', endTime: '2026-10-06T02:00:00Z' },
        { type: 'AWAKE', startTime: '2026-10-06T02:00:00Z', endTime: '2026-10-06T02:15:00Z' },
        { type: 'DEEP', startTime: '2026-10-06T02:15:00Z', endTime: '2026-10-06T06:00:00Z' },
      ] }],
    morning_responses: [{ study_date: '2026-10-06', submitted_at: '2026-10-06T10:00:00Z', energy: 3, sleep_quality: 4, bedtime: '23:50:00', fell_asleep_time: '23:55:00', reported_sleep_date: '2026-10-05' }],
    evening_responses: [],
  };
}
describe('reference dashboard data alignment', () => {
  it('pairs the preceding night with its wake day and uses actual stage onset', () => {
    const row = referenceRows(dataset())[0];
    expect(row.night).toBe('2026-10-05');
    expect(row.day).toBe('2026-10-06');
    expect(row.sleep?.onset).toBe(1460);
    expect(row.sleep?.awakenings).toBe(1); // exclude the initial awake stage
    expect(row.midday?.bed).toBe(1430);
    expect(row.sleep?.hrAvg).toBe(65); // sample-weighted, not mean of hourly means
    expect(row.sleep?.hrPeak).toBe(100);
    expect(row.hrDay.avg).toBe(90);
  });
  it('preserves missing records and never invents unavailable measurements', () => {
    const d = dataset(); d.sleep_sessions = []; d.morning_responses = [];
    const row = referenceRows(d)[0];
    expect(row.sleep).toBeNull(); expect(row.midday).toBeNull();
    expect(row.active).toBeNull(); expect(row.evening).toBeNull();
    expect(row.hrDay.peakAt).toBeNull();
  });
  it('uses Amsterdam civil time through DST and regardless of viewer time zone', () => {
    expect(civilMinute('2026-10-25T00:30:00Z', '2026-10-24')).toBe(1590);
    expect(civilMinute('2026-10-25T01:30:00Z', '2026-10-24')).toBe(1590);
  });
  it('retains all questionnaire submissions and compares the latest', () => {
    const d = dataset(); d.morning_responses.push({ ...d.morning_responses[0], submitted_at: '2026-10-06T14:00:00Z', energy: 5 });
    const row = referenceRows(d)[0];
    expect(row.midday?.energy).toBe(5); expect(row.submissions.morning).toHaveLength(2);
  });
  it('uses the user-confirmed study-date alignment for early-morning answers', () => {
    const d=dataset();
    d.morning_responses[0]={...d.morning_responses[0],reported_sleep_date:'2026-10-06',bedtime:'04:30:00',fell_asleep_time:'04:30:00'};
    const row=referenceRows(d)[0];
    expect(row.midday?.bed).toBe(1710);
    expect(row.midday?.fell).toBe(1710);
    expect(row.sleep?.onset).toBe(1460);
  });
  it('maps productive hours as reported and preserves a recorded zero', () => {
    const d=dataset();
    d.evening_responses=[{study_date:'2026-10-06',submitted_at:'2026-10-06T18:00:00Z',energy:4,productive_hours:0}];
    expect(referenceRows(d)[0].evening?.productive).toBe(0);
    d.evening_responses[0].productive_hours=null;
    expect(referenceRows(d)[0].evening?.productive).toBeNull();
  });
});
