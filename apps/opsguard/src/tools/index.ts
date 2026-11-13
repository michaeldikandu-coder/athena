import os from 'os';
import { z } from 'zod';
import { Tool } from '@athena/core';
import { getDatabaseHealth } from '@athena/database';
import { bachs, BachsPayment, formatMoney, github, resolveRepo, sendNotificationTool } from '@athena/integrations';
import { getService, getServices, getLogSources } from '../config/services';
import { checkHealth } from '../health';
import { queryLogFile } from '../logs';

const repo = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .optional()
  .describe('owner/repo. Defaults to the configured repository.');

// ---------- Systems ----------

export const getSystemStatusTool: Tool<Record<string, never>> = {
  id: 'get_system_status',
  name: 'Get System Status',
  description:
    'Check every configured service over HTTP and report host metrics (load, memory, uptime) and database connectivity. Start incident investigations here.',
  inputSchema: z.object({}).strict(),
  permissionLevel: 'low',
  requiredPermissions: ['read:systems'],
  requiresApproval: false,
  category: 'systems',
  handler: async () => {
    const services = getServices();
    const results = await Promise.all(services.map((s) => checkHealth(s)));
    const total = os.totalmem();
    const free = os.freemem();
    return {
      success: true,
      data: {
        checkedAt: new Date().toISOString(),
        summary: {
          services: results.length,
          healthy: results.filter((r) => r.healthy).length,
          unhealthy: results.filter((r) => !r.healthy).map((r) => r.name),
        },
        services: results,
        host: {
          hostname: os.hostname(),
          loadAverage: os.loadavg().map((n) => Number(n.toFixed(2))),
          cpus: os.cpus().length,
          memoryUsedPercent: Number((((total - free) / total) * 100).toFixed(1)),
          uptimeHours: Number((os.uptime() / 3600).toFixed(1)),
        },
        database: { connected: getDatabaseHealth() },
        logSources: Object.keys(getLogSources()),
      },
    };
  },
};

const serviceInput = z.object({
  service: z.string().describe('Name of a configured service (see get_system_status)'),
  samples: z.number().int().min(1).max(5).optional().describe('Number of checks to run (default 3)'),
});
export const checkServiceHealthTool: Tool<z.infer<typeof serviceInput>> = {
  id: 'check_service_health',
  name: 'Check Service Health',
  description:
    'Run repeated HTTP checks against one configured service and return status codes, latency per sample, and a response body preview.',
  inputSchema: serviceInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:systems'],
  requiresApproval: false,
  category: 'systems',
  handler: async ({ service, samples }) => {
    const config = getService(service);
    const runs = [];
    for (let i = 0; i < (samples ?? 3); i++) {
      runs.push(await checkHealth(config, i === 0));
    }
    const latencies = runs.map((r) => r.latencyMs);
    return {
      success: true,
      data: {
        service,
        url: config.url,
        healthyRatio: `${runs.filter((r) => r.healthy).length}/${runs.length}`,
        avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        maxLatencyMs: Math.max(...latencies),
        samples: runs,
      },
    };
  },
};

const logsInput = z.object({
  source: z.string().describe('Name of a configured log source'),
  contains: z.string().max(200).optional().describe('Case-insensitive text to match'),
  level: z.enum(['error', 'warn', 'info', 'debug']).optional(),
  limit: z.number().int().min(1).max(200).optional().describe('Max lines to return (default 50)'),
});
export const queryLogsTool: Tool<z.infer<typeof logsInput>> = {
  id: 'query_logs',
  name: 'Query Logs',
  description: 'Search the most recent lines of a configured log file by text and level.',
  inputSchema: logsInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:logs'],
  requiresApproval: false,
  category: 'systems',
  handler: async (input) => ({
    success: true,
    data: await queryLogFile({ ...input, limit: input.limit ?? 50 }),
  }),
};

// ---------- Deployments (GitHub Actions) ----------

const runsInput = z.object({
  repo,
  status: z.enum(['failure', 'success', 'in_progress', 'cancelled']).optional().describe('Default: failure'),
  branch: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(30).optional(),
});
export const listWorkflowRunsTool: Tool<z.infer<typeof runsInput>> = {
  id: 'list_workflow_runs',
  name: 'List CI/CD Runs',
  description: 'List recent GitHub Actions workflow runs (deployments, builds), failed ones by default.',
  inputSchema: runsInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:deployments'],
  requiresApproval: false,
  category: 'deployments',
  handler: async ({ repo: repoName, status, branch, limit }) => {
    const r = resolveRepo(repoName);
    const result = await github().get<{ workflow_runs: any[] }>(
      `/repos/${r.owner}/${r.name}/actions/runs`,
      { status: status ?? 'failure', branch, per_page: limit ?? 10 }
    );
    return {
      success: true,
      data: result.workflow_runs.map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        branch: run.head_branch,
        commit: run.head_sha?.slice(0, 7),
        commitMessage: run.head_commit?.message?.split('\n')[0],
        actor: run.actor?.login,
        event: run.event,
        createdAt: run.created_at,
        url: run.html_url,
      })),
    };
  },
};

