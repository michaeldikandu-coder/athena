import { WorkflowTemplate } from '@athena/core';

/**
 * Workflow templates installed with MoneyGuard. Bachs webhook events arrive
 * as "bachs.<event type>" with the Bachs event envelope as the payload
 * ({ id, type, created_at, organization_id, data }).
 */
export const moneyGuardWorkflows: WorkflowTemplate[] = [
  {
    key: 'failed-payment-investigation',
    name: 'Investigate failed payments',
    description: 'When Bachs reports a failed payment attempt, find out why and whether it looks like fraud.',
    trigger: { type: 'webhook', config: { event: 'bachs.collection.failed' } },
    steps: [
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'Bachs reported a failed payment attempt on charge {{trigger.payload.data.charge_id}} ({{trigger.payload.data.amount}} {{trigger.payload.data.currency}}, reason: "{{trigger.payload.data.reason}}"). Investigate why it failed and whether it looks like fraud or a legitimate customer problem. The customer may still retry, so do not treat the order as lost. Take appropriate action.',
        },
      },
    ],
  },
  {
    key: 'payment-risk-review',
    name: 'Review successful payments',
    description:
      'For every successful payment, run the risk rules and have the agent investigate only when the risk is medium or high.',
    trigger: { type: 'webhook', config: { event: 'bachs.collection.succeeded' } },
    steps: [
      {
        id: 'risk',
        type: 'tool_call',
        config: {
          tool: 'check_risk_rules',
          input: { chargeId: '{{trigger.payload.data.charge_id}}' },
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
            'Payment {{trigger.payload.data.charge_id}} ({{trigger.payload.data.amount}} {{trigger.payload.data.currency}}) succeeded but scored {{steps.risk.output.score}} ({{steps.risk.output.level}}) on the risk rules. Investigate it and take appropriate action.',
        },
      },
    ],
  },
  {
    key: 'underpaid-payment',
    name: 'Review underpaid payments',
    description: 'When a customer pays less than owed, decide whether it is a mistake or abuse.',
    trigger: { type: 'webhook', config: { event: 'bachs.collection.underpaid' } },
    steps: [
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'Charge {{trigger.payload.data.charge_id}} was underpaid: {{trigger.payload.data.amount_paid}} of {{trigger.payload.data.amount_expected}} {{trigger.payload.data.currency}} received. Check the customer history and decide whether this is a one-off mistake or a pattern, and recommend next steps.',
        },
      },
    ],
  },
  {
    key: 'dispute-response',
    name: 'Respond to disputes',
    description: 'When a customer’s bank opens a chargeback, investigate and prepare a recommendation before the deadline.',
    trigger: { type: 'webhook', config: { event: 'bachs.dispute.created' } },
    steps: [
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'A dispute {{trigger.payload.data.dispute_id}} was opened on charge {{trigger.payload.data.charge_id}} for {{trigger.payload.data.amount}} {{trigger.payload.data.currency}} (reason: {{trigger.payload.data.reason}}, respond by {{trigger.payload.data.response_deadline_at}}). Investigate the payment and the customer, open a case with the evidence to submit or a recommendation to accept, and notify the team.',
        },
      },
    ],
  },
];
