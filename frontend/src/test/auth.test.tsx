import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACCESS_TOKEN_KEY, apiClient, authHeaders, AUTH_EXPIRED_EVENT } from '../api/client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('bearer token handling', () => {
  it('sends no Authorization header when signed out', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true }));
    vi.stubGlobal('fetch', fn);
    await apiClient.get('/participants');
    const init = fn.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(authHeaders()).toEqual({});
  });

  it('sends the bearer token on GET, POST and uploads', async () => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, 'abc');
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true }));
    vi.stubGlobal('fetch', fn);
    await apiClient.get('/participants');
    await apiClient.post('/sync', { mode: 'demo' });
    await apiClient.uploadFile('/import', new File(['{}'], 'x.json'));
    for (const call of fn.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer abc');
    }
  });

  it('401 clears the stored token and announces the expired session', async () => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, 'abc');
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'Session expired. Please sign in again.' }, 401)));
    const seen = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, seen);
    await expect(apiClient.get('/participants')).rejects.toMatchObject({ status: 401 });
    window.removeEventListener(AUTH_EXPIRED_EVENT, seen);
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(seen).toHaveBeenCalled();
  });

  it('403 keeps the session and shows the server message', async () => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, 'abc');
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'You do not have access to this participant.' }, 403)));
    await expect(apiClient.get('/participants/P002/daily')).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('do not have access'),
    });
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe('abc');
  });
});

describe('participant page status indicators', () => {
  const dayRow = (date: string, has: boolean) => ({
    date, mean_bpm: has ? 70 : null, min_bpm: null, max_bpm: null, samples: has ? 100 : 0,
    steps: has ? 5000 : null, excluded_intervals: 0, sleep_hours: has ? 7 : null, sessions: 0,
    resting_bpm: has ? 60 : null, hrv_rmssd_ms: null, hrv_samples: 0,
  });
  const dashboard = (days: ReturnType<typeof dayRow>[], excluded = 0) => ({
    participant_code: 'P001', timezone: 'Europe/Amsterdam', start_date: days[0].date, end_date: days[days.length - 1].date,
    days, heart_rate_trend: [], morning_responses: [], evening_responses: [], notes: [],
    summary: { mean_bpm: 70, heart_rate_samples: 100, steps: 5000, excluded_step_intervals: excluded, mean_sleep_hours: 7, valid_sleep_days: 1 },
  });

  async function renderWith(body: unknown) {
    vi.resetModules();
    vi.doMock('../api/client', () => ({
      apiClient: {
        get: vi.fn(async (endpoint: string) =>
          endpoint === '/participants'
            ? [{ participant_code: 'P001', timezone: 'Europe/Amsterdam', start_date: '2026-10-09', end_date: '2026-10-11' }]
            : body),
      },
    }));
    const { default: Page } = await import('../pages/ParticipantDataPage');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={qc}><Page /></QueryClientProvider>);
  }

  it('partial coverage is amber and excluded intervals are called out', async () => {
    await renderWith(dashboard([dayRow('2026-10-09', true), dayRow('2026-10-10', false)], 3));
    expect(await screen.findByText('1 missing day')).toHaveClass('badge-warning');
    expect(screen.getByText('3 step intervals excluded')).toHaveClass('badge-warning');
  });

  it('complete coverage is green', async () => {
    await renderWith(dashboard([dayRow('2026-10-09', true)]));
    expect(await screen.findByText('No missing days')).toHaveClass('badge-success');
  });

  it('all days empty is the critical red indicator', async () => {
    await renderWith(dashboard([dayRow('2026-10-09', false), dayRow('2026-10-10', false)]));
    expect(await screen.findByText(/Critical: all 2 days missing/)).toHaveClass('badge-danger');
  });
});
