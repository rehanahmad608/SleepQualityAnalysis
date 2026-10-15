/**
 * Supabase Auth over its public REST API (the project does not use supabase-js).
 *
 * Only the public/anon key is used. Recovery credentials (access/refresh tokens,
 * codes, token hashes) are handled in memory only: they are never written to
 * localStorage/sessionStorage, never logged, and never placed in the app's
 * participant session (`supabase-access-token`).
 */
import { ACCESS_TOKEN_KEY } from '../api/authEvents';

export interface AuthConfig {
  url: string;
  anonKey: string;
}

export type AuthErrorKind =
  | 'config'
  | 'network'
  | 'rate_limit'
  | 'expired'
  | 'invalid'
  | 'weak_password'
  | 'same_password'
  | 'session'
  | 'credentials'
  | 'unknown';

/** Safe-to-display error. `message` never contains tokens or passwords. */
export class AuthError extends Error {
  kind: AuthErrorKind;
  status: number;
  reasons: string[];

  constructor(kind: AuthErrorKind, message: string, status = 0, reasons: string[] = []) {
    super(message);
    this.name = 'AuthError';
    this.kind = kind;
    this.status = status;
    this.reasons = reasons;
  }
}

export function getAuthConfig(): AuthConfig | null {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  return url && anonKey ? { url, anonKey } : null;
}

export function passwordMinLength(): number {
  const n = Number(import.meta.env.VITE_PASSWORD_MIN_LENGTH);
  return Number.isInteger(n) && n >= 6 ? n : 8;
}

export const PASSWORD_MAX_LENGTH = 72;

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Where the recovery email must send the user back to (must be an allowed redirect URL). */
export function recoveryRedirectUrl(loc: Pick<Location, 'hostname' | 'port' | 'origin'> = window.location): string {
  const configured = String(import.meta.env.VITE_PASSWORD_RECOVERY_REDIRECT_URL || '').trim();
  if (configured) return configured;
  const { hostname, port, origin } = loc;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Always the loopback literal that is registered as an allowed redirect URL.
    return `http://127.0.0.1:${port || '5173'}/reset-password`;
  }
  return `${origin}/reset-password`;
}

/* ------------------------------------------------------------ transport */

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
  query?: Record<string, string>;
}

function classify(status: number, body: Record<string, unknown> | null): AuthError {
  const code = String(body?.error_code ?? body?.code ?? '').toLowerCase();
  const text = String(body?.msg ?? body?.message ?? body?.error_description ?? body?.error ?? '').toLowerCase();
  const reasons = Array.isArray((body as { weak_password?: { reasons?: unknown } } | null)?.weak_password?.reasons)
    ? ((body as { weak_password: { reasons: string[] } }).weak_password.reasons as string[])
    : [];
  if (status === 429 || code.includes('rate_limit') || code === 'over_request_rate_limit') {
    return new AuthError('rate_limit', 'Too many requests. Please wait a few minutes and try again.', status);
  }
  if (code === 'weak_password' || reasons.length) {
    return new AuthError('weak_password', 'That password does not meet the password requirements.', status, reasons);
  }
  if (code === 'same_password' || text.includes('different from the old password')) {
    return new AuthError('same_password', 'Choose a password different from your current one.', status);
  }
  if (code === 'otp_expired' || code === 'flow_state_expired' || text.includes('expired')) {
    return new AuthError('expired', 'This recovery link has expired.', status);
  }
  if (
    ['flow_state_not_found', 'bad_code_verifier', 'validation_failed', 'bad_oauth_callback', 'otp_disabled'].includes(code) ||
    text.includes('invalid') || text.includes('already been used') || text.includes('not found')
  ) {
    return new AuthError('invalid', 'This recovery link is invalid or has already been used.', status);
  }
  if (status === 401 || status === 403 || code === 'bad_jwt' || code === 'session_not_found' || code === 'session_expired') {
    return new AuthError('session', 'Your recovery session is no longer valid.', status);
  }
  if (code === 'invalid_credentials') {
    return new AuthError('credentials', 'Sign-in failed. Check your email and password.', status);
  }
  return new AuthError('unknown', 'The authentication service could not complete the request.', status);
}

async function authRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const cfg = getAuthConfig();
  if (!cfg) throw new AuthError('config', 'Authentication is not configured for this deployment.');
  const query = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : '';
  let resp: Response;
  try {
    resp = await fetch(`${cfg.url}/auth/v1${path}${query}`, {
      method: opts.method ?? 'GET',
      headers: {
        apikey: cfg.anonKey,
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new AuthError('network', 'Cannot reach the authentication service. Check your connection and try again.');
  }
  let data: Record<string, unknown> | null = null;
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }
  if (!resp.ok) throw classify(resp.status, data);
  return (data ?? {}) as T;
}

/* ------------------------------------------------------------- PKCE */

const VERIFIER_KEY = 'recovery-code-verifier';

function base64Url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createPkcePair(): Promise<{ verifier: string; challenge: string } | null> {
  try {
    if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) return null;
    const random = new Uint8Array(48);
    globalThis.crypto.getRandomValues(random);
    const verifier = base64Url(random);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { verifier, challenge: base64Url(new Uint8Array(digest)) };
  } catch {
    return null;
  }
}