const runInput = z.object({ repo, runId: z.number().int().positive() });
export const getWorkflowRunTool: Tool<z.infer<typeof runInput>> = {
  id: 'get_workflow_run',
  name: 'Get CI/CD Run Details',
  description: 'Get the jobs and failed steps of a GitHub Actions run to find what broke.',
  inputSchema: runInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:deployments'],
  requiresApproval: false,
  category: 'deployments',
  handler: async ({ repo: repoName, runId }) => {
    const r = resolveRepo(repoName);
    const [run, jobs] = await Promise.all([
      github().get<any>(`/repos/${r.owner}/${r.name}/actions/runs/${runId}`),
      github().get<{ jobs: any[] }>(`/repos/${r.owner}/${r.name}/actions/runs/${runId}/jobs`, {
        per_page: 30,
      }),
    ]);
    return {
      success: true,
      data: {
        id: run.id,
        name: run.name,
        conclusion: run.conclusion,
        branch: run.head_branch,
        commit: run.head_sha,
        commitMessage: run.head_commit?.message,
        attempt: run.run_attempt,
        url: run.html_url,
        jobs: jobs.jobs.map((job) => ({
          name: job.name,
          conclusion: job.conclusion,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          failedSteps: (job.steps ?? [])
            .filter((s: any) => s.conclusion === 'failure')
            .map((s: any) => s.name),
          url: job.html_url,
        })),
      },
    };
  },
};

export const rerunFailedJobsTool: Tool<z.infer<typeof runInput>> = {
  id: 'rerun_failed_jobs',
  name: 'Re-run Failed CI/CD Jobs',
  description:
    'Re-run the failed jobs of a GitHub Actions run (e.g. to retry a deployment after a transient failure). Requires human approval.',
  inputSchema: runInput,
  permissionLevel: 'high',
  requiredPermissions: ['write:deployments'],
  requiresApproval: true,
  category: 'deployments',
  handler: async ({ repo: repoName, runId }) => {
    const r = resolveRepo(repoName);
    await github().post(`/repos/${r.owner}/${r.name}/actions/runs/${runId}/rerun-failed-jobs`);
    return { success: true, data: { runId, rerunRequested: true } };
  },
};

// ---------- Orders (Bachs checkouts and payments) ----------

const bachsId = z.string().regex(/^[A-Za-z0-9_-]{3,100}$/);
const orderInput = z
  .object({
    checkoutId: bachsId.optional().describe('Bachs checkout id (chk_...) for the order'),
    chargeId: bachsId.optional().describe('Bachs charge id (ch_...) of the order payment'),
  })
  .refine((v) => v.checkoutId || v.chargeId, 'Provide checkoutId or chargeId');

function paymentView(p: BachsPayment) {
  return {
    chargeId: p.payment_id,
    status: p.status,
    amount: formatMoney(p.amount, p.currency),
    paymentMethod: p.payment_method ?? null,
    message: p.message ?? null,
    statusHistory: (p.status_history ?? []).map((h) => ({ status: h.status, at: h.occurred_at, reason: h.reason ?? null })),
    createdAt: p.created_at,
    completedAt: p.completed_at ?? null,
  };
}

export const getOrderDetailsTool: Tool<z.infer<typeof orderInput>> = {
  id: 'get_order_details',
  name: 'Get Order Details',
  description:
    'Fetch an order from Bachs by checkout id or charge id: checkout status and expiry, payment status, payment method, and status history with failure reasons.',
  inputSchema: orderInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:orders'],
  requiresApproval: false,
  category: 'orders',
  handler: async ({ checkoutId, chargeId }) => {
    if (checkoutId) {
      const c = await bachs().get<any>(`/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`);
      return {
        success: true,
        data: {
          checkoutId: c.checkout_id,
          status: c.status,
          paymentStatus: c.payment_status ?? null,
          amount: c.amount ? formatMoney(c.amount, c.currency) : null,
          reference: c.reference ?? null,
          paymentMethod: c.payment_method ?? null,
          createdAt: c.created_at ?? null,
          expiresAt: c.expires_at ?? null,
          completedAt: c.completed_at ?? null,
          metadata: c.metadata ?? {},
          payment: c.charge ? paymentView(c.charge as BachsPayment) : null,
        },
      };
    }
    const p = await bachs().get<BachsPayment>(`/v1/payments/${encodeURIComponent(chargeId!)}`);
    return { success: true, data: { ...paymentView(p), checkoutId: p.checkout_id ?? null, reference: p.reference ?? null } };
  },
};

