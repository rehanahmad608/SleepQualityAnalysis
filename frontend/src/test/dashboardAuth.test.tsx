import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardAuth from '../auth/DashboardAuth';
import { ACCESS_TOKEN_KEY } from '../api/authEvents';

vi.mock('../auth/supabaseAuth', () => ({
  getAuthConfig: () => ({ url: 'https://example.supabase.co', anonKey: 'public' }),
  validateDashboardSession: vi.fn(async (token: string) => { if (token === 'expired') throw new Error('Session expired'); }),
  signInWithGoogle: vi.fn(), finishGoogleSignIn: vi.fn(),
}));
afterEach(() => sessionStorage.clear());
function mount() {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Routes>
    <Route element={<DashboardAuth />}><Route index element={<div>Private dashboard</div>} /></Route>
  </Routes></MemoryRouter></QueryClientProvider>);
}
describe('dashboard login boundary', () => {
  it('keeps dashboard unmounted while signed out', async () => {
    mount();
    expect(await screen.findByText('Continue with Google')).toBeInTheDocument();
    expect(screen.queryByText('Private dashboard')).not.toBeInTheDocument();
  });
  it('opens dashboard only after validating the session', async () => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, 'valid'); mount();
    expect(await screen.findByText('Private dashboard')).toBeInTheDocument();
  });
  it('rejects expired sessions and removes their token', async () => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, 'expired'); mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Session expired');
    expect(screen.queryByText('Private dashboard')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });
});
