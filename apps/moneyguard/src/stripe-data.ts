import { formatAmount, stripe, StripeList } from '@athena/integrations';

/**
 * Subset of the Stripe Charge object used by MoneyGuard
 * (https://docs.stripe.com/api/charges/object)
 */
export interface StripeCharge {
  id: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed';
  paid: boolean;
  refunded: boolean;
  disputed: boolean;
  captured: boolean;
  created: number;
  customer: string | null;
  description: string | null;
  failure_code: string | null;
  failure_message: string | null;
  receipt_email: string | null;
  metadata: Record<string, string>;
  payment_intent: string | null;
  outcome: {
    network_status?: string;
    reason?: string | null;
    risk_level?: string;
    risk_score?: number;
    seller_message?: string;
    type?: string;
  } | null;
  billing_details: {
    email: string | null;
    name: string | null;
    address: { country: string | null; postal_code: string | null } | null;
  };
  payment_method_details: {
    type: string;
    card?: {
      brand: string;
      country: string | null;
      last4: string;
      funding: string;
      checks?: {
        cvc_check: string | null;
        address_postal_code_check: string | null;
        address_line1_check: string | null;
      };
    };
  } | null;
}

export interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  created: number;
  delinquent: boolean;
  balance: number;
  currency: string | null;
  address: { country: string | null } | null;
  metadata: Record<string, string>;
}

export function summarizeCharge(charge: StripeCharge): Record<string, unknown> {
  const card = charge.payment_method_details?.card;
  return {
    id: charge.id,
    amount: charge.amount,
    amountFormatted: formatAmount(charge.amount, charge.currency),
    currency: charge.currency,
    status: charge.status,
    createdAt: new Date(charge.created * 1000).toISOString(),
    customerId: charge.customer,
    description: charge.description,
    paymentIntentId: charge.payment_intent,
    failure: charge.failure_code
      ? { code: charge.failure_code, message: charge.failure_message }
      : null,
    refunded: charge.refunded,
    amountRefunded: charge.amount_refunded,
    disputed: charge.disputed,
    radar: charge.outcome
      ? {
          riskLevel: charge.outcome.risk_level,
          riskScore: charge.outcome.risk_score,
          networkStatus: charge.outcome.network_status,
          reason: charge.outcome.reason,
          sellerMessage: charge.outcome.seller_message,
        }
      : null,
    card: card
      ? {
          brand: card.brand,
          last4: card.last4,
          country: card.country,
          funding: card.funding,
          cvcCheck: card.checks?.cvc_check ?? null,
          postalCheck: card.checks?.address_postal_code_check ?? null,
        }
      : null,
    billingCountry: charge.billing_details?.address?.country ?? null,
    billingEmail: charge.billing_details?.email ?? charge.receipt_email,
    metadata: charge.metadata,
  };
}

export async function fetchCharge(chargeId: string): Promise<StripeCharge> {
  return stripe().get<StripeCharge>(`/v1/charges/${encodeURIComponent(chargeId)}`);
}

export async function fetchCustomer(customerId: string): Promise<StripeCustomer> {
  return stripe().get<StripeCustomer>(`/v1/customers/${encodeURIComponent(customerId)}`);
}

export async function fetchCustomerCharges(
  customerId: string,
  limit: number,
  sinceDays?: number
): Promise<StripeCharge[]> {
  const query: Record<string, string | number> = { customer: customerId, limit };
  if (sinceDays) {
    query['created[gte]'] = Math.floor(Date.now() / 1000) - sinceDays * 86400;
  }
  const list = await stripe().get<StripeList<StripeCharge>>('/v1/charges', query);
  return list.data;
}

export async function fetchRecentCharges(limit = 20): Promise<StripeCharge[]> {
  const list = await stripe().get<StripeList<StripeCharge>>('/v1/charges', { limit });
  return list.data;
}
