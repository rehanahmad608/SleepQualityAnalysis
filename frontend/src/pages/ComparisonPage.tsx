import { useComparison } from '../api/hooks';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import StatusBadge from '../components/ui/StatusBadge';
import { getCompletenessTone } from '../utils/status';
import MetricCard from '../components/ui/MetricCard';
import { DataTable } from '../components/ui/DataTable';
import {
  formatAbsoluteChange,
  formatBPM,
  formatDuration,
  formatPercentageChange,
  formatSteps,
} from '../utils/format';
import type { ReactNode } from 'react';

interface CompareMetricProps {
  label: string;
  w1Value: number | null | undefined;
  w2Value: number | null | undefined;
  w1Valid: number | null | undefined;
  w2Valid: number | null | undefined;
  formatter: (v: number | null | undefined) => string;
  baseline: number | null | undefined;
  current: number | null | undefined;
  units?: string;
  description?: string;
}

function CompareMetric({
  label,
  w1Value,
  w2Value,
  w1Valid,
  w2Valid,
  formatter,
  baseline,
  current,
  units,
  description,
}: CompareMetricProps) {
  const pct = formatPercentageChange(current, baseline);
  const abs = formatAbsoluteChange(current, baseline, formatter);
  const isNeutral = pct === '—' || pct === '0%';
  const isPosStr = !isNeutral && pct.startsWith('↑');
  const deltaClass = isNeutral ? 'delta-neutral' : isPosStr ? 'delta-pos' : 'delta-neg';

  return (
    <div className="comparison-metric-row">
      <div className="comparison-metric-label">{label}</div>
      <div className="comparison-left">
        <div>{formatter(w1Value)}{units ? ` ${units}` : ''}</div>
        <div className="text-xs text-muted">{w1Valid ?? 0} valid days</div>
      </div>
      <div className={`comparison-value ${deltaClass}`} aria-live="polite">
        <div className="font-semibold">{abs}</div>
        <div className="text-xs">{pct}</div>
      </div>
      <div className="comparison-right">
        <div>{formatter(w2Value)}{units ? ` ${units}` : ''}</div>
        <div className="text-xs text-muted">{w2Valid ?? 0} valid days</div>
      </div>
      {description && (
        <div className="text-xs text-muted" style={{ gridColumn: '1 / -1', marginTop: -4 }}>
          {description}
        </div>
      )}
    </div>
  );
}

function ComparisonWeekCard({
  weekLabel,
  avgSleep,
  sleepValid,
  totalNap,
  avgRHR,
  rhrValid,
  avgObsHR,
  obsHRValid,
  avgSteps,
  stepsValid,
  completeness,
  dateRange,
}: {
  weekLabel: string;
  avgSleep: number | null;
  sleepValid: number;
  totalNap: number | null;
  avgRHR: number | null;
  rhrValid: number;
  avgObsHR: number | null;
  obsHRValid: number;
  avgSteps: number | null;
  stepsValid: number;
  completeness: number;
  dateRange: string;
}) {
  return (
    <div className="card" style={{ height: '100%' }}>
      <div className="card-header">
        <div>
          <div className="card-title">{weekLabel}</div>
          <div className="card-subtitle">{dateRange}</div>
        </div>
        <StatusBadge variant={getCompletenessTone(completeness)}>
          {Math.round(completeness)}% complete
        </StatusBadge>
      </div>
      <div className="grid grid-cols-2">
        <MetricCard
          label="Avg Main Sleep"
          value={formatDuration(avgSleep)}
          footer={<span>{sleepValid} valid days</span>}
          compact
        />
        <MetricCard
          label="Total Naps"
          value={formatDuration(totalNap)}
          compact
        />
        <MetricCard
          label="Avg Resting HR"
          value={formatBPM(avgRHR)}
          units="bpm"
          footer={<span>{rhrValid} valid days</span>}
          compact
        />
        <MetricCard
          label="Avg Obs Mean HR"
          value={formatBPM(avgObsHR)}
          units="bpm"
          footer={<span>{obsHRValid} valid days</span>}
          compact
        />
        <MetricCard
          label="Avg Steps"
          value={formatSteps(avgSteps)}
          footer={<span>{stepsValid} valid days</span>}
          compact
        />
      </div>
    </div>
  );
}

