import axios from 'axios';
import { ServiceConfig } from './config/services';

export interface HealthResult {
  name: string;
  url: string;
  healthy: boolean;
  status: number | null;
  latencyMs: number;
  error?: string;
  bodyPreview?: string;
  checkedAt: string;
}

/**
 * Perform a real HTTP health check. Redirects are not followed so a
 * configured URL cannot bounce the request to an internal address.
 */
export async function checkHealth(service: ServiceConfig, includeBody = false): Promise<HealthResult> {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const response = await axios.get(service.url, {
      timeout: service.timeoutMs ?? 8000,
      maxRedirects: 0,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: (data) => data,
      headers: { 'User-Agent': 'athena-opsguard/1.0' },
      maxContentLength: 1024 * 1024,
    });
    const latencyMs = Date.now() - started;
    const expected = service.expectStatus;
    const healthy = expected ? response.status === expected : response.status >= 200 && response.status < 400;
    return {
      name: service.name,
      url: service.url,
      healthy,
      status: response.status,
      latencyMs,
      ...(includeBody && typeof response.data === 'string'
        ? { bodyPreview: response.data.slice(0, 500) }
        : {}),
      checkedAt,
    };
  } catch (error) {
    const err = error as { code?: string; message: string };
    return {
      name: service.name,
      url: service.url,
      healthy: false,
      status: null,
      latencyMs: Date.now() - started,
      error: err.code || err.message,
      checkedAt,
    };
  }
}
