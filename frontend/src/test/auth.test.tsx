import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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
