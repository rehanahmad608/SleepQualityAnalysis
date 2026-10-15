import { useEffect, useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import { apiClient } from '../api/client';
import { ACCESS_TOKEN_KEY, AUTH_EXPIRED_EVENT } from '../api/authEvents';
import { AuthError, signInWithPassword } from '../auth/supabaseAuth';
import MetricCard from '../components/ui/MetricCard';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import MissingDaysBadge from '../components/ui/MissingDaysBadge';
import StatusBadge from '../components/ui/StatusBadge';
import './participantData.css';

interface Participant { participant_code: string; timezone: string; start_date: string; end_date: string; default_date?: string }
interface Day { date: string; mean_bpm: number | null; samples: number; steps: number | null; sleep_hours: number | null; resting_bpm: number | null; hrv_rmssd_ms: number | null; excluded_intervals: number }
interface Response { study_date: string; submitted_at: string; energy: number; sleep_quality?: number; bedtime?: string; fell_asleep_time?: string; last_meal_time?: string; productivity_original?: string; productive_hours?: number | null }
interface Dashboard {
  participant_code: string; timezone: string; start_date: string; end_date: string;
  days: Day[]; heart_rate_trend: { timestamp: string; bpm: number | null; samples: number }[];
  morning_responses: Response[]; evening_responses: Response[];
  summary: { mean_bpm: number | null; heart_rate_samples: number; steps: number | null; excluded_step_intervals: number; mean_sleep_hours: number | null; valid_sleep_days: number };
  notes: string[];
}
const number = (value: number | null | undefined, digits = 1) => value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
const localTime = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function ForgotPasswordLink() {
  // Plain anchor when rendered outside a router (isolated component tests).
  return useInRouterContext() ? <Link to="/forgot-password">Forgot password?</Link> : <a href="/forgot-password">Forgot password?</a>;
}

export default function ParticipantDataPage({ initialView = 'daily', initialPeriod = 'all', title = 'Participant Data' }: { initialView?: 'daily' | 'weekly'; initialPeriod?: 'all' | 'day' | 'night'; title?: string }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(sessionStorage.getItem(ACCESS_TOKEN_KEY) || '');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(''); const [signingIn, setSigningIn] = useState(false);
  const authConfigured = !!import.meta.env.VITE_SUPABASE_URL;
  useEffect(() => {
    const onExpired = () => { setToken(''); queryClient.clear(); };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [queryClient]);
  const [code, setCode] = useState(''); const [selectedDate, setDate] = useState('');
  const [mode, setMode] = useState<'daily' | 'weekly'>(initialView);
  const [period, setPeriod] = useState<string>(initialPeriod); const [dataFormat, setFormat] = useState('json');
  const participants = useQuery({ queryKey: ['structured-participants', token], queryFn: () => apiClient.get<Participant[]>('/participants'), enabled: !authConfigured || !!token, retry: false });
  const selected = participants.data?.find(p => p.participant_code === code) || participants.data?.[0];
  const participantCode = selected?.participant_code || '';
  const day = selectedDate || selected?.default_date || selected?.start_date || '';
  const data = useQuery({
    queryKey: ['participant-data', token, participantCode, mode, day, period, dataFormat],
    queryFn: () => apiClient.get<Dashboard>(`/participants/${encodeURIComponent(participantCode)}/${mode}`, { [mode === 'daily' ? 'date' : 'week_start']: day, period, format: dataFormat }),
    enabled: !!participantCode && !!day && (!authConfigured || !!token), retry: false,
  });
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setSigningIn(true); setLoginError('');
    try {
      const accessToken = await signInWithPassword(email, password);
      setToken(accessToken); setPassword('');
      queryClient.clear();
    } catch (error) { setLoginError(error instanceof AuthError ? error.message : 'Sign-in failed.'); }
    finally { setSigningIn(false); }
  }
  function signOut() { sessionStorage.removeItem(ACCESS_TOKEN_KEY); setToken(''); queryClient.clear(); }
  if (authConfigured && !token) return <section className="participant-data"><h1>Sign in</h1><p>View the participant data shared with your account.</p><form className="participant-login" onSubmit={signIn}>
    <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" /></label>
    <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
    <button className="btn btn-primary" disabled={signingIn}>{signingIn ? 'Signing in…' : 'Sign in'}</button>{loginError && <p role="alert">{loginError}</p>}
    <p className="text-sm"><ForgotPasswordLink /></p>
  </form></section>;
  return <section className="participant-data">
    <div className="page-header"><div><h1>{title}</h1><p className="page-subtitle">Imported health measurements and questionnaire responses · Europe/Amsterdam</p></div>{authConfigured && <button className="btn" onClick={signOut}>Sign out</button>}</div>
    {participants.isLoading && <LoadingState title="Loading participants…" />}
    {participants.isError && <ErrorState title="Could not load participants" errorMessage={participants.error instanceof Error ? participants.error.message : undefined} retry={() => { void participants.refetch(); }} />}
    {participants.data?.length === 0 && <p>No participants have been shared with this account.</p>}
    {selected && <>
      <div className="participant-filters">
        <label>Participant<select value={participantCode} onChange={e => { setCode(e.target.value); setDate(''); }}>{participants.data?.map(p => <option key={p.participant_code}>{p.participant_code}</option>)}</select></label>
        <label>View<select value={mode} onChange={e => setMode(e.target.value as 'daily' | 'weekly')}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
        <label>{mode === 'daily' ? 'Date' : 'Seven days starting'}<input type="date" value={day} onChange={e => setDate(e.target.value)} /></label>
        <label>Time of day<select value={period} onChange={e => setPeriod(e.target.value)}><option value="all">Full day</option><option value="day">Day · 06:00–22:00</option><option value="night">Night · before 06:00 / after 22:00</option></select></label>
        <label>Data source<select value={dataFormat} onChange={e => setFormat(e.target.value)}><option value="json">JSON export</option><option value="csv">CSV export</option></select></label>
      </div>
      <p className="text-sm text-muted">Available records: {selected.start_date} to {selected.end_date}. Day/night filters apply to heart rate, HRV and steps. Sleep uses its wake date.</p>
      {data.isLoading && <LoadingState title="Loading measurements…" />}
      {data.isError && <ErrorState title="Could not load measurements" errorMessage={data.error instanceof Error ? data.error.message : undefined} retry={() => { void data.refetch(); }} />}
      {data.data && <>
        <p className="text-sm">Showing {data.data.start_date} to {data.data.end_date} {data.isFetching && '· Updating…'}</p>
        {data.data.days.length > 0 && (
          <div className="participant-status" aria-label="Data coverage">
            {/* Display only: derived from fields the API already returns; no calculation changes. */}
            <MissingDaysBadge
              missing={data.data.days.filter(d => d.samples === 0 && d.steps == null && d.sleep_hours == null && d.resting_bpm == null && d.hrv_rmssd_ms == null).length}
              total={data.data.days.length}
            />
            {data.data.summary.excluded_step_intervals > 0
              ? <StatusBadge variant="warning">{data.data.summary.excluded_step_intervals} step intervals excluded</StatusBadge>
              : <StatusBadge variant="neutral" icon={false}>No step intervals excluded</StatusBadge>}
          </div>
        )}
        <div className="participant-metrics">
          <MetricCard label="Observed mean heart rate" value={number(data.data.summary.mean_bpm)} units="bpm" sampleCount={data.data.summary.heart_rate_samples} />
          <MetricCard label="Nonoverlapping steps" value={number(data.data.summary.steps, 0)} units="steps" footer={`${data.data.summary.excluded_step_intervals} intervals excluded`} />
          <MetricCard label="Mean sleep per recorded wake date" value={number(data.data.summary.mean_sleep_hours)} units="hours" footer={`${data.data.summary.valid_sleep_days} dates with sleep`} />
        </div>
        {data.data.summary.heart_rate_samples === 0 && data.data.days.every(d => d.steps == null && d.sleep_hours == null) && <p>No wearable measurements match these filters. Questionnaire responses may still be available below.</p>}
        <div className="participant-chart"><h2>Heart rate · hourly observed averages</h2>{data.data.heart_rate_trend.some(point => point.bpm != null) ? <ResponsiveContainer width="100%" height={260}><LineChart data={data.data.heart_rate_trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="timestamp" tickFormatter={localTime} minTickGap={60} /><YAxis unit=" bpm" /><Tooltip labelFormatter={label => localTime(String(label))} /><Line dataKey="bpm" name="Mean heart rate" stroke="#6366f1" dot={false} connectNulls={false} /></LineChart></ResponsiveContainer> : <p>No heart-rate readings for this selection.</p>}</div>
        <div className="participant-chart"><h2>Daily steps</h2><ResponsiveContainer width="100%" height={230}><BarChart data={data.data.days}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Bar dataKey="steps" name="Nonoverlapping steps" fill="#14b8a6" /></BarChart></ResponsiveContainer></div>
        <h2>Daily measurements</h2><div className="participant-table"><table><thead><tr><th>Date</th><th>Mean HR</th><th>HR samples</th><th>Resting HR</th><th>HRV RMSSD</th><th>Steps</th><th>Sleep hours</th></tr></thead><tbody>{data.data.days.map(d => <tr key={d.date}><td>{d.date}</td><td>{number(d.mean_bpm)}</td><td>{number(d.samples, 0)}</td><td>{number(d.resting_bpm)}</td><td>{number(d.hrv_rmssd_ms)}</td><td>{number(d.steps, 0)}</td><td>{number(d.sleep_hours)}</td></tr>)}</tbody></table></div>
        <h2>Morning questionnaire</h2>{data.data.morning_responses.length ? <div className="participant-table"><table><thead><tr><th>Submitted</th><th>Sleep quality /10</th><th>Energy /10</th><th>Reported bedtime</th><th>Reported sleep onset</th></tr></thead><tbody>{data.data.morning_responses.map(r => <tr key={r.submitted_at}><td>{localTime(r.submitted_at)}</td><td>{r.sleep_quality ?? '—'}</td><td>{r.energy}</td><td>{r.bedtime ?? '—'}</td><td>{r.fell_asleep_time ?? '—'}</td></tr>)}</tbody></table></div> : <p>No morning responses in this date range.</p>}
        <h2>Evening questionnaire</h2>{data.data.evening_responses.length ? <div className="participant-table"><table><thead><tr><th>Submitted</th><th>Energy /10</th><th>Productivity as entered</th><th>Last meal as entered</th></tr></thead><tbody>{data.data.evening_responses.map(r => <tr key={r.submitted_at}><td>{localTime(r.submitted_at)}</td><td>{r.energy}</td><td>{r.productivity_original ?? '—'}</td><td>{r.last_meal_time ?? '—'}</td></tr>)}</tbody></table></div> : <p>No evening responses in this date range.</p>}
        <p className="text-sm text-muted">Questionnaire clock times are shown as entered. Their AM/PM meaning and the productivity duration need confirmation.</p>
        <ul className="text-sm text-muted">{data.data.notes.map(note => <li key={note}>{note}</li>)}</ul>
      </>}
    </>}
  </section>;
}
