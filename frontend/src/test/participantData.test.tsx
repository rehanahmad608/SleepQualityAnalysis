import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, test, expect } from 'vitest';
import ParticipantDataPage from '../pages/ParticipantDataPage';
import { apiClient } from '../api/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

vi.mock('../api/client', () => ({ apiClient: { get: vi.fn() } }));

test('participant, date, week and day/night filters drive the Python API request', async () => {
  const dashboard = { start_date: '2026-10-09', end_date: '2026-10-09', days: [], heart_rate_trend: [], morning_responses: [], evening_responses: [], notes: [], summary: { mean_bpm: null, heart_rate_samples: 0, steps: null, excluded_step_intervals: 0, mean_sleep_hours: null, valid_sleep_days: 0 } };
  vi.mocked(apiClient.get).mockImplementation(async endpoint => (endpoint === '/participants' ? [{ participant_code: 'P001', timezone: 'Europe/Amsterdam', start_date: '2026-10-09', end_date: '2026-10-13' }] : dashboard) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><ParticipantDataPage /></QueryClientProvider>);
  await screen.findByLabelText('Time of day');
  fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: 'night' } });
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/participants/P001/daily', { date: '2026-10-09', period: 'night', format: 'json' }));
  fireEvent.change(screen.getByLabelText('View'), { target: { value: 'weekly' } });
  fireEvent.change(screen.getByLabelText('Data source'), { target: { value: 'csv' } });
  fireEvent.change(screen.getByLabelText('Seven days starting'), { target: { value: '2026-10-10' } });
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/participants/P001/weekly', { week_start: '2026-10-10', period: 'night', format: 'csv' }));
  view.unmount(); client.clear();
});

test('sidebar Daily, Night and Weekly open Supabase participant views without old study requests', async () => {
  vi.mocked(apiClient.get).mockClear();
  const dashboard = { start_date: '2026-10-09', end_date: '2026-10-09', days: [], heart_rate_trend: [], morning_responses: [], evening_responses: [], notes: [], summary: { mean_bpm: null, heart_rate_samples: 0, steps: null, excluded_step_intervals: 0, mean_sleep_hours: null, valid_sleep_days: 0 } };
  vi.mocked(apiClient.get).mockImplementation(async endpoint => (endpoint === '/participants' ? [{ participant_code: 'P001', timezone: 'Europe/Amsterdam', start_date: '2026-10-09', end_date: '2026-10-13' }] : dashboard) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter><App /></MemoryRouter></QueryClientProvider>);
  await screen.findByLabelText('Time of day');
  fireEvent.click(screen.getByRole('link', { name: 'Daily' }));
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/participants/P001/daily', { date: '2026-10-09', period: 'day', format: 'json' }));
  fireEvent.click(screen.getByRole('link', { name: 'Night' }));
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/participants/P001/daily', { date: '2026-10-09', period: 'night', format: 'json' }));
  fireEvent.click(screen.getByRole('link', { name: 'Weekly' }));
  await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/participants/P001/weekly', { week_start: '2026-10-09', period: 'all', format: 'json' }));
  expect(vi.mocked(apiClient.get).mock.calls.some(([endpoint]) => endpoint === '/study' || endpoint === '/daily-summary' || endpoint === '/weekly-summary')).toBe(false);
  view.unmount(); client.clear();
});
