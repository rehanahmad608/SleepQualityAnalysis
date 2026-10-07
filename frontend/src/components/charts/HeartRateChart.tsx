import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HeartRateSample } from '../../types';
import { formatLocalTime } from '../../utils/format';

export interface HeartRateChartProps {
  data: HeartRateSample[];
  height?: number;
  title?: string;
}

interface ChartPoint {
  time: string;
  iso: string;
  bpm: number | null;
  gap: boolean;
}

function buildSeries(samples: HeartRateSample[]): ChartPoint[][] {
  const series: ChartPoint[][] = [];
  let current: ChartPoint[] = [];

  for (const s of samples) {
    const pt: ChartPoint = {
      time: formatLocalTime(s.local_time || s.timestamp),
      iso: s.local_time || s.timestamp,
      bpm: s.bpm,
      gap: false,
    };
    if (s.bpm === null || s.bpm === undefined || Number.isNaN(s.bpm)) {
      if (current.length > 0) {
        series.push(current);
        current = [];
      }
      continue;
    }
    current.push(pt);
  }
  if (current.length > 0) series.push(current);
  return series;
}

function buildAxisTicks(samples: HeartRateSample[]): string[] {
  if (samples.length === 0) return [];
  const n = Math.min(samples.length, 8);
  const step = Math.max(1, Math.floor(samples.length / n));
  const ticks: string[] = [];
  for (let i = 0; i < samples.length; i += step) {
    const s = samples[i];
    ticks.push(formatLocalTime(s.local_time || s.timestamp));
  }
  const last = samples[samples.length - 1];
  const lastTick = formatLocalTime(last.local_time || last.timestamp);
  if (ticks[ticks.length - 1] !== lastTick) ticks.push(lastTick);
  return ticks;
}

export default function HeartRateChart({
  data,
  height = 260,
  title = 'Heart rate (bpm)',
}: HeartRateChartProps) {
  const series = buildSeries(data);
  const flat = data.map((s) => ({
    time: formatLocalTime(s.local_time || s.timestamp),
    bpm: s.bpm,
  }));
  const ticks = buildAxisTicks(data);

  const colors = ['#4f46e5', '#6366f1', '#8b5cf6', '#a78bfa'];

  return (
    <div aria-label={title} role="img">
      <div className="chart-container" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={flat} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="time"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--border-strong)"
              ticks={ticks}
              interval={0}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--border-strong)"
              domain={['auto', 'auto']}
              label={{
                value: 'bpm',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <Tooltip
              labelFormatter={(l) => `Time: ${l}`}
              formatter={(v: unknown) => (v === null || v === undefined ? ['No data', 'HR'] : [`${v} bpm`, 'HR'])}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            {series.map((seg, idx) => (
              <Line
                key={idx}
                type="monotone"
                data={seg}
                dataKey="bpm"
                stroke={colors[idx % colors.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
            {series.length === 0 && (
              <Line
                type="monotone"
                dataKey="bpm"
                stroke="transparent"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