function storeVerifier(v: string | null): void {
  try {
    if (v) localStorage.setItem(VERIFIER_KEY, v);
    else localStorage.removeItem(VERIFIER_KEY);
  } catch {
    // storage unavailable: PKCE links then fail with a clear "request a new link" message
  }
}

function takeVerifier(): string | null {
  try {
    return localStorage.getItem(VERIFIER_KEY);
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- recovery */

/** Ask Supabase to email a recovery link. Resolves the same way whether or not the user exists. */
export async function requestPasswordRecovery(email: string): Promise<void> {
  const pkce = await createPkcePair();
  storeVerifier(pkce?.verifier ?? null);
  await authRequest('/recover', {
    method: 'POST',
    query: { redirect_to: recoveryRedirectUrl() },
    body: {
      email: email.trim(),
      ...(pkce ? { code_challenge: pkce.challenge, code_challenge_method: 's256' } : {}),
    },
  });
}

export type RecoveryCallback =
  | { kind: 'none' }
  | { kind: 'error'; code: string; expired: boolean }
  | { kind: 'tokens'; accessToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'wrong_type'; type: string };

/** Interpret whichever callback shape Supabase produced; never assumes a single format. */
export function parseRecoveryCallback(search: string, hash: string): RecoveryCallback {
  const q = new URLSearchParams(search.replace(/^\?/, ''));
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  const get = (k: string) => h.get(k) ?? q.get(k);

  const error = get('error') || get('error_code');
  if (error) {
    const code = (get('error_code') || error).toLowerCase();
    const desc = (get('error_description') || '').toLowerCase();
    return { kind: 'error', code, expired: code.includes('expired') || desc.includes('expired') };
  }
  const type = get('type');
  if (type && type !== 'recovery') return { kind: 'wrong_type', type };
  const accessToken = h.get('access_token') || q.get('access_token');
  if (accessToken) return { kind: 'tokens', accessToken };
  const tokenHash = q.get('token_hash') || h.get('token_hash');
  if (tokenHash) return { kind: 'token_hash', tokenHash };
  const code = q.get('code') || h.get('code');
  if (code) return { kind: 'code', code };
  return { kind: 'none' };
}

interface SessionResponse {
  access_token?: string;
}

/** Turn a callback into a verified recovery access token (held in memory by the caller). */
export async function establishRecoverySession(cb: RecoveryCallback): Promise<string> {
  let accessToken: string | undefined;
  if (cb.kind === 'tokens') {
    accessToken = cb.accessToken;
  } else if (cb.kind === 'token_hash') {
    const r = await authRequest<SessionResponse>('/verify', {
      method: 'POST',
      body: { type: 'recovery', token_hash: cb.tokenHash },
    });
    accessToken = r.access_token;
  } else if (cb.kind === 'code') {
    const verifier = takeVerifier();
    if (!verifier) {
      throw new AuthError('invalid', 'This recovery link must be opened in the same browser that requested it.');
    }
    const r = await authRequest<SessionResponse>('/token', {
      method: 'POST',
      query: { grant_type: 'pkce' },
      body: { auth_code: cb.code, code_verifier: verifier },
    });
    storeVerifier(null); // single use
    accessToken = r.access_token;
  } else {
    throw new AuthError('invalid', 'This recovery link is invalid.');
  }
  if (!accessToken) throw new AuthError('invalid', 'This recovery link is invalid or has already been used.');
  // Validate the session before offering a password form.
  await authRequest('/user', { token: accessToken });
  return accessToken;
}

export async function updatePassword(accessToken: string, password: string): Promise<void> {
  await authRequest('/user', { method: 'PUT', token: accessToken, body: { password } });
}

/** Best effort: revoke the short-lived recovery session after the password changed. */
export async function revokeSession(accessToken: string): Promise<void> {
  try {
    await authRequest('/logout', { method: 'POST', token: accessToken, query: { scope: 'local' } });
  } catch {
    // not critical; the token is short-lived and was never persisted
  }
}

/* ------------------------------------------------------------ sign-in */

/** Existing participant sign-in (stores the token under the app's single session key). */
export async function signInWithPassword(email: string, password: string): Promise<string> {
  const r = await authRequest<SessionResponse>('/token', {
    method: 'POST',
    query: { grant_type: 'password' },
    body: { email, password },
  });
  if (!r.access_token) throw new AuthError('credentials', 'Sign-in failed. Check your email and password.');
  sessionStorage.setItem(ACCESS_TOKEN_KEY, r.access_token);
  return r.access_token;
}
