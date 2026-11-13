import { AppError } from '@athena/shared';
import { RestClient } from '../rest/rest-client';

let client: RestClient | undefined;

/**
 * Stripe REST API client (https://docs.stripe.com/api). Uses STRIPE_SECRET_KEY.
 * Test-mode keys (sk_test_...) hit the real Stripe API against test data.
 */
export function stripe(): RestClient {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new AppError('STRIPE_SECRET_KEY is not configured', { statusCode: 503 });
  }
  client = new RestClient({
    service: 'stripe',
    baseURL: 'https://api.stripe.com',
    bearerToken: key,
    timeoutMs: 20000,
    maxRetries: 2,
  });
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export interface StripeList<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
}

/**
 * Format a Stripe minor-unit amount, e.g. 12345 usd -> "123.45 USD"
 */
export function formatAmount(amount: number, currency: string): string {
  const zeroDecimal = ['jpy', 'krw', 'vnd', 'clp', 'pyg', 'ugx', 'xaf', 'xof'];
  const value = zeroDecimal.includes(currency.toLowerCase()) ? amount : amount / 100;
  return `${value.toFixed(zeroDecimal.includes(currency.toLowerCase()) ? 0 : 2)} ${currency.toUpperCase()}`;
}
