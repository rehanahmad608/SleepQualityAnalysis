import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({
  title = 'No data available',
  description = 'No records exist for this selection. Try another date, or import / sync data.',
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div
        className="state-title"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {title}
      </div>
      {description && <div className="state-desc">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
