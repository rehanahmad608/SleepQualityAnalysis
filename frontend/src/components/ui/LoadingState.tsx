export interface LoadingStateProps {
  title?: string;
  description?: string;
  compact?: boolean;
}

export default function LoadingState({
  title = 'Loading…',
  description = 'Fetching data from the backend, please wait.',
  compact = false,
}: LoadingStateProps) {
  return (
    <div
      className="loading-state"
      style={compact ? { padding: '20px' } : undefined}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-spinner" role="status" aria-label="Loading" />
      <div className="state-title">{title}</div>
      {!compact && <div className="state-desc">{description}</div>}
    </div>
  );
}