function buildNarrative(cmp: {
  week1: { avg_main_sleep_valid_days: number; avg_steps_valid_days: number; avg_resting_hr_valid_days: number; completeness_percent: number };
  week2: { avg_main_sleep_valid_days: number; avg_steps_valid_days: number; avg_resting_hr_valid_days: number; completeness_percent: number };
  delta_main_sleep_pct: number | null;
  delta_steps_pct: number | null;
  delta_resting_hr_pct: number | null;
}): ReactNode[] {
  const parts: ReactNode[] = [];

  const pct = (v: number | null, higherIsBetter: boolean) => {
    if (v === null || v === undefined || Number.isNaN(v)) return 'no measurable change';
    const sign = v > 0 ? 'increase' : 'decrease';
    const good = (higherIsBetter && v > 0) || (!higherIsBetter && v < 0);
    return `${good ? 'favorable ' : ''}${Math.abs(Math.round(v))}% ${sign}`;
  };

  parts.push(
    <p key="a">
      <strong>Week 1 vs Week 2 comparison.</strong> This summary contrasts aggregated, valid-day averages across the two study weeks.
      If the baseline (Week 1) value for a metric is zero or missing, the percentage change is intentionally shown as “—” to avoid misleading Infinity or 0% figures.
    </p>
  );

  parts.push(
    <p key="b">
      Main sleep: {pct(cmp.delta_main_sleep_pct, true)}.
      Steps: {pct(cmp.delta_steps_pct, true)}.
      Resting HR: {pct(cmp.delta_resting_hr_pct, false)} (lower is generally more favorable).
    </p>
  );

  const completenessMsg =
    cmp.week2.completeness_percent >= cmp.week1.completeness_percent
      ? `Week 2 data coverage (${Math.round(cmp.week2.completeness_percent)}%) is comparable to or better than Week 1 (${Math.round(cmp.week1.completeness_percent)}%).`
      : `Week 2 data coverage (${Math.round(cmp.week2.completeness_percent)}%) is lower than Week 1 (${Math.round(cmp.week1.completeness_percent)}%); treat differences with caution.`;

  parts.push(<p key="c">{completenessMsg}</p>);
  parts.push(
    <p key="d">
      <em>No medical diagnosis or custom sleep-quality score is provided.</em> Interpret metrics as raw recorded values only.
    </p>
  );

  return parts;
}

