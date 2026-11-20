/** Convert the authenticated API response into the supplied design's night/day model.
 * Dates and clock comparisons use Amsterdam civil time, independent of the viewer's zone.
 * Missing data stays null; no readings or questionnaire answers are generated.
 */
export interface Reading { timestamp: string; bpm: number | null; peak_bpm?: number | null; samples: number }
export interface CheckIn { study_date: string; submitted_at: string; energy: number | null; sleep_quality?: number | null; bedtime?: string | null; fell_asleep_time?: string | null; reported_sleep_date?: string | null; productive_hours?: number | null; last_meal_time?: string | null }
export interface SleepSession { study_date: string; start_at: string; end_at: string; minutes_asleep: number | null; recorded_minutes_asleep?: number | null; minutes_awake: number | null; minutes_to_fall_asleep: number | null; main_sleep: boolean | null; stages: { type: string; startTime: string; endTime: string }[] | null }
export interface RangeData {
  days: { date: string; steps: number | null; sleep_hours: number | null }[];
  heart_rate_trend: Reading[]; sleep_sessions?: SleepSession[];
  morning_responses: CheckIn[]; evening_responses: CheckIn[];
}
export const shiftDate = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const clock = (v?: string | null) => v ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)) : null;
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function civilMinute(stamp: string, base: string) {
  const p = Object.fromEntries(parts.formatToParts(new Date(stamp)).map(x => [x.type, x.value]));
  return (Date.parse(`${p.year}-${p.month}-${p.day}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 60000 + Number(p.hour) * 60 + Number(p.minute);
}
export function recordedSleepMetrics(session: SleepSession, firstSleepStage?: string) {
  // Elapsed UTC time remains correct when Amsterdam clocks change for DST.
  const start=Date.parse(session.start_at),end=Date.parse(session.end_at);
  const elapsed=(end-start)/60000;
  const recordedMinutes=Number.isFinite(elapsed) && elapsed>0 ? elapsed : null;
  const lead=firstSleepStage ? (Date.parse(firstSleepStage)-start)/60000 : null;
  const bandLatencyMinutes=recordedMinutes!=null && lead!=null && Number.isFinite(lead) && lead>=0 && lead<=recordedMinutes ? lead : null;
  // Preserve the exported band total even when the demo display total is varied.
  const asleep=session.recorded_minutes_asleep ?? session.minutes_asleep;
  const recordedEfficiency=recordedMinutes!=null && asleep!=null && Number.isFinite(asleep) && asleep>=0 && asleep<=recordedMinutes ? asleep/recordedMinutes*100 : null;
  return {recordedMinutes,recordedMinutesAsleep:asleep,bandLatencyMinutes,recordedEfficiency};
}
function hrStats(points: Reading[]) {
  const valid = points.filter(p => p.bpm != null && p.samples > 0);
  const samples = valid.reduce((n, p) => n + p.samples, 0);
  const peaks = valid.map(p => p.peak_bpm).filter((v): v is number => v != null);
  return { avg: samples ? Math.round(valid.reduce((n, p) => n + p.bpm! * p.samples, 0) / samples) : null, peak: peaks.length ? Math.max(...peaks) : null, peakAt: null };
}
export function referenceRows(data: RangeData) {
  return data.days.map(day => {
    const night = shiftDate(day.date, -1);
    // When multiple submissions exist, compare the latest and retain all in the check-in cards.
    const mornings = data.morning_responses.filter(r => r.study_date === day.date).sort((a,b) => a.submitted_at.localeCompare(b.submitted_at));
    const evenings = data.evening_responses.filter(r => r.study_date === day.date).sort((a,b) => a.submitted_at.localeCompare(b.submitted_at));
    const morning = mornings[mornings.length - 1], evening = evenings[evenings.length - 1];
    const candidates = (data.sleep_sessions || []).filter(s => s.study_date === day.date && s.end_at);
    const sessions = [...candidates].sort((a, b) => Number(b.main_sleep === true) - Number(a.main_sleep === true) || (b.minutes_asleep || 0) - (a.minutes_asleep || 0));
    const s = sessions[0];
    const previousEvening = data.evening_responses.filter(r => r.study_date === night).sort((a,b) => a.submitted_at.localeCompare(b.submitted_at)).pop();
    const minute = (v?: string | null) => {
      const c = clock(v); if (c == null || !morning?.reported_sleep_date) return null;
      return (Date.parse(`${morning.reported_sleep_date}T00:00:00Z`) - Date.parse(`${night}T00:00:00Z`)) / 60000 + c;
    };
    const asleepStages = s?.stages?.filter(p => ['LIGHT','DEEP','REM','ASLEEP'].includes(p.type)).sort((a,b) => a.startTime.localeCompare(b.startTime));
    // Only use recorded sleep-stage boundaries; interval start is not assumed to be sleep onset.
    const onset = asleepStages?.length ? civilMinute(asleepStages[0].startTime, night) : null;
    const wake = asleepStages?.length ? civilMinute(asleepStages[asleepStages.length - 1].endTime, night) : null;
    const metrics=s ? recordedSleepMetrics(s,asleepStages?.[0]?.startTime) : {recordedMinutes:null,recordedMinutesAsleep:null,bandLatencyMinutes:null,recordedEfficiency:null};
    const overnight = data.heart_rate_trend.filter(p => { const t = civilMinute(p.timestamp, night); return t >= 1320 && t < 1800; });
    const daytime = data.heart_rate_trend.filter(p => { const t = civilMinute(p.timestamp, day.date); return t >= 360 && t < 1320; });
    const nightHr = hrStats(overnight);
    const awakeStages = s?.stages?.filter(p => p.type === 'AWAKE') || [];
    const wakePeriods = awakeStages.map(p => ({ start: civilMinute(p.startTime, night), len: (Date.parse(p.endTime) - Date.parse(p.startTime))/60000 }))
      .filter(p => onset != null && wake != null && p.start >= onset && p.start + p.len <= wake && p.len >= 10);
    return {
      night, day: day.date,
      sleep: s && onset != null && wake != null ? { onset, wake, sleepMin: s.minutes_asleep, awakeMin: s.minutes_awake, ...metrics, sessionStart: civilMinute(s.start_at, night), sessionEnd: civilMinute(s.end_at, night), awakenings: s.stages ? wakePeriods.length : null, wakePeriods, hrAvg: nightHr.avg, hrPeak: nightHr.peak, hrPeakAt: null } : null,
      midday: morning ? { bed: minute(morning.bedtime), fell: minute(morning.fell_asleep_time), awakenings: null, quality: morning.sleep_quality ?? null, energy: morning.energy } : null,
      evening: evening ? { energy: evening.energy, planned: evening.productive_hours ?? null, productive: evening.productive_hours ?? null, meal: clock(evening.last_meal_time) } : null,
      steps: day.steps, hrDay: hrStats(daytime), mealBefore: clock(previousEvening?.last_meal_time),
      sleepSessionCount: candidates.length,
      curve: data.heart_rate_trend.map(p => ({ t: civilMinute(p.timestamp, night), v: p.bpm == null ? null : Math.round(p.bpm), samples: p.samples })).filter(p => p.t >= 1200 && p.t <= 2760),
      submissions: { morning: mornings, evening: evenings },
    };
  });
}
