const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

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

  const resp = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(sessionStorage.getItem('supabase-access-token') ? { Authorization: `Bearer ${sessionStorage.getItem('supabase-access-token')}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!resp.ok) {
    let message = `HTTP ${resp.status}`;
    let detail: unknown = undefined;
    try {
      const errBody = await resp.json();
      if (typeof errBody === 'object' && errBody !== null) {
        const m = (errBody as { message?: string; detail?: unknown }).message;
        const d = (errBody as { detail?: unknown }).detail;
        if (typeof m === 'string') message = m;
        detail = d ?? errBody;
      } else if (typeof errBody === 'string') {
        message = errBody;
      }
    } catch {
      try {
        message = await resp.text();
      } catch {
        // ignore
      }
    }
    throw new ApiHttpError(resp.status, message, detail);
  }

  const contentType = resp.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await resp.json()) as T;
  }
  return (await resp.text()) as unknown as T;
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
    const resp = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: sessionStorage.getItem('supabase-access-token') ? { Authorization: `Bearer ${sessionStorage.getItem('supabase-access-token')}` } : {},
      body: form,
    });
    if (!resp.ok) {
      let message = `HTTP ${resp.status}`;
      let detail: unknown = undefined;
      try {
        const errBody = await resp.json();
        if (typeof errBody === 'object' && errBody !== null) {
          const m = (errBody as { message?: string }).message;
          if (typeof m === 'string') message = m;
          detail = errBody;
        }
      } catch {
        // ignore
      }
      throw new ApiHttpError(resp.status, message, detail);
    }
    return (await resp.json()) as T;
  },
  getDownloadUrl(endpoint: string): string {
    return `${API_BASE}${endpoint}`;
  },
};
