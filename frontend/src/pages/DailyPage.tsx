import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDailySummary, useHeartRate, useSleep, useStudy } from '../api/hooks';
import { formatBPM, formatDuration, formatLocalTime, formatSteps, formatStudyDateLabel } from '../utils/format';
import { getCurrentStudyDayOrDefault } from '../utils/time';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import MetricCard from '../components/ui/MetricCard';
import DatePicker from '../components/ui/DatePicker';
import HeartRateChart from '../components/charts/HeartRateChart';
import SleepStageTimeline from '../components/charts/SleepStageTimeline';
import { DataTable, useChartTableToggle, ChartOrTableToggle } from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';

export default function DailyPage() {
  const studyQuery = useStudy();
  const study = studyQuery.data;
  const [sp, setSp] = useSearchParams();
  const [date, setDate] = useState<string>('');
  const [view, setView] = useChartTableToggle();

  useEffect(() => {
    if (study) {
      const fromURL = sp.get('date');
      const defaultDate = fromURL || getCurrentStudyDayOrDefault(study);
      if (!date) {
        setDate(defaultDate);
      } else if (fromURL && fromURL !== date) {
        setDate(fromURL);
      }
    }
  }, [study, sp, date]);

  useEffect(() => {
    if (date && sp.get('date') !== date) {
      setSp({ date }, { replace: true });
    }
  }, [date, sp, setSp]);

  const summaryQ = useDailySummary(date);
  const hrQ = useHeartRate(date);
  const sleepQ = useSleep(date);

  if (studyQuery.isLoading) {
    return <LoadingState title="Loading study info…" />;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Daily View</h1>
          <p className="page-subtitle">
            {date
              ? formatStudyDateLabel(date, study ? studyQuery.data && allDatesIndex(study.start_date, date) : null)
              : 'Select a study date to view'}
          </p>
        </div>
        <div className="page-actions" style={{ minWidth: 240 }}>
          <DatePicker value={date} onChange={setDate} label="Study date" />
        </div>
      </div>

      {summaryQ.isLoading && !summaryQ.data && <LoadingState title={`Loading summary for ${date}…`} compact />}
      {summaryQ.isError && !summaryQ.data && (
        <ErrorState
          title={`Failed to load summary for ${date}`}
          errorMessage={summaryQ.error instanceof Error ? summaryQ.error.message : undefined}
          retry={() => summaryQ.refetch()}
        />
      )}

      {summaryQ.data && (
        <section className="mb-4">
          <div className="grid grid-cols-4 mb-4">
            <MetricCard
              label="Main Sleep"
              value={summaryQ.data.main_sleep_seconds !== null ? formatDuration(summaryQ.data.main_sleep_seconds) : '—'}
              units={summaryQ.data.main_sleep_seconds !== null ? 'hours:minutes' : undefined}
              source={summaryQ.data.source}
              isProvisional={summaryQ.data.is_provisional}
              coverage={summaryQ.data.coverage}
              footer={
                summaryQ.data.main_sleep_start ? (
                  <span>{formatLocalTime(summaryQ.data.main_sleep_start)} → {formatLocalTime(summaryQ.data.main_sleep_end)}</span>
                ) : undefined
              }
            />
            <MetricCard
              label="Steps"
              value={summaryQ.data.steps_count !== null ? formatSteps(summaryQ.data.steps_count) : '—'}
              units="steps"
              source={summaryQ.data.source}
              sampleCount={summaryQ.data.steps_sample_count}
              isProvisional={summaryQ.data.is_provisional}
              coverage={summaryQ.data.coverage}
            />
            <MetricCard
              label="Resting HR"
              value={summaryQ.data.resting_hr_bpm !== null ? formatBPM(summaryQ.data.resting_hr_bpm) : '—'}
              units="bpm"
              source={summaryQ.data.source}
              isProvisional={summaryQ.data.is_provisional}
              coverage={summaryQ.data.coverage}
            />
            <MetricCard
              label="Observed Mean HR"
              value={summaryQ.data.observed_mean_hr_bpm !== null ? formatBPM(summaryQ.data.observed_mean_hr_bpm) : '—'}
              units="bpm"
              source={summaryQ.data.source}
              sampleCount={summaryQ.data.hr_sample_count}
              isProvisional={summaryQ.data.is_provisional}
              coverage={summaryQ.data.coverage}
            />
          </div>
        </section>
      )}

      <section className="card mb-4">
        <div className="card-header">
          <div>
            <div className="card-title">Heart rate throughout day</div>
            <div className="card-subtitle">
              {hrQ.data ? `${hrQ.data.length} samples` : ''}
              {summaryQ.data?.observed_mean_hr_bpm !== null && summaryQ.data?.observed_mean_hr_bpm !== undefined
                ? ` · Mean ${formatBPM(summaryQ.data.observed_mean_hr_bpm)} bpm (${summaryQ.data.hr_sample_count ?? 0} samples)`
                : ''}
            </div>
          </div>
          <ChartOrTableToggle view={view} onChange={setView} />
        </div>

        {hrQ.isLoading && !hrQ.data && <LoadingState title="Loading heart rate samples…" compact />}
        {hrQ.isError && !hrQ.data && (
          <ErrorState
            title="Failed to load heart rate"
            errorMessage={hrQ.error instanceof Error ? hrQ.error.message : undefined}
            retry={() => hrQ.refetch()}
          />
        )}
        {hrQ.data && hrQ.data.length === 0 && (
          <EmptyState
            title="No heart rate samples for this date"
            description="No HR readings were recorded or imported for this study date. Check the data source coverage above."
          />
        )}
        {hrQ.data && hrQ.data.length > 0 && (
          view === 'chart' ? (
            <HeartRateChart data={hrQ.data} height={300} />
          ) : (
            <DataTable
              aria-label="Heart rate samples table"
              columns={[
                { key: 'localTime', header: 'Local Time' },
                { key: 'bpm', header: 'BPM', align: 'right' },
              ]}
              data={hrQ.data.map((s, i) => ({
                localTime: formatLocalTime(s.local_time || s.timestamp),
                bpm: s.bpm !== null && s.bpm !== undefined && !Number.isNaN(s.bpm) ? formatBPM(s.bpm) : null,
              }))}
              getRowKey={(_, i) => i}
            />
          )
        )}
      </section>

      <section className="card mb-4">
        <div className="card-header">
          <div>
            <div className="card-title">Sleep sessions for {date}</div>
            <div className="card-subtitle">Main sleep plus any naps</div>
          </div>
          {summaryQ.data?.sleep_efficiency !== null && summaryQ.data?.sleep_efficiency !== undefined && (
            <StatusBadge variant="neutral" icon={false}>Efficiency {Math.round(summaryQ.data.sleep_efficiency * 100)}%</StatusBadge>
          )}
        </div>
        {sleepQ.isLoading && !sleepQ.data && <LoadingState title="Loading sleep sessions…" compact />}
        {sleepQ.isError && !sleepQ.data && (
          <ErrorState
            title="Failed to load sleep sessions"
            errorMessage={sleepQ.error instanceof Error ? sleepQ.error.message : undefined}
            retry={() => sleepQ.refetch()}
          />
        )}
        {sleepQ.data && sleepQ.data.sessions.length === 0 && (
          <EmptyState
            title="No sleep sessions recorded"
            description="No sleep data available for this date. Click the Sleep page to see stage-level detail if available."
          />
        )}
        {sleepQ.data && sleepQ.data.sessions.length > 0 && (
          <div className="flex flex-col gap-3">
            {sleepQ.data.sessions.map((ses) => (
              <div key={ses.session_id} className="card" style={{ padding: 14 }}>
                <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                  <div>
                    <StatusBadge variant={ses.is_main ? 'neutral' : 'info'}>
                      {ses.is_main ? 'Main sleep' : 'Nap'}
                    </StatusBadge>
                    <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                      {formatLocalTime(ses.local_start_time || ses.start_time)} → {formatLocalTime(ses.local_end_time || ses.end_time)}
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm flex-wrap">
                    <div>
                      <div className="text-xs text-muted">Asleep</div>
                      <div className="font-semibold">{formatDuration(ses.asleep_seconds)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">In-bed</div>
                      <div className="font-semibold">{formatDuration(ses.in_bed_seconds)}</div>
                    </div>
                    {ses.efficiency !== null && ses.efficiency !== undefined && !Number.isNaN(ses.efficiency) && (
                      <div>
                        <div className="text-xs text-muted">Efficiency</div>
                        <div className="font-semibold">{Math.round(ses.efficiency * 100)}%</div>
                      </div>
                    )}
                  </div>
                </div>
                {ses.stages && ses.stages.length > 0 && (
                  <div className="mt-2">
                    <SleepStageTimeline
                      segments={ses.stages}
                      startISO={ses.start_time}
                      endISO={ses.end_time}
                      height={72}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function allDatesIndex(start: string, date: string): number {
  const s = new Date(start);
  const d = new Date(date);
  const ms = d.getTime() - s.getTime();
  return Math.round(ms / 86400000) + 1;
}
