import type { ReactNode } from 'react';

/** Semantic tones. Colour meaning is app-wide; see STATUS_TONE below. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Semantic tones plus legacy names kept for backwards compatibility.
 * Legacy names are mapped to a tone so every page renders consistently.
 */
export type StatusVariant =
  | StatusTone
  | 'muted'
  | 'demo'
  | 'import'
  | 'google'
  | 'stale'
  | 'provisional';

export const STATUS_TONE: Record<StatusVariant, StatusTone> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  neutral: 'neutral',
  muted: 'neutral',
  demo: 'warning',
  import: 'info',
  // Google mode alone never implies success; callers pass 'success' only
  // when the connection is actually confirmed healthy.
  google: 'info',
  stale: 'warning',
  provisional: 'info',
};

export interface StatusBadgeProps {
  variant: StatusVariant;
  children: ReactNode;
  className?: string;
  title?: string;
  /** Show the semantic icon (default true). Pass false for purely numeric chips. */
  icon?: boolean;
  /** Optional ARIA role, e.g. "status" for badges that update dynamically. */
  role?: 'status' | 'note' | 'alert';
}

function ToneIcon({ tone }: { tone: StatusTone }) {
  const common = {
    className: 'badge-icon',
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  switch (tone) {
    case 'success':
      return (
        <svg {...common}>
          <path d="M3 8.5l3.2 3.2L13 4.8" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...common}>
          <path d="M8 2.2L14.2 13H1.8L8 2.2z" />
          <path d="M8 6.5v3M8 11.4v.1" />
        </svg>
      );
    case 'danger':
      return (
        <svg {...common}>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      );
    case 'info':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 7.2V11M8 4.9v.1" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.4" />
        </svg>
      );
  }
}

export default function StatusBadge({
  variant,
  children,
  className = '',
  title,
  icon = true,
  role,
}: StatusBadgeProps) {
  const tone = STATUS_TONE[variant] ?? 'neutral';
  const extra = variant === 'provisional' ? ' badge-provisional' : '';
  return (
    <span
      className={`badge badge-${tone}${extra} ${className}`.trim()}
      data-tone={tone}
      role={role}
      title={title}
    >
      {icon && <ToneIcon tone={tone} />}
      {children}
    </span>
  );
}
