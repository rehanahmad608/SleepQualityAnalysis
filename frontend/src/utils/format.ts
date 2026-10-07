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

export function formatLocalTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return format(d, 'HH:mm');
  } catch {
    return '—';
  }
}

export function formatLocalDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return format(d, 'yyyy-MM-dd');
  } catch {
    return '—';
  }
}

export function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return format(d, 'yyyy-MM-dd HH:mm');
  } catch {
    return '—';
  }
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
