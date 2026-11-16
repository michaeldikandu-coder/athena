import type { ConnectionProvider } from './types';

/**
 * Ready-made agents. Picking one fills the agent form (everything stays
 * editable) and, when the template has one, creates the workflow that starts it.
 */

export type TriggerChoice =
  | { kind: 'manual' }
  | { kind: 'schedule'; intervalMinutes: number }
  | { kind: 'event'; event: string }
  | { kind: 'webhook' };

export interface WorkflowDraft {
  name: string;
  description: string;
  trigger: TriggerChoice;
  task: string;
  /** Ask a person before the agent starts */
  approvalFirst?: boolean;
}

export interface AgentTemplate {
  key: string;
  name: string;
  summary: string;
  needs: ConnectionProvider[];
  agent: {
    name: string;
    description: string;
    systemPrompt: string;
    tools: string[];
    maxIterations: number;
  };
  workflow?: WorkflowDraft;
}

const REPORT = 'Never invent data. If a tool fails, say so. Finish with a short report: findings, actions taken, and next steps.';

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: 'refund-reviewer',
    name: 'Refund Reviewer',
    summary: 'Give it a charge id and a complaint. It checks the payment, history and risk, opens a case, and proposes a refund for your approval.',
    needs: ['bachs'],
    agent: {
      name: 'Refund Reviewer',
      description: 'Reviews a Bachs payment and proposes a refund only when it is justified.',
      systemPrompt: `You are Refund Reviewer, a payments operations agent working on Bachs payments.

When given a charge id:
1. Get the payment with get_transaction_details.
2. Get the customer profile and recent payment history to spot repeated failures or unusual amounts.
3. Run check_risk_rules on the charge.
4. Refund only if the payment succeeded, is refundable, and the evidence supports the customer's claim.
5. Always open a case with create_case: findings, risk level, recommendation.
6. If a refund is justified, call refund_transaction with a clear reason. It needs human approval; if it is rejected, do not retry.

${REPORT}`,
      tools: ['get_transaction_details', 'get_customer_profile', 'search_transaction_history', 'check_risk_rules', 'create_case', 'refund_transaction'],
      maxIterations: 12,
    },
  },
  {
    key: 'dispute-responder',
    name: 'Dispute Responder',
    summary: 'When a customer opens a dispute in Bachs, it gathers the evidence, opens a case with a recommendation, and tells your team.',
    needs: ['bachs'],
    agent: {
      name: 'Dispute Responder',
      description: 'Prepares evidence and a recommendation for every new Bachs dispute.',
      systemPrompt: `You are Dispute Responder. For each dispute:
1. Read the dispute and the disputed payment.
2. Look at the customer's profile and payment history for signs of fraud or a genuine problem.
3. Open a case with create_case: what the evidence shows, and whether to contest or accept.
4. If Slack is available, send one send_notification with the recommendation and the response deadline.

${REPORT}`,
      tools: ['get_disputes', 'get_transaction_details', 'get_customer_profile', 'search_transaction_history', 'create_case', 'send_notification'],
      maxIterations: 12,
    },
    workflow: {
      name: 'Respond to new disputes',
      description: 'Runs when Bachs reports a new dispute.',
      trigger: { kind: 'event', event: 'bachs.dispute.created' },
      task: 'A dispute {{trigger.payload.data.dispute_id}} was opened on charge {{trigger.payload.data.charge_id}} for {{trigger.payload.data.amount}} {{trigger.payload.data.currency}} (reason: {{trigger.payload.data.reason}}). Prepare the case and recommendation.',
    },
  },
  {
    key: 'daily-digest',
    name: 'Daily Ops Digest',
    summary: 'Every morning it checks service health, failed deploys and open disputes, and posts one summary to Slack.',
    needs: ['services', 'github', 'bachs', 'slack'],
    agent: {
      name: 'Daily Ops Digest',
      description: 'Posts a daily summary of services, deploys and disputes.',
      systemPrompt: `You are Daily Ops Digest. Once a day:
1. Check all services with get_system_status.
2. List failed CI/CD runs from the last day with list_workflow_runs.
3. List open disputes with get_disputes.
4. Send one send_notification titled "Daily ops digest" with a short bullet list per area. Use severity "warning" if anything needs attention, otherwise "info".
Skip any area whose tools are unavailable and say so in the message.

${REPORT}`,
      tools: ['get_system_status', 'list_workflow_runs', 'get_disputes', 'send_notification'],
      maxIterations: 8,
    },
    workflow: {
      name: 'Daily digest',
      description: 'Runs once a day.',
      trigger: { kind: 'schedule', intervalMinutes: 1440 },
      task: 'Prepare and send today\'s ops digest.',
    },
  },
  {
    key: 'deploy-guard',
    name: 'Deploy Guard',
    summary: 'When a GitHub Actions run fails, it reads the logs, checks your services, re-runs flaky jobs after your approval, and opens an issue for real failures.',
    needs: ['github', 'services'],
    agent: {
      name: 'Deploy Guard',
      description: 'Triages failed GitHub Actions runs.',
      systemPrompt: `You are Deploy Guard. For a failed GitHub Actions run:
1. Read the run and its failed jobs with get_workflow_run.
2. Check whether live services are affected with check_service_health.
3. If the failure looks transient (timeouts, network, flaky tests), propose rerun_failed_jobs. It needs approval.
4. Otherwise search_tickets for an existing issue and create_ticket if there is none, with the failing step and likely cause.

${REPORT}`,
      tools: ['list_workflow_runs', 'get_workflow_run', 'check_service_health', 'rerun_failed_jobs', 'search_tickets', 'create_ticket'],
      maxIterations: 12,
    },
    workflow: {
      name: 'Triage failed deploys',
      description: 'Runs when a GitHub Actions run fails.',
      trigger: { kind: 'event', event: 'github.workflow_run' },
      task: 'GitHub Actions run {{trigger.payload.workflow_run.id}} ("{{trigger.payload.workflow_run.name}}" on {{trigger.payload.workflow_run.head_branch}}) failed. Triage it.',
    },
  },
  {
    key: 'uptime-alerts',
    name: 'Uptime Alert Handler',
    summary: 'Your monitoring tool calls a webhook URL; the agent checks the service, then updates the open incident or opens a new one.',
    needs: ['services', 'github'],
    agent: {
      name: 'Uptime Alert Handler',
      description: 'Verifies external alerts and keeps one incident issue per problem.',
      systemPrompt: `You are Uptime Alert Handler. For each alert:
1. Verify it with check_service_health or get_system_status.
2. If the service is fine, report a false alarm and stop.
3. Otherwise search_tickets for an open incident about this service. Update it with update_incident, or open one with create_ticket.
4. If Slack is available, notify the team once.

${REPORT}`,
      tools: ['check_service_health', 'get_system_status', 'search_tickets', 'update_incident', 'create_ticket', 'send_notification'],
      maxIterations: 10,
    },
    workflow: {
      name: 'Handle uptime alerts',
      description: 'Runs when your monitoring tool calls the signed webhook URL.',
      trigger: { kind: 'webhook' },
      task: 'An external monitoring alert was received (its JSON body is in the context). Verify it and respond.',
    },
  },
];

