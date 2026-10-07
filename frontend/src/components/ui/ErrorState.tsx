import type { ReactNode } from 'react';

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  retry?: () => void;
  errorMessage?: string | null;
}

export default function ErrorState({
  title = 'Failed to load data',
  description = 'Something went wrong while fetching data. You can try again.',
  retry,
  errorMessage,
}: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <div className="state-title">{title}</div>
      <div className="state-desc" style={{ color: 'inherit' }}>
        {description}
      </div>
      {errorMessage && (
        <div className="text-xs mt-1" style={{ color: 'inherit', fontFamily: 'monospace' }}>
          {errorMessage}
        </div>
      )}
      {retry && (
        <div className="mt-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={retry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
