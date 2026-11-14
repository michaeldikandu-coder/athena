import { createHash } from 'crypto';
import { AgentModel, AgentToolModel, WorkflowModel } from '@athena/database';
import {
  AthenaApplication,
  defaultModel,
  defaultProvider,
  getApplication,
  listApplications,
  toolRegistry,
  validateWorkflowDefinition,
} from '@athena/core';
import { AppError, ConflictError, LLMProvider, logger } from '@athena/shared';

export interface InstallOptions {
  provider?: LLMProvider;
  model?: string;
}

/**
 * A stable fingerprint of what an application installs. When the code's
 * templates change (a new prompt, tool, or workflow), the fingerprint changes
 * and installed copies are brought up to date on the next start.
 */
export function templateVersion(app: AthenaApplication): string {
  const material = JSON.stringify({ agent: app.agent, workflows: app.workflows });
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

async function createWorkflowsFromTemplates(app: AthenaApplication, agentId: string, userId: string, onlyKeys?: Set<string>) {
  const ids: string[] = [];
  for (const template of app.workflows) {
    if (onlyKeys && !onlyKeys.has(template.key)) continue;
    const { trigger, steps } = validateWorkflowDefinition(template);
    const workflow = await WorkflowModel.create({
      name: template.name,
      description: template.description,
      agentId,
      trigger,
      steps,
      application: app.id,
      templateKey: template.key,
      // Scheduled workflows call the LLM on a timer; the user enables them explicitly
      status: trigger.type === 'schedule' ? 'inactive' : 'active',
      userId,
    });
    ids.push(String(workflow._id));
  }
  return ids;
}

/**
 * Install an application for a user: one agent built from the app template,
 * its tool assignments, and the app's workflow templates. Every installed
 * agent runs on the same AgentRuntime.
 */
export async function installApplication(
  appId: string,
  userId: string,
  options: InstallOptions = {}
): Promise<{ agentId: string; workflowIds: string[] }> {
  const app: AthenaApplication = getApplication(appId);

  if (await AgentModel.exists({ userId, application: appId })) {
    throw new ConflictError(`${app.name} is already installed`);
  }

  const provider = options.provider ?? defaultProvider();
  const agent = await AgentModel.create({
    name: app.agent.name,
    description: app.agent.description,
    systemPrompt: app.agent.systemPrompt,
    modelConfig: { provider, model: options.model || defaultModel(provider) },
    permissions: app.agent.permissions,
    maxIterations: app.agent.maxIterations ?? 15,
    application: app.id,
    templateVersion: templateVersion(app),
    userId,
    status: 'active',
  });
  const agentId = String(agent._id);

  try {
    await AgentToolModel.insertMany(app.agent.tools.map((toolId) => ({ agentId, toolId, enabled: true })));
    const workflowIds = await createWorkflowsFromTemplates(app, agentId, userId);
    return { agentId, workflowIds };
  } catch (error) {
    // Roll back a partial install
    await Promise.all([
      AgentModel.deleteOne({ _id: agentId }),
      AgentToolModel.deleteMany({ agentId }),
      WorkflowModel.deleteMany({ agentId }),
    ]);
    throw new AppError(`Failed to install ${app.name}`, { cause: error as Error });
  }
}

/**
 * Bring every installed application agent up to its current template.
 *
 * - Agent: name, description, prompt, permissions, and max iterations follow the
 *   template. The model, provider, and on/off status the user chose are kept.
 * - Tools: tools that no longer exist are removed and the template's tools added.
 *   Extra tools the user assigned that still exist are kept.
 * - Workflows: application workflows are matched to templates by key and updated
 *   (their on/off status kept); ones whose template was removed, or that predate
 *   template keys, are replaced. Workflows the user created are never touched.
 */
export async function syncInstalledApplications(): Promise<number> {
  let upgraded = 0;

  for (const app of listApplications()) {
    const version = templateVersion(app);
    const agents = await AgentModel.find({ application: app.id, templateVersion: { $ne: version } }).lean();

    for (const agent of agents) {
      const agentId = String(agent._id);
      try {
        await AgentModel.updateOne(
          { _id: agent._id },
          {
            name: app.agent.name,
            description: app.agent.description,
            systemPrompt: app.agent.systemPrompt,
            permissions: app.agent.permissions,
            maxIterations: app.agent.maxIterations ?? 15,
            templateVersion: version,
          }
        );

        const links = await AgentToolModel.find({ agentId }).lean();
        const stale = links.filter((l) => !toolRegistry.has(l.toolId)).map((l) => l.toolId);
        if (stale.length) await AgentToolModel.deleteMany({ agentId, toolId: { $in: stale } });
        for (const toolId of app.agent.tools) {
          await AgentToolModel.updateOne(
            { agentId, toolId },
            { $set: { enabled: true }, $setOnInsert: { agentId, toolId } },
            { upsert: true }
          );
        }

        const templates = new Map(app.workflows.map((t) => [t.key, t]));
        const existing = await WorkflowModel.find({ agentId, application: app.id }).lean();
        const kept = new Set<string>();
        for (const workflow of existing) {
          const template = workflow.templateKey ? templates.get(workflow.templateKey) : undefined;
          if (!template || kept.has(template.key)) {
            await WorkflowModel.deleteOne({ _id: workflow._id });
            continue;
          }
          const { trigger, steps } = validateWorkflowDefinition(template);
          await WorkflowModel.updateOne(
            { _id: workflow._id },
            { name: template.name, description: template.description, trigger, steps }
          );
          kept.add(template.key);
        }
        const missing = new Set(app.workflows.map((t) => t.key).filter((k) => !kept.has(k)));
        if (missing.size) await createWorkflowsFromTemplates(app, agentId, agent.userId, missing);

        upgraded++;
        logger.info(`Upgraded installed ${app.name} to the current template`, {
          agentId,
          removedTools: stale,
          replacedWorkflows: existing.length - kept.size,
        });
      } catch (error) {
        logger.error(`Could not upgrade installed ${app.name}`, error as Error, { agentId });
      }
    }
  }
  return upgraded;
}

export async function findInstalledAgent(appId: string, userId: string) {
  return AgentModel.findOne({ userId, application: appId }).lean();
}
