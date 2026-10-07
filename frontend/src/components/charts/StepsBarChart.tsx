import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import { formatSteps } from '../../utils/format';
import { getDayOfWeekLabel } from '../../utils/time';

export interface StepsBarPoint {
  date: string;
  dayNumber?: number;
  steps: number | null;
}

export interface StepsBarChartProps {
  data: StepsBarPoint[];
  height?: number;
  title?: string;
  showLabels?: boolean;
}

export default function StepsBarChart({
  data,
  height = 260,
  title = 'Steps per day',
  showLabels = true,
}: StepsBarChartProps) {
  const chartData = data.map((d) => {
    const dow = getDayOfWeekLabel(d.date);
    const label = d.dayNumber ? `D${d.dayNumber}\n${dow}` : `${dow}\n${d.date.slice(5)}`;
    return {
      date: d.date,
      label,
      steps: d.steps,
      hasData: d.steps !== null && d.steps !== undefined && !Number.isNaN(d.steps),
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
              allowDecimals={false}
              label={{
                value: 'steps',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
            />
            <Tooltip
              labelFormatter={(l, p) => {
                const point = (p?.[0]?.payload as { date: string } | undefined);
                return point?.date ?? String(l);
              }}
              formatter={(v: unknown) => {
                if (v === null || v === undefined || Number.isNaN(v as number)) return ['No data', 'Steps'];
                return [formatSteps(v as number), 'Steps'];
              }}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="steps" isAnimationActive={false} radius={[4, 4, 0, 0]} maxBarSize={36}>
              {showLabels && (
                <LabelList
                  dataKey="steps"
                  position="top"
                  fill="var(--text-muted)"
                  fontSize={10}
                  formatter={(v: unknown) =>
                    v === null || v === undefined || Number.isNaN(v as number) ? 'No data' : formatSteps(v as number)
                  }
                />
              )}
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.hasData ? '#10b981' : '#cbd5e1'} fillOpacity={d.hasData ? 1 : 0.5} strokeDasharray={d.hasData ? '' : '3 3'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
