import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { ACCESS_TOKEN_KEY, AUTH_EXPIRED_EVENT } from '../api/authEvents';
import { finishGoogleSignIn, getAuthConfig, signInWithGoogle, validateDashboardSession } from './supabaseAuth';
import '../pages/authPages.css';

export default function DashboardAuth() {
  const [status, setStatus] = useState<'checking' | 'signed-out' | 'signed-in'>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  useEffect(() => {
    let active = true;
    const expired = () => {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      cache.clear();
      setStatus('signed-out');
      setError('Your session has ended. Please sign in again.');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    (async () => {
      try {
        if (window.location.pathname === '/auth/callback') await finishGoogleSignIn();
        const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
        if (!token) { if (active) setStatus('signed-out'); return; }
        await validateDashboardSession(token);
        if (active) setStatus('signed-in');
      } catch (e) {
        sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        if (active) {
          setError(e instanceof Error ? e.message : 'Could not verify your session. Please sign in again.');
          setStatus('signed-out');
        }
      }
    })();
    return () => { active = false; window.removeEventListener(AUTH_EXPIRED_EVENT, expired); };
  }, [cache]);

  if (status === 'signed-in') return <Outlet />;
  return <main className="auth-shell"><section className="auth-card">
    <h1>Sleep Quality Dashboard</h1>
    <p className="auth-lead">Sign in with your Google account to view your dashboard.</p>
    {status === 'checking' ? <p role="status">Checking your session…</p> : <>
      {error && <p className="auth-alert error" role="alert">{error}</p>}
      {!getAuthConfig() && <p className="auth-alert info">Google sign-in is awaiting setup by the project owner.</p>}
      <button className="btn btn-primary" disabled={busy || !getAuthConfig()} onClick={async () => {
        setBusy(true); setError('');
        try { await signInWithGoogle(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not start Google sign-in.'); setBusy(false); }
      }}>{busy ? 'Opening Google…' : 'Continue with Google'}</button>
    </>}
  </section></main>;
}
