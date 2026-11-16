import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load the monorepo root .env (from apps/api or apps/dashboard, compiled or
// bundled), then a local one. Existing environment variables always win, and
// hosts like Vercel have no .env file at all.
// NODE_ENV is never taken from a file: Next.js sets it, and a stray
// NODE_ENV=development would switch a production build to dev mode.
for (const candidate of [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '.env'),
]) {
  if (!fs.existsSync(candidate)) continue;
  for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(candidate)))) {
    if (key !== 'NODE_ENV' && process.env[key] === undefined) process.env[key] = value;
  }
}

const isProduction = process.env.NODE_ENV === 'production';

function required(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (!isProduction && devFallback !== undefined) return devFallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

const jwtSecret = required('JWT_SECRET', 'dev-only-insecure-secret-change-me-0123456789');
if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
// Encrypts the credentials users connect (Bachs, GitHub, Slack)
if (isProduction && (process.env.ENCRYPTION_KEY ?? '').length < 32) {
  throw new Error('ENCRYPTION_KEY must be set to at least 32 characters in production');
}

/**
 * Public base URL of the app, used for webhook URLs and run continuations.
 * API_URL (or APP_URL) wins; on Vercel the production domain is used.
 */
function publicUrl(): string {
  const explicit = process.env.API_URL || process.env.APP_URL;
  if (explicit) return explicit;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_ENV === 'production') {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || process.env.API_PORT || 3000}`;
}

export const config = {
  isProduction,
  port: Number(process.env.PORT || process.env.API_PORT || 3001),
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/athena'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  /** Origins allowed to call the API with credentials (comma separated) */
  corsOrigins: (process.env.CORS_ORIGINS || process.env.DASHBOARD_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  /** Public base URL of this API, used to show webhook URLs */
  publicUrl: publicUrl(),
  allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
  /** Secret used to derive per-workflow webhook signing secrets */
  webhookSigningSecret: required('WEBHOOK_SIGNING_SECRET', 'dev-only-webhook-secret'),
  cookieName: 'athena_token',
  /** Set "none" when the dashboard and API are on different sites (requires HTTPS) */
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none',
};