// ---------- Incidents (GitHub Issues) ----------

const searchTicketsInput = z.object({
  repo,
  query: z.string().max(200).optional().describe('Text to look for in open incident titles'),
});
export const searchTicketsTool: Tool<z.infer<typeof searchTicketsInput>> = {
  id: 'search_tickets',
  name: 'Search Open Incidents',
  description: 'List open incident tickets so you can update an existing one instead of creating duplicates.',
  inputSchema: searchTicketsInput,
  permissionLevel: 'low',
  requiredPermissions: ['read:tickets'],
  requiresApproval: false,
  category: 'incidents',
  handler: async ({ repo: repoName, query }) => {
    const r = resolveRepo(repoName);
    const issues = await github().get<any[]>(`/repos/${r.owner}/${r.name}/issues`, {
      labels: 'incident',
      state: 'open',
      per_page: 30,
    });
    const needle = query?.toLowerCase();
    return {
      success: true,
      data: issues
        .filter((i) => !i.pull_request)
        .filter((i) => !needle || String(i.title).toLowerCase().includes(needle))
        .map((i) => ({
          number: i.number,
          title: i.title,
          labels: i.labels.map((l: any) => l.name),
          createdAt: i.created_at,
          url: i.html_url,
        })),
    };
  },
};

const createTicketInput = z.object({
  repo,
  title: z.string().min(5).max(200),
  summary: z.string().min(20).max(6000).describe('Incident summary in Markdown: impact, evidence, likely cause, next steps'),
  severity: z.enum(['sev1', 'sev2', 'sev3']).describe('sev1 = outage, sev2 = degraded, sev3 = minor'),
  affectedServices: z.array(z.string().max(60)).max(10).optional(),
});
export const createTicketTool: Tool<z.infer<typeof createTicketInput>> = {
  id: 'create_ticket',
  name: 'Create Incident Ticket',
  description: 'Open an incident ticket (GitHub issue labelled "incident") with your summary.',
  inputSchema: createTicketInput,
  permissionLevel: 'medium',
  requiredPermissions: ['write:tickets'],
  requiresApproval: false,
  category: 'incidents',
  handler: async ({ repo: repoName, title, summary, severity, affectedServices }, context) => {
    const r = resolveRepo(repoName);
    const body = [
      summary,
      '',
      affectedServices?.length ? `**Affected services:** ${affectedServices.join(', ')}` : '',
      `**Severity:** ${severity}`,
      '',
      `_Opened by Athena OpsGuard · execution \`${context.executionId}\`_`,
    ]
      .filter((line) => line !== undefined)
      .join('\n');
    const issue = await github().post<any>(`/repos/${r.owner}/${r.name}/issues`, {
      title: `[${severity.toUpperCase()}] ${title}`,
      body,
      labels: ['incident', severity],
    });
    return { success: true, data: { number: issue.number, url: issue.html_url } };
  },
};

const updateIncidentInput = z.object({
  repo,
  number: z.number().int().positive().describe('Incident ticket number'),
  comment: z.string().min(5).max(6000).describe('Update in Markdown'),
  resolve: z.boolean().optional().describe('Close the incident as resolved'),
});
export const updateIncidentTool: Tool<z.infer<typeof updateIncidentInput>> = {
  id: 'update_incident',
  name: 'Update Incident',
  description: 'Add a status update to an incident ticket and optionally close it as resolved.',
  inputSchema: updateIncidentInput,
  permissionLevel: 'medium',
  requiredPermissions: ['write:tickets'],
  requiresApproval: false,
  category: 'incidents',
  handler: async ({ repo: repoName, number, comment, resolve }, context) => {
    const r = resolveRepo(repoName);
    await github().post(`/repos/${r.owner}/${r.name}/issues/${number}/comments`, {
      body: `${comment}\n\n_Athena OpsGuard · execution \`${context.executionId}\`_`,
    });
    if (resolve) {
      await github().patch(`/repos/${r.owner}/${r.name}/issues/${number}`, {
        state: 'closed',
        state_reason: 'completed',
      });
    }
    return { success: true, data: { number, commented: true, closed: Boolean(resolve) } };
  },
};

export const opsGuardTools: Tool[] = [
  getSystemStatusTool,
  checkServiceHealthTool,
  queryLogsTool,
  listWorkflowRunsTool,
  getWorkflowRunTool,
  rerunFailedJobsTool,
  getOrderDetailsTool,
  searchTicketsTool,
  createTicketTool,
  updateIncidentTool,
  sendNotificationTool,
];
