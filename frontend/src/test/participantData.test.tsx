import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, test, expect } from 'vitest';
import ParticipantDataPage from '../pages/ParticipantDataPage';
import { apiClient } from '../api/client';

vi.mock('../auth/supabaseAuth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/supabaseAuth')>(),
  validateDashboardSession: vi.fn(async () => undefined),
}));

vi.mock('../api/client', () => ({ apiClient: { get: vi.fn() } }));

test('morning responses are visible before charts and show response counts', async () => {
  const dashboard = { start_date: '2026-10-06', end_date: '2026-10-06', days: [], heart_rate_trend: [],
    morning_responses: [{ study_date: '2026-10-06', submitted_at: '2026-10-06T11:53:25Z', energy: 3, sleep_quality: 3, bedtime: '04:30:00', fell_asleep_time: '04:30:00' }],
    evening_responses: [], notes: [], summary: { mean_bpm: null, heart_rate_samples: 0, steps: null, excluded_step_intervals: 0, mean_sleep_hours: null, valid_sleep_days: 0 } };
  vi.mocked(apiClient.get).mockImplementation(async endpoint => (endpoint === '/participants' ? [{ participant_code: 'P001_DEMO', start_date: '2026-10-06', end_date: '2026-10-24', is_demo: true }] : dashboard) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><ParticipantDataPage /></QueryClientProvider>);
  const morning = await screen.findByRole('heading', { name: 'Morning questionnaire (1)' });
  expect(screen.getByRole('link', { name: 'Morning responses: 1' })).toBeInTheDocument();
  expect(screen.getAllByText('04:30:00')).toHaveLength(2);
  expect(screen.queryByText(/Observed mean heart rate|Mean sleep per recorded wake date|Mean HR/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Data source')).not.toBeInTheDocument();
  const steps = screen.getByRole('heading', { name: 'Daily steps' });
  expect(morning.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  view.unmount(); client.clear();
});

test('named participant view requests exactly fourteen dates', async () => {
  vi.mocked(apiClient.get).mockClear();
  const dashboard = { start_date: '2026-10-06', end_date: '2026-10-19', days: [], heart_rate_trend: [], morning_responses: [], evening_responses: [], notes: [], summary: { mean_bpm: null, heart_rate_samples: 0, steps: null, excluded_step_intervals: 0, mean_sleep_hours: null, valid_sleep_days: 0 } };
  vi.mocked(apiClient.get).mockImplementation(async endpoint => (endpoint === '/participants' ? [{ participant_code: 'P001_DEMO', timezone: 'Europe/Amsterdam', start_date: '2026-10-06', end_date: '2026-10-19', is_demo: true, demo: { description: 'Copied test measurements.', day_sources: [] } }] : dashboard) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><ParticipantDataPage /></QueryClientProvider>);
  await screen.findByRole('heading', { name: "Jack's Sleep Data" });
  expect(screen.queryByText('Demo dataset')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Data coverage')).not.toBeInTheDocument();
  expect(screen.queryByText('Nonoverlapping steps')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: "Jack's Sleep Data" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('View'), { target: { value: 'fortnight' } });
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/participants/P001_DEMO/range', { start_date: '2026-10-06', end_date: '2026-10-19', period: 'all', format: 'json' }));
  view.unmount(); client.clear();
});

test('participant, date, week and day/night filters drive the Python API request', async () => {
  const dashboard = { start_date: '2026-10-09', end_date: '2026-10-09', days: [], heart_rate_trend: [], morning_responses: [], evening_responses: [], notes: [], summary: { mean_bpm: null, heart_rate_samples: 0, steps: null, excluded_step_intervals: 0, mean_sleep_hours: null, valid_sleep_days: 0 } };
  vi.mocked(apiClient.get).mockImplementation(async endpoint => (endpoint === '/participants' ? [{ participant_code: 'P001', timezone: 'Europe/Amsterdam', start_date: '2026-10-09', end_date: '2026-10-13' }] : dashboard) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><ParticipantDataPage /></QueryClientProvider>);
  await screen.findByLabelText('Time of day');
  fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: 'night' } });
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/participants/P001/daily', { date: '2026-10-09', period: 'night', format: 'json' }));
  fireEvent.change(screen.getByLabelText('View'), { target: { value: 'weekly' } });
  expect(screen.queryByLabelText('Data source')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Seven days starting'), { target: { value: '2026-10-10' } });
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/participants/P001/weekly', { week_start: '2026-10-10', period: 'night', format: 'json' }));
  view.unmount(); client.clear();
});
