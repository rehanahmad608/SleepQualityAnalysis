import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSleep, useStudy } from '../api/hooks';
import { formatDuration, formatLocalTime, formatStudyDateLabel } from '../utils/format';
import { getCurrentStudyDayOrDefault } from '../utils/time';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import DatePicker from '../components/ui/DatePicker';
import SleepStageTimeline from '../components/charts/SleepStageTimeline';
import { DataTable, useChartTableToggle, ChartOrTableToggle } from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import type { SleepStageType } from '../types';

const STAGE_ORDER: SleepStageType[] = ['rem', 'deep', 'light', 'awake', 'unknown'];

const STAGE_LABELS: Record<SleepStageType, string> = {
  awake: 'Awake',
  light: 'Light',
  deep: 'Deep',
  rem: 'REM',
  unknown: 'Unknown',
};

export default function SleepPage() {
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

  const sleepQ = useSleep(date);

  const dayNum = study && date
    ? Math.round((new Date(date).getTime() - new Date(study.start_date).getTime()) / 86400000) + 1
    : null;

  const mainSession = sleepQ.data?.sessions.find((s) => s.is_main) ?? null;
  const naps = sleepQ.data?.sessions.filter((s) => !s.is_main) ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sleep Details</h1>
          <p className="page-subtitle">
            {date ? formatStudyDateLabel(date, dayNum) : 'Select a study date'} · Stage-level data and session breakdown
          </p>
        </div>
        <div className="page-actions" style={{ minWidth: 240 }}>
          <DatePicker value={date} onChange={setDate} label="Study date" />
        </div>
      </div>

      {sleepQ.isLoading && !sleepQ.data && <LoadingState title={`Loading sleep data for ${date}…`} />}
      {sleepQ.isError && !sleepQ.data && (
        <ErrorState
          title={`Failed to load sleep data for ${date}`}
          errorMessage={sleepQ.error instanceof Error ? sleepQ.error.message : undefined}
          retry={() => sleepQ.refetch()}
        />
      )}
      {sleepQ.data && sleepQ.data.sessions.length === 0 && (
        <EmptyState
          title="No sleep sessions for this date"
          description="No stage-level sleep data exists for this date. Try a different date, or import/sync data."
        />
      )}

      {sleepQ.data && sleepQ.data.sessions.length > 0 && mainSession && (
        <section className="card mb-4">
          <div className="card-header mb-3">
            <div>
              <div className="card-title flex items-center gap-2">
                <StatusBadge variant="neutral">Main sleep</StatusBadge>
                Session details
              </div>
              <div className="card-subtitle">
                {formatLocalTime(mainSession.local_start_time || mainSession.start_time)} → {formatLocalTime(mainSession.local_end_time || mainSession.end_time)}
                {mainSession.source ? ` · Source: ${mainSession.source}` : ''}
              </div>
            </div>
            {mainSession.efficiency !== null && mainSession.efficiency !== undefined && !Number.isNaN(mainSession.efficiency) && (
              <StatusBadge variant="neutral" icon={false}>Efficiency {Math.round(mainSession.efficiency * 100)}%</StatusBadge>
            )}
          </div>
          <div className="grid grid-cols-3 mb-4">
            <div className="metric-card">
              <div className="metric-label">In-bed</div>
              <div className="metric-value">{formatDuration(mainSession.in_bed_seconds)}</div>
              <div className="metric-meta mt-1">
                {formatLocalTime(mainSession.local_start_time || mainSession.start_time)} → {formatLocalTime(mainSession.local_end_time || mainSession.end_time)}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Asleep</div>
              <div className="metric-value">{formatDuration(mainSession.asleep_seconds)}</div>
              <div className="metric-meta mt-1">
                {mainSession.in_bed_seconds !== null && mainSession.asleep_seconds !== null && mainSession.in_bed_seconds > 0
                  ? `${Math.round((mainSession.asleep_seconds / mainSession.in_bed_seconds) * 100)}% of in-bed time`
                  : '—'}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Efficiency</div>
              <div className="metric-value">
                {mainSession.efficiency !== null && mainSession.efficiency !== undefined && !Number.isNaN(mainSession.efficiency)
                  ? `${Math.round(mainSession.efficiency * 100)}%`
                  : '—'}
              </div>
              <div className="metric-meta mt-1">Asleep ÷ In-bed</div>
            </div>
          </div>

          {mainSession.stage_totals_seconds && (
            <div className="mb-4">
              <h4 className="mb-2 text-sm font-semibold">Stages breakdown</h4>
              <div className="stages-bar" role="img" aria-label="Sleep stages bar">
                {STAGE_ORDER.map((stage) => {
                  const dur = mainSession.stage_totals_seconds?.[stage] ?? 0;
                  if (dur <= 0) return null;
                  const pct = (dur / Math.max(1, mainSession.asleep_seconds ?? 0)) * 100;
                  return (
                    <div
                      key={stage}
                      className={`stages-bar-segment stage-${stage}`}
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                      title={`${STAGE_LABELS[stage]}: ${formatDuration(dur)} (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-5 mt-2 gap-2">
                {STAGE_ORDER.map((stage) => {
                  const dur = mainSession.stage_totals_seconds?.[stage] ?? 0;
                  const pct = mainSession.asleep_seconds !== null && mainSession.asleep_seconds > 0 ? Math.round((dur / mainSession.asleep_seconds) * 100) : null;
                  return (
                    <div key={stage} className="text-xs text-center">
                      <div style={{ fontWeight: 600 }}>{STAGE_LABELS[stage]}</div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        {dur > 0 ? formatDuration(dur) : '—'}
                      </div>
                      <div style={{ color: 'var(--text-subtle)' }}>{dur > 0 && pct !== null ? `${pct}%` : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-3">
            <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
              <h4 className="text-sm font-semibold">Stage timeline</h4>
              <ChartOrTableToggle view={view} onChange={setView} />
            </div>
            {view === 'chart' ? (
              mainSession.stages && mainSession.stages.length > 0 ? (
                <SleepStageTimeline
                  segments={mainSession.stages}
                  startISO={mainSession.start_time}
                  endISO={mainSession.end_time}
                  height={90}
                />
              ) : (
                <EmptyState title="No stage segments" description="Main sleep session exists but no stage-level segments were recorded." />
              )
            ) : (
              <DataTable
                aria-label="Sleep stages table"
                columns={[
                  { key: 'stage', header: 'Stage' },
                  { key: 'start', header: 'Start' },
                  { key: 'end', header: 'End' },
                  { key: 'dur', header: 'Duration', align: 'right' },
                ]}
                data={(mainSession.stages ?? []).map((seg, i) => ({
                  stage: STAGE_LABELS[seg.stage],
                  start: formatLocalTime(seg.local_start_time || seg.start_time),
                  end: formatLocalTime(seg.local_end_time || seg.end_time),
                  dur: formatDuration(seg.duration_seconds),
                }))}
                getRowKey={(_, i) => i}
              />
            )}
          </div>
        </section>
      )}

      {sleepQ.data && naps.length > 0 && (
        <section className="card mb-4">
          <div className="card-header">
            <div>
              <div className="card-title">Naps ({naps.length})</div>
              <div className="card-subtitle">Additional sleep sessions outside the main sleep period</div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {naps.map((nap) => (
              <div key={nap.session_id} className="card" style={{ padding: 14 }}>
                <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                  <div>
                    <StatusBadge variant="info">Nap</StatusBadge>
                    <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                      {formatLocalTime(nap.local_start_time || nap.start_time)} → {formatLocalTime(nap.local_end_time || nap.end_time)}
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm flex-wrap">
                    <div>
                      <div className="text-xs text-muted">Asleep</div>
                      <div className="font-semibold">{formatDuration(nap.asleep_seconds)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">In-bed</div>
                      <div className="font-semibold">{formatDuration(nap.in_bed_seconds)}</div>
                    </div>
                    {nap.efficiency !== null && nap.efficiency !== undefined && !Number.isNaN(nap.efficiency) && (
                      <div>
                        <div className="text-xs text-muted">Efficiency</div>
                        <div className="font-semibold">{Math.round(nap.efficiency * 100)}%</div>
                      </div>
                    )}
                  </div>
                </div>
                {nap.stages && nap.stages.length > 0 && (
                  <div className="mt-2">
                    <SleepStageTimeline
                      segments={nap.stages}
                      startISO={nap.start_time}
                      endISO={nap.end_time}
                      height={64}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {sleepQ.data && sleepQ.data.sessions.length > 0 && (
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">All stages — combined ({sleepQ.data.sessions.reduce((a, s) => a + (s.stages?.length ?? 0), 0)} segments)</div>
              <div className="card-subtitle">Across main sleep and all naps</div>
            </div>
          </div>
          <DataTable
            aria-label="All sleep stages table"
            columns={[
              { key: 'session', header: 'Session' },
              { key: 'stage', header: 'Stage' },
              { key: 'start', header: 'Start' },
              { key: 'end', header: 'End' },
              { key: 'dur', header: 'Duration', align: 'right' },
            ]}
            data={sleepQ.data.sessions.flatMap((ses) =>
              (ses.stages ?? []).map((seg) => ({
                session: ses.is_main ? 'Main sleep' : 'Nap',
                stage: STAGE_LABELS[seg.stage],
                start: formatLocalTime(seg.local_start_time || seg.start_time),
                end: formatLocalTime(seg.local_end_time || seg.end_time),
                dur: formatDuration(seg.duration_seconds),
              }))
            )}
            getRowKey={(_, i) => i}
          />
        </section>
      )}
    </div>
  );
}
