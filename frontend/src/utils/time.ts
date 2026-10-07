import { addDays, differenceInDays, format, isAfter, isBefore, parseISO } from 'date-fns';
import type { StudyConfig } from '../types';

export function getStudyDates(startDate: string, days = 14): string[] {
  const start = parseISO(startDate);
  const result: string[] = [];
  for (let i = 0; i < days; i++) {
    result.push(format(addDays(start, i), 'yyyy-MM-dd'));
  }
  return result;
}

export function getWeekDates(allDates: string[], weekNumber: 1 | 2): string[] {
  const startIdx = weekNumber === 1 ? 0 : 7;
  return allDates.slice(startIdx, startIdx + 7);
}

export function getDayNumber(allDates: string[], date: string): number {
  const idx = allDates.indexOf(date);
  if (idx === -1) return -1;
  return idx + 1;
}

export function isWithinStudy(dateISO: string, study: StudyConfig | undefined | null): boolean {
  if (!study) return false;
  const d = parseISO(dateISO);
  const start = parseISO(study.start_date);
  const end = parseISO(study.end_date);
  return (
    (d.getTime() === start.getTime() || d > start) &&
    (d.getTime() === end.getTime() || d < end)
  ) || (differenceInDays(d, start) >= 0 && differenceInDays(end, d) >= 0);
}

export function getCurrentStudyDayOrDefault(study: StudyConfig | undefined | null): string {
  if (!study) return '';
  const allDates = getStudyDates(study.start_date, study.days_total);
  const today = format(new Date(), 'yyyy-MM-dd');
  if (isWithinStudy(today, study)) {
    return today;
  }
  const lastDate = allDates[allDates.length - 1];
  return lastDate || study.start_date;
}

export function getWeekForDayNumber(dayNumber: number): 1 | 2 {
  return dayNumber <= 7 ? 1 : 2;
}

export function getDayOfWeekLabel(dateISO: string): string {
  const d = parseISO(dateISO);
  return format(d, 'EEE');
}

export function formatHourLocal(iso: string): string {
  return format(new Date(iso), 'HH:mm');
}
