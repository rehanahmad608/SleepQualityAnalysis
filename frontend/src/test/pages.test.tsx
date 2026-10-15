import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from '../components/Layout/Layout';
import OverviewPage from '../pages/OverviewPage';
import { setDisplayTimeZone } from '../utils/format';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const studyRaw = {
  timezone: 'Europe/Amsterdam',
  freshness: { last_successful_fetch: '2026-10-07T21:30:30', is_stale: false },
  participant_code: 'P001',
  study_id: 's',
  start_date: '2026-09-24',
  end_date_exclusive: '2026-09-27',
  study_days_count: 3,
  study_dates: ['2026-09-24', '2026-09-25', '2026-09-26'],
  data_mode: 'demo',
};

const dailyBody = (date: string, hasData: boolean) => ({
  data: {
    date,
    sleep: {
      main_asleep_seconds: hasData ? 21600 : null,
      total_sleep_seconds: hasData ? 21600 : null,
      sleep_efficiency_pct: null,
    },
    steps: { count: hasData ? 5000 : null, intervals_count: 0 },
    heart_rate: { resting_bpm: hasData ? 60 : null, observed_mean_bpm: null, sample_count: 0 },
    coverage: { has_sleep: hasData, has_steps: hasData, has_heart_rate: false },
    is_provisional: false,
  },
});

const capsBody = (legacy: boolean) => ({
  legacy_study: legacy,
  legacy_requested: true,
  legacy_reason: legacy ? null : 'missing_schema',
  writes_enabled: false,
  auth_required: true,
});

function stubBackend(daily: (date: string) => Response, legacy = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const u = new URL(String(input), 'http://localhost');
      if (u.pathname === '/api/v1/capabilities') return json(capsBody(legacy));
      if (u.pathname === '/api/v1/study') return json(studyRaw);
      if (u.pathname === '/api/v1/dashboard/daily') return daily(u.searchParams.get('date') ?? '');
      return new Response('not found', { status: 404 });
    })
  );
}

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/overview']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/overview" element={<OverviewPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setDisplayTimeZone(undefined);
});

describe('Overview data states', () => {
  it('complete coverage: green indicator, real values, valid dates', async () => {
    stubBackend((d) => json(dailyBody(d, true)));
    renderApp();
    expect(await screen.findByText('No missing days')).toHaveClass('badge-success');
    expect(screen.getAllByText(/2026-09-24 → 2026-09-26/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/undefined|NaN|Invalid/);
  });

  it('partial coverage: amber indicator with the confirmed count', async () => {
    stubBackend((d) => json(dailyBody(d, d !== '2026-09-25')));
    renderApp();
    const badge = await screen.findByText('1 missing day');
    expect(badge).toHaveClass('badge-warning');
  });

  it('no observations at all (confirmed by the backend): red critical indicator', async () => {
    stubBackend((d) => json(dailyBody(d, false)));
    renderApp();
    const badge = await screen.findByText(/Critical: all 3 days missing/);
    expect(badge).toHaveClass('badge-danger');
  });

  it('API failure shows an error state, never missing days', async () => {
    stubBackend((d) =>
      d === '2026-09-25' ? json({ detail: 'database is locked' }, 500) : json(dailyBody(d, true))
    );
    renderApp();
    expect(await screen.findByText('Could not load daily summaries')).toBeInTheDocument();
    expect(screen.getByText(/database is locked/)).toBeInTheDocument();
    expect(screen.queryByText(/missing day/i)).toBeNull();
    expect(screen.queryByText('No missing days')).toBeNull();
  });

  it('connection failure shows a clear error and no data indicators', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    renderApp();
    expect(await screen.findByText('Could not determine available features')).toBeInTheDocument();
    expect(screen.getByText(/Cannot reach the backend API/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/missing day/i)).toBeNull());
  });

  it('malformed study response is reported as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const u = new URL(String(input), 'http://localhost');
        if (u.pathname === '/api/v1/capabilities') return json(capsBody(true));
        return json({ hello: 'world' });
      })
    );
    renderApp();
    expect(await screen.findByText('Could not load study configuration')).toBeInTheDocument();
    expect(screen.getByText(/Unexpected backend response/)).toBeInTheDocument();
  });

  it('legacy schema unavailable: friendly notice, no legacy requests, legacy nav hidden', async () => {
    stubBackend((d) => json(dailyBody(d, true)), false);
    renderApp();
    expect(await screen.findByText('Legacy study data is not available')).toBeInTheDocument();
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/study') || u.includes('/dashboard/'))).toBe(false);
    expect(screen.queryByRole('link', { name: 'Study Overview' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Participant Data' })).toBeInTheDocument();
    expect(screen.queryByText(/missing day/i)).toBeNull();
  });

  it('legacy available: legacy navigation is shown', async () => {
    stubBackend((d) => json(dailyBody(d, true)), true);
    renderApp();
    expect(await screen.findByRole('link', { name: 'Study Overview' })).toBeInTheDocument();
  });
});
