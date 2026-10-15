import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';
import { parseRecoveryCallback, recoveryRedirectUrl } from '../auth/supabaseAuth';

const SUPA = 'https://project-ref.supabase.co';
const REDIRECT = 'http://127.0.0.1:5173/reset-password';

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[];
let respond: (call: Call) => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function LocationProbe() {
  const l = useLocation();
  return <div data-testid="loc">{`${l.pathname}${l.search}${l.hash}`}</div>;
}

function renderAt(entry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  calls = [];
  sessionStorage.clear();
  localStorage.clear();
  vi.stubEnv('VITE_SUPABASE_URL', SUPA);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');
  vi.stubEnv('VITE_PASSWORD_RECOVERY_REDIRECT_URL', REDIRECT);
  respond = () => json({});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        url: String(input),
        method: init?.method ?? 'GET',
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      return respond(call);
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const authCalls = () => calls.filter((c) => c.url.startsWith(SUPA));
const apiCalls = () => calls.filter((c) => c.url.includes('/api/v1'));

/* ------------------------------------------------------------ forgot */

describe('forgot password', () => {
  it('is reachable from the sign-in form', async () => {
    respond = (c) => (c.url.includes('/capabilities') ? json({ detail: 'no' }, 401) : json({}));
    renderAt('/');
    const link = await screen.findByRole('link', { name: 'Forgot password?' });
    fireEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByTestId('loc').textContent).toBe('/forgot-password');
  });

  it('validates the email format before sending anything', async () => {
    renderAt('/forgot-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery email' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(authCalls()).toHaveLength(0);
  });

  it('sends the recovery request with the explicit redirect and shows a neutral message', async () => {
    renderAt('/forgot-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jack@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery email' }));
    expect(await screen.findByText(/If an account exists for that email address/)).toBeInTheDocument();
    const [call] = authCalls();
    expect(call.method).toBe('POST');
    const url = new URL(call.url);
    expect(url.pathname).toBe('/auth/v1/recover');
    expect(url.searchParams.get('redirect_to')).toBe(REDIRECT);
    expect((call.body as { email: string }).email).toBe('jack@example.com');
    expect(call.headers.apikey).toBe('public-anon-key');
    expect(call.headers.Authorization).toBeUndefined();
  });

  it('does not reveal whether the account exists', async () => {
    respond = () => json({ msg: 'User not found', error_code: 'user_not_found' }, 400);
    renderAt('/forgot-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ghost@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery email' }));
    expect(await screen.findByText(/If an account exists for that email address/)).toBeInTheDocument();
  });

  it('reports rate limits and network failures', async () => {
    respond = () => json({ error_code: 'over_email_send_rate_limit', msg: 'rate' }, 429);
    renderAt('/forgot-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jack@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery email' }));
    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery email' }));
    expect(await screen.findByText(/Cannot reach the authentication service/)).toBeInTheDocument();
  });

  it('default redirect for a loopback browser is the registered 127.0.0.1 URL', () => {
    vi.stubEnv('VITE_PASSWORD_RECOVERY_REDIRECT_URL', '');
    const loc = { hostname: 'localhost', port: '', origin: 'http://localhost:5173' } as Location;
    expect(recoveryRedirectUrl(loc)).toBe('http://127.0.0.1:5173/reset-password');
    expect(recoveryRedirectUrl({ ...loc, hostname: '127.0.0.1', port: '5173' } as Location)).toBe(REDIRECT);
  });
});

/* ------------------------------------------------------ callback parsing */

describe('recovery callback formats', () => {
  it('recognises fragment tokens, PKCE code, token hash and errors', () => {
    expect(parseRecoveryCallback('', '#access_token=AT&refresh_token=RT&type=recovery')).toEqual({ kind: 'tokens', accessToken: 'AT' });
    expect(parseRecoveryCallback('?code=abc', '')).toEqual({ kind: 'code', code: 'abc' });
    expect(parseRecoveryCallback('?token_hash=h&type=recovery', '')).toEqual({ kind: 'token_hash', tokenHash: 'h' });
    expect(parseRecoveryCallback('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'))
      .toMatchObject({ kind: 'error', expired: true });
    expect(parseRecoveryCallback('', '#access_token=AT&type=signup')).toEqual({ kind: 'wrong_type', type: 'signup' });
    expect(parseRecoveryCallback('', '')).toEqual({ kind: 'none' });
  });
});

/* ----------------------------------------------------------- reset page */

const validLink = '/reset-password#access_token=ACCESS-SECRET&refresh_token=REFRESH-SECRET&expires_in=3600&type=recovery';

function userOk(call: Call) {
  if (call.url.endsWith('/auth/v1/user') && call.method === 'GET') return json({ id: 'u1', email: 'jack@example.com' });
  return json({});
}

