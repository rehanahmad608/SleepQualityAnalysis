import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthError, getAuthConfig, isValidEmail, requestPasswordRecovery } from '../auth/supabaseAuth';
import './authPages.css';

const NEUTRAL_SUCCESS =
  'If an account exists for that email address, a password recovery link has been sent. ' +
  'Check your inbox (and spam folder). The link expires after a short time.';

export default function ForgotPasswordPage() {
  const configured = !!getAuthConfig();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!isValidEmail(email)) {
      setFieldError('Enter a valid email address.');
      return;
    }
    setFieldError('');
    setStatus('sending');
    try {
      await requestPasswordRecovery(email);
      setStatus('sent');
    } catch (e) {
      const kind = e instanceof AuthError ? e.kind : 'unknown';
      if (kind === 'rate_limit' || kind === 'network' || kind === 'config') {
        setError((e as AuthError).message);
        setStatus('idle');
      } else {
        // Never reveal whether the address exists: other rejections look like success.
        setStatus('sent');
      }
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="forgot-title">
        <h1 id="forgot-title">Reset your password</h1>
        {!configured ? (
          <div className="auth-alert error" role="alert">
            Password recovery is not configured for this deployment.
          </div>
        ) : status === 'sent' ? (
          <div className="auth-alert success" role="status">{NEUTRAL_SUCCESS}</div>
        ) : (
          <>
            <p className="auth-lead">Enter your account email and we will send you a link to choose a new password.</p>
            <form className="auth-form" onSubmit={submit} noValidate>
              <label className="auth-field">
                Email
                <input
                  className="input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!fieldError}
                  aria-describedby={fieldError ? 'email-error' : undefined}
                  required
                />
                {fieldError && <span id="email-error" className="auth-field-error" role="alert">{fieldError}</span>}
              </label>
              {error && <div className="auth-alert error" role="alert">{error}</div>}
              <div className="auth-actions">
                <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
                  {status === 'sending' ? (<><span className="auth-spinner" aria-hidden="true" />Sending…</>) : 'Send recovery email'}
                </button>
              </div>
            </form>
          </>
        )}
        <div className="auth-links">
          <Link to="/">Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
