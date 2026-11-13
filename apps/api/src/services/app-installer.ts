import { AgentModel, AgentToolModel, WorkflowModel } from '@athena/database';
import {
  AthenaApplication,
  defaultModel,
  defaultProvider,
  getApplication,
  validateWorkflowDefinition,
} from '@athena/core';
import { AppError, ConflictError, LLMProvider } from '@athena/shared';

export interface InstallOptions {
  provider?: LLMProvider;
  model?: string;
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
    userId,
    status: 'active',
  });
  const agentId = String(agent._id);

  try {
    await AgentToolModel.insertMany(app.agent.tools.map((toolId) => ({ agentId, toolId, enabled: true })));

    const workflowIds: string[] = [];
    for (const template of app.workflows) {
      const { trigger, steps } = validateWorkflowDefinition(template);
      const workflow = await WorkflowModel.create({
        name: template.name,
        description: template.description,
        agentId,
        trigger,
        steps,
        application: app.id,
        // Scheduled workflows call the LLM on a timer; the user enables them explicitly
        status: trigger.type === 'schedule' ? 'inactive' : 'active',
        userId,
      });
      workflowIds.push(String(workflow._id));
    }
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

export async function findInstalledAgent(appId: string, userId: string) {
  return AgentModel.findOne({ userId, application: appId }).lean();
}
