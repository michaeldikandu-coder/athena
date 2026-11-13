export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string; code?: string; details?: unknown };
  meta?: Record<string, any>;
}

/**
 * Call the Athena API through the dashboard's /api proxy (same origin, cookie auth)
 */
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<{ data: T; meta?: Record<string, any> }> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'include',
    cache: 'no-store',
    signal: options.signal,
  });

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    // non-JSON response
  }

  if (!response.ok || !payload?.success) {
    const message = payload?.error?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload?.error?.details);
  }
  return { data: payload.data as T, meta: payload.meta };
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const details = Array.isArray(error.details)
      ? error.details
          .map((d: any) => (d?.path?.length ? `${d.path.join('.')}: ${d.message}` : d?.message))
          .filter(Boolean)
          .join('; ')
      : '';
    return details ? `${error.message} (${details})` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