export default function ComparisonPage() {
  const cmpQ = useComparison();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Week Comparison</h1>
          <p className="page-subtitle">
            Side-by-side Week 1 vs Week 2 · Changes expressed as absolute and percentage deltas
          </p>
        </div>
      </div>

      {cmpQ.isLoading && !cmpQ.data && <LoadingState title="Loading week comparison…" />}
      {cmpQ.isError && !cmpQ.data && (
        <ErrorState
          title="Failed to load week comparison"
          errorMessage={cmpQ.error instanceof Error ? cmpQ.error.message : undefined}
          retry={() => cmpQ.refetch()}
        />
      )}

      {cmpQ.data && (
        <>
          <section className="grid grid-cols-2-compare mb-4">
            <ComparisonWeekCard
              weekLabel="Week 1 (Days 1–7)"
              dateRange={cmpQ.data.week1.dates.join(' · ')}
              avgSleep={cmpQ.data.week1.avg_main_sleep_seconds}
              sleepValid={cmpQ.data.week1.avg_main_sleep_valid_days}
              totalNap={cmpQ.data.week1.total_nap_seconds}
              avgRHR={cmpQ.data.week1.avg_resting_hr_bpm}
              rhrValid={cmpQ.data.week1.avg_resting_hr_valid_days}
              avgObsHR={cmpQ.data.week1.avg_observed_mean_hr_bpm}
              obsHRValid={cmpQ.data.week1.avg_observed_mean_hr_valid_days}
              avgSteps={cmpQ.data.week1.avg_steps_count}
              stepsValid={cmpQ.data.week1.avg_steps_valid_days}
              completeness={cmpQ.data.week1.completeness_percent}
            />
            <ComparisonWeekCard
              weekLabel="Week 2 (Days 8–14)"
              dateRange={cmpQ.data.week2.dates.join(' · ')}
              avgSleep={cmpQ.data.week2.avg_main_sleep_seconds}
              sleepValid={cmpQ.data.week2.avg_main_sleep_valid_days}
              totalNap={cmpQ.data.week2.total_nap_seconds}
              avgRHR={cmpQ.data.week2.avg_resting_hr_bpm}
              rhrValid={cmpQ.data.week2.avg_resting_hr_valid_days}
              avgObsHR={cmpQ.data.week2.avg_observed_mean_hr_bpm}
              obsHRValid={cmpQ.data.week2.avg_observed_mean_hr_valid_days}
              avgSteps={cmpQ.data.week2.avg_steps_count}
              stepsValid={cmpQ.data.week2.avg_steps_valid_days}
              completeness={cmpQ.data.week2.completeness_percent}
            />
          </section>

          <section className="card mb-4">
            <div className="card-header">
              <div>
                <div className="card-title">Metric differences · W1 → W2</div>
                <div className="card-subtitle">
                  Absolute change and % change. Baseline=0 or missing → “—”
                </div>
              </div>
            </div>
            <div style={{ padding: '0 4px' }}>
              <div className="grid grid-cols-1" style={{ gridTemplateColumns: '1fr 110px 1fr' }}>
                <div className="text-xs text-muted text-right pb-2 border-b border-[var(--border)]">Week 1</div>
                <div className="text-xs text-muted text-center pb-2 border-b border-[var(--border)]">Change</div>
                <div className="text-xs text-muted pb-2 border-b border-[var(--border)]">Week 2</div>
              </div>
              <CompareMetric
                label="Average Main Sleep"
                w1Value={cmpQ.data.week1.avg_main_sleep_seconds}
                w2Value={cmpQ.data.week2.avg_main_sleep_seconds}
                w1Valid={cmpQ.data.week1.avg_main_sleep_valid_days}
                w2Valid={cmpQ.data.week2.avg_main_sleep_valid_days}
                formatter={formatDuration}
                baseline={cmpQ.data.week1.avg_main_sleep_seconds}
                current={cmpQ.data.week2.avg_main_sleep_seconds}
                description={cmpQ.data.delta_main_sleep_pct === null || cmpQ.data.delta_main_sleep_pct === undefined ? 'Baseline missing → no percentage shown.' : undefined}
              />
              <CompareMetric
                label="Total Nap Duration"
                w1Value={cmpQ.data.week1.total_nap_seconds}
                w2Value={cmpQ.data.week2.total_nap_seconds}
                w1Valid={cmpQ.data.week1.avg_main_sleep_valid_days}
                w2Valid={cmpQ.data.week2.avg_main_sleep_valid_days}
                formatter={formatDuration}
                baseline={cmpQ.data.week1.total_nap_seconds}
                current={cmpQ.data.week2.total_nap_seconds}
              />
              <CompareMetric
                label="Average Resting HR"
                w1Value={cmpQ.data.week1.avg_resting_hr_bpm}
                w2Value={cmpQ.data.week2.avg_resting_hr_bpm}
                w1Valid={cmpQ.data.week1.avg_resting_hr_valid_days}
                w2Valid={cmpQ.data.week2.avg_resting_hr_valid_days}
                formatter={formatBPM}
                baseline={cmpQ.data.week1.avg_resting_hr_bpm}
                current={cmpQ.data.week2.avg_resting_hr_bpm}
                units="bpm"
              />
              <CompareMetric
                label="Average Observed Mean HR"
                w1Value={cmpQ.data.week1.avg_observed_mean_hr_bpm}
                w2Value={cmpQ.data.week2.avg_observed_mean_hr_bpm}
                w1Valid={cmpQ.data.week1.avg_observed_mean_hr_valid_days}
                w2Valid={cmpQ.data.week2.avg_observed_mean_hr_valid_days}
                formatter={formatBPM}
                baseline={cmpQ.data.week1.avg_observed_mean_hr_bpm}
                current={cmpQ.data.week2.avg_observed_mean_hr_bpm}
                units="bpm"
              />
              <CompareMetric
                label="Average Steps"
                w1Value={cmpQ.data.week1.avg_steps_count}
                w2Value={cmpQ.data.week2.avg_steps_count}
                w1Valid={cmpQ.data.week1.avg_steps_valid_days}
                w2Valid={cmpQ.data.week2.avg_steps_valid_days}
                formatter={formatSteps}
                baseline={cmpQ.data.week1.avg_steps_count}
                current={cmpQ.data.week2.avg_steps_count}
              />
            </div>
          </section>

          <section className="card mb-4">
            <div className="card-header">
              <div className="card-title">Differences summary table</div>
            </div>
            <DataTable
              aria-label="Week-over-week differences table"
              columns={[
                { key: 'metric', header: 'Metric' },
                { key: 'w1', header: 'Week 1', align: 'right' },
                { key: 'w2', header: 'Week 2', align: 'right' },
                { key: 'abs', header: 'Abs. change', align: 'right' },
                { key: 'pct', header: '% change', align: 'right' },
                { key: 'valid', header: 'Valid days' },
              ]}
              data={[
                {
                  metric: 'Avg Main Sleep',
                  w1: formatDuration(cmpQ.data.week1.avg_main_sleep_seconds),
                  w2: formatDuration(cmpQ.data.week2.avg_main_sleep_seconds),
                  abs: formatAbsoluteChange(cmpQ.data.week2.avg_main_sleep_seconds, cmpQ.data.week1.avg_main_sleep_seconds, formatDuration),
                  pct: formatPercentageChange(cmpQ.data.week2.avg_main_sleep_seconds, cmpQ.data.week1.avg_main_sleep_seconds),
                  valid: `${cmpQ.data.week1.avg_main_sleep_valid_days} / ${cmpQ.data.week2.avg_main_sleep_valid_days}`,
                },
                {
                  metric: 'Total Naps',
                  w1: formatDuration(cmpQ.data.week1.total_nap_seconds),
                  w2: formatDuration(cmpQ.data.week2.total_nap_seconds),
                  abs: formatAbsoluteChange(cmpQ.data.week2.total_nap_seconds, cmpQ.data.week1.total_nap_seconds, formatDuration),
                  pct: formatPercentageChange(cmpQ.data.week2.total_nap_seconds, cmpQ.data.week1.total_nap_seconds),
                  valid: 'N/A',
                },
                {
                  metric: 'Avg Resting HR (bpm)',
                  w1: formatBPM(cmpQ.data.week1.avg_resting_hr_bpm),
                  w2: formatBPM(cmpQ.data.week2.avg_resting_hr_bpm),
                  abs: formatAbsoluteChange(cmpQ.data.week2.avg_resting_hr_bpm, cmpQ.data.week1.avg_resting_hr_bpm, formatBPM),
                  pct: formatPercentageChange(cmpQ.data.week2.avg_resting_hr_bpm, cmpQ.data.week1.avg_resting_hr_bpm),
                  valid: `${cmpQ.data.week1.avg_resting_hr_valid_days} / ${cmpQ.data.week2.avg_resting_hr_valid_days}`,
                },
                {
                  metric: 'Avg Obs Mean HR (bpm)',
                  w1: formatBPM(cmpQ.data.week1.avg_observed_mean_hr_bpm),
                  w2: formatBPM(cmpQ.data.week2.avg_observed_mean_hr_bpm),
                  abs: formatAbsoluteChange(cmpQ.data.week2.avg_observed_mean_hr_bpm, cmpQ.data.week1.avg_observed_mean_hr_bpm, formatBPM),
                  pct: formatPercentageChange(cmpQ.data.week2.avg_observed_mean_hr_bpm, cmpQ.data.week1.avg_observed_mean_hr_bpm),
                  valid: `${cmpQ.data.week1.avg_observed_mean_hr_valid_days} / ${cmpQ.data.week2.avg_observed_mean_hr_valid_days}`,
                },
                {
                  metric: 'Avg Steps',
                  w1: formatSteps(cmpQ.data.week1.avg_steps_count),
                  w2: formatSteps(cmpQ.data.week2.avg_steps_count),
                  abs: formatAbsoluteChange(cmpQ.data.week2.avg_steps_count, cmpQ.data.week1.avg_steps_count, formatSteps),
                  pct: formatPercentageChange(cmpQ.data.week2.avg_steps_count, cmpQ.data.week1.avg_steps_count),
                  valid: `${cmpQ.data.week1.avg_steps_valid_days} / ${cmpQ.data.week2.avg_steps_valid_days}`,
                },
              ]}
              getRowKey={(r) => r.metric}
            />
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">Narrative explanation</div>
            </div>
            <div className="narrative">{buildNarrative(cmpQ.data)}</div>
          </section>
        </>
      )}
    </div>
  );
}
