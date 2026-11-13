import path from 'path';
import dotenv from 'dotenv';

// Load the monorepo root .env, then a local one if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

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
  publicUrl: process.env.API_URL || `http://localhost:${process.env.PORT || process.env.API_PORT || 3001}`,
  allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
  /** Secret used to derive per-workflow webhook signing secrets */
  webhookSigningSecret: required('WEBHOOK_SIGNING_SECRET', 'dev-only-webhook-secret'),
  bachsWebhookSecret: process.env.BACHS_WEBHOOK_SECRET || '',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  cookieName: 'athena_token',
  /** Set "none" when the dashboard and API are on different sites (requires HTTPS) */
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none',
};
