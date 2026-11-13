import {
  bachs,
  BachsCustomer,
  BachsDispute,
  BachsList,
  BachsPayment,
  BachsPaymentListItem,
  BachsRefund,
  formatMoney,
  maskTail,
} from '@athena/integrations';

/**
 * Data access for MoneyGuard on the Bachs API (https://docs.bachs.io).
 * A payment is identified by its charge id. Payments carry the customer's
 * name and email but not a customer id, so history is matched by email.
 */

const PAGE_SIZE = 100;
const MAX_HISTORY_PAGES = 3;

export async function fetchPayment(chargeId: string): Promise<BachsPayment> {
  return bachs().get<BachsPayment>(`/v1/payments/${encodeURIComponent(chargeId)}`);
}

export async function fetchRecentPayments(limit = 25): Promise<BachsPaymentListItem[]> {
  const page = await bachs().get<BachsList<BachsPaymentListItem>>('/v1/payments', { limit });
  return page.items;
}

/**
 * Payments for one customer email, newest first, scanning at most
 * MAX_HISTORY_PAGES pages of the account's payment list.
 */
export async function fetchPaymentsByEmail(
  email: string,
  options: { sinceDays?: number; limit?: number } = {}
): Promise<{ payments: BachsPaymentListItem[]; scanned: number; complete: boolean }> {
  const target = email.trim().toLowerCase();
  const since = options.sinceDays ? Date.now() - options.sinceDays * 86400 * 1000 : 0;
  const matches: BachsPaymentListItem[] = [];
  let scanned = 0;
  let complete = false;

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const list = await bachs().get<BachsList<BachsPaymentListItem>>('/v1/payments', {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    scanned += list.items.length;
    let reachedWindowEnd = false;
    for (const item of list.items) {
      const when = new Date(item.transaction_date || item.completed_at || 0).getTime();
      if (since && when && when < since) {
        reachedWindowEnd = true;
        continue;
      }
      if ((item.customer_email || '').toLowerCase() === target) matches.push(item);
    }
    if (!list.pagination?.has_more || list.items.length < PAGE_SIZE || reachedWindowEnd) {
      complete = true;
      break;
    }
  }

  return { payments: matches.slice(0, options.limit ?? 50), scanned, complete };
}

export async function findCustomerByEmail(email: string): Promise<BachsCustomer | null> {
  const list = await bachs().get<BachsList<BachsCustomer>>('/v1/customers', { search: email, limit: 10 });
  const target = email.trim().toLowerCase();
  return list.items.find((c) => c.email?.toLowerCase() === target) ?? null;
}

export async function fetchCustomer(customerId: string): Promise<BachsCustomer> {
  return bachs().get<BachsCustomer>(`/v1/customers/${encodeURIComponent(customerId)}`);
}

export async function fetchRecentDisputes(limit = 100): Promise<BachsDispute[]> {
  const list = await bachs().get<BachsList<BachsDispute>>('/v1/disputes', { limit });
  return list.items;
}

export async function fetchDispute(disputeId: string): Promise<BachsDispute> {
  return bachs().get<BachsDispute>(`/v1/disputes/${encodeURIComponent(disputeId)}`);
}

export async function fetchRefundForCharge(chargeId: string): Promise<BachsRefund | null> {
  try {
    return await bachs().get<BachsRefund>(`/v1/refunds/by-charge/${encodeURIComponent(chargeId)}`);
  } catch (error) {
    if ((error as { context?: { status?: number } }).context?.status === 404) return null;
    throw error;
  }
}

/**
 * Agent-facing view of a payment. Sender account numbers are masked; the
 * agent never needs them in full.
 */
export function summarizePayment(p: BachsPayment): Record<string, unknown> {
  const details = p.payment_method_details;
  const failures = (p.status_history ?? []).filter((h) => /fail|declin|expir|cancel/i.test(h.status));
  return {
    chargeId: p.payment_id,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    amountFormatted: formatMoney(p.amount, p.currency),
    amountPaid: p.amount_paid,
    amountRemaining: p.amount_remaining,
    createdAt: p.created_at,
    completedAt: p.completed_at ?? null,
    reference: p.reference ?? null,
    checkoutId: p.checkout_id ?? null,
    billingReason: p.billing_reason ?? null,
    subscriptionId: p.subscription_id ?? null,
    paymentMethod: p.payment_method ?? null,
    channel: p.channel ?? null,
    message: p.message ?? null,
    customer: { name: p.customer?.name ?? null, email: p.customer?.email ?? null },
    isRefundable: p.is_refundable ?? null,
    refundIds: p.refunds ?? [],
    fee: p.fees ? formatMoney(p.fees.amount, p.fees.currency) : null,
    payer: details
      ? {
          type: details.type ?? null,
          card: details.card
            ? {
                brand: details.card.brand,
                last4: details.card.last4,
                cardholderName: details.card.cardholder_name ?? null,
                fingerprint: details.card.fingerprint ?? null,
              }
            : undefined,
          bankTransfer: details.bank_transfer
            ? {
                senderName: details.bank_transfer.sender_name ?? null,
                senderBank: details.bank_transfer.sender_bank ?? null,
                senderAccount: maskTail(details.bank_transfer.sender_account_number),
                narration: details.bank_transfer.narration ?? null,
              }
            : undefined,
        }
      : null,
    statusHistory: (p.status_history ?? []).map((h) => ({ status: h.status, at: h.occurred_at, reason: h.reason ?? null })),
    failedAttempts: failures.length,
    metadata: p.meta ?? {},
  };
}

export function summarizeListItem(p: BachsPaymentListItem): Record<string, unknown> {
  return {
    chargeId: p.id ?? null,
    status: p.status,
    amount: formatMoney(p.amount, p.currency),
    settlement: p.settlement_amount ? formatMoney(p.settlement_amount, p.settlement_currency) : null,
    date: p.transaction_date ?? p.completed_at ?? null,
    reference: p.reference ?? null,
  };
}