/** Triggers offered in the simple workflow form */
export const TRIGGER_OPTIONS: Array<{ value: string; label: string; choice: TriggerChoice; hint?: string }> = [
  { value: 'manual', label: 'When I click Run', choice: { kind: 'manual' } },
  { value: 'schedule', label: 'On a schedule', choice: { kind: 'schedule', intervalMinutes: 60 } },
  { value: 'bachs.collection.failed', label: 'A Bachs payment fails', choice: { kind: 'event', event: 'bachs.collection.failed' }, hint: '{{trigger.payload.data.charge_id}}, {{trigger.payload.data.amount}}, {{trigger.payload.data.reason}}' },
  { value: 'bachs.collection.succeeded', label: 'A Bachs payment succeeds', choice: { kind: 'event', event: 'bachs.collection.succeeded' }, hint: '{{trigger.payload.data.charge_id}}, {{trigger.payload.data.amount}}' },
  { value: 'bachs.collection.underpaid', label: 'A Bachs payment is underpaid', choice: { kind: 'event', event: 'bachs.collection.underpaid' }, hint: '{{trigger.payload.data.charge_id}}' },
  { value: 'bachs.dispute.created', label: 'A Bachs dispute is opened', choice: { kind: 'event', event: 'bachs.dispute.created' }, hint: '{{trigger.payload.data.dispute_id}}, {{trigger.payload.data.charge_id}}' },
  { value: 'bachs.checkout.expired', label: 'A Bachs checkout expires', choice: { kind: 'event', event: 'bachs.checkout.expired' }, hint: '{{trigger.payload.data.checkout_id}}' },
  { value: 'github.workflow_run', label: 'A GitHub Actions run fails', choice: { kind: 'event', event: 'github.workflow_run' }, hint: '{{trigger.payload.workflow_run.id}}, {{trigger.payload.workflow_run.name}}' },
  { value: 'webhook', label: 'Another system calls my webhook URL', choice: { kind: 'webhook' }, hint: '{{trigger.payload.<field>}} from the JSON body' },
];

/** Build the trigger and steps the API expects */
export function workflowDefinition(draft: WorkflowDraft): { trigger: unknown; steps: unknown[] } {
  const t = draft.trigger;
  const trigger =
    t.kind === 'manual'
      ? { type: 'manual', config: {} }
      : t.kind === 'schedule'
        ? { type: 'schedule', config: { intervalMinutes: t.intervalMinutes } }
        : t.kind === 'webhook'
          ? { type: 'webhook', config: {} }
          : {
              type: 'webhook',
              config: {
                event: t.event,
                // GitHub sends every run; only failed, completed runs matter here
                ...(t.event === 'github.workflow_run'
                  ? {
                      conditions: [
                        { path: 'trigger.payload.action', operator: 'eq', value: 'completed' },
                        { path: 'trigger.payload.workflow_run.conclusion', operator: 'eq', value: 'failure' },
                      ],
                    }
                  : {}),
              },
            };
  const steps: unknown[] = [];
  if (draft.approvalFirst) {
    steps.push({ id: 'confirm', type: 'approval', config: { message: `Start "${draft.name}"?` } });
  }
  steps.push({ id: 'run', type: 'agent_task', config: { task: draft.task } });
  return { trigger, steps };
}
