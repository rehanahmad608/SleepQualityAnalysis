import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '—';
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

export function formatBPM(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${Math.round(value)}`;
}

export function formatSteps(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return Math.round(value).toLocaleString('en-US');
}

export function formatPercentageChange(
  value: number | null | undefined,
  baseline: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value) ||
    baseline === null ||
    baseline === undefined ||
    Number.isNaN(baseline) ||
    baseline === 0
  ) {
    return '—';
  }
  const pct = ((value - baseline) / Math.abs(baseline)) * 100;
  const rounded = Math.round(pct);
  if (rounded > 0) {
    return `↑${rounded}%`;
  }
  if (rounded < 0) {
    return `↓${Math.abs(rounded)}%`;
  }
  return '0%';
}

export function formatAbsoluteChange(
  value: number | null | undefined,
  baseline: number | null | undefined,
  formatter: (v: number | null | undefined) => string
): string {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value) ||
    baseline === null ||
    baseline === undefined ||
    Number.isNaN(baseline)
  ) {
    return '—';
  }
  const delta = value - baseline;
  if (delta > 0) {
    return `+${formatter(delta)}`;
  }
  if (delta < 0) {
    return `−${formatter(Math.abs(delta))}`;
  }
  return '0';
}

/**
 * Display timezone. Set once from the study configuration so every clock time
 * is shown in the study's zone (the same zone the backend uses to cut days).
 * undefined = the browser's zone.
 */
let displayTimeZone: string | undefined;

export function setDisplayTimeZone(tz: string | undefined): void {
  if (!tz) {
    displayTimeZone = undefined;
    return;
  }
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    displayTimeZone = tz;
  } catch {
    displayTimeZone = undefined;
  }
}

export function getDisplayTimeZone(): string | undefined {
  return displayTimeZone;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function zonedParts(d: Date): { y: string; mo: string; d: string; h: string; mi: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: displayTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute') };
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatLocalTime(iso: string | null | undefined): string {
  const d = parseInstant(iso);
  if (!d) return '—';
  const p = zonedParts(d);
  return `${p.h}:${p.mi}`;
}

export function formatLocalDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // A bare calendar date has no instant; never shift it across timezones.
  if (DATE_ONLY_RE.test(iso)) return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? '—' : iso;
  const d = parseInstant(iso);
  if (!d) return '—';
  const p = zonedParts(d);
  return `${p.y}-${p.mo}-${p.d}`;
}

export function formatLocalDateTime(iso: string | null | undefined): string {
  const d = parseInstant(iso);
  if (!d) return '—';
  const p = zonedParts(d);
  return `${p.y}-${p.mo}-${p.d} ${p.h}:${p.mi}`;
}

export function formatStudyDateLabel(dateISO: string, dayNumber: number | null | undefined): string {
  const date = formatLocalDate(dateISO);
  if (dayNumber === null || dayNumber === undefined) {
    return date;
  }
  return `Day ${dayNumber} · ${date}`;
}

export function formatWithValidCount(
  value: number | null | undefined,
  validCount: number | null | undefined,
  formatter: (v: number | null | undefined) => string,
  unitLabel: string
): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const formatted = formatter(value);
  if (validCount === null || validCount === undefined) {
    return formatted;
  }
  return `${formatted} ${unitLabel} (${validCount} valid days)`;
}
