import type { SleepSegment, SleepStageType } from '../../types';
import { formatDuration, formatLocalTime } from '../../utils/format';

export interface SleepStageTimelineProps {
  segments: SleepSegment[];
  startISO: string;
  endISO: string;
  height?: number;
}

const STAGE_COLORS: Record<SleepStageType, string> = {
  awake: '#fca5a5',
  light: '#93c5fd',
  deep: '#6366f1',
  rem: '#a78bfa',
  unknown: '#cbd5e1',
};

const STAGE_LABELS: Record<SleepStageType, string> = {
  awake: 'Awake',
  light: 'Light',
  deep: 'Deep',
  rem: 'REM',
  unknown: 'Unknown',
};

export default function SleepStageTimeline({
  segments,
  startISO,
  endISO,
  height = 80,
}: SleepStageTimelineProps) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const total = Math.max(1, end - start);

  const axisTicks = 6;
  const tickTimes: string[] = [];
  for (let i = 0; i <= axisTicks; i++) {
    const t = new Date(start + (total * i) / axisTicks);
    tickTimes.push(formatLocalTime(t.toISOString()));
  }

  const totalDurationSec = Math.max(0, Math.round((end - start) / 1000));

  return (
    <div className="timeline-wrap" aria-label="Sleep stage timeline" role="img">
      <div className="mb-2 text-sm text-muted">
        Total in-bed window: {formatDuration(totalDurationSec)} · {segments.length} segments
      </div>
      <div className="timeline-axis" style={{ height: `${height}px` }}>
        {segments.length === 0 && (
          <div
            className="timeline-block"
            style={{ width: '100%', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)' }}
          >
            No stage segments available
          </div>
        )}
        {segments.map((seg, i) => {
          const segStart = new Date(seg.start_time).getTime();
          const segEnd = new Date(seg.end_time).getTime();
          const left = Math.max(0, ((segStart - start) / total) * 100);
          const width = Math.max(0.2, ((segEnd - segStart) / total) * 100);
          return (
            <div
              key={i}
              className={`timeline-block stage-${seg.stage}`}
              style={{
                width: `${width}%`,
                background: STAGE_COLORS[seg.stage],
                marginLeft: i === 0 ? `${left}%` : undefined,
              }}
              title={`${STAGE_LABELS[seg.stage]} · ${formatDuration(seg.duration_seconds)} · ${formatLocalTime(seg.local_start_time || seg.start_time)} – ${formatLocalTime(seg.local_end_time || seg.end_time)}`}
              role="img"
              aria-label={`${STAGE_LABELS[seg.stage]} for ${formatDuration(seg.duration_seconds)}`}
            />
          );
        })}
      </div>
      <div className="timeline-labels">
        {tickTimes.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="legend">
        {(Object.keys(STAGE_LABELS) as SleepStageType[]).map((k) => (
          <span className="legend-item" key={k}>
            <span className="legend-swatch" style={{ background: STAGE_COLORS[k] }} /> {STAGE_LABELS[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
