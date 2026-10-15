import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AuthError,
  PASSWORD_MAX_LENGTH,
  establishRecoverySession,
  getAuthConfig,
  parseRecoveryCallback,
  passwordMinLength,
  revokeSession,
  updatePassword,
  type RecoveryCallback,
} from '../auth/supabaseAuth';
import './authPages.css';

type Phase =
  | { name: 'checking' }
  | { name: 'ready' }
  | { name: 'invalid'; message: string }
  | { name: 'saving' }
  | { name: 'done' };

// A recovery code/token is single use; React StrictMode runs effects twice in development.
const inflight = new Map<string, Promise<string>>();

function callbackKey(cb: RecoveryCallback): string | null {
  if (cb.kind === 'tokens') return `t:${cb.accessToken}`;
  if (cb.kind === 'code') return `c:${cb.code}`;
  if (cb.kind === 'token_hash') return `h:${cb.tokenHash}`;
  return null;
}

function invalidMessage(cb: RecoveryCallback): string | null {
  if (cb.kind === 'error') {
    return cb.expired
      ? 'This recovery link has expired. Request a new one to continue.'
      : 'This recovery link is invalid or has already been used. Request a new one to continue.';
  }
  if (cb.kind === 'wrong_type') return 'This link is not a password recovery link. Request a new recovery email.';
  if (cb.kind === 'none') return 'No recovery link was found. Open the link from your recovery email, or request a new one.';
  return null;
}

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ name: 'checking' });
  // Recovery credentials live in memory only (never storage, never the URL, never logs).
  const tokenRef = useRef<string>('');
  const started = useRef(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const min = passwordMinLength();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const cb = parseRecoveryCallback(location.search, location.hash);
    // Remove tokens/codes from the address bar and history entry immediately.
    navigate({ pathname: '/reset-password', search: '', hash: '' }, { replace: true });

    if (!getAuthConfig()) {
      setPhase({ name: 'invalid', message: 'Password recovery is not configured for this deployment.' });
      return;
    }
    const immediate = invalidMessage(cb);
    if (immediate) {
      setPhase({ name: 'invalid', message: immediate });
      return;
    }
    const key = callbackKey(cb) as string;
    let promise = inflight.get(key);
    if (!promise) {
      promise = establishRecoverySession(cb);
      inflight.set(key, promise);
    }
    promise
      .then((token) => {
        tokenRef.current = token;
        setPhase({ name: 'ready' });
      })
      .catch((e: unknown) => {
        const err = e instanceof AuthError ? e : null;
        const msg =
          err?.kind === 'network' || err?.kind === 'rate_limit' ? err.message
          : err?.kind === 'expired' ? 'This recovery link has expired. Request a new one to continue.'
          : 'This recovery link is invalid or has already been used. Request a new one to continue.';
        setPhase({ name: 'invalid', message: msg });
      })
      .finally(() => inflight.delete(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(): boolean {
    const next: typeof errors = {};
    if (password.length < min) next.password = `Use at least ${min} characters.`;
    else if (password.length > PASSWORD_MAX_LENGTH) next.password = `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setPhase({ name: 'saving' });
    try {
      await updatePassword(tokenRef.current, password);
    } catch (e) {
      const err = e instanceof AuthError ? e : null;
      if (err?.kind === 'session' || err?.kind === 'expired' || err?.kind === 'invalid') {
        tokenRef.current = '';
        setPhase({ name: 'invalid', message: 'Your recovery session has expired. Request a new recovery email to continue.' });
        return;
      }
      const detail =
        err?.kind === 'weak_password'
          ? `${err.message}${err.reasons.length ? ` (${err.reasons.join(', ').replace(/_/g, ' ')})` : ''}`
          : err?.kind === 'same_password' || err?.kind === 'network' || err?.kind === 'rate_limit'
          ? err.message
          : 'The password could not be updated. Please try again.';
      setErrors({ form: detail });
      setPhase({ name: 'ready' });
      return;
    }
    const token = tokenRef.current;
    tokenRef.current = '';
    setPassword('');
    setConfirm('');
    void revokeSession(token); // the recovery session must not outlive the reset
    setPhase({ name: 'done' });
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="reset-title">
        <h1 id="reset-title">Set a new password</h1>

        {phase.name === 'checking' && (
          <p className="auth-lead" role="status"><span className="auth-spinner" aria-hidden="true" />Verifying your recovery link…</p>
        )}

        {phase.name === 'invalid' && (
          <>
            <div className="auth-alert error" role="alert">{phase.message}</div>
            <div className="auth-links">
              <Link to="/forgot-password">Request a new recovery email</Link>
              <Link to="/">Back to sign in</Link>
            </div>
          </>
        )}

        {phase.name === 'done' && (
          <>
            <div className="auth-alert success" role="status">Password updated successfully.</div>
            <div className="auth-links">
              <Link to="/">Go to sign in</Link>
            </div>
          </>
        )}

        {(phase.name === 'ready' || phase.name === 'saving') && (
          <form className="auth-form" onSubmit={submit} noValidate>
            <p className="auth-lead">Choose a new password for your account.</p>
            <div className="auth-field">
              <label htmlFor="new-password">New password</label>
              <span className="auth-input-row">
                <input
                  id="new-password"
                  className="input"
                  type={show ? 'text' : 'password'}
                  name="new-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                  aria-describedby="new-password-hint"
                  disabled={phase.name === 'saving'}
                  required
                />
                <button type="button" className="btn" aria-pressed={show} onClick={() => setShow((v) => !v)}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </span>
              <span id="new-password-hint" className="auth-hint">At least {min} characters.</span>
              {errors.password && <span className="auth-field-error" role="alert">{errors.password}</span>}
            </div>
            <div className="auth-field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                className="input"
                type={show ? 'text' : 'password'}
                name="confirm-password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={!!errors.confirm}
                disabled={phase.name === 'saving'}
                required
              />
              {errors.confirm && <span className="auth-field-error" role="alert">{errors.confirm}</span>}
            </div>
            {errors.form && <div className="auth-alert error" role="alert">{errors.form}</div>}
            <div className="auth-actions">
              <button type="submit" className="btn btn-primary" disabled={phase.name === 'saving'}>
                {phase.name === 'saving' ? (<><span className="auth-spinner" aria-hidden="true" />Updating…</>) : 'Update password'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
