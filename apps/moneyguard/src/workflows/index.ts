import { WorkflowTemplate } from '@athena/core';

/**
 * Workflow templates installed with MoneyGuard. Stripe webhook events arrive
 * as "stripe.<event type>" with the Stripe event as the payload.
 */
export const moneyGuardWorkflows: WorkflowTemplate[] = [
  {
    key: 'failed-charge-investigation',
    name: 'Investigate failed charges',
    description: 'When Stripe reports a failed charge, investigate the cause and the customer.',
    trigger: { type: 'webhook', config: { event: 'stripe.charge.failed' } },
    steps: [
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'Stripe reported a failed charge {{trigger.payload.data.object.id}}. Investigate why it failed and whether it looks like fraud or a legitimate customer problem. Take appropriate action.',
        },
      },
    ],
  },
  {
    key: 'large-charge-review',
    name: 'Review large successful charges',
    description:
      'For successful charges above the threshold, run the risk rules and have the agent investigate only when the risk is medium or high.',
    trigger: {
      type: 'webhook',
      config: {
        event: 'stripe.charge.succeeded',
        conditions: [{ path: 'trigger.payload.data.object.amount', operator: 'gte', value: 100000 }],
      },
    },
    steps: [
      {
        id: 'risk',
        type: 'tool_call',
        config: {
          tool: 'check_risk_rules',
          input: { chargeId: '{{trigger.payload.data.object.id}}' },
        },
      },
      {
        id: 'is_risky',
        type: 'condition',
        config: {
          conditions: [{ path: 'steps.risk.output.level', operator: 'in', value: ['medium', 'high'] }],
          then: 'investigate',
          else: null,
        },
      },
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'A large charge {{trigger.payload.data.object.id}} scored {{steps.risk.output.score}} ({{steps.risk.output.level}}) on the risk rules. Investigate it and take appropriate action.',
        },
      },
    ],
  },
  {
    key: 'early-fraud-warning',
    name: 'Respond to early fraud warnings',
    description: 'When the card network issues an early fraud warning, investigate and propose action.',
    trigger: { type: 'webhook', config: { event: 'stripe.radar.early_fraud_warning.created' } },
    steps: [
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'Stripe received an early fraud warning for charge {{trigger.payload.data.object.charge}} (fraud type: {{trigger.payload.data.object.fraud_type}}). Investigate, open a case, and propose whether to refund to avoid a dispute.',
        },
      },
    ],
  },
];
