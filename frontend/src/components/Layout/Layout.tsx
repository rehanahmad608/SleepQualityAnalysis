import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStudy } from '../../api/hooks';
import { formatLocalDate, formatLocalDateTime } from '../../utils/format';
import StatusBadge from '../ui/StatusBadge';
import LoadingState from '../ui/LoadingState';
import ErrorState from '../ui/ErrorState';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Participant Data', end: true },
  { to: '/overview', label: 'Study Overview' },
  { to: '/daily', label: 'Daily' },
  { to: '/night', label: 'Night' },
  { to: '/weekly', label: 'Weekly' },
  { to: '/comparison', label: 'Comparison' },
  { to: '/data', label: 'Data Management' },
];

function DataModeBadge({ mode }: { mode: 'demo' | 'import' | 'google' }) {
  const labels = {
    demo: 'DEMO MODE',
    import: 'IMPORT MODE',
    google: 'GOOGLE MODE',
  } as const;
  return <StatusBadge variant={mode}>{labels[mode]}</StatusBadge>;
}

export default function Layout() {
  const location = useLocation();
  const structured = ['/', '/participant-data', '/daily', '/night', '/weekly', '/sleep'].includes(location.pathname);
  const studyQuery = useStudy(!structured);
  const study = studyQuery.data;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </span>
          Sleep Study
        </div>
        <nav>
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <header className="app-header" role="banner">
        <div className="app-header-info">
          <div className="app-header-title">
            <h1 style={{ fontSize: '1.05rem' }}>
              Sleep Quality Analysis Dashboard
              {!structured && study?.participant_label ? ` · ${study.participant_label}` : ''}
            </h1>
            {!structured && study && (
              <small>
                Study period: {formatLocalDate(study.start_date)} → {formatLocalDate(study.end_date)} ({study.days_total} days)
              </small>
            )}
          </div>
          {!structured && study && <DataModeBadge mode={study.data_mode} />}
        </div>
        <div className="app-header-right">
          {!structured && studyQuery.isLoading && (
            <span className="text-sm text-muted">Loading study info…</span>
          )}
          {!structured && studyQuery.isError && (
            <StatusBadge variant="danger">Study info unavailable</StatusBadge>
          )}
          {!structured && study && (
            <div className="flex items-center gap-2 flex-wrap">
              {study.data_mode === 'demo' && (
                <div className="demo-banner" role="note">
                  SYNTHETIC DEMO DATA — not real participant data
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                {study.freshness?.last_successful_sync ? (
                  <>
                    <span className="text-muted">
                      Last sync: {formatLocalDateTime(study.freshness.last_successful_sync)}
                    </span>
                    {study.freshness.is_stale ? (
                      <StatusBadge variant="stale" title={`Stale: ${study.freshness.stale_hours ?? '?'}h since last sync`}>
                        Stale
                        {study.freshness.stale_hours ? ` (${study.freshness.stale_hours}h)` : ''}
                      </StatusBadge>
                    ) : (
                      <StatusBadge variant="success">Fresh</StatusBadge>
                    )}
                  </>
                ) : (
                  <StatusBadge variant="muted">No sync yet</StatusBadge>
                )}
              </div>
              {study.data_mode === 'google' && (
                study.google_configured && study.google_connected ? (
                  <StatusBadge variant="success">Google Health: Connected</StatusBadge>
                ) : (
                  <StatusBadge variant="danger" title="OAuth project needs to be set up and authorized">
                    Google Health: NOT CONFIGURED — requires OAuth project eligibility
                  </StatusBadge>
                )
              )}
            </div>
          )}
        </div>
      </header>

      <main className="main-content" id="main-content" role="main">
        {!structured && studyQuery.isLoading && !study && <LoadingState title="Loading study configuration…" />}
        {!structured && studyQuery.isError && !study && (
          <ErrorState
            title="Could not load study configuration"
            errorMessage={studyQuery.error instanceof Error ? studyQuery.error.message : undefined}
            retry={() => studyQuery.refetch()}
          />
        )}
        {(structured || study) && <Outlet />}
      </main>
    </div>
  );
}
