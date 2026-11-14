import { AppError, findConnection, requireConnection } from '@athena/shared';
import { RestClient } from '../rest/rest-client';

/**
 * Bachs REST API client (https://docs.bachs.io). Each user connects their own
 * secret key in Settings > Connections; bachs() uses the key of the user whose
 * request or run is in progress.
 * sk_sandbox_ keys go to the sandbox, sk_live_ keys to production, matching
 * the official SDK. BACHS_BASE_URL overrides the endpoint.
 */

const SANDBOX_URL = 'https://sandbox-api.bachs.io';
const PRODUCTION_URL = 'https://api.bachs.io';

export function isBachsKey(key: string): boolean {
  return /^sk_(sandbox|live)_[A-Za-z0-9_-]{8,200}$/.test(key);
}

export function bachsEnvironmentForKey(key: string): 'sandbox' | 'production' {
  return key.startsWith('sk_sandbox_') ? 'sandbox' : 'production';
}

/** Environment of the current user's Bachs connection */
export function bachsEnvironment(): 'sandbox' | 'production' | null {
  const key = findConnection('bachs')?.secrets.apiKey;
  return key ? bachsEnvironmentForKey(key) : null;
}

/**
 * Client for a specific key. BACHS_BASE_URL (server setting) overrides the
 * endpoint for every user, e.g. for a self-hosted mock during development.
 */
export function createBachsClient(key: string): RestClient {
  if (!isBachsKey(key)) {
    throw new AppError('Bachs API key must start with sk_sandbox_ or sk_live_', { statusCode: 400 });
  }
  return new RestClient({
    service: 'bachs',
    baseURL: process.env.BACHS_BASE_URL || (key.startsWith('sk_sandbox_') ? SANDBOX_URL : PRODUCTION_URL),
    bearerToken: key,
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 20000,
    maxRetries: 2,
  });
}

/** Client for the current user's Bachs connection */
export function bachs(): RestClient {
  return createBachsClient(requireConnection('bachs').secrets.apiKey);
}

export function isBachsConfigured(): boolean {
  return Boolean(findConnection('bachs')?.secrets.apiKey);
}

/** Make one cheap authenticated call to confirm the key works */
export async function verifyBachsKey(key: string): Promise<{ environment: 'sandbox' | 'production' }> {
  await createBachsClient(key).get('/v1/payments', { limit: 1 });
  return { environment: bachsEnvironmentForKey(key) };
}

/** Bachs money is a decimal string paired with an ISO 4217 code, e.g. "75000.00 NGN" */
export function formatMoney(amount: string | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `${amount} ${(currency ?? '').toUpperCase()}`.trim();
}

/** Keep only the last 4 characters of an account number or phone */
export function maskTail(value: string | null | undefined, visible = 4): string | null {
  if (!value) return null;
  return value.length <= visible ? value : `${'•'.repeat(Math.min(value.length - visible, 6))}${value.slice(-visible)}`;
}

// ---------- Object shapes (subset of the documented fields) ----------

export interface BachsStatusChange {
  status: string;
  occurred_at: string;
  reason?: string | null;
}

/** GET /v1/payments/{payment_id} */
export interface BachsPayment {
  payment_id: string;
  status: string;
  amount: string;
  currency: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  reference?: string | null;
  checkout_id?: string | null;
  subscription_id?: string | null;
  billing_reason?: string | null;
  is_refundable?: boolean | null;
  amount_paid?: string | null;
  amount_remaining?: string | null;
  fee_usd?: string | null;
  fees?: { amount: string; currency: string } | null;
  payment_method?: string | null;
  channel?: string | null;
  narration?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
  customer?: { name?: string | null; email?: string | null } | null;
  line_items?: Array<Record<string, unknown>> | null;
  refunds?: string[] | null;
  status_history?: BachsStatusChange[] | null;
  payment_method_details?: {
    type?: string;
    card?: {
      brand?: string;
      last4?: string;
      exp_month?: number;
      exp_year?: number;
      cardholder_name?: string | null;
      fingerprint?: string | null;
    };
    bank_transfer?: {
      sender_name?: string | null;
      sender_bank?: string | null;
      sender_bank_code?: string | null;
      sender_account_number?: string | null;
      session_id?: string | null;
      narration?: string | null;
    };
    [key: string]: unknown;
  } | null;
}

/** GET /v1/payments list item */
export interface BachsPaymentListItem {
  id?: string | null;
  status: string;
  amount: string;
  currency: string;
  customer_name?: string | null;
  customer_email?: string | null;
  reference?: string | null;
  is_refundable?: boolean | null;
  amount_paid?: string | null;
  amount_remaining?: string | null;
  settlement_amount?: string | null;
  settlement_currency?: string | null;
  fee?: string | null;
  meta?: Record<string, unknown> | null;
  transaction_date?: string | null;
  completed_at?: string | null;
}

export interface BachsList<T> {
  items: T[];
  pagination?: { has_more?: boolean; limit?: number; offset?: number; returned?: number; total?: number };
  total?: number;
}

export interface BachsCustomer {
  customer_id: string;
  email: string;
  name?: string | null;
  phone_number?: string | null;
  metadata: Record<string, unknown>;
  billing_address?: { line1?: string | null; city?: string | null; state?: string | null; country?: string | null } | null;
  created_at: string;
  updated_at: string;
}

export interface BachsRefund {
  refund_id: string;
  charge_id: string;
  reference: string;
  status: 'processing' | 'success' | 'failed';
  requested_amount: string;
  refunded_amount?: string | null;
  refund_fee_amount?: string;
  fee_bearer?: string;
  reason?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface BachsDispute {
  dispute_id: string;
  charge_id: string;
  amount: string;
  currency: string;
  status: string;
  reason?: string | null;
  is_response_editable?: boolean;
  response_deadline_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  charge_amount?: string | null;
  charge_currency?: string | null;
}
