import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { apiClient } from './client';
import type { Capabilities } from '../types';
import {
  fetchComparison,
  fetchDaily,
  fetchHeartRate,
  fetchSleep,
  fetchStudy,
  fetchSyncRun,
  fetchWeekly,
  importJson,
  startSync,
  type DailyLoader,
} from './endpoints';
import { setDisplayTimeZone } from '../utils/format';
import type {
  StudyConfig,
  DailySummary,
  WeeklySummary,
  ComparisonSummary,
  HeartRateSample,
  SleepSessionWithSegments,
  SyncRun,
  ImportResult,
} from '../types';

export const queryKeys = {
  study: ['study'] as const,
  dailySummary: (date: string) => ['daily-summary', date] as const,
  weeklySummary: (weekNumber: 1 | 2) => ['weekly-summary', weekNumber] as const,
  comparison: ['comparison'] as const,
  heartRate: (date: string) => ['heart-rate', date] as const,
  sleep: (date: string) => ['sleep', date] as const,
  syncRun: (runId: string) => ['sync-run', runId] as const,
};

const STUDY_STALE_MS = 60 * 1000;
const DAILY_STALE_MS = 30 * 1000;

async function loadStudy(): Promise<StudyConfig> {
  const study = await fetchStudy();
  // All displayed clock times follow the study's timezone, not the browser's.
  setDisplayTimeZone(study.timezone);
  return study;
}

function getStudy(qc: QueryClient): Promise<StudyConfig> {
  return qc.fetchQuery({ queryKey: queryKeys.study, queryFn: loadStudy, staleTime: STUDY_STALE_MS });
}

/** Daily summaries go through the query cache so pages share one request per date. */
function dailyLoader(qc: QueryClient, studyStart: string): DailyLoader {
  return (date) =>
    qc.fetchQuery({
      queryKey: queryKeys.dailySummary(date),
      queryFn: () => fetchDaily(date, studyStart),
      staleTime: DAILY_STALE_MS,
    });
}

export function useStudy(enabled = true): UseQueryResult<StudyConfig> {
  return useQuery({
    queryKey: queryKeys.study,
    enabled,
    queryFn: loadStudy,
    staleTime: STUDY_STALE_MS,
  });
}

/** Which backend features exist in this deployment (legacy study schema, writes). */
export function useCapabilities(): UseQueryResult<Capabilities> {
  return useQuery({
    queryKey: ['capabilities'] as const,
    queryFn: () => apiClient.get<Capabilities>('/capabilities'),
    staleTime: 60 * 1000,
    retry: false,
  });
}

/** Legacy study pages are shown only when the backend confirms the legacy schema. */
export function isLegacyAvailable(caps: Capabilities | undefined): boolean {
  return !!caps && caps.legacy_study === true;
}

export function useDailySummary(date: string): UseQueryResult<DailySummary> {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.dailySummary(date),
    queryFn: async () => {
      const study = await getStudy(qc);
      return fetchDaily(date, study.start_date);
    },
    enabled: !!date,
    staleTime: DAILY_STALE_MS,
  });
}

/**
 * One backend request per study day. Any failed request fails the whole query:
 * an API error is never turned into a "missing day".
 */
export function useAllDailySummaries(
  study: StudyConfig | undefined,
  dates: string[]
): UseQueryResult<DailySummary[]> {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['all-daily-summaries', study?.start_date ?? '', dates.join(',')],
    enabled: !!study && dates.length > 0,
    queryFn: () => {
      const load = dailyLoader(qc, (study as StudyConfig).start_date);
      return Promise.all(dates.map((d) => load(d)));
    },
    staleTime: DAILY_STALE_MS,
  });
}

export function useWeeklySummary(weekNumber: 1 | 2): UseQueryResult<WeeklySummary> {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.weeklySummary(weekNumber),
    queryFn: async () => {
      const study = await getStudy(qc);
      return fetchWeekly(weekNumber, dailyLoader(qc, study.start_date));
    },
  });
}

export function useComparison(): UseQueryResult<ComparisonSummary> {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.comparison,
    queryFn: async () => {
      const study = await getStudy(qc);
      const dates = studyDatesOf(study);
      return fetchComparison(dates, dailyLoader(qc, study.start_date));
    },
  });
}

function studyDatesOf(study: StudyConfig): string[] {
  const out: string[] = [];
  const start = Date.parse(`${study.start_date}T00:00:00Z`);
  for (let i = 0; i < study.days_total; i++) {
    out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export function useHeartRate(date: string): UseQueryResult<HeartRateSample[]> {
  return useQuery({
    queryKey: queryKeys.heartRate(date),
    queryFn: () => fetchHeartRate(date),
    enabled: !!date,
  });
}

export function useSleep(date: string): UseQueryResult<SleepSessionWithSegments> {
  return useQuery({
    queryKey: queryKeys.sleep(date),
    queryFn: () => fetchSleep(date),
    enabled: !!date,
  });
}

export function useSyncRun(runId: string): UseQueryResult<SyncRun> {
  return useQuery({
    queryKey: queryKeys.syncRun(runId),
    queryFn: () => fetchSyncRun(runId),
    enabled: !!runId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === 'pending' || s === 'running') return 2000;
      return false;
    },
  });
}

export function useStartSync(): UseMutationResult<SyncRun> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => startSync('google_health'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.study });
    },
  });
}

const REGENERATE_POLL_MS = 1000;
const REGENERATE_TIMEOUT_MS = 60_000;

/**
 * The backend has no dedicated "regenerate demo" route; the equivalent is a
 * demo-mode sync run (POST /sync {mode: "demo"}). Waits for the run to finish.
 */
export function useRegenerateDemo(): UseMutationResult<SyncRun> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const started = await startSync('demo');
      const deadline = Date.now() + REGENERATE_TIMEOUT_MS;
      for (;;) {
        const run = await fetchSyncRun(started.run_id);
        if (run.status === 'completed') return run;
        if (run.status === 'failed') {
          throw new Error(run.error_message ?? 'Demo regeneration failed.');
        }
        if (Date.now() > deadline) {
          throw new Error('Demo regeneration is did not finish within 60 seconds; the backend run is still reported as running.');
        }
        await new Promise((r) => setTimeout(r, REGENERATE_POLL_MS));
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useImportJSON(): UseMutationResult<
  ImportResult,
  unknown,
  { file: File }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file }) => importJson(file),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useExportCSV(): () => void {
  return () => {
    const url = apiClient.getDownloadUrl('/export');
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', 'study-export.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
}
