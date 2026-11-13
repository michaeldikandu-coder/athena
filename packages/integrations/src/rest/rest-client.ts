import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, Method } from 'axios';
import { IntegrationError, logger, sleep } from '@athena/shared';

export interface RestClientOptions {
  /** Service name used in errors and logs */
  service: string;
  baseURL: string;
  headers?: Record<string, string>;
  /** Bearer token, added as Authorization header */
  bearerToken?: string;
  /** HTTP basic auth */
  basicAuth?: { username: string; password: string };
  timeoutMs?: number;
  maxRetries?: number;
}

export interface RestRequest {
  method: Method;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Send body as application/x-www-form-urlencoded (e.g. Stripe) */
  form?: boolean;
  headers?: Record<string, string>;
  /** Retry non-idempotent requests too. Default: only GET/HEAD/PUT/DELETE retry. */
  retryUnsafe?: boolean;
  /** Idempotency key header value, for APIs that support it */
  idempotencyKey?: string;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

/**
 * Encode nested objects the way Stripe and many form APIs expect:
 * { metadata: { a: 1 } } -> metadata[a]=1
 */
export function encodeForm(data: unknown, prefix = ''): string {
  const parts: string[] = [];
  const add = (key: string, value: unknown): void => {
    if (value === undefined) return;
    if (value === null) {
      parts.push(`${encodeURIComponent(key)}=`);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => add(`${key}[${i}]`, item));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) add(`${key}[${k}]`, v);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  };
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      add(prefix ? `${prefix}[${k}]` : k, v);
    }
  }
  return parts.join('&');
}

/**
 * HTTP client for external services with timeouts, retries with backoff on
 * transient failures, and errors that never include credentials.
 */
export class RestClient {
  private http: AxiosInstance;
  private options: RestClientOptions;

  constructor(options: RestClientOptions) {
    this.options = options;
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (options.bearerToken) headers.Authorization = `Bearer ${options.bearerToken}`;

    this.http = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeoutMs ?? 15000,
      headers,
      auth: options.basicAuth,
      validateStatus: () => true,
    });
  }

  async request<T = any>(req: RestRequest): Promise<T> {
    const maxRetries = this.options.maxRetries ?? 2;
    const canRetry = req.retryUnsafe || SAFE_METHODS.has(req.method.toUpperCase()) || !!req.idempotencyKey;

    const headers: Record<string, string> = { ...req.headers };
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;

    let data: unknown = req.body;
    if (req.form && req.body !== undefined) {
      data = encodeForm(req.body);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const config: AxiosRequestConfig = {
      method: req.method,
      url: req.path,
      params: req.query
        ? Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== undefined))
        : undefined,
      data,
      headers,
    };

    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        const response = await this.http.request(config);
        logger.debug(`${this.options.service} ${req.method} ${req.path}`, {
          status: response.status,
          ms: Date.now() - started,
        });

        if (response.status >= 200 && response.status < 300) {
          return response.data as T;
        }
        if (canRetry && attempt < maxRetries && RETRYABLE_STATUS.has(response.status)) {
          await sleep(this.backoff(attempt, response.headers['retry-after']));
          continue;
        }
        throw new IntegrationError(
          this.options.service,
          `${req.method} ${req.path} returned ${response.status}: ${this.describeError(response.data)}`,
          { context: { status: response.status } }
        );
      } catch (error) {
        if (error instanceof IntegrationError) throw error;
        const axiosError = error as AxiosError;
        if (canRetry && attempt < maxRetries) {
          await sleep(this.backoff(attempt));
          continue;
        }
        throw new IntegrationError(
          this.options.service,
          `${req.method} ${req.path} failed: ${axiosError.code || axiosError.message}`,
          { cause: axiosError }
        );
      }
    }
  }

  get<T = any>(path: string, query?: RestRequest['query']): Promise<T> {
    return this.request<T>({ method: 'GET', path, query });
  }

  post<T = any>(path: string, body?: unknown, extra: Partial<RestRequest> = {}): Promise<T> {
    return this.request<T>({ method: 'POST', path, body, ...extra });
  }

  patch<T = any>(path: string, body?: unknown, extra: Partial<RestRequest> = {}): Promise<T> {
    return this.request<T>({ method: 'PATCH', path, body, ...extra });
  }

  private backoff(attempt: number, retryAfter?: string): number {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 10000);
    return Math.min(500 * 2 ** attempt, 5000) + Math.floor(Math.random() * 200);
  }

  private describeError(data: unknown): string {
    if (!data) return 'no body';
    if (typeof data === 'string') return data.slice(0, 300);
    const obj = data as Record<string, any>;
    return String(obj.error?.message || obj.message || JSON.stringify(obj).slice(0, 300));
  }
}
