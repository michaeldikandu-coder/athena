import { z } from 'zod';
import { AppError, logger } from '@athena/shared';

/**
 * OpsGuard only talks to services and log files listed in configuration.
 * Agents pick by name; they can never supply arbitrary URLs or paths, which
 * prevents SSRF and arbitrary file reads.
 */

const serviceSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_.-]{1,60}$/),
  url: z.string().url(),
  expectStatus: z.number().int().min(100).max(599).optional(),
  timeoutMs: z.number().int().min(500).max(30000).optional(),
});

export type ServiceConfig = z.infer<typeof serviceSchema>;

const logSourceSchema = z.record(z.string().regex(/^[a-zA-Z0-9_.-]{1,60}$/), z.string().min(1));

function parseJsonEnv<T>(name: string, schema: z.ZodType<T>, fallback: T): T {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    logger.warn(`Invalid ${name} configuration`, { issues: parsed.error.errors });
  } catch {
    logger.warn(`${name} is not valid JSON`);
  }
  return fallback;
}

/**
 * OPSGUARD_SERVICES='[{"name":"api","url":"https://api.example.com/health"}]'
 */
export function getServices(): ServiceConfig[] {
  return parseJsonEnv('OPSGUARD_SERVICES', z.array(serviceSchema), []);
}

export function getService(name: string): ServiceConfig {
  const service = getServices().find((s) => s.name === name);
  if (!service) {
    const known = getServices().map((s) => s.name).join(', ') || 'none configured';
    throw new AppError(`Unknown service "${name}". Configured services: ${known}`, { statusCode: 404 });
  }
  return service;
}

/**
 * OPSGUARD_LOG_FILES='{"api":"/var/log/api/app.log"}'
 */
export function getLogSources(): Record<string, string> {
  return parseJsonEnv('OPSGUARD_LOG_FILES', logSourceSchema, {});
}
