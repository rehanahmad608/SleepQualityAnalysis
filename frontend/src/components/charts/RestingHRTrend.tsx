import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import { formatBPM } from '../../utils/format';
import { getDayOfWeekLabel } from '../../utils/time';

export interface RestingHRPoint {
  date: string;
  dayNumber?: number;
  restingHR: number | null;
}

export interface RestingHRTrendProps {
  data: RestingHRPoint[];
  height?: number;
  title?: string;
}

export default function RestingHRTrend({
  data,
  height = 260,
  title = 'Resting heart rate trend',
}: RestingHRTrendProps) {
  const chartData = data.map((d) => {
    const dow = getDayOfWeekLabel(d.date);
    const label = d.dayNumber ? `D${d.dayNumber}\n${dow}` : `${dow}\n${d.date.slice(5)}`;
    return {
      date: d.date,
      label,
      restingHR: d.restingHR,
      hasData: d.restingHR !== null && d.restingHR !== undefined && !Number.isNaN(d.restingHR),
    };
  });

  return (
    <div aria-label={title} role="img">
      <div className="chart-container" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
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
              labelFormatter={(l, p) => {
                const point = (p?.[0]?.payload as { date: string } | undefined);
                return point?.date ?? String(l);
              }}
              formatter={(v: unknown) =>
                v === null || v === undefined || Number.isNaN(v as number)
                  ? ['No data', 'Resting HR']
                  : [`${formatBPM(v as number)} bpm`, 'Resting HR']
              }
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="restingHR"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 3, fill: '#ef4444', stroke: '#fff', strokeWidth: 1 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              connectNulls={false}
            >
              <LabelList
                dataKey="restingHR"
                position="top"
                fill="var(--text-muted)"
                fontSize={10}
                formatter={(v: unknown) =>
                  v === null || v === undefined || Number.isNaN(v as number) ? '' : formatBPM(v as number)
                }
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
