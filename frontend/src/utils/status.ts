import type { StatusTone } from '../components/ui/StatusBadge';

export type DataMode = 'demo' | 'import' | 'google';

export interface MissingDaysStatus {
  tone: StatusTone;
  label: string;
}

/**
 * Missing-days indicator semantics:
 *  - none missing            -> green
 *  - some missing            -> amber (partial)
 *  - every required day gone -> red (critical)
 */
export function getMissingDaysStatus(missing: number, total: number): MissingDaysStatus {
  if (total > 0 && missing >= total) {
    return { tone: 'danger', label: `Critical: all ${total} days missing` };
  }
  if (missing > 0) {
    return { tone: 'warning', label: `${missing} missing ${missing === 1 ? 'day' : 'days'}` };
  }
  return { tone: 'success', label: 'No missing days' };
}

/** Completeness percentage -> tone: 100% green, 0% red, anything partial amber. */
export function getCompletenessTone(percent: number): StatusTone {
  if (percent >= 100) return 'success';
  if (percent <= 0) return 'danger';
  return 'warning';
}

/**
 * Data-mode badge semantics. Google mode never implies success on its own;
 * it is green only when the connection is confirmed configured and connected.
 */
export function getModeTone(
  mode: DataMode,
  google?: { configured: boolean | null; connected: boolean | null }
): StatusTone {
  if (mode === 'demo') return 'warning';
  if (mode === 'import') return 'info';
  return google?.configured && google?.connected ? 'success' : 'info';
}
