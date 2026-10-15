import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { isLegacyAvailable, useCapabilities, useStudy } from '../../api/hooks';
import { formatLocalDate, formatLocalDateTime } from '../../utils/format';
import StatusBadge from '../ui/StatusBadge';
import DataModeBadge from '../ui/DataModeBadge';
import LoadingState from '../ui/LoadingState';
import ErrorState from '../ui/ErrorState';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  /** Needs the legacy study schema; hidden when the backend reports it unavailable. */
  legacy?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Participant Data', end: true },
  { to: '/overview', label: 'Study Overview', legacy: true },
  { to: '/daily', label: 'Daily' },
  { to: '/night', label: 'Night' },
  { to: '/weekly', label: 'Weekly' },
  { to: '/comparison', label: 'Comparison', legacy: true },
  { to: '/data', label: 'Data Management', legacy: true },
];

/** Pages served by the structured (Supabase) participant API; they never load the legacy study. */
const STRUCTURED_PATHS = ['/', '/participant-data', '/daily', '/night', '/weekly', '/sleep'];

export default function Layout() {
  const location = useLocation();
  const structured = STRUCTURED_PATHS.includes(location.pathname);
  const capsQuery = useCapabilities();
  const legacyAvailable = isLegacyAvailable(capsQuery.data);
  // Legacy study data is requested only on legacy pages AND only when the backend
  // confirmed the complete legacy schema exists.
  const studyQuery = useStudy(!structured && legacyAvailable);
  const study = studyQuery.data;
  const showLegacyHeader = !structured && legacyAvailable;
  const navItems = NAV_ITEMS.filter((item) => !item.legacy || legacyAvailable);

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
            {navItems.map((item) => (
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
              {showLegacyHeader && study?.participant_label ? ` · ${study.participant_label}` : ''}
            </h1>
            {showLegacyHeader && study && (
              <small>
                Study period: {formatLocalDate(study.start_date)} → {formatLocalDate(study.end_date)} ({study.days_total} days)
              </small>
            )}
          </div>
          {showLegacyHeader && study && (
            <DataModeBadge
              mode={study.data_mode}
              googleConfigured={study.google_configured}
              googleConnected={study.google_connected}
            />
          )}
        </div>
        <div className="app-header-right">
          {showLegacyHeader && studyQuery.isLoading && (
            <span className="text-sm text-muted">Loading study info…</span>
          )}
          {showLegacyHeader && studyQuery.isError && (
            <StatusBadge variant="danger" role="alert">Study info unavailable</StatusBadge>
          )}
          {showLegacyHeader && study && (
            <div className="flex items-center gap-2 flex-wrap">
              {study.data_mode === 'demo' && (
                <StatusBadge variant="warning" role="note" className="demo-notice">
                  SYNTHETIC DEMO DATA — not real participant data
                </StatusBadge>
              )}
              <div className="flex items-center gap-2 text-sm">
                {study.freshness?.last_successful_sync ? (
                  <>
                    <span className="text-muted">
                      Last sync: {formatLocalDateTime(study.freshness.last_successful_sync)}
                    </span>
                    {study.freshness.is_stale ? (
                      <StatusBadge variant="warning" title={`Stale: ${study.freshness.stale_hours ?? '?'}h since last sync`}>
                        Stale
                        {study.freshness.stale_hours ? ` (${study.freshness.stale_hours}h)` : ''}
                      </StatusBadge>
                    ) : (
                      <StatusBadge variant="success">Fresh</StatusBadge>
                    )}
                  </>
                ) : (
                  <StatusBadge variant="info">No sync yet</StatusBadge>
                )}
              </div>
              {study.data_mode === 'google' && (
                study.google_configured === null || study.google_connected === null ? (
                  <StatusBadge variant="info" title="The backend does not report Google OAuth status">
                    Google Health: status not reported
                  </StatusBadge>
                ) : study.google_configured && study.google_connected ? (
                  <StatusBadge variant="success">Google Health: Connected</StatusBadge>
                ) : study.google_configured ? (
                  <StatusBadge variant="warning" title="Credentials exist but the OAuth authorization is not complete">
                    Google Health: not authorized
                  </StatusBadge>
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
        {structured && <Outlet />}
        {!structured && capsQuery.isLoading && <LoadingState title="Checking available features…" />}
        {!structured && capsQuery.isError && (
          <ErrorState
            title="Could not determine available features"
            errorMessage={capsQuery.error instanceof Error ? capsQuery.error.message : undefined}
            retry={() => capsQuery.refetch()}
          />
        )}
        {!structured && capsQuery.data && !legacyAvailable && (
          <div className="card" role="status">
            <div className="card-title">Legacy study data is not available</div>
            <p className="text-sm text-muted mt-2">
              This deployment does not have the original study database schema installed, so the
              legacy study pages are disabled. Use the participant pages (Participant Data, Daily,
              Night, Weekly) for the shared dataset.
            </p>
          </div>
        )}
        {!structured && legacyAvailable && studyQuery.isLoading && !study && (
          <LoadingState title="Loading study configuration…" />
        )}
        {!structured && legacyAvailable && studyQuery.isError && !study && (
          <ErrorState
            title="Could not load study configuration"
            errorMessage={studyQuery.error instanceof Error ? studyQuery.error.message : undefined}
            retry={() => studyQuery.refetch()}
          />
        )}
        {!structured && legacyAvailable && study && <Outlet />}
      </main>
    </div>
  );
}
