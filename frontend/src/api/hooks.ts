import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { apiClient } from './client';
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

export function useStudy(): UseQueryResult<StudyConfig> {
  return useQuery({
    queryKey: queryKeys.study,
    queryFn: () => apiClient.get<StudyConfig>('/study'),
    staleTime: 60 * 1000,
  });
}

export function useDailySummary(date: string): UseQueryResult<DailySummary> {
  return useQuery({
    queryKey: queryKeys.dailySummary(date),
    queryFn: () =>
      apiClient.get<DailySummary>('/daily-summary', { date }),
    enabled: !!date,
  });
}

export function useWeeklySummary(weekNumber: 1 | 2): UseQueryResult<WeeklySummary> {
  return useQuery({
    queryKey: queryKeys.weeklySummary(weekNumber),
    queryFn: () =>
      apiClient.get<WeeklySummary>('/weekly-summary', { week: weekNumber }),
  });
}

export function useComparison(): UseQueryResult<ComparisonSummary> {
  return useQuery({
    queryKey: queryKeys.comparison,
    queryFn: () => apiClient.get<ComparisonSummary>('/comparison'),
  });
}

export function useHeartRate(date: string): UseQueryResult<HeartRateSample[]> {
  return useQuery({
    queryKey: queryKeys.heartRate(date),
    queryFn: () =>
      apiClient.get<HeartRateSample[]>('/heart-rate', { date }),
    enabled: !!date,
  });
}

export function useSleep(date: string): UseQueryResult<SleepSessionWithSegments> {
  return useQuery({
    queryKey: queryKeys.sleep(date),
    queryFn: () =>
      apiClient.get<SleepSessionWithSegments>('/sleep', { date }),
    enabled: !!date,
  });
}

export function useSyncRun(runId: string): UseQueryResult<SyncRun> {
  return useQuery({
    queryKey: queryKeys.syncRun(runId),
    queryFn: () =>
      apiClient.get<SyncRun>(`/sync/runs/${runId}`),
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
    mutationFn: () => apiClient.post<SyncRun>('/sync/start'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.study });
    },
  });
}

export function useRegenerateDemo(): UseMutationResult<StudyConfig> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<StudyConfig>('/study/regenerate-demo'),
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
    mutationFn: ({ file }) =>
      apiClient.uploadFile<ImportResult>('/import/json', file),
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
