import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ACCESS_TOKEN_KEY } from '../api/authEvents';
import { revokeSession } from '../auth/supabaseAuth';
import referenceHtml from '../dashboard/referenceDashboard.html?raw';
import { civilMinute, RangeData, referenceRows, shiftDate } from '../dashboard/referenceData';
import { buildGlanceSummaries } from '../dashboard/glanceSummaries';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';

interface Participant { participant_code: string; start_date: string; end_date: string; default_date?: string; is_demo?: boolean }
export default function ReferenceDashboardPage({ initialView = 'week' }: { initialView?: 'week' | 'day' }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cache = useQueryClient();
  useEffect(() => { document.title = "Jack's Sleep Data"; }, []);
  const [renderError, setRenderError] = useState(false);
  const [participant, setParticipant] = useState(() => new URLSearchParams(window.location.search).get('participant') || '');
  const participants = useQuery({ queryKey: ['reference-participants'], queryFn: () => apiClient.get<Participant[]>('/participants'), retry: false });
  const selected = participants.data?.find(p => p.participant_code === participant) || participants.data?.[0];
  // Jack's dashboard covers the 14-day study. The night of 18 Oct is paired
  // with the wake day of 19 Oct; later weeks stay outside the presentation.
  const displayEnd = selected?.participant_code === 'P001_DEMO'
    ? [selected.end_date, '2026-10-19'].sort()[0] : selected?.end_date;
  const data = useQuery({
    queryKey: ['reference-data', selected?.participant_code, selected?.start_date, displayEnd],
    enabled: !!selected,
    retry: false,
    queryFn: async () => {
      const combined: RangeData = { days: [], heart_rate_trend: [], sleep_sessions: [], morning_responses: [], evening_responses: [] };
      // API windows remain bounded to 31 days. Include the preceding evening for night/day pairing.
      for (let start = shiftDate(selected!.start_date, -1); start <= displayEnd!; start = shiftDate(start, 31)) {
        const end = [shiftDate(start, 30), displayEnd!].sort()[0];
        const page = await apiClient.get<RangeData>(`/participants/${encodeURIComponent(selected!.participant_code)}/range`, { start_date: start, end_date: end, format: 'json', period: 'all' });
        combined.days.push(...page.days);
        combined.heart_rate_trend.push(...page.heart_rate_trend);
        combined.sleep_sessions!.push(...page.sleep_sessions || []);
        combined.morning_responses.push(...page.morning_responses);
        combined.evening_responses.push(...page.evening_responses);
      }
      combined.days = combined.days.filter(d => d.date >= selected!.start_date && d.date <= displayEnd!);
      return referenceRows(combined);
    },
  });
  const payload = useMemo(() => ({
    type: 'sleep-dashboard:data', rows: data.data || [], initialView,
    summaries: buildGlanceSummaries(data.data || []),
    initialDate: [new URLSearchParams(window.location.search).get('date') || selected?.default_date || selected?.start_date || '', displayEnd || '9999-12-31'].sort()[0],
  }), [data.data, initialView, selected, displayEnd]);
  const sendData = useCallback(() => { if (data.data) frame.current?.contentWindow?.postMessage(payload, '*'); }, [data.data, payload]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      // Only the isolated dashboard frame may request actions; it never receives tokens.
      if (!frame.current?.contentWindow || event.source !== frame.current.contentWindow) return;
      if (event.data?.type === 'sleep-dashboard:ready') sendData();
      if (event.data?.type === 'sleep-dashboard:request-curve') {
        const { studyDate, requestId } = event.data;
        if (!selected || !data.data?.some(row => row.day === studyDate)) return;
        const target = frame.current.contentWindow;
        void cache.fetchQuery({
          queryKey: ['sleep-comparison', selected.participant_code, studyDate], staleTime: 300_000,
          queryFn: () => apiClient.get<RangeData>(`/participants/${encodeURIComponent(selected.participant_code)}/sleep-comparison`, { date: studyDate }),
        }).then(result => {
          const base = shiftDate(studyDate, -1);
          const points = result.heart_rate_trend.map(p => ({ t: civilMinute(p.timestamp, base), v: p.bpm, samples: p.samples })).filter(p => p.t >= 1200 && p.t <= 2760);
          target.postMessage({ type: 'sleep-dashboard:curve', requestId, points }, '*');
        }).catch(() => target.postMessage({ type: 'sleep-dashboard:curve', requestId, error: true }, '*'));
      }
      if (event.data?.type === 'sleep-dashboard:error') setRenderError(true);
      if (event.data?.type === 'sleep-dashboard:logout') {
        const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
        sessionStorage.removeItem(ACCESS_TOKEN_KEY); cache.clear();
        if (token) void revokeSession(token);
        window.location.replace('/');
      }
    };
    window.addEventListener('message', receive);
    sendData();
    return () => window.removeEventListener('message', receive);
  }, [sendData, cache, selected, data.data]);
  if (participants.isError || data.isError) return <div style={{ padding: 32 }}><ErrorState title="Could not load Jack's sleep data" errorMessage={(participants.error || data.error)?.message} retry={() => { void participants.refetch(); void data.refetch(); }} /></div>;
  if (participants.isLoading || (selected && !data.data)) return <div style={{ padding: 32, minHeight: '100vh', background: '#F7F6F2', color: '#1E1B3A' }}><LoadingState title="Loading sleep and check-in data…" /></div>;
  if (!selected) return <div style={{ padding: 32 }}><h1>No participant access</h1><p>No participants have been shared with this account.</p><button className="btn" onClick={() => { sessionStorage.removeItem(ACCESS_TOKEN_KEY); cache.clear(); window.location.replace('/'); }}>Sign out</button></div>;
  return <div style={{ position: 'fixed', inset: 0, background: '#F7F6F2', zIndex: 10 }}>
    {participants.data!.length > 1 && <select aria-label="Participant" value={selected.participant_code} onChange={e => setParticipant(e.target.value)} style={{ position: 'absolute', zIndex: 2, top: 14, left: 16 }}>{participants.data!.map(p => <option key={p.participant_code} value={p.participant_code}>{p.is_demo ? 'Jack' : p.participant_code}</option>)}</select>}
    {renderError && <div role="alert" style={{ padding: 16, color: '#8b2417' }}>Could not display this selection. Please refresh and try again.</div>}
    <iframe ref={frame} title="Jack's Sleep Data" srcDoc={referenceHtml} sandbox="allow-scripts" onLoad={sendData} style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
  </div>;
}
