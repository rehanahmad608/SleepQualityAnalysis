import { describe, expect, it } from 'vitest';
import { buildGlanceSummaries, dailySummary, SummaryRow, weeklySummary } from '../dashboard/glanceSummaries';

function row(day: string, minutes: number | null, productive: number | null, steps: number | null = 1000): SummaryRow {
  const night = new Date(`${day}T12:00:00Z`); night.setUTCDate(night.getUTCDate()-1);
  return {day,night:night.toISOString().slice(0,10),sleep:minutes==null ? null : {sleepMin:minutes},evening:productive==null ? null : {productive},steps};
}
describe('at-a-glance narrative summaries', () => {
  it('reports the observed direction even when productivity is higher after less sleep', () => {
    const text=dailySummary(row('2026-10-07',300,5),row('2026-10-06',420,2));
    expect(text).toContain('2h 0m shorter');
    expect(text).toContain('3h higher');
    expect(text).toContain('steps reflect physical activity');
  });
  it('does not treat zero productivity or steps as missing', () => {
    const text=dailySummary(row('2026-10-06',360,0,0));
    expect(text).toContain('reported 0 productive hours');
    expect(text).toContain('recorded 0 steps');
  });
  it('does not substitute a zero or an earlier nonconsecutive day for missing data', () => {
    const text=dailySummary(row('2026-10-08',null,null,null),row('2026-10-06',420,2));
    expect(text).toContain('no recorded sleep');
    expect(text).toContain('did not report productive hours');
    expect(text).toContain('previous day is unavailable');
    expect(text).not.toContain('Versus yesterday');
  });
  it('compares paired days without forcing a productivity decline', () => {
    const text=weeklySummary([row('2026-10-06',300,6),row('2026-10-07',360,5),row('2026-10-08',480,2),row('2026-10-09',540,1)]);
    expect(text).toContain('5.5h after shorter nights vs 1.5h after longer nights');
    expect(text).toContain('2/2 paired days');
    expect(text).not.toMatch(/caus|enough sleep|drops/i);
  });
  it('declines a shorter/longer comparison with insufficient variation', () => {
    const text=weeklySummary([row('2026-10-06',420,1),row('2026-10-07',420,2),row('2026-10-08',420,3),row('2026-10-09',420,4)]);
    expect(text).toContain('too little sleep variation');
    expect(text).not.toContain('NaN');
  });
  it('keys weeks by the preceding night and includes the last study day', () => {
    const summaries=buildGlanceSummaries([row('2026-10-06',360,2),row('2026-10-19',420,3)]);
    expect(Object.keys(summaries.weekly)).toEqual(['2026-10-05','2026-10-12']);
    expect(summaries.daily['2026-10-19']).toContain('slept 7h 0m');
  });
});
