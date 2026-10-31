export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler = () => undefined;

/** Lets the auth layer react once when any call finds the session gone (expired, deactivated, logged out elsewhere). */
export const setUnauthorizedHandler = (handler: UnauthorizedHandler) => {
  onUnauthorized = handler;
};

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  formData?: FormData;
  /** Login and similar calls expect 401 as an ordinary answer, not a lost session. */
  ignoreUnauthorized?: boolean;
}

function buildUrl(path: string, query?: Options['query']): string {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && params.set(k, String(v)));
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

export async function api<T = void>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, query, formData, ignoreUnauthorized } = options;
  const response = await fetch(buildUrl(path, query), {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (response.status === 401 && !ignoreUnauthorized) onUnauthorized();
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    throw new ApiError(response.status, message ?? 'Something went wrong', Array.isArray(payload.message) ? payload.message : []);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Downloads a file response (export / attachment) through the browser's save dialog. */
export async function download(path: string, query?: Options['query']): Promise<void> {
  const response = await fetch(buildUrl(path, query), { credentials: 'same-origin' });
  if (!response.ok) throw new ApiError(response.status, 'Download failed');
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="([^"]+)"/i.exec(disposition)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : (plain ?? 'download');

  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}
