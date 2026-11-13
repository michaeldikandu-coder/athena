import { AppError } from '@athena/shared';
import { RestClient } from '../rest/rest-client';

/**
 * Bachs REST API client (https://docs.bachs.io). Uses BACHS_API_KEY.
 * sk_sandbox_ keys go to the sandbox, sk_live_ keys to production, matching
 * the official SDK. BACHS_BASE_URL overrides the endpoint.
 */

const SANDBOX_URL = 'https://sandbox-api.bachs.io';
const PRODUCTION_URL = 'https://api.bachs.io';

let client: RestClient | undefined;

export function bachsEnvironment(): 'sandbox' | 'production' | null {
  const key = process.env.BACHS_API_KEY;
  if (!key) return null;
  return key.startsWith('sk_sandbox_') ? 'sandbox' : 'production';
}

export function bachs(): RestClient {
  if (client) return client;
  const key = process.env.BACHS_API_KEY;
  if (!key) {
    throw new AppError('BACHS_API_KEY is not configured', { statusCode: 503 });
  }
  if (!key.startsWith('sk_sandbox_') && !key.startsWith('sk_live_')) {
    throw new AppError('BACHS_API_KEY must start with sk_sandbox_ or sk_live_', { statusCode: 503 });
  }
  const baseURL =
    process.env.BACHS_BASE_URL || (key.startsWith('sk_sandbox_') ? SANDBOX_URL : PRODUCTION_URL);

  client = new RestClient({
    service: 'bachs',
    baseURL,
    bearerToken: key,
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 20000,
    maxRetries: 2,
  });
  return client;
}

export function isBachsConfigured(): boolean {
  return Boolean(process.env.BACHS_API_KEY);
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
