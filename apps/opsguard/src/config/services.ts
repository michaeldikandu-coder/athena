import { z } from 'zod';
import { AppError, findConnection, logger } from '@athena/shared';

/**
 * OpsGuard only talks to services the user listed (Settings > Connections >
 * Monitored services) and log files the server operator listed. Agents pick
 * by name; they can never supply arbitrary URLs or paths. Health checks also
 * refuse private addresses in production (see health.ts).
 */

export const serviceSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]{1,60}$/, 'Use letters, numbers, dots, dashes or underscores (max 60)'),
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), 'URL must start with http:// or https://'),
  expectStatus: z.number().int().min(100).max(599).optional(),
  timeoutMs: z.number().int().min(500).max(30000).optional(),
});

export const servicesListSchema = z
  .array(serviceSchema)
  .max(25)
  .refine((list) => new Set(list.map((s) => s.name.toLowerCase())).size === list.length, 'Service names must be unique');

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
 * Services the current user asked OpsGuard to watch.
 */
export function getServices(): ServiceConfig[] {
  const parsed = servicesListSchema.safeParse(findConnection('services')?.config.services ?? []);
  return parsed.success ? parsed.data : [];
}

export function getService(name: string): ServiceConfig {
  const services = getServices();
  const service = services.find((s) => s.name === name);
  if (!service) {
    if (services.length === 0) {
      throw new AppError(
        'No services are configured for this account. Add them in Settings > Connections > Monitored services. Do not retry with other names.',
        { statusCode: 404 }
      );
    }
    throw new AppError(
      `Unknown service "${name}". Use one of these exact names: ${services.map((s) => s.name).join(', ')}`,
      { statusCode: 404 }
    );
  }
  return service;
}

/**
 * OPSGUARD_LOG_FILES='{"api":"/var/log/api/app.log"}'
 */
export function getLogSources(): Record<string, string> {
  return parseJsonEnv('OPSGUARD_LOG_FILES', logSourceSchema, {});
}
