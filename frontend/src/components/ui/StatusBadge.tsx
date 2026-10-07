export type StatusVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted'
  | 'demo'
  | 'import'
  | 'google'
  | 'stale'
  | 'provisional'
  | 'info';

export interface StatusBadgeProps {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export default function StatusBadge({ variant, children, className = '', title }: StatusBadgeProps) {
  return (
    <span className={`badge badge-${variant} ${className}`.trim()} role="status" title={title}>
      {children}
    </span>
  );
}
