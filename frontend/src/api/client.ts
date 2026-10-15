import { ACCESS_TOKEN_KEY, AUTH_EXPIRED_EVENT } from './authEvents';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

export { ACCESS_TOKEN_KEY };

function readToken(): string {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

/** The bearer token (if signed in), applied to EVERY request including uploads. */
export function authHeaders(): Record<string, string> {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ApiError {
  status: number;
  message: string;
  detail?: unknown;
}

export class ApiHttpError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.detail = detail;
  }
}

/** The request never produced an HTTP response (backend down, network, CORS). */
export class ApiConnectionError extends Error {
  constructor(message = 'Cannot reach the backend API. Check that the server is running and try again.') {
    super(message);
    this.name = 'ApiConnectionError';
  }
}

function describeDetail(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const parts = detail
      .map((d) => {
        if (typeof d === 'string') return d;
        if (typeof d === 'object' && d !== null) {
          const o = d as { msg?: unknown; loc?: unknown };
          const loc = Array.isArray(o.loc) ? o.loc.join('.') : '';
          return typeof o.msg === 'string' ? (loc ? `${loc}: ${o.msg}` : o.msg) : null;
        }
        return null;
      })
      .filter((x): x is string => !!x);
    if (parts.length > 0) return parts.join('; ');
  }
  return null;
}

/** An expired/revoked session: drop the token and tell the UI to show sign-in again. */
export { AUTH_EXPIRED_EVENT };

function handleUnauthorized(resp: Response): void {
  if (resp.status !== 401 || !readToken()) return;
  try {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // ignore storage failures
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function toHttpError(resp: Response): Promise<ApiHttpError> {
  handleUnauthorized(resp);
  let message = `HTTP ${resp.status}`;
  let detail: unknown = undefined;
  try {
    const body: unknown = await resp.json();
    if (typeof body === 'object' && body !== null) {
      const b = body as { message?: unknown; detail?: unknown };
      detail = b.detail ?? body;
      message =
        (typeof b.message === 'string' && b.message) || describeDetail(b.detail) || message;
    } else if (typeof body === 'string' && body) {
      message = body;
    }
  } catch {
    // body was not JSON (e.g. a proxy error page); keep the status-based message
  }
  if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
    message = `Backend unavailable (HTTP ${resp.status}). ${message === `HTTP ${resp.status}` ? '' : message}`.trim();
  } else if (resp.status >= 500 && message === `HTTP ${resp.status}`) {
    message = `Server error (HTTP ${resp.status}); the backend may be unavailable.`;
  }
  return new ApiHttpError(resp.status, message, detail);
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiConnectionError();
  }
}

async function parseJson<T>(resp: Response): Promise<T> {
  const contentType = resp.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiHttpError(
      resp.status,
      `Unexpected response type "${contentType || 'unknown'}" from the API (expected JSON).`
    );
  }
  try {
    return (await resp.json()) as T;
  } catch {
    throw new ApiHttpError(resp.status, 'The API returned invalid JSON.');
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  queryParams?: Record<string, string | number | boolean | undefined | null>
): Promise<T> {
  let url = `${API_BASE}${endpoint}`;

  if (queryParams) {
    const usp = new URLSearchParams();
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        usp.append(k, String(v));
      }
    });
    const qs = usp.toString();
    if (qs) {
      url += `?${qs}`;
    }
  }

  const resp = await send(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...authHeaders(),
      ...(options.headers ?? {}),
    },
  });

  if (!resp.ok) {
    throw await toHttpError(resp);
  }
  return parseJson<T>(resp);
}


export const apiClient = {
  get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<T>(endpoint, { method: 'GET' }, params);
  },
  post<T>(endpoint: string, body?: unknown) {
    return request<T>(endpoint, {
      method: 'POST',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  put<T>(endpoint: string, body?: unknown) {
    return request<T>(endpoint, {
      method: 'PUT',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  delete<T>(endpoint: string) {
    return request<T>(endpoint, { method: 'DELETE' });
  },
  async uploadFile<T>(endpoint: string, file: File): Promise<T> {
    const form = new FormData();
    form.append('file', file);
    const resp = await send(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    if (!resp.ok) {
      throw await toHttpError(resp);
    }
    return parseJson<T>(resp);
  },
  getDownloadUrl(endpoint: string): string {
    return `${API_BASE}${endpoint}`;
  },
};
