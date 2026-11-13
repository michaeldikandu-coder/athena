import { AthenaApplication } from '@athena/core';
import { moneyGuardTools } from './tools';
import { moneyGuardAgent } from './config/agent';
import { moneyGuardWorkflows } from './workflows';

export const moneyGuardApp: AthenaApplication = {
  id: 'moneyguard',
  name: 'MoneyGuard',
  tagline: 'Financial operations agent',
  description:
    'Investigates failed and suspicious Stripe transactions, evaluates risk rules, opens cases, and flags or refunds charges after human approval.',
  tools: moneyGuardTools,
  agent: moneyGuardAgent,
  workflows: moneyGuardWorkflows,
  env: [
    { name: 'STRIPE_SECRET_KEY', description: 'Stripe secret key (sk_test_... for test mode)' },
    {
      name: 'STRIPE_WEBHOOK_SECRET',
      description: 'Signing secret for the Stripe webhook endpoint (whsec_...)',
      optional: true,
    },
    { name: 'SLACK_WEBHOOK_URL', description: 'Slack incoming webhook for notifications', optional: true },
    {
      name: 'MONEYGUARD_LARGE_AMOUNT',
      description: 'Large-amount threshold in minor units (default 100000 = 1,000.00)',
      optional: true,
    },
  ],
};

export { moneyGuardTools } from './tools';
export { CaseModel } from './models/case.model';
export type { ICase } from './models/case.model';
export { fetchRecentCharges, summarizeCharge } from './stripe-data';
export { assessRisk } from './risk-rules';
