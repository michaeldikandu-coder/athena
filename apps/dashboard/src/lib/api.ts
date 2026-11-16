export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
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
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'include',
      cache: 'no-store',
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the dashboard server.', 0, 'network_error');
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    // non-JSON response: the platform answers with plain text when the API crashed or timed out
  }

  if (!response.ok || !payload?.success) {
    if (!payload && response.status >= 500) {
      throw new ApiError('The Athena API is not answering. Check the server logs.', response.status, 'api_unreachable');
    }
    const message = payload?.error?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload?.error?.code, payload?.error?.details);
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
