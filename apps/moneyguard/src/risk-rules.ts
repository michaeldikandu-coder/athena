import { StripeCharge, StripeCustomer } from './stripe-data';

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
  thresholds: { largeAmount: number };
}

interface RuleInput {
  charge: StripeCharge;
  customer: StripeCustomer | null;
  history: StripeCharge[];
  largeAmount: number;
}

interface Rule {
  id: string;
  description: string;
  weight: number;
  test: (input: RuleInput) => string | null;
}

const DAY = 86400;

/**
 * Deterministic risk rules evaluated against live Stripe data. The agent uses
 * these as evidence; it still reasons about the overall picture itself.
 */
const RULES: Rule[] = [
  {
    id: 'large_amount',
    description: 'Charge amount at or above the large-amount threshold',
    weight: 20,
    test: ({ charge, largeAmount }) =>
      charge.amount >= largeAmount ? `amount ${charge.amount} >= ${largeAmount}` : null,
  },
  {
    id: 'radar_elevated',
    description: 'Stripe Radar rated the charge elevated or highest risk',
    weight: 30,
    test: ({ charge }) => {
      const level = charge.outcome?.risk_level;
      return level === 'elevated' || level === 'highest' ? `radar risk_level=${level}` : null;
    },
  },
  {
    id: 'radar_score_high',
    description: 'Stripe Radar risk score of 65 or above',
    weight: 20,
    test: ({ charge }) => {
      const score = charge.outcome?.risk_score;
      return typeof score === 'number' && score >= 65 ? `radar risk_score=${score}` : null;
    },
  },
  {
    id: 'payment_failed',
    description: 'The charge failed',
    weight: 10,
    test: ({ charge }) =>
      charge.status === 'failed'
        ? `failure_code=${charge.failure_code ?? 'unknown'} (${charge.outcome?.reason ?? 'no reason'})`
        : null,
  },
  {
    id: 'fraud_decline',
    description: 'Issuer or Radar declined the charge for suspected fraud',
    weight: 30,
    test: ({ charge }) => {
      const reason = `${charge.outcome?.reason ?? ''} ${charge.failure_code ?? ''}`;
      return /fraud|stolen|lost_card|pickup_card/.test(reason) ? `decline reason: ${reason.trim()}` : null;
    },
  },
  {
    id: 'card_country_mismatch',
    description: 'Card issuing country differs from billing country',
    weight: 15,
    test: ({ charge }) => {
      const cardCountry = charge.payment_method_details?.card?.country;
      const billing = charge.billing_details?.address?.country;
      return cardCountry && billing && cardCountry !== billing
        ? `card country ${cardCountry} vs billing ${billing}`
        : null;
    },
  },
  {
    id: 'verification_failed',
    description: 'CVC or postal code verification failed',
    weight: 15,
    test: ({ charge }) => {
      const checks = charge.payment_method_details?.card?.checks;
      const failed = [
        checks?.cvc_check === 'fail' ? 'cvc' : null,
        checks?.address_postal_code_check === 'fail' ? 'postal_code' : null,
      ].filter(Boolean);
      return failed.length ? `failed checks: ${failed.join(', ')}` : null;
    },
  },
  {
    id: 'high_velocity',
    description: 'Five or more charges for this customer in 24 hours',
    weight: 15,
    test: ({ charge, history }) => {
      const recent = history.filter((c) => Math.abs(charge.created - c.created) <= DAY);
      return recent.length >= 5 ? `${recent.length} charges within 24h` : null;
    },
  },
  {
    id: 'repeated_failures',
    description: 'Three or more failed charges for this customer in 24 hours',
    weight: 20,
    test: ({ charge, history }) => {
      const failed = history.filter(
        (c) => c.status === 'failed' && Math.abs(charge.created - c.created) <= DAY
      );
      return failed.length >= 3 ? `${failed.length} failed charges within 24h` : null;
    },
  },
  {
    id: 'prior_disputes',
    description: 'Customer has disputed charges in history',
    weight: 25,
    test: ({ history }) => {
      const disputed = history.filter((c) => c.disputed);
      return disputed.length ? `${disputed.length} disputed charge(s): ${disputed.map((c) => c.id).join(', ')}` : null;
    },
  },
  {
    id: 'new_customer_large_amount',
    description: 'Customer created in the last 7 days making a large purchase',
    weight: 15,
    test: ({ charge, customer, largeAmount }) => {
      if (!customer) return null;
      const ageDays = (charge.created - customer.created) / DAY;
      return ageDays < 7 && charge.amount >= largeAmount / 2
        ? `customer age ${ageDays.toFixed(1)} days, amount ${charge.amount}`
        : null;
    },
  },
  {
    id: 'delinquent_customer',
    description: 'Stripe marks the customer as delinquent',
    weight: 10,
    test: ({ customer }) => (customer?.delinquent ? 'customer.delinquent=true' : null),
  },
];

export function largeAmountThreshold(): number {
  const configured = Number(process.env.MONEYGUARD_LARGE_AMOUNT);
  return Number.isFinite(configured) && configured > 0 ? configured : 100000;
}

export function assessRisk(input: Omit<RuleInput, 'largeAmount'>): RiskAssessment {
  const largeAmount = largeAmountThreshold();
  const full = { ...input, largeAmount };
  const triggered: RiskRuleResult[] = [];

  for (const rule of RULES) {
    const evidence = rule.test(full);
    if (evidence) {
      triggered.push({ rule: rule.id, description: rule.description, weight: rule.weight, evidence });
    }
  }

  const score = Math.min(100, triggered.reduce((sum, r) => sum + r.weight, 0));
  const level = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

  return {
    chargeId: input.charge.id,
    score,
    level,
    triggered,
    evaluated: RULES.map((r) => r.id),
    thresholds: { largeAmount },
  };
}
