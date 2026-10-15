import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiConnectionError, ApiHttpError } from '../api/client';
import { ApiContractError } from '../api/adapters';
import {
  fetchComparison,
  fetchDaily,
  fetchStudy,
  fetchWeekly,
  startSync,
  importJson,
} from '../api/endpoints';
import { useAllDailySummaries } from '../api/hooks';
import { formatLocalDate, formatLocalDateTime, formatLocalTime, setDisplayTimeZone } from '../utils/format';
import type { StudyConfig } from '../types';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const studyRaw = {
  timezone: 'Europe/Amsterdam',
  freshness: { last_successful_fetch: null, is_stale: true },
  participant_code: 'P001',
  study_id: 's',
  start_date: '2026-09-24',
  end_date_exclusive: '2026-10-08',
  study_days_count: 14,
  study_dates: [],
  data_mode: 'demo',
};

const dailyBody = (date: string, hasData: boolean) => ({
  data: {
    date,
    sleep: { main_asleep_seconds: hasData ? 20000 : null, total_sleep_seconds: hasData ? 20000 : null, sleep_efficiency_pct: null },
    steps: { count: hasData ? 100 : null, intervals_count: 0 },
    heart_rate: { resting_bpm: null, observed_mean_bpm: null, sample_count: 0 },
    coverage: { has_sleep: hasData, has_steps: hasData, has_heart_rate: false },
    is_provisional: false,
  },
});

function mockFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input), 'http://localhost'), init)
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setDisplayTimeZone(undefined);
});

describe('endpoint paths and parameters', () => {
  it('calls the real backend routes', async () => {
    const fn = mockFetch((u) => {
      if (u.pathname === '/api/v1/study') return json(studyRaw);
      if (u.pathname === '/api/v1/dashboard/daily') return json(dailyBody(u.searchParams.get('date') ?? '', true));
      return new Response('nope', { status: 404 });
    });
    const study = await fetchStudy();
    expect(study.days_total).toBe(14);
    const day = await fetchDaily('2026-09-26', study.start_date);
    expect(day.day_number).toBe(3);
    const urls = fn.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/api/v1/study');
    expect(urls).toContain('/api/v1/dashboard/daily?date=2026-09-26');
  });

  it('weekly fetch requests the week and every day of that week', async () => {
    const dates = ['2026-09-24', '2026-09-25'];
    const fn = mockFetch((u) => {
      if (u.pathname === '/api/v1/dashboard/weekly') {
        return json({
          week_number: 1,
          summary: {
            week_number: 1,
            day_range: dates,
            mean_steps_per_valid_day: 100,
            valid_step_days: 2,
            mean_main_sleep_per_valid_night_seconds: 20000,
            valid_sleep_nights: 2,
            mean_resting_bpm: null,
            valid_resting_days: 0,
            mean_observed_bpm: null,
            valid_observed_days: 0,
          },
        });
      }
      return json(dailyBody(u.searchParams.get('date') ?? '', true));
    });
    const w = await fetchWeekly(1, (d) => fetchDaily(d, '2026-09-24'));
    expect(w.daily_summaries.map((d) => d.date)).toEqual(dates);
    expect(w.avg_resting_hr_bpm).toBeNull();
    const urls = fn.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/api/v1/dashboard/weekly?week=1');
  });

  it('posts sync requests with the backend body shape', async () => {
    const fn = mockFetch(() => json({ run_id: 'r1', status: 'accepted', started_at: '2026-10-12T10:00:00', message: '' }));
    const run = await startSync('google_health');
    expect(run).toMatchObject({ run_id: 'r1', status: 'pending' });
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(String(fn.mock.calls[0][0])).toBe('/api/v1/sync');
    expect(JSON.parse(String(init.body))).toEqual({ mode: 'google_health', force_full_refresh: false });
  });

  it('uploads import files as multipart "file" to /import', async () => {
    const fn = mockFetch(() => json({ success: true, validation_errors: [], stats: { sleep_sessions_upserted: 1 } }));
    const res = await importJson(new File(['{}'], 'x.json', { type: 'application/json' }));
    expect(res.accepted_records).toBe(1);
    expect(String(fn.mock.calls[0][0])).toBe('/api/v1/import');
    expect((fn.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData);
  });
});

describe('error handling', () => {
  it('reports connection failures distinctly', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchStudy()).rejects.toBeInstanceOf(ApiConnectionError);
  });

  it('surfaces FastAPI detail text from HTTP errors', async () => {
    mockFetch(() => json({ detail: 'Date 2030-01-01 not in study window' }, { status: 400 }));
    const err = await fetchDaily('2030-01-01', '2026-09-24').catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(400);
    expect((err as ApiHttpError).message).toContain('not in study window');
  });

  it('flags backend-unavailable proxy errors', async () => {
    mockFetch(() => new Response('Bad gateway', { status: 502 }));
    const err = (await fetchStudy().catch((e) => e)) as ApiHttpError;
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(err.message).toMatch(/Backend unavailable/);
  });

  it('rejects non-JSON success responses (e.g. an HTML fallback page)', async () => {
    mockFetch(() => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(fetchStudy()).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('rejects JSON that does not match the contract', async () => {
    mockFetch(() => json({ hello: 'world' }));
    await expect(fetchStudy()).rejects.toBeInstanceOf(ApiContractError);
    await expect(fetchComparison([], async () => { throw new Error('unused'); })).rejects.toBeInstanceOf(ApiContractError);
  });
});

describe('overview: API failure is not "missing days"', () => {
  const study: StudyConfig = {
    study_id: 's',
    participant_label: 'P001',
    start_date: '2026-09-24',
    end_date: '2026-09-26',
    days_total: 3,
    timezone: 'Europe/Amsterdam',
    data_mode: 'demo',
    freshness: { last_successful_sync: null, is_stale: false, stale_hours: null },
    google_configured: null,
    google_connected: null,
  };
  const dates = ['2026-09-24', '2026-09-25', '2026-09-26'];
  const wrapper = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };

  it('puts the query in an error state when one daily request fails', async () => {
    mockFetch((u) => {
      const d = u.searchParams.get('date') ?? '';
      if (d === '2026-09-25') return new Response('boom', { status: 500 });
      return json(dailyBody(d, true));
    });
    const { result } = renderHook(() => useAllDailySummaries(study, dates), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('returns confirmed-empty days as data, not as errors', async () => {
    mockFetch((u) => json(dailyBody(u.searchParams.get('date') ?? '', false)));
    const { result } = renderHook(() => useAllDailySummaries(study, dates), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(3);
    expect(result.current.data?.every((d) => d.coverage.has_sleep === false)).toBe(true);
  });
});

describe('timezone-aware formatting', () => {
  it('renders instants in the study timezone, not the browser zone', () => {
    setDisplayTimeZone('Europe/Amsterdam');
    expect(formatLocalTime('2026-09-24T21:50:00Z')).toBe('23:50'); // CEST = UTC+2
    expect(formatLocalDateTime('2026-09-24T22:30:00Z')).toBe('2026-09-25 00:30');
    setDisplayTimeZone('UTC');
    expect(formatLocalTime('2026-09-24T21:50:00Z')).toBe('21:50');
  });

  it('never shifts bare calendar dates', () => {
    setDisplayTimeZone('America/Los_Angeles');
    expect(formatLocalDate('2026-09-25')).toBe('2026-09-25');
  });

  it('shows an em dash for invalid input instead of Invalid Date / NaN', () => {
    expect(formatLocalTime('not-a-date')).toBe('—');
    expect(formatLocalDate(undefined)).toBe('—');
    expect(formatLocalDateTime(null)).toBe('—');
  });
});
