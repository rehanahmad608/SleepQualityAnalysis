import { useRef, useState, useEffect } from 'react';
import { useImportJSON, useRegenerateDemo, useStartSync, useStudy, useSyncRun } from '../api/hooks';
import type { ImportResult, StudyConfig } from '../types';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import StatusBadge from '../components/ui/StatusBadge';
import { formatLocalDateTime } from '../utils/format';
import { DataTable } from '../components/ui/DataTable';

const EXPECTED_SCHEMA_VERSION = 1;

interface ImportPayloadV1 {
  schema_version?: number;
}

function validateClientSide(file: File): Promise<{ ok: boolean; parsed?: ImportPayloadV1; error?: string; rejected?: { record_index: number; reason: string }[] }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve({ ok: false, error: 'Could not read file' });
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const parsed = JSON.parse(text) as ImportPayloadV1;
        if (!parsed || typeof parsed !== 'object') {
          resolve({ ok: false, error: 'Root must be a JSON object' });
          return;
        }
        if (parsed.schema_version !== undefined && parsed.schema_version !== EXPECTED_SCHEMA_VERSION) {
          resolve({
            ok: false,
            error: `Unsupported schema_version: ${parsed.schema_version}. Expected: ${EXPECTED_SCHEMA_VERSION}`,
            rejected: [{ record_index: 0, reason: `Unsupported schema_version ${parsed.schema_version}` }],
          });
          return;
        }
        resolve({ ok: true, parsed });
      } catch (e) {
        resolve({ ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` });
      }
    };
    reader.readAsText(file);
  });
}

function DataModeCard({ mode, study }: { mode: StudyConfig['data_mode']; study: StudyConfig }) {
  const regenerateDemo = useRegenerateDemo();

  if (mode === 'demo') {
    return (
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title flex items-center gap-2">
              <StatusBadge variant="demo">DEMO MODE</StatusBadge> Demo data management
            </div>
            <div className="card-subtitle">Synthetic, deterministic data is generated on the fly. No real participant data.</div>
          </div>
        </div>
        <p className="help-text">
          Demo mode exists to validate the UI/UX pipeline without connecting any real data source.
          Regenerating replaces the in-memory demo set with a fresh random sample.
        </p>
        <div className="mt-4">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => regenerateDemo.mutate()}
            disabled={regenerateDemo.isPending}
          >
            {regenerateDemo.isPending ? 'Regenerating…' : 'Regenerate Demo Data'}
          </button>
          {regenerateDemo.isError && (
            <div className="text-xs mt-2" style={{ color: 'var(--danger)' }}>
              Failed: {regenerateDemo.error instanceof Error ? regenerateDemo.error.message : String(regenerateDemo.error)}
            </div>
          )}
          {regenerateDemo.isSuccess && (
            <div className="text-xs mt-2" style={{ color: 'var(--success)' }}>
              Demo study regenerated.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'import') {
    return <ImportPanel />;
  }

  return <GoogleSyncPanel study={study} />;
}

function ImportPanel() {
  const [dragActive, setDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; error?: string; rejected?: { record_index: number; reason: string }[] } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportJSON();

  useEffect(() => {
    if (!pendingFile) {
      setValidation(null);
      return;
    }
    setProgress(10);
    validateClientSide(pendingFile)
      .then((res) => {
        setProgress(40);
        if (!res.ok) {
          setValidation({ ok: false, error: res.error, rejected: res.rejected });
          setProgress(null);
          return;
        }
        setValidation({ ok: true });
        setProgress(60);
        importMutation.mutate(
          { file: pendingFile },
          {
            onSettled: () => setProgress(null),
          }
        );
      })
      .catch((e) => {
        setValidation({ ok: false, error: String(e) });
        setProgress(null);
      });
  }, [pendingFile]);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setPendingFile(f);
  };

  const result: ImportResult | undefined = importMutation.data ?? undefined;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title flex items-center gap-2">
            <StatusBadge variant="import">IMPORT MODE</StatusBadge> Upload a study JSON export
          </div>
          <div className="card-subtitle">Schema v1 JSON file. Client-side validation runs first; backend performs the authoritative validation.</div>
        </div>
      </div>

      <div
        className={`dropzone ${dragActive ? 'active' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label="Drop JSON file here or click to select"
      >
        <div className="dropzone-title">Drop study JSON file here, or click to select</div>
        <div className="dropzone-desc">
          Accepts a single <code>.json</code> file matching schema v1. Client-side schema validation runs before upload.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPendingFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {pendingFile && (
        <div className="mt-3 text-sm">
          <div className="font-medium">File: {pendingFile.name} ({(pendingFile.size / 1024).toFixed(1)} KB)</div>
          {progress !== null && (
            <div className="mt-2">
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-muted mt-1">
                {progress < 50 ? 'Validating client-side…' : progress < 100 ? 'Uploading…' : 'Done'}
              </div>
            </div>
          )}
          {validation && !validation.ok && (
            <div className="mt-2" style={{ color: 'var(--danger)' }}>
              <div className="font-medium">Client-side validation failed:</div>
              <div className="text-xs mt-1">{validation.error}</div>
              {validation.rejected && validation.rejected.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-medium">Rejected records ({validation.rejected.length})</div>
                  <DataTable
                    className="mt-1"
                    columns={[
                      { key: 'record_index', header: 'Record #' },
                      { key: 'reason', header: 'Reason' },
                    ]}
                    data={validation.rejected}
                    getRowKey={(r, i) => i}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {importMutation.isError && (
        <div className="mt-3">
          <ErrorState
            title="Upload failed"
            errorMessage={importMutation.error instanceof Error ? importMutation.error.message : undefined}
          />
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <StatusBadge variant="success">{result.accepted_records} accepted</StatusBadge>
            {result.rejected_records > 0 ? (
              <StatusBadge variant="danger">{result.rejected_records} rejected</StatusBadge>
            ) : (
              <StatusBadge variant="muted">No rejections</StatusBadge>
            )}
            {!result.schema_version_valid && <StatusBadge variant="warning">Schema version mismatch</StatusBadge>}
          </div>
          {result.warnings && result.warnings.length > 0 && (
            <div className="text-sm mb-2">
              <div className="font-medium text-sm mb-1">Warnings:</div>
              <ul className="text-xs text-muted" style={{ paddingLeft: 18 }}>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {result.rejected_reasons && result.rejected_reasons.length > 0 && (
            <DataTable
              className="mt-2"
              columns={[
                { key: 'record_index', header: 'Record #' },
                { key: 'reason', header: 'Reason' },
              ]}
              data={result.rejected_reasons}
              getRowKey={(r, i) => i}
            />
          )}
        </div>
      )}

      <p className="help-text mt-4">
        <p><strong>Help:</strong> The JSON import endpoint expects a top-level object including <code>study</code>, daily summaries, and raw records under schema version <strong>{EXPECTED_SCHEMA_VERSION}</strong>. If the server detects structural problems, individual rejected records are reported above.</p>
      </p>
    </div>
  );
}

function GoogleSyncPanel({ study }: { study: StudyConfig }) {
  const startSync = useStartSync();
  const [runId, setRunId] = useState<string | null>(null);
  const syncRun = useSyncRun(runId ?? '');

  useEffect(() => {
    if (startSync.isSuccess && startSync.data?.run_id) {
      setRunId(startSync.data.run_id);
    }
  }, [startSync.isSuccess, startSync.data]);

  const configured = study.google_configured;
  const connected = study.google_connected;

  const statusColor = !configured
    ? 'error'
    : !connected
    ? 'warning'
    : syncRun.data?.status === 'failed'
    ? 'error'
    : syncRun.data?.status === 'running' || syncRun.data?.status === 'pending'
    ? 'running'
    : 'ok';

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title flex items-center gap-2">
            <StatusBadge variant="google">GOOGLE HEALTH MODE</StatusBadge> Google Health Connect sync
          </div>
          <div className="card-subtitle">
            Periodically pulls sleep, steps, and HR samples from Google Health Connect via server-to-server OAuth.
          </div>
        </div>
      </div>

      <div className="sync-status-row" role="status" aria-label="Google Health connection status">
        <span className={`status-indicator ${statusColor}`} aria-hidden="true" />
        <div className="flex-1">
          {!configured ? (
            <div>
              <div className="font-medium" style={{ color: 'var(--danger)' }}>
                NOT CONFIGURED — requires OAuth project eligibility
              </div>
              <div className="text-xs text-muted mt-1">
                Set up a Google OAuth client with the Health Connect API scopes, then store credentials on the backend.
                Without a valid OAuth project, this mode cannot be used.
              </div>
            </div>
          ) : !connected ? (
            <div>
              <div className="font-medium" style={{ color: 'var(--warning)' }}>
                Configured, but not yet authorized
              </div>
              <div className="text-xs text-muted mt-1">
                The backend has credentials, but the participant has not completed the OAuth authorization flow yet.
              </div>
            </div>
          ) : (
            <div>
              <div className="font-medium" style={{ color: 'var(--success)' }}>
                Connected — Google Health authorized
              </div>
              <div className="text-xs text-muted mt-1">
                You can start a manual sync or wait for the next scheduled run.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sync-status-row" role="status" aria-label="Last sync status">
        <span className={`status-indicator ${study.freshness?.is_stale ? 'warning' : 'ok'}`} aria-hidden="true" />
        <div className="flex-1">
          <div className="font-medium">
            Last successful sync: {study.freshness?.last_successful_sync ? formatLocalDateTime(study.freshness.last_successful_sync) : 'Never'}
          </div>
          {study.freshness?.is_stale && (
            <div className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
              Stale: {study.freshness.stale_hours ?? '?'}h since last successful sync
            </div>
          )}
        </div>
      </div>

      {(runId || startSync.isPending) && syncRun.data !== undefined && (
        <div className="sync-status-row" role="status" aria-label="Current sync run">
          <span
            className={`status-indicator ${
              startSync.isPending || syncRun.data?.status === 'running' || syncRun.data?.status === 'pending'
                ? 'running'
                : syncRun.data?.status === 'failed'
                ? 'error'
                : 'ok'
            }`}
            aria-hidden="true"
          />
          <div className="flex-1">
            <div className="font-medium">
              Run {syncRun.data?.run_id ?? runId}: {formatRunStatus(syncRun.data?.status)}
            </div>
            {syncRun.data && (
              <div className="text-xs text-muted mt-1 flex gap-3 flex-wrap">
                <span>Started: {syncRun.data.started_at ? formatLocalDateTime(syncRun.data.started_at) : '—'}</span>
                <span>Finished: {syncRun.data.finished_at ? formatLocalDateTime(syncRun.data.finished_at) : '—'}</span>
                <span>
                  Records: {syncRun.data.records_attempted ?? 0} attempted · {syncRun.data.records_succeeded ?? 0} ok ·{' '}
                  {syncRun.data.records_failed ?? 0} failed
                </span>
              </div>
            )}
            {syncRun.data?.error_message && (
              <div className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                Error: {syncRun.data.error_message}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => startSync.mutate()}
          disabled={startSync.isPending || !configured || !connected}
        >
          {startSync.isPending ? 'Starting sync…' : 'Start Sync'}
        </button>
        {startSync.isError && (
          <span className="text-xs" style={{ color: 'var(--danger)' }}>
            Could not start sync: {startSync.error instanceof Error ? startSync.error.message : String(startSync.error)}
          </span>
        )}
      </div>

      <p className="help-text mt-4">
        <p><strong>Help:</strong> Starting a sync returns HTTP 202 (Accepted) with a <code>run_id</code>. The frontend then polls <code>/api/v1/sync/runs/:id</code> every 2s until the run reaches <code>completed</code> or <code>failed</code>.</p>
        <p><strong>NOT CONFIGURED scenario:</strong> When <code>google_configured</code> is false, no OAuth client is available on the backend. This UI clearly surfaces that state instead of pretending sync can succeed.</p>
      </p>
    </div>
  );
}

function formatRunStatus(s: string | undefined): string {
  switch (s) {
    case 'pending':
      return 'Queued';
    case 'running':
      return 'Running…';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Unknown';
  }
}

export default function DataManagementPage() {
  const studyQuery = useStudy();
  const study = studyQuery.data;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Data Management</h1>
          <p className="page-subtitle">
            Manage the data backend: demo regeneration, JSON import, or Google Health sync
          </p>
        </div>
      </div>

      {studyQuery.isLoading && !study && <LoadingState title="Loading data mode…" />}
      {studyQuery.isError && !study && (
        <ErrorState
          title="Could not load study mode"
          errorMessage={studyQuery.error instanceof Error ? studyQuery.error.message : undefined}
          retry={() => studyQuery.refetch()}
        />
      )}

      {study && (
        <>
          <section className="card mb-4">
            <div className="card-header">
              <div>
                <div className="card-title">Current data mode</div>
                <div className="card-subtitle">
                  The active mode controls which panel below is used to supply data to every view.
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {(['demo', 'import', 'google'] as const).map((m) => (
                  <StatusBadge
                    key={m}
                    variant={study.data_mode === m ? m : 'muted'}
                  >
                    {study.data_mode === m ? '● ' : '○ '}
                    {m === 'demo' ? 'DEMO' : m === 'import' ? 'IMPORT' : 'GOOGLE'}
                  </StatusBadge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 text-sm">
              <div>
                <div className="text-xs text-muted">Study ID</div>
                <div className="font-medium">{study.study_id}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Participant</div>
                <div className="font-medium">{study.participant_label}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Active mode</div>
                <div className="font-medium">
                  <StatusBadge variant={study.data_mode}>
                    {study.data_mode.toUpperCase()} MODE
                  </StatusBadge>
                </div>
              </div>
            </div>
          </section>

          <DataModeCard mode={study.data_mode} study={study} />
        </>
      )}
    </div>
  );
}
