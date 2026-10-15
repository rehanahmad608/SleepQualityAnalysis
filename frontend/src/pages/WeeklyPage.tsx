import { useState } from 'react';
import { useWeeklySummary, useStudy } from '../api/hooks';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import WeekSelector from '../components/ui/WeekSelector';
import StatusBadge from '../components/ui/StatusBadge';
import { getCompletenessTone } from '../utils/status';
import MetricCard from '../components/ui/MetricCard';
import StepsBarChart from '../components/charts/StepsBarChart';
import SleepDurationChart from '../components/charts/SleepDurationChart';
import RestingHRTrend from '../components/charts/RestingHRTrend';
import { DataTable, useChartTableToggle, ChartOrTableToggle } from '../components/ui/DataTable';
import { formatBPM, formatDuration, formatPercentageChange, formatSteps, formatStudyDateLabel } from '../utils/format';
import { getDayNumber } from '../utils/time';

export default function WeeklyPage() {
  const studyQuery = useStudy();
  const [week, setWeek] = useState<1 | 2>(1);
  const wQ = useWeeklySummary(week);
  const [stepsView, setStepsView] = useChartTableToggle();
  const [sleepView, setSleepView] = useChartTableToggle();
  const [hrView, setHrView] = useChartTableToggle();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Weekly View</h1>
          <p className="page-subtitle">
            7-day aggregated metrics using valid-day averages · Week {week} {wQ.data ? `(${wQ.data.day_range_label})` : ''}
          </p>
        </div>
        <div className="page-actions">
          <WeekSelector value={week} onChange={setWeek} />
        </div>
      </div>

      {wQ.isLoading && !wQ.data && <LoadingState title={`Loading Week ${week} summary…`} />}
      {wQ.isError && !wQ.data && (
        <ErrorState
          title={`Failed to load Week ${week}`}
          errorMessage={wQ.error instanceof Error ? wQ.error.message : undefined}
          retry={() => wQ.refetch()}
        />
      )}

      {wQ.data && (
        <>
          <section className="mb-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="text-sm text-muted">{wQ.data.dates.join(' · ')}</div>
              <StatusBadge variant={getCompletenessTone(wQ.data.completeness_percent)}>
                {Math.round(wQ.data.completeness_percent)}% complete
              </StatusBadge>
            </div>
            <div className="grid grid-cols-4">
              <MetricCard
                label="Avg Main Sleep"
                value={formatDuration(wQ.data.avg_main_sleep_seconds)}
                units="per night"
                footer={<span>{wQ.data.avg_main_sleep_valid_days} of 7 valid days</span>}
              />
              <MetricCard
                label="Total Naps"
                value={formatDuration(wQ.data.total_nap_seconds)}
                footer={<span>Across {wQ.data.avg_main_sleep_valid_days} valid days</span>}
              />
              <MetricCard
                label="Avg Resting HR"
                value={formatBPM(wQ.data.avg_resting_hr_bpm)}
                units="bpm"
                footer={<span>{wQ.data.avg_resting_hr_valid_days} of 7 valid days</span>}
              />
              <MetricCard
                label="Avg Steps"
                value={formatSteps(wQ.data.avg_steps_count)}
                units="/day"
                footer={<span>{wQ.data.avg_steps_valid_days} of 7 valid days</span>}
              />
            </div>
          </section>

          <section className="card mb-4">
            <div className="card-header">
              <div>
                <div className="card-title">Steps per day · Week {week}</div>
                <div className="card-subtitle">
                  Average {formatSteps(wQ.data.avg_steps_count)} / valid day ({wQ.data.avg_steps_valid_days} of 7 days)
                </div>
              </div>
              <ChartOrTableToggle view={stepsView} onChange={setStepsView} />
            </div>
            {stepsView === 'chart' ? (
              <StepsBarChart
                data={wQ.data.daily_summaries.map((d) => ({
                  date: d.date,
                  dayNumber: d.day_number,
                  steps: d.steps_count,
                }))}
                height={280}
              />
            ) : (
              <DataTable
                aria-label="Steps per week table"
                columns={[
                  { key: 'day', header: 'Day' },
                  { key: 'date', header: 'Date' },
                  { key: 'steps', header: 'Steps', align: 'right' },
                  { key: 'hrSamples', header: 'HR Samples', align: 'right' },
                  { key: 'provisional', header: 'Status' },
                ]}
                data={wQ.data.daily_summaries.map((d) => ({
                  day: formatStudyDateLabel(d.date, d.day_number),
                  date: d.date,
                  steps: d.steps_count !== null ? formatSteps(d.steps_count) : null,
                  hrSamples: d.hr_sample_count !== null && d.hr_sample_count !== undefined ? d.hr_sample_count.toLocaleString() : null,
                  provisional: d.is_provisional ? <StatusBadge variant="provisional">PROVISIONAL</StatusBadge> : null,
                }))}
                getRowKey={(r) => r.date}
              />
            )}
          </section>

          <section className="card mb-4">
            <div className="card-header">
              <div>
                <div className="card-title">Sleep duration · Week {week}</div>
                <div className="card-subtitle">
                  Average {formatDuration(wQ.data.avg_main_sleep_seconds)} main sleep ({wQ.data.avg_main_sleep_valid_days} of 7 nights)
                </div>
              </div>
              <ChartOrTableToggle view={sleepView} onChange={setSleepView} />
            </div>
            {sleepView === 'chart' ? (
              <SleepDurationChart
                data={wQ.data.daily_summaries.map((d) => ({
                  date: d.date,
                  dayNumber: d.day_number,
                  mainSleepSeconds: d.main_sleep_seconds,
                  napSeconds: d.nap_seconds,
                }))}
                height={280}
              />
            ) : (
              <DataTable
                aria-label="Sleep duration table"
                columns={[
                  { key: 'day', header: 'Day' },
                  { key: 'mainSleep', header: 'Main Sleep', align: 'right' },
                  { key: 'naps', header: 'Naps', align: 'right' },
                  { key: 'efficiency', header: 'Efficiency', align: 'right' },
                  { key: 'provisional', header: 'Status' },
                ]}
                data={wQ.data.daily_summaries.map((d) => ({
                  day: formatStudyDateLabel(d.date, d.day_number),
                  mainSleep: d.main_sleep_seconds !== null ? formatDuration(d.main_sleep_seconds) : null,
                  naps: d.nap_seconds !== null ? formatDuration(d.nap_seconds) : null,
                  efficiency:
                    d.sleep_efficiency !== null && d.sleep_efficiency !== undefined && !Number.isNaN(d.sleep_efficiency)
                      ? `${Math.round(d.sleep_efficiency * 100)}%`
                      : null,
                  provisional: d.is_provisional ? <StatusBadge variant="provisional">PROVISIONAL</StatusBadge> : null,
                }))}
                getRowKey={(r) => r.day}
              />
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Resting HR trend · Week {week}</div>
                <div className="card-subtitle">
                  Average {formatBPM(wQ.data.avg_resting_hr_bpm)} bpm ({wQ.data.avg_resting_hr_valid_days} of 7 days)
                </div>
              </div>
              <ChartOrTableToggle view={hrView} onChange={setHrView} />
            </div>
            {hrView === 'chart' ? (
              <RestingHRTrend
                data={wQ.data.daily_summaries.map((d) => ({
                  date: d.date,
                  dayNumber: d.day_number,
                  restingHR: d.resting_hr_bpm,
                }))}
                height={280}
              />
            ) : (
              <DataTable
                aria-label="Resting HR table"
                columns={[
                  { key: 'day', header: 'Day' },
                  { key: 'rhr', header: 'Resting HR (bpm)', align: 'right' },
                  { key: 'obsMean', header: 'Obs Mean HR (bpm)', align: 'right' },
                  { key: 'provisional', header: 'Status' },
                ]}
                data={wQ.data.daily_summaries.map((d) => ({
                  day: formatStudyDateLabel(d.date, d.day_number),
                  rhr: d.resting_hr_bpm !== null ? formatBPM(d.resting_hr_bpm) : null,
                  obsMean: d.observed_mean_hr_bpm !== null ? formatBPM(d.observed_mean_hr_bpm) : null,
                  provisional: d.is_provisional ? <StatusBadge variant="provisional">PROVISIONAL</StatusBadge> : null,
                }))}
                getRowKey={(r) => r.day}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
