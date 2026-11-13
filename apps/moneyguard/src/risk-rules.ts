import type { BachsCustomer, BachsDispute, BachsPayment, BachsPaymentListItem } from '@athena/integrations';

export interface RiskRuleResult {
  rule: string;
  description: string;
  weight: number;
  evidence: string;
}

export interface RiskAssessment {
  chargeId: string;
  score: number;
  level: 'low' | 'medium' | 'high';
  triggered: RiskRuleResult[];
  evaluated: string[];
  skipped: Array<{ rule: string; reason: string }>;
  context: {
    largeAmountThreshold: string | null;
    historyPaymentsMatched: number;
    historyComplete: boolean;
  };
}

export interface RiskInput {
  payment: BachsPayment;
  customer: BachsCustomer | null;
  /** Other payments by the same customer email (may include this one) */
  history: BachsPaymentListItem[];
  historyComplete: boolean;
  /** Recent disputes on the account */
  disputes: BachsDispute[];
}

/**
 * Default "large payment" thresholds per currency, in major units.
 * Override with MONEYGUARD_LARGE_AMOUNTS='{"NGN":"2000000","USD":"1500"}'.
 */
const DEFAULT_LARGE_AMOUNTS: Record<string, number> = {
  USD: 1000,
  EUR: 1000,
  GBP: 800,
  NGN: 1500000,
  GHS: 15000,
  KES: 130000,
  ZAR: 18000,
  UGX: 3700000,
  RWF: 1300000,
  TZS: 2600000,
  XAF: 600000,
  XOF: 600000,
  ZMW: 25000,
  USDT: 1000,
  USDC: 1000,
};

export function largeAmountThresholds(): Record<string, number> {
  const raw = process.env.MONEYGUARD_LARGE_AMOUNTS;
  if (!raw) return DEFAULT_LARGE_AMOUNTS;
  try {
    const parsed = JSON.parse(raw) as Record<string, string | number>;
    const merged = { ...DEFAULT_LARGE_AMOUNTS };
    for (const [currency, value] of Object.entries(parsed)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) merged[currency.toUpperCase()] = n;
    }
    return merged;
  } catch {
    return DEFAULT_LARGE_AMOUNTS;
  }
}

const DAY_MS = 86400 * 1000;
const FAILED = new Set(['failed', 'expired', 'cancelled']);
const REFUNDED = new Set(['refunded', 'partially_refunded', 'auto_refunded']);

