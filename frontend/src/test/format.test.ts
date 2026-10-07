import { describe, it, expect } from 'vitest';
import { formatDuration, formatPercentageChange, formatSteps, formatBPM } from '../utils/format';

describe('formatDuration', () => {
  it('formats zero seconds as 0m', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats minutes only', () => {
    expect(formatDuration(32 * 60)).toBe('32m');
  });

  it('formats hours only', () => {
    expect(formatDuration(7 * 3600)).toBe('7h');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(7 * 3600 + 32 * 60)).toBe('7h 32m');
  });

  it('rounds correctly (7h 32m from 27300s = 7h35m', () => {
    expect(formatDuration(27300)).toBe('7h 35m');
  });

  it('returns em dash for null', () => {
    expect(formatDuration(null)).toBe('—');
  });

  it('returns em dash for undefined', () => {
    expect(formatDuration(undefined)).toBe('—');
  });

  it('returns em dash for NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('formatPercentageChange', () => {
  it('shows positive change with up arrow', () => {
    expect(formatPercentageChange(112, 100)).toBe('↑12%');
  });

  it('shows negative change with down arrow', () => {
    expect(formatPercentageChange(92, 100)).toBe('↓8%');
  });

  it('rounds to nearest integer', () => {
    expect(formatPercentageChange(105.4, 100)).toBe('↑5%');
    expect(formatPercentageChange(94.6, 100)).toBe('↓5%');
  });

  it('shows 0% for identical values', () => {
    expect(formatPercentageChange(100, 100)).toBe('0%');
  });

  it('returns em dash for zero baseline', () => {
    expect(formatPercentageChange(5, 0)).toBe('—');
  });

  it('returns em dash for null baseline', () => {
    expect(formatPercentageChange(5, null)).toBe('—');
  });

  it('returns em dash for undefined baseline', () => {
    expect(formatPercentageChange(5, undefined)).toBe('—');
  });

  it('returns em dash for null value', () => {
    expect(formatPercentageChange(null, 100)).toBe('—');
  });

  it('returns em dash for undefined value', () => {
    expect(formatPercentageChange(undefined, 100)).toBe('—');
  });

  it('returns em dash for NaN value', () => {
    expect(formatPercentageChange(Number.NaN, 100)).toBe('—');
  });

  it('returns em dash for NaN baseline', () => {
    expect(formatPercentageChange(5, Number.NaN)).toBe('—');
  });
});

describe('formatSteps', () => {
  it('formats thousands with comma', () => {
    expect(formatSteps(6500)).toBe('6,500');
    expect(formatSteps(12345)).toBe('12,345');
  });

  it('returns em dash for null', () => {
    expect(formatSteps(null)).toBe('—');
  });
});

describe('formatBPM', () => {
  it('rounds and formats bpm', () => {
    expect(formatBPM(62.7)).toBe('63');
  });
  it('returns em dash for null', () => {
    expect(formatBPM(null)).toBe('—');
  });
});
