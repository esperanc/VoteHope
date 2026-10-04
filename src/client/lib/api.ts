export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  readonly status: number;
  readonly code: string;
  /** The whole JSON error body, for errors that carry details (e.g. import problems). */
  readonly body: unknown;

  constructor(status: number, code: string, body: unknown = null) {
    super(code);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

let onUnauthorized: (() => void) | null = null;

/** Called when an admin request is refused because the login has expired. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function send<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(0, 'network');
  }
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 401 && url.startsWith('/api/admin/') && !url.endsWith('/login')) onUnauthorized?.();
    throw new ApiError(response.status, data?.error ?? 'http_error', data);
  }
  return data as T;
}

export function api<T>(method: Method, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  return send<T>(url, {
    method,
    headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function upload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  return send<T>(url, { method: 'POST', body: form });
}
