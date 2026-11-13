/**
 * Convert Mongo documents into API shapes (string ids, no internal fields)
 */

type Doc = Record<string, any> & { _id: unknown };

export function serializeAgent(agent: Doc, toolIds: string[] = []) {
  return {
    id: String(agent._id),
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    modelConfig: agent.modelConfig,
    permissions: agent.permissions ?? [],
    application: agent.application ?? null,
    maxIterations: agent.maxIterations ?? 15,
    status: agent.status,
    tools: toolIds,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export function serializeExecution(execution: Doc, agentName?: string) {
  return {
    id: String(execution._id),
    agentId: execution.agentId,
    agentName: agentName ?? null,
    workflowId: execution.workflowId ?? null,
    application: execution.application ?? null,
    task: execution.task ?? null,
    trigger: execution.trigger,
    status: execution.status,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt ?? null,
    durationMs: execution.completedAt
      ? new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
      : null,
    error: execution.error ?? null,
    result: execution.result ?? null,
    iterations: execution.iterations ?? 0,
    toolCallCount: execution.toolCallCount ?? 0,
    usage: execution.usage ?? { inputTokens: 0, outputTokens: 0 },
  };
}

export function serializeApproval(approval: Doc) {
  return {
    id: String(approval._id),
    executionId: approval.executionId,
    agentId: approval.agentId,
    requestedAction: approval.requestedAction,
    status: approval.status,
    reviewerId: approval.reviewerId ?? null,
    reviewerComment: approval.reviewerComment ?? null,
    requestedAt: approval.requestedAt,
    reviewedAt: approval.reviewedAt ?? null,
    expiresAt: approval.expiresAt,
  };
}

export function serializeWorkflow(workflow: Doc, extra: Record<string, unknown> = {}) {
  return {
    id: String(workflow._id),
    name: workflow.name,
    description: workflow.description,
    agentId: workflow.agentId,
    application: workflow.application ?? null,
    trigger: workflow.trigger,
    steps: workflow.steps,
    status: workflow.status,
    lastRunAt: workflow.lastRunAt ?? null,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    ...extra,
  };
}
