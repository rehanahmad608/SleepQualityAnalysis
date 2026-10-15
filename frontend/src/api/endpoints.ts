/**
 * Endpoint map (frontend operation -> real FastAPI route):
 *
 *   study            GET  /study                              adaptStudy
 *   daily summary    GET  /dashboard/daily?date=              adaptDaily
 *   weekly summary   GET  /dashboard/weekly?week=  (+7 daily) adaptWeekly
 *   comparison       GET  /dashboard/comparison    (+14 daily) adaptComparison
 *   heart rate       GET  /heart-rate?date=                   adaptHeartRate
 *   sleep            GET  /sleep?date=                        adaptSleep
 *   start sync       POST /sync {mode}                        adaptSyncStart
 *   sync status      GET  /sync/{run_id}                      adaptSyncStatus
 *   regenerate demo  POST /sync {mode:"demo"} + poll          (no dedicated route)
 *   JSON import      POST /import (multipart "file")          adaptImport
 *   CSV export       GET  /export                             (browser download)
 */
import { apiClient } from './client';
import {
  adaptComparison,
  adaptDaily,
  adaptHeartRate,
  adaptImport,
  adaptSleep,
  adaptStudy,
  adaptSyncStart,
  adaptSyncStatus,
  adaptWeekly,
  weekDatesFromWeekly,
} from './adapters';
import type {
  ComparisonSummary,
  DailySummary,
  HeartRateSample,
  ImportResult,
  SleepSessionWithSegments,
  StudyConfig,
  SyncRun,
  WeeklySummary,
} from '../types';

export async function fetchStudy(): Promise<StudyConfig> {
  return adaptStudy(await apiClient.get<unknown>('/study'));
}

export async function fetchDaily(date: string, studyStart: string): Promise<DailySummary> {
  const raw = await apiClient.get<unknown>('/dashboard/daily', { date });
  return adaptDaily(raw, studyStart);
}

/** `loadDaily` lets callers route daily requests through a shared cache. */
export type DailyLoader = (date: string) => Promise<DailySummary>;

export async function fetchWeekly(week: 1 | 2, loadDaily: DailyLoader): Promise<WeeklySummary> {
  const raw = await apiClient.get<unknown>('/dashboard/weekly', { week });
  const days = await Promise.all(weekDatesFromWeekly(raw).map((d) => loadDaily(d)));
  return adaptWeekly(raw, days);
}

export async function fetchComparison(
  studyDates: string[],
  loadDaily: DailyLoader
): Promise<ComparisonSummary> {
  const raw = await apiClient.get<unknown>('/dashboard/comparison');
  const days = await Promise.all(studyDates.map((d) => loadDaily(d)));
  return adaptComparison(raw, days);
}

export async function fetchHeartRate(date: string): Promise<HeartRateSample[]> {
  return adaptHeartRate(await apiClient.get<unknown>('/heart-rate', { date }));
}

export async function fetchSleep(date: string): Promise<SleepSessionWithSegments> {
  return adaptSleep(await apiClient.get<unknown>('/sleep', { date }));
}

export async function startSync(mode: 'google_health' | 'demo'): Promise<SyncRun> {
  const raw = await apiClient.post<unknown>('/sync', { mode, force_full_refresh: false });
  return adaptSyncStart(raw);
}

export async function fetchSyncRun(runId: string): Promise<SyncRun> {
  return adaptSyncStatus(await apiClient.get<unknown>(`/sync/${encodeURIComponent(runId)}`));
}

export async function importJson(file: File): Promise<ImportResult> {
  return adaptImport(await apiClient.uploadFile<unknown>('/import', file));
}
