import StatusBadge from './StatusBadge';
import { getMissingDaysStatus } from '../../utils/status';

export default function MissingDaysBadge({ missing, total }: { missing: number; total: number }) {
  const { tone, label } = getMissingDaysStatus(missing, total);
  return (
    <StatusBadge variant={tone} role="status">
      {label}
    </StatusBadge>
  );
}