function money(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function time(value: string | null | undefined): number {
  const t = new Date(value ?? '').getTime();
  return Number.isFinite(t) ? t : 0;
}

function nameTokens(name: string | null | undefined): Set<string> {
  return new Set(
    (name ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 3)
  );
}

interface Rule {
  id: string;
  description: string;
  weight: number;
  /** Returns evidence when triggered, null when not, or { skip } when the data is unavailable */
  test: (input: RiskInput, ctx: { threshold: number | null }) => string | null | { skip: string };
}

/**
 * Deterministic rules over live Bachs data. The agent treats them as
 * evidence; it still reasons about the overall picture.
 */
const RULES: Rule[] = [
  {
    id: 'large_amount',
    description: 'Payment at or above the large-amount threshold for its currency',
    weight: 20,
    test: ({ payment }, { threshold }) => {
      if (threshold === null) return { skip: `no threshold configured for ${payment.currency}` };
      return money(payment.amount) >= threshold
        ? `${payment.amount} ${payment.currency} >= ${threshold} ${payment.currency}`
        : null;
    },
  },
  {
    id: 'payment_failed',
    description: 'The payment failed, expired, or was cancelled',
    weight: 10,
    test: ({ payment }) =>
      FAILED.has(payment.status) ? `status=${payment.status}${payment.message ? ` (${payment.message})` : ''}` : null,
  },
  {
    id: 'fraud_signal_in_failure',
    description: 'A failure reason mentions fraud, a stolen or lost card, or a risk block',
    weight: 30,
    test: ({ payment }) => {
      const reasons = [payment.message, ...(payment.status_history ?? []).map((h) => h.reason)]
        .filter(Boolean)
        .join(' | ');
      return /fraud|stolen|lost card|lost_card|risk|blocked|suspicious/i.test(reasons) ? `reasons: ${reasons.slice(0, 200)}` : null;
    },
  },
  {
    id: 'repeated_attempts',
    description: 'Three or more failed attempts recorded on this payment',
    weight: 15,
    test: ({ payment }) => {
      const failures = (payment.status_history ?? []).filter((h) => /fail|declin/i.test(h.status));
      return failures.length >= 3 ? `${failures.length} failed attempts in status history` : null;
    },
  },
  {
    id: 'amount_mismatch',
    description: 'The customer paid less or more than the amount owed',
    weight: 10,
    test: ({ payment }) =>
      ['underpaid', 'overpaid', 'accepted'].includes(payment.status)
        ? `status=${payment.status}, paid ${payment.amount_paid ?? '?'} of ${payment.amount} ${payment.currency}`
        : null,
  },
  {
    id: 'payer_name_mismatch',
    description: 'The bank-transfer sender or cardholder name does not match the customer name',
    weight: 15,
    test: ({ payment }) => {
      const customerName = payment.customer?.name;
      const payerName =
        payment.payment_method_details?.bank_transfer?.sender_name ??
        payment.payment_method_details?.card?.cardholder_name;
      if (!customerName || !payerName) return { skip: 'payer or customer name not available' };
      const a = nameTokens(customerName);
      const b = nameTokens(payerName);
      if (a.size === 0 || b.size === 0) return { skip: 'names too short to compare' };
      const overlap = Array.from(a).some((t) => b.has(t));
      return overlap ? null : `customer "${customerName}" vs payer "${payerName}"`;
    },
  },
  {
    id: 'high_velocity',
    description: 'Five or more payments from this customer within 24 hours',
    weight: 15,
    test: ({ payment, history }) => {
      const at = time(payment.created_at);
      const recent = history.filter((h) => Math.abs(time(h.transaction_date) - at) <= DAY_MS);
      return recent.length >= 5 ? `${recent.length} payments within 24h` : null;
    },
  },
  {
    id: 'repeated_failures',
    description: 'Three or more failed payments from this customer within 24 hours',
    weight: 20,
    test: ({ payment, history }) => {
      const at = time(payment.created_at);
      const failed = history.filter((h) => FAILED.has(h.status) && Math.abs(time(h.transaction_date) - at) <= DAY_MS);
      return failed.length >= 3 ? `${failed.length} failed payments within 24h` : null;
    },
  },
  {
    id: 'prior_disputes',
    description: "Disputes (chargebacks) on this customer's payments",
    weight: 30,
    test: ({ payment, history, disputes }) => {
      const chargeIds = new Set([payment.payment_id, ...history.map((h) => h.id).filter(Boolean) as string[]]);
      const hits = disputes.filter((d) => chargeIds.has(d.charge_id));
      return hits.length
        ? `${hits.length} dispute(s): ${hits.map((d) => `${d.dispute_id} (${d.status}, ${d.reason ?? 'no reason'})`).join(', ')}`
        : null;
    },
  },
  {
    id: 'prior_refunds',
    description: 'Two or more refunded payments for this customer',
    weight: 10,
    test: ({ payment, history }) => {
      const refunded = history.filter((h) => REFUNDED.has(h.status) && h.id !== payment.payment_id);
      return refunded.length >= 2 ? `${refunded.length} refunded payments` : null;
    },
  },
  {
    id: 'new_customer_large_amount',
    description: 'Customer created in the last 7 days paying at least half the large-amount threshold',
    weight: 15,
    test: ({ payment, customer }, { threshold }) => {
      if (!customer) return { skip: 'customer record not found' };
      if (threshold === null) return { skip: `no threshold for ${payment.currency}` };
      const ageDays = (time(payment.created_at) - time(customer.created_at)) / DAY_MS;
      return ageDays < 7 && money(payment.amount) >= threshold / 2
        ? `customer age ${ageDays.toFixed(1)} days, amount ${payment.amount} ${payment.currency}`
        : null;
    },
  },
  {
    id: 'customer_previously_flagged',
    description: 'MoneyGuard flagged this customer before',
    weight: 25,
    test: ({ customer }) => {
      const flag = customer?.metadata?.moneyguard_risk;
      return flag ? `customer metadata moneyguard_risk=${String(flag)} (${String(customer?.metadata?.moneyguard_reason ?? '')})` : null;
    },
  },
];

export function assessRisk(input: RiskInput): RiskAssessment {
  const thresholds = largeAmountThresholds();
  const threshold = thresholds[input.payment.currency?.toUpperCase()] ?? null;
  const triggered: RiskRuleResult[] = [];
  const skipped: RiskAssessment['skipped'] = [];

  for (const rule of RULES) {
    const result = rule.test(input, { threshold });
    if (result && typeof result === 'object') {
      skipped.push({ rule: rule.id, reason: result.skip });
    } else if (result) {
      triggered.push({ rule: rule.id, description: rule.description, weight: rule.weight, evidence: result });
    }
  }

  const score = Math.min(100, triggered.reduce((sum, r) => sum + r.weight, 0));
  const level = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  return {
    chargeId: input.payment.payment_id,
    score,
    level,
    triggered,
    evaluated: RULES.map((r) => r.id),
    skipped,
    context: {
      largeAmountThreshold: threshold === null ? null : `${threshold} ${input.payment.currency}`,
      historyPaymentsMatched: input.history.length,
      historyComplete: input.historyComplete,
    },
  };
}
