import StatusBadge from './StatusBadge';
import { getModeTone, type DataMode } from '../../utils/status';

const LABELS: Record<DataMode, string> = {
  demo: 'DEMO MODE',
  import: 'IMPORT MODE',
  google: 'GOOGLE MODE',
};

export interface DataModeBadgeProps {
  mode: DataMode;
  googleConfigured?: boolean | null;
  googleConnected?: boolean | null;
  label?: string;
  className?: string;
}

export default function DataModeBadge({
  mode,
  googleConfigured,
  googleConnected,
  label,
  className,
}: DataModeBadgeProps) {
  const tone = getModeTone(mode, {
    configured: !!googleConfigured,
    connected: !!googleConnected,
  });
  return (
    <StatusBadge variant={tone} className={className}>
      {label ?? LABELS[mode]}
    </StatusBadge>
  );
}
