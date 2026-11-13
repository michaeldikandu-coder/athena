import { WorkflowTemplate } from '@athena/core';

export const opsGuardWorkflows: WorkflowTemplate[] = [
  {
    key: 'scheduled-health-check',
    name: 'Scheduled health check',
    description:
      'Every 15 minutes, check all services. If any is unhealthy, the agent investigates and opens or updates an incident.',
    trigger: { type: 'schedule', config: { intervalMinutes: 15 } },
    steps: [
      { id: 'status', type: 'tool_call', config: { tool: 'get_system_status', input: {} } },
      {
        id: 'any_down',
        type: 'condition',
        config: {
          conditions: [{ path: 'steps.status.output.summary.unhealthy.length', operator: 'gt', value: 0 }],
          then: 'investigate',
          else: null,
        },
      },
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'The scheduled health check found unhealthy services: {{steps.status.output.summary.unhealthy}}. Investigate the impact and likely cause, and coordinate the response.',
          includePayload: false,
        },
      },
    ],
  },
  {
    key: 'failed-deployment',
    name: 'Investigate failed deployments',
    description: 'When a GitHub Actions run fails, find the failed step and decide whether to open an incident or retry.',
    trigger: {
      type: 'webhook',
      config: {
        event: 'github.workflow_run',
        conditions: [
          { path: 'trigger.payload.action', operator: 'eq', value: 'completed' },
          { path: 'trigger.payload.workflow_run.conclusion', operator: 'eq', value: 'failure' },
        ],
      },
    },
    steps: [
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'GitHub Actions run {{trigger.payload.workflow_run.id}} ("{{trigger.payload.workflow_run.name}}" on {{trigger.payload.workflow_run.head_branch}}) failed in {{trigger.payload.repository.full_name}}. Find what failed, check whether services are affected, and respond.',
        },
      },
    ],
  },
  {
    key: 'failed-order',
    name: 'Investigate failed orders',
    description: 'When an order payment fails in Stripe, check whether it is a customer issue or a system problem.',
    trigger: { type: 'webhook', config: { event: 'stripe.payment_intent.payment_failed' } },
    steps: [
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'Order payment {{trigger.payload.data.object.id}} failed. Determine whether this is an isolated customer issue or a sign of a system problem (service health, recent deployments, logs). Open an incident only if systems are at fault.',
        },
      },
    ],
  },
  {
    key: 'external-alert',
    name: 'Handle external alerts',
    description:
      'Receives alerts from uptime monitors or other tools through this workflow\'s signed webhook URL.',
    trigger: { type: 'webhook', config: {} },
    steps: [
      {
        id: 'investigate',
        type: 'agent_task',
        config: {
          task:
            'An external monitoring alert was received (payload in context). Verify it against live system status, investigate, and respond.',
        },
      },
    ],
  },
];
