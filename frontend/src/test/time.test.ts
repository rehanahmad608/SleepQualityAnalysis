import { describe, it, expect } from 'vitest';
import { getStudyDates, getWeekDates, getDayNumber, isWithinStudy, getCurrentStudyDayOrDefault } from '../utils/time';
import type { StudyConfig } from '../types';

describe('getStudyDates', () => {
  it('returns exactly 14 dates by default', () => {
    const dates = getStudyDates('2025-01-01');
    expect(dates).toHaveLength(14);
  });

  it('starts at the given start date', () => {
    const dates = getStudyDates('2025-01-01');
    expect(dates[0]).toBe('2025-01-01');
  });

  it('produces contiguous calendar-consecutive dates', () => {
    const dates = getStudyDates('2025-01-01');
    expect(dates[1]).toBe('2025-01-02');
    expect(dates[13]).toBe('2025-01-14');
  });

  it('respects explicit days parameter', () => {
    const dates = getStudyDates('2025-01-01', 7);
    expect(dates).toHaveLength(7);
    expect(dates[6]).toBe('2025-01-07');
  });
});

describe('getWeekDates', () => {
  const all = getStudyDates('2025-01-01');

  it('returns exactly 7 dates for week 1', () => {
    const w1 = getWeekDates(all, 1);
    expect(w1).toHaveLength(7);
    expect(w1[0]).toBe('2025-01-01');
    expect(w1[6]).toBe('2025-01-07');
  });

  it('returns exactly 7 dates for week 2', () => {
    const w2 = getWeekDates(all, 2);
    expect(w2).toHaveLength(7);
    expect(w2[0]).toBe('2025-01-08');
    expect(w2[6]).toBe('2025-01-14');
  });

  it('week 1 + week 2 = 14 unique dates', () => {
    const w1 = getWeekDates(all, 1);
    const w2 = getWeekDates(all, 2);
    const combined = new Set([...w1, ...w2]);
    expect(combined.size).toBe(14);
  });
});

describe('getDayNumber', () => {
  const all = getStudyDates('2025-01-01');

  it('returns 1 for first date', () => {
    expect(getDayNumber(all, '2025-01-01')).toBe(1);
  });

  it('returns 14 for last date', () => {
    expect(getDayNumber(all, '2025-01-14')).toBe(14);
  });

  it('returns -1 for date not in the list', () => {
    expect(getDayNumber(all, '2024-12-31')).toBe(-1);
  });
});

describe('isWithinStudy', () => {
  const study: StudyConfig = {
    study_id: 's1',
    participant_label: 'P1',
    start_date: '2025-01-01',
    end_date: '2025-01-14',
    days_total: 14,
    data_mode: 'demo',
    google_connected: false,
    google_configured: false,
    freshness: { last_successful_sync: null, is_stale: false, stale_hours: null },
  };

  it('returns true on the start date', () => {
    expect(isWithinStudy('2025-01-01', study)).toBe(true);
  });

  it('returns true on the end date', () => {
    expect(isWithinStudy('2025-01-14', study)).toBe(true);
  });

  it('returns true inside range', () => {
    expect(isWithinStudy('2025-01-07', study)).toBe(true);
  });

  it('returns false before start', () => {
    expect(isWithinStudy('2024-12-31', study)).toBe(false);
  });

  it('returns false after end', () => {
    expect(isWithinStudy('2025-01-15', study)).toBe(false);
  });

  it('returns false when study is null', () => {
    expect(isWithinStudy('2025-01-02', null)).toBe(false);
  });
});

describe('getCurrentStudyDayOrDefault', () => {
  const study: StudyConfig = {
    study_id: 's1',
    participant_label: 'P1',
    start_date: '2000-01-01',
    end_date: '2000-01-14',
    days_total: 14,
    data_mode: 'demo',
    google_connected: false,
    google_configured: false,
    freshness: { last_successful_sync: null, is_stale: false, stale_hours: null },
  };

  it('falls back to last date when today outside study', () => {
    const d = getCurrentStudyDayOrDefault(study);
    expect(d).toBe('2000-01-14');
  });

  it('returns empty string for null study', () => {
    expect(getCurrentStudyDayOrDefault(null)).toBe('');
  });
});
