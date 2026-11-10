/** Descriptive summaries: no medical sleep threshold, causal claim or steps/productivity proxy. */
export interface SummaryRow {
  night: string;
  day: string;
  sleep: { sleepMin: number | null } | null;
  evening: { productive?: number | null } | null;
  steps: number | null;
}
const recorded = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const hours = (v: number) => v.toLocaleString('en-GB', { maximumFractionDigits: 1 });
function duration(minutes: number) {
  const total = Math.round(Math.abs(minutes));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}
function priorDate(day: string) {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10);
}
function weekKey(night: string) {
  const d = new Date(`${night}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10);
}
export function dailySummary(row: SummaryRow, previous?: SummaryRow): string {
  const sleep = row.sleep?.sleepMin, productive = row.evening?.productive;
  const first = `Jack ${recorded(sleep) ? `slept ${duration(sleep)}` : 'has no recorded sleep for this night'}, ${recorded(productive) ? `reported ${hours(productive)} productive hours` : 'did not report productive hours'} and ${recorded(row.steps) ? `recorded ${row.steps.toLocaleString('en-GB', { maximumFractionDigits: 0 })} steps` : 'has no recorded step count'}.`;
  const priorSleep = previous?.sleep?.sleepMin, priorProductive = previous?.evening?.productive;
  if (previous?.day === priorDate(row.day) && recorded(sleep) && recorded(priorSleep) && recorded(productive) && recorded(priorProductive)) {
    const ds = sleep - priorSleep, dp = productive - priorProductive;
    const sleepChange = Math.round(Math.abs(ds)) === 0 ? 'unchanged' : `${duration(ds)} ${ds < 0 ? 'shorter' : 'longer'}`;
    const productivityChange = Math.abs(dp) < 0.05 ? 'unchanged' : `${hours(Math.abs(dp))}h ${dp < 0 ? 'lower' : 'higher'}`;
    return `${first} Versus yesterday: sleep was ${sleepChange} and reported productivity ${productivityChange}; steps reflect physical activity.`;
  }
  return `${first} Steps reflect physical activity; a paired comparison with the previous day is unavailable.`;
}
export function weeklySummary(rows: SummaryRow[]): string {
  const sleeps = rows.map(r => r.sleep?.sleepMin).filter(recorded);
  const productive = rows.map(r => r.evening?.productive).filter(recorded);
  const steps = rows.map(r => r.steps).filter(recorded);
  const first = `Jack ${sleeps.length ? `averaged ${duration(mean(sleeps))} sleep` : 'has no recorded sleep data'}, ${productive.length ? `reported ${hours(mean(productive))} productive hours/day on average` : 'did not report productive hours'} and ${steps.length ? `recorded ${steps.reduce((a,b) => a+b,0).toLocaleString('en-GB', { maximumFractionDigits: 0 })} steps` : 'has no recorded step counts'}.`;
  const paired = rows.filter(r => recorded(r.sleep?.sleepMin) && recorded(r.evening?.productive));
  if (paired.length >= 4) {
    const ordered = paired.map(r => r.sleep!.sleepMin!).sort((a,b) => a-b);
    const mid = Math.floor(ordered.length / 2);
    const median = ordered.length % 2 ? ordered[mid] : (ordered[mid-1] + ordered[mid]) / 2;
    const shorter = paired.filter(r => r.sleep!.sleepMin! < median);
    const longer = paired.filter(r => r.sleep!.sleepMin! >= median);
    if (shorter.length >= 2 && longer.length >= 2) {
      const shortHours = mean(shorter.map(r => r.evening!.productive!));
      const longHours = mean(longer.map(r => r.evening!.productive!));
      return `${first} Reported productivity averaged ${hours(shortHours)}h after shorter nights vs ${hours(longHours)}h after longer nights (${shorter.length}/${longer.length} paired days, split at median sleep); steps reflect activity.`;
    }
  }
  return `${first} There are too few paired days or too little sleep variation to compare shorter and longer nights; steps reflect physical activity.`;
}
export function buildGlanceSummaries(rows: SummaryRow[]) {
  const byDay = new Map(rows.map(r => [r.day, r]));
  const weeks = new Map<string, SummaryRow[]>();
  for (const row of rows) {
    const key = weekKey(row.night);
    weeks.set(key, [...weeks.get(key) || [], row]);
  }
  return {
    daily: Object.fromEntries(rows.map(row => [row.day, dailySummary(row, byDay.get(priorDate(row.day)))])),
    weekly: Object.fromEntries([...weeks].map(([key, days]) => [key, weeklySummary(days)])),
  };
}
