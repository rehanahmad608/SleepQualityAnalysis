import type { ReactNode } from 'react';
import ProvisionalBadge from './ProvisionalBadge';
import UnitsLabel from './UnitsLabel';
import type { CoverageFlags } from '../../types';

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  units?: string;
  source?: string | null;
  sampleCount?: number | null;
  coverage?: CoverageFlags | null;
  isProvisional?: boolean;
  footer?: ReactNode;
  className?: string;
  valueClassName?: string;
  compact?: boolean;
}

export default function MetricCard({
  label,
  value,
  units,
  source,
  sampleCount,
  coverage,
  isProvisional = false,
  footer,
  className = '',
  valueClassName = '',
  compact = false,
}: MetricCardProps) {
  return (
    <div
      className={`metric-card ${compact ? 'compact' : ''} ${className}`.trim()}
      aria-label={label}
    >
      <div className="metric-card-header">
        <div>
          <div className="metric-label">{label}</div>
        </div>
        {isProvisional && <ProvisionalBadge />}
      </div>
      <div className="flex items-end gap-1 flex-wrap">
        <span className={`metric-value ${valueClassName}`}>{value}</span>
        {units && <UnitsLabel units={units} />}
      </div>
      {(source || sampleCount !== null || sampleCount !== undefined || coverage || footer) && (
        <div className="metric-meta-row metric-meta mt-1">
          {source && <span>Source: {source}</span>}
          {sampleCount !== null && sampleCount !== undefined && !Number.isNaN(sampleCount) && (
            <span>{sampleCount.toLocaleString()} samples</span>
          )}
          {coverage && (
            <span className="metric-coverage" aria-label="Data coverage">
              <CoverageIndicator label="HR" on={coverage.has_heart_rate} />
              <CoverageIndicator label="Steps" on={coverage.has_steps} />
              <CoverageIndicator label="Sleep" on={coverage.has_sleep} />
            </span>
          )}
          {footer}
        </div>
      )}
    </div>
  );
}

function CoverageIndicator({ label, on }: { label: string; on: boolean }) {
  return (
    <span title={`${label}: ${on ? 'Available' : 'Missing'}`}>
      <span className={`coverage-dot ${on ? 'ok' : 'missing'}`} aria-hidden="true" />{' '}
      <span className={on ? '' : 'text-muted'} style={{ textDecoration: on ? 'none' : 'line-through' }}>
        {label}
      </span>
    </span>
  );
}