describe('reset password page', () => {
  it('verifies the recovery session before showing the form and scrubs the URL', async () => {
    respond = userOk;
    renderAt(validLink);
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    const check = authCalls().find((c) => c.url.endsWith('/auth/v1/user'));
    expect(check?.headers.Authorization).toBe('Bearer ACCESS-SECRET');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/reset-password'));
    expect(document.body.textContent).not.toContain('ACCESS-SECRET');
  });

  it('exchanges a PKCE code using the stored verifier', async () => {
    localStorage.setItem('recovery-code-verifier', 'verifier-123');
    respond = (c) => {
      if (c.url.includes('grant_type=pkce')) return json({ access_token: 'PKCE-ACCESS' });
      return userOk(c);
    };
    renderAt('/reset-password?code=AUTHCODE');
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    const exchange = authCalls().find((c) => c.url.includes('grant_type=pkce'));
    expect(exchange?.body).toEqual({ auth_code: 'AUTHCODE', code_verifier: 'verifier-123' });
    expect(localStorage.getItem('recovery-code-verifier')).toBeNull();
  });

  it('verifies a token hash link', async () => {
    respond = (c) => (c.url.endsWith('/auth/v1/verify') ? json({ access_token: 'HASH-ACCESS' }) : userOk(c));
    renderAt('/reset-password?token_hash=HASH&type=recovery');
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    const verify = authCalls().find((c) => c.url.endsWith('/auth/v1/verify'));
    expect(verify?.body).toEqual({ type: 'recovery', token_hash: 'HASH' });
  });

  it('shows an expired-link message with a way to request a new email', async () => {
    renderAt('/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(await screen.findByText(/recovery link has expired/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new recovery email' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(authCalls()).toHaveLength(0);
  });

  it('treats a rejected or reused link as invalid', async () => {
    respond = () => json({ error_code: 'bad_jwt', msg: 'invalid JWT' }, 401);
    renderAt(validLink);
    expect(await screen.findByText(/invalid or has already been used/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('handles a missing token and a code without a stored verifier', async () => {
    const first = renderAt('/reset-password');
    expect(await screen.findByText(/No recovery link was found/)).toBeInTheDocument();
    first.unmount();
    renderAt('/reset-password?code=orphan');
    expect(await screen.findByText(/same browser that requested it|invalid or has already been used/)).toBeInTheDocument();
  });

  it('rejects mismatched and too-short passwords without calling Supabase', async () => {
    respond = userOk;
    renderAt(validLink);
    const pw = await screen.findByLabelText('New password');
    fireEvent.change(pw, { target: { value: 'LongEnough#1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Different#2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();

    fireEvent.change(pw, { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText(/Use at least 8 characters/)).toBeInTheDocument();
    expect(authCalls().filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('show/hide toggles both password fields', async () => {
    respond = userOk;
    renderAt(validLink);
    const pw = await screen.findByLabelText('New password');
    expect(pw).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(pw).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'text');
  });

  it('updates the password through the authenticated Supabase endpoint and shows success', async () => {
    respond = (c) => {
      if (c.method === 'PUT') return json({ id: 'u1' });
      return userOk(c);
    };
    renderAt(validLink);
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'Correct#Horse9' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Correct#Horse9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Password updated successfully.')).toBeInTheDocument();
    const put = authCalls().find((c) => c.method === 'PUT')!;
    expect(new URL(put.url).pathname).toBe('/auth/v1/user');
    expect(put.headers.Authorization).toBe('Bearer ACCESS-SECRET');
    expect(put.body).toEqual({ password: 'Correct#Horse9' });
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/');
    // recovery session is revoked and never becomes a participant session
    await waitFor(() => expect(authCalls().some((c) => c.url.includes('/auth/v1/logout'))).toBe(true));
    expect(sessionStorage.getItem('supabase-access-token')).toBeNull();
    expect(screen.getByTestId('loc').textContent).toBe('/reset-password');
  });

  it.each([
    ['weak password', { error_code: 'weak_password', msg: 'weak', weak_password: { reasons: ['length', 'characters'] } }, 422, /does not meet the password requirements/],
    ['same password', { error_code: 'same_password', msg: 'New password should be different from the old password.' }, 422, /different from your current one/],
    ['server error', { msg: 'boom' }, 500, /could not be updated/],
  ])('keeps the form and explains a %s failure', async (_name, body, status, message) => {
    respond = (c) => (c.method === 'PUT' ? json(body, status) : userOk(c));
    renderAt(validLink);
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'Correct#Horse9' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Correct#Horse9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('an expired recovery session during update asks for a new email', async () => {
    respond = (c) => (c.method === 'PUT' ? json({ error_code: 'session_expired', msg: 'expired' }, 401) : userOk(c));
    renderAt(validLink);
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'Correct#Horse9' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Correct#Horse9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText(/recovery session has expired/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new recovery email' })).toBeInTheDocument();
  });

  it('a network failure during update keeps the form usable', async () => {
    respond = userOk;
    renderAt(validLink);
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'Correct#Horse9' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Correct#Horse9' } });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText(/Cannot reach the authentication service/)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------- isolation */

describe('independence from the dashboard', () => {
  it('direct access makes no dashboard, study, capability or participant requests', async () => {
    respond = userOk;
    renderAt(validLink);
    await screen.findByLabelText('New password');
    expect(apiCalls()).toHaveLength(0);
    expect(calls.every((c) => c.url.startsWith(SUPA))).toBe(true);
    expect(screen.queryByText(/Participant Data|Study Overview|Could not load/)).toBeNull();
  });

  it('exposes no participant data or session during and after recovery, and never logs tokens', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    respond = (c) => (c.method === 'PUT' ? json({ id: 'u1' }) : userOk(c));
    renderAt(validLink);
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'Correct#Horse9' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Correct#Horse9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await screen.findByText('Password updated successfully.');
    expect(apiCalls()).toHaveLength(0);
    expect(sessionStorage.length).toBe(0);
    expect(JSON.stringify(Object.entries(localStorage))).not.toMatch(/ACCESS-SECRET|REFRESH-SECRET|Correct#Horse9/);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toMatch(/ACCESS-SECRET|REFRESH-SECRET|Correct#Horse9/);
    expect(document.body.textContent).not.toMatch(/ACCESS-SECRET|REFRESH-SECRET|Correct#Horse9/);
  });

  it('forgot-password page also stays independent of the dashboard', async () => {
    renderAt('/forgot-password');
    await screen.findByRole('heading', { name: 'Reset your password' });
    expect(apiCalls()).toHaveLength(0);
  });
});
