import { Router } from 'express';
import { z } from 'zod';
import { AgentModel, WorkflowModel } from '@athena/database';
import { agentRuntime, describeApplication, getApplication, listApplications } from '@athena/core';
import { bachsEnvironment, isBachsConfigured, isGithubConfigured, github, resolveRepo } from '@athena/integrations';
import { CaseModel, fetchRecentPayments } from '@athena/moneyguard';
import { checkHealth, getServices } from '@athena/opsguard';
import { AppError, NotFoundError, logger, successResponse } from '@athena/shared';
import { asyncHandler, validate } from '../middleware/validate';
import { findInstalledAgent, installApplication } from '../services/app-installer';

const router = Router();

const appParams = z.object({ appId: z.string().regex(/^[a-z0-9-]{1,40}$/) });
const installBody = z.object({
  provider: z.enum(['anthropic', 'groq']).optional(),
  model: z.string().trim().max(100).optional(),
});

async function requireInstalledAgentId(appId: string, userId: string): Promise<string> {
  const agent = await findInstalledAgent(appId, userId);
  if (!agent) throw new AppError(`${getApplication(appId).name} is not installed`, { statusCode: 409 });
  return String(agent._id);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const installed = await AgentModel.find({ userId: req.user!.id, application: { $exists: true } })
      .select('application status')
      .lean();
    const byApp = new Map(installed.map((a) => [a.application, a]));
    res.json(
      successResponse(
        listApplications().map((app) => {
          const agent = byApp.get(app.id);
          return {
            ...describeApplication(app),
            installed: Boolean(agent),
            agentId: agent ? String(agent._id) : null,
          };
        })
      )
    );
  })
);

router.post(
  '/:appId/install',
  validate({ params: appParams, body: installBody }),
  asyncHandler(async (req, res) => {
    const result = await installApplication(req.params.appId, req.user!.id, req.body);
    res.status(201).json(successResponse(result));
  })
);

router.get(
  '/:appId',
  validate({ params: appParams }),
  asyncHandler(async (req, res) => {
    const app = getApplication(req.params.appId);
    const agent = await findInstalledAgent(app.id, req.user!.id);
    const workflows = agent
      ? await WorkflowModel.find({ agentId: String(agent._id), userId: req.user!.id }).lean()
      : [];
    res.json(
      successResponse({
        ...describeApplication(app),
        installed: Boolean(agent),
        agentId: agent ? String(agent._id) : null,
        installedWorkflows: workflows.map((w) => ({
          id: String(w._id),
          name: w.name,
          status: w.status,
          trigger: w.trigger,
        })),
      })
    );
  })
);

// ---------- MoneyGuard ----------

router.get(
  '/moneyguard/payments',
  asyncHandler(async (_req, res) => {
    if (!isBachsConfigured()) {
      res.json(successResponse({ configured: false, environment: null, payments: [] }));
      return;
    }
    const payments = await fetchRecentPayments(25);
    res.json(
      successResponse({
        configured: true,
        environment: bachsEnvironment(),
        payments: payments.map((p) => ({
          chargeId: p.id ?? null,
          status: p.status,
          amount: p.amount,
          currency: p.currency,
          customerName: p.customer_name ?? null,
          customerEmail: p.customer_email ?? null,
          reference: p.reference ?? null,
          settlement: p.settlement_amount ? { amount: p.settlement_amount, currency: p.settlement_currency } : null,
          isRefundable: p.is_refundable ?? null,
          date: p.transaction_date ?? p.completed_at ?? null,
        })),
      })
    );
  })
);

router.get(
  '/moneyguard/cases',
  asyncHandler(async (req, res) => {
    const cases = await CaseModel.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(successResponse(cases.map((c) => ({ ...c, id: String(c._id), _id: undefined }))));
  })
);

const investigateChargeBody = z.object({
  chargeId: z.string().regex(/^[A-Za-z0-9_-]{3,100}$/),
  note: z.string().max(1000).optional(),
});

router.post(
  '/moneyguard/investigate',
  validate({ body: investigateChargeBody }),
  asyncHandler(async (req, res) => {
    const { chargeId, note } = req.body as z.infer<typeof investigateChargeBody>;
    const agentId = await requireInstalledAgentId('moneyguard', req.user!.id);
    const result = await agentRuntime.start({
      agentId,
      userId: req.user!.id,
      task: `Investigate Bachs payment ${chargeId}.${note ? ` Reviewer note: ${note}` : ''}`,
      trigger: { type: 'manual', source: 'moneyguard', payload: { chargeId } },
    });
    res.status(202).json(successResponse(result));
  })
);

// ---------- OpsGuard ----------

router.get(
  '/opsguard/overview',
  asyncHandler(async (_req, res) => {
    const services = getServices();
    const health = await Promise.all(services.map((s) => checkHealth(s)));

    let failedRuns: unknown[] = [];
    let githubError: string | null = null;
    if (isGithubConfigured()) {
      try {
        const r = resolveRepo();
        const data = await github().get<{ workflow_runs: any[] }>(`/repos/${r.owner}/${r.name}/actions/runs`, {
          status: 'failure',
          per_page: 5,
        });
        failedRuns = data.workflow_runs.map((run) => ({
          id: run.id,
          name: run.name,
          branch: run.head_branch,
          createdAt: run.created_at,
          url: run.html_url,
        }));
      } catch (error) {
        githubError = (error as Error).message;
        logger.warn('OpsGuard overview: GitHub request failed', { error: githubError });
      }
    }

    res.json(
      successResponse({
        services: health,
        github: { configured: isGithubConfigured(), repo: process.env.GITHUB_REPO ?? null, failedRuns, error: githubError },
      })
    );
  })
);

const investigateIncidentBody = z.object({
  description: z.string().trim().min(5).max(2000),
  service: z.string().max(60).optional(),
});

router.post(
  '/opsguard/investigate',
  validate({ body: investigateIncidentBody }),
  asyncHandler(async (req, res) => {
    const { description, service } = req.body as z.infer<typeof investigateIncidentBody>;
    const agentId = await requireInstalledAgentId('opsguard', req.user!.id);
    const result = await agentRuntime.start({
      agentId,
      userId: req.user!.id,
      task: `Operational issue reported${service ? ` for service "${service}"` : ''}: ${description}. Investigate and respond.`,
      trigger: { type: 'manual', source: 'opsguard', payload: { description, service } },
    });
    res.status(202).json(successResponse(result));
  })
);

router.use((_req, _res, next) => next(new NotFoundError('Application route')));

export default router;
