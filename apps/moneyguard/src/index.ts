import { AthenaApplication } from '@athena/core';
import { moneyGuardTools } from './tools';
import { moneyGuardAgent } from './config/agent';
import { moneyGuardWorkflows } from './workflows';

export const moneyGuardApp: AthenaApplication = {
  id: 'moneyguard',
  name: 'MoneyGuard',
  tagline: 'Financial operations agent',
  description:
    'Investigates failed, suspicious, underpaid, and disputed Bachs payments, evaluates risk rules, opens cases, and flags customers or issues refunds after human approval.',
  tools: moneyGuardTools,
  agent: moneyGuardAgent,
  workflows: moneyGuardWorkflows,
  connections: [
    {
      provider: 'bachs',
      description:
        'Your Bachs secret key (sk_sandbox_... for the sandbox) to read payments, customers and disputes, flag customers and refund. Add the webhook signing secret to start runs automatically.',
    },
    { provider: 'slack', description: 'Incoming webhook so the agent can notify your team', optional: true },
  ],
  env: [
    {
      name: 'MONEYGUARD_LARGE_AMOUNTS',
      description: 'JSON map of large-payment thresholds per currency, e.g. {"NGN":"1500000","USD":"1000"}',
      optional: true,
    },
  ],
};

export { moneyGuardTools } from './tools';
export { CaseModel } from './models/case.model';
export type { ICase } from './models/case.model';
export { fetchRecentPayments, summarizeListItem } from './bachs-data';
export { assessRisk } from './risk-rules';
