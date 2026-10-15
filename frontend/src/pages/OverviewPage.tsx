import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStudy, useExportCSV, useAllDailySummaries } from '../api/hooks';
import { isEmptyDay } from '../api/adapters';
import { formatBPM, formatDuration, formatSteps, formatStudyDateLabel } from '../utils/format';
import { getDayOfWeekLabel, getStudyDates } from '../utils/time';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import ProvisionalBadge from '../components/ui/ProvisionalBadge';
import StatusBadge from '../components/ui/StatusBadge';
import MissingDaysBadge from '../components/ui/MissingDaysBadge';
import StepsBarChart from '../components/charts/StepsBarChart';
import SleepDurationChart from '../components/charts/SleepDurationChart';
import RestingHRTrend from '../components/charts/RestingHRTrend';
import { DataTable, useChartTableToggle, ChartOrTableToggle } from '../components/ui/DataTable';

export default function OverviewPage() {
  const studyQuery = useStudy();
  const study = studyQuery.data;
  const allDates = study ? getStudyDates(study.start_date, study.days_total) : [];
  const summariesQuery = useAllDailySummaries(study, allDates);
  const summaries = summariesQuery.data ?? [];
  const exportCSV = useExportCSV();

  const [stepsView, setStepsView] = useChartTableToggle();
  const [sleepView, setSleepView] = useChartTableToggle();
  const [hrView, setHrView] = useChartTableToggle();

  const hasAny = summaries.some(
    (s) => s && (s.main_sleep_seconds !== null || s.steps_count !== null || s.resting_hr_bpm !== null)
  );
  // A "missing" day is one the backend answered for and confirmed has no
  // recorded observations. A failed request is an error state, never a missing day.
  const missingDays = summaries.filter(isEmptyDay).length;
  const anyMissing = missingDays > 0;

  let content: JSX.Element | null = null;

  if (studyQuery.isLoading || summariesQuery.isLoading) {
    content = <LoadingState title="Loading 14-day overview…" />;
  } else if (studyQuery.isError) {
    content = (
      <ErrorState
        title="Could not load study"
        errorMessage={studyQuery.error instanceof Error ? studyQuery.error.message : undefined}
        retry={() => studyQuery.refetch()}
      />
    );
  } else if (summariesQuery.isError) {
    content = (
      <ErrorState
        title="Could not load daily summaries"
        errorMessage={summariesQuery.error instanceof Error ? summariesQuery.error.message : undefined}
        retry={() => summariesQuery.refetch()}
      />
    );
  } else if (!hasAny && !anyMissing) {
    content = (
      <EmptyState
        title="No 14-day data available"
        description="No daily summaries could be loaded. If using import mode, upload a study JSON file. If using Google Health, run a sync."
      />
    );
  }

  if (content) {
    return (
      <div>
        <div className="page-header mb-4">
          <div>
            <h1>14-Day Overview</h1>
            <p className="page-subtitle">Full study period at a glance</p>
          </div>
        </div>
        {content}
      </div>
    );
  }

  const totalDays = summaries.length;
  const validSleepDays = summaries.filter((s) => s && s.main_sleep_seconds !== null && !Number.isNaN(s.main_sleep_seconds)).length;
  const validStepsDays = summaries.filter((s) => s && s.steps_count !== null && !Number.isNaN(s.steps_count)).length;
  const validHRDays = summaries.filter((s) => s && s.resting_hr_bpm !== null && !Number.isNaN(s.resting_hr_bpm)).length;

  const coveragePct =
    totalDays > 0 ? Math.round(((validSleepDays + validStepsDays + validHRDays) / (totalDays * 3)) * 100) : 0;

  const avgSleepSec = (() => {
    const vals = summaries.map((s) => s?.main_sleep_seconds).filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  })();
  const avgSteps = (() => {
    const vals = summaries.map((s) => s?.steps_count).filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  })();
  const avgRestingHR = (() => {
    const vals = summaries.map((s) => s?.resting_hr_bpm).filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  })();

  const stepPoints = summaries.map((s, i) => ({
    date: allDates[i] ?? '',
    dayNumber: i + 1,
    steps: s?.steps_count ?? null,
  }));
  const sleepPoints = summaries.map((s, i) => ({
    date: allDates[i] ?? '',
    dayNumber: i + 1,
    mainSleepSeconds: s?.main_sleep_seconds ?? null,
    napSeconds: s?.nap_seconds ?? null,
  }));
  const hrPoints = summaries.map((s, i) => ({
    date: allDates[i] ?? '',
    dayNumber: i + 1,
    restingHR: s?.resting_hr_bpm ?? null,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>14-Day Overview</h1>
          <p className="page-subtitle">
            {study ? `${study.start_date} → ${study.end_date}` : 'Full study period at a glance'}
          </p>
          <div className="flex gap-2 mt-2 flex-wrap text-sm">
            <StatusBadge variant="neutral" icon={false}>{validSleepDays}/{totalDays} sleep days</StatusBadge>
            <StatusBadge variant="neutral" icon={false}>{validStepsDays}/{totalDays} steps days</StatusBadge>
            <StatusBadge variant="neutral" icon={false}>{validHRDays}/{totalDays} RHR days</StatusBadge>
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => exportCSV()}
            aria-label="Export study data as CSV"
          >
            Export CSV
          </button>
        </div>
      </div>

      <section className="card mb-4">
        <div className="card-header">
          <div>
            <div className="card-title">Study Progress</div>
            <div className="card-subtitle">
              Average {avgSleepSec !== null ? `${formatDuration(avgSleepSec)} main sleep` : '—'} · {avgSteps !== null ? `${formatSteps(avgSteps)} steps/day` : '—'} · {avgRestingHR !== null ? `${formatBPM(avgRestingHR)} bpm resting HR` : '—'}
            </div>
          </div>
        </div>
        <div className="progress-bar mb-2" role="progressbar" aria-label="Study data coverage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={coveragePct}>
          <div
            className="progress-bar-fill"
            style={{ width: `${coveragePct}%` }}
          />
        </div>
      </section>

      <section className="card mb-4">
        <div className="card-header mb-3">
          <div>
            <div className="card-title">Daily Snapshots</div>
            <div className="card-subtitle">Click any day to open the detailed daily view</div>
          </div>
          <MissingDaysBadge missing={missingDays} total={totalDays} />
        </div>

        <div className="grid grid-cols-14">
          {summaries.map((s, i) => {
            const date = allDates[i] ?? '';
            const dayNum = i + 1;
            const dow = getDayOfWeekLabel(date);
            if (isEmptyDay(s)) {
              return (
                <Link key={date} to={`/daily?date=${encodeURIComponent(date)}`} className="date-card-link" aria-label={`Day ${dayNum} ${date} no data`}>
                  <div className="date-card" style={{ borderStyle: 'dashed' }}>
                    <div className="date-card-day">D{dayNum} · {dow}</div>
                    <div className="date-card-date" style={{ color: 'var(--text-subtle)' }}>{date.slice(5)}</div>
                    <div className="mt-2 date-card-empty">No data</div>
                  </div>
                </Link>
              );
            }
            return (
              <Link key={date} to={`/daily?date=${encodeURIComponent(date)}`} className="date-card-link" aria-label={`Day ${dayNum} ${formatStudyDateLabel(date, dayNum)}`}>
                <div className="date-card">
                  <div className="flex justify-between items-start">
                    <div className="date-card-day">D{dayNum} · {dow}</div>
                    {s.is_provisional && <ProvisionalBadge />}
                  </div>
                  <div className="date-card-date">{date.slice(5)}</div>
                  <div className="mt-1 flex flex-col gap-1">
                    <div className="date-card-metric" title="Main sleep">
                      {s.main_sleep_seconds !== null ? formatDuration(s.main_sleep_seconds) : <span className="date-card-empty">—</span>}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text)', fontWeight: 600 }} title="Steps">
                      {s.steps_count !== null ? formatSteps(s.steps_count) : '—'}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)', fontWeight: 600 }} title="Resting HR">
                      {s.resting_hr_bpm !== null ? `${formatBPM(s.resting_hr_bpm)} bpm` : '—'}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card mb-4">
        <div className="card-header">
          <div>
            <div className="card-title">Steps per day (14 days)</div>
            <div className="card-subtitle">{validStepsDays} of {totalDays} valid days</div>
          </div>
          <ChartOrTableToggle view={stepsView} onChange={setStepsView} />
        </div>
        {stepsView === 'chart' ? (
          <StepsBarChart data={stepPoints} height={280} />
        ) : (
          <DataTable
            aria-label="Steps per day data table"
            columns={[
              { key: 'day', header: 'Day' },
              { key: 'date', header: 'Date' },
              { key: 'steps', header: 'Steps', align: 'right' },
            ]}
            data={stepPoints.map((p, i) => ({ ...p, day: `Day ${i + 1}` }))}
            getRowKey={(r) => r.date}
          />
        )}
      </section>

      <section className="card mb-4">
        <div className="card-header">
          <div>
            <div className="card-title">Main sleep per night (14 days)</div>
            <div className="card-subtitle">{validSleepDays} of {totalDays} valid nights</div>
          </div>
          <ChartOrTableToggle view={sleepView} onChange={setSleepView} />
        </div>
        {sleepView === 'chart' ? (
          <SleepDurationChart data={sleepPoints} height={280} />
        ) : (
          <DataTable
            aria-label="Sleep duration data table"
            columns={[
              { key: 'day', header: 'Day' },
              { key: 'date', header: 'Date' },
              { key: 'mainSleep', header: 'Main Sleep', align: 'right' },
              { key: 'naps', header: 'Naps', align: 'right' },
            ]}
            data={sleepPoints.map((p, i) => ({
              day: `Day ${i + 1}`,
              date: p.date,
              mainSleep: p.mainSleepSeconds !== null ? formatDuration(p.mainSleepSeconds) : null,
              naps: p.napSeconds !== null ? formatDuration(p.napSeconds) : null,
            }))}
            getRowKey={(r) => r.date}
          />
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Resting HR trend (14 days)</div>
            <div className="card-subtitle">{validHRDays} of {totalDays} valid days</div>
          </div>
          <ChartOrTableToggle view={hrView} onChange={setHrView} />
        </div>
        {hrView === 'chart' ? (
          <RestingHRTrend data={hrPoints} height={280} />
        ) : (
          <DataTable
            aria-label="Resting HR data table"
            columns={[
              { key: 'day', header: 'Day' },
              { key: 'date', header: 'Date' },
              { key: 'rhr', header: 'Resting HR (bpm)', align: 'right' },
            ]}
            data={hrPoints.map((p, i) => ({
              day: `Day ${i + 1}`,
              date: p.date,
              rhr: p.restingHR !== null ? formatBPM(p.restingHR) : null,
            }))}
            getRowKey={(r) => r.date}
          />
        )}
      </section>
    </div>
  );
}
