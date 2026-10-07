import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import { formatDuration } from '../../utils/format';
import { getDayOfWeekLabel } from '../../utils/time';

export interface SleepDurationPoint {
  date: string;
  dayNumber?: number;
  mainSleepSeconds: number | null;
  napSeconds?: number | null;
}

export interface SleepDurationChartProps {
  data: SleepDurationPoint[];
  height?: number;
  title?: string;
  showLabels?: boolean;
}

export default function SleepDurationChart({
  data,
  height = 260,
  title = 'Sleep duration per night',
  showLabels = true,
}: SleepDurationChartProps) {
  const chartData = data.map((d) => {
    const dow = getDayOfWeekLabel(d.date);
    const label = d.dayNumber ? `D${d.dayNumber}\n${dow}` : `${dow}\n${d.date.slice(5)}`;
    const mainMin = d.mainSleepSeconds !== null && d.mainSleepSeconds !== undefined ? d.mainSleepSeconds / 60 : null;
    const napMin = d.napSeconds !== null && d.napSeconds !== undefined ? d.napSeconds / 60 : null;
    return {
      date: d.date,
      label,
      mainMin,
      napMin,
      hasMain: mainMin !== null && !Number.isNaN(mainMin),
      hasNap: napMin !== null && !Number.isNaN(napMin),
    };
  });

  return (
    <div aria-label={title} role="img">
      <div className="chart-container" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-muted)', fontSize: 11, style: { whiteSpace: 'pre-line' } }}
              stroke="var(--border-strong)"
              interval={0}
              height={40}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              stroke="var(--border-strong)"
              label={{
                value: 'minutes',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              labelFormatter={(l, p) => {
                const point = (p?.[0]?.payload as { date: string } | undefined);
                return point?.date ?? String(l);
              }}
              formatter={(v: unknown, name: string) => {
                const mins = v as number | null;
                const secs = mins === null || mins === undefined || Number.isNaN(mins) ? null : mins * 60;
                const label = name === 'mainMin' ? 'Main sleep' : 'Naps';
                return [secs === null ? 'No data' : formatDuration(secs), label];
              }}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }}
              formatter={(v) => (v === 'mainMin' ? 'Main sleep (minutes)' : 'Naps (minutes)')}
            />
            <Bar dataKey="mainMin" stackId="sleep" name="mainMin" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}>
              {showLabels && (
                <LabelList
                  dataKey="mainMin"
                  position="top"
                  fill="var(--text-muted)"
                  fontSize={10}
                  formatter={(v: unknown) => {
                    const mins = v as number | null;
                    if (mins === null || mins === undefined || Number.isNaN(mins)) return '';
                    return formatDuration(mins * 60);
                  }}
                />
              )}
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.hasMain ? '#6366f1' : '#e2e8f0'} fillOpacity={d.hasMain ? 1 : 0.4} />
              ))}
            </Bar>
            <Bar dataKey="napMin" stackId="sleep" name="napMin" radius={[0, 0, 0, 0]} maxBarSize={32} isAnimationActive={false}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.hasNap ? '#a78bfa' : 'transparent'} fillOpacity={d.hasNap ? 1 : 0} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
