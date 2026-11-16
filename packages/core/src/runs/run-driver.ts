import { randomUUID } from 'crypto';
import { ApprovalModel, ExecutionModel } from '@athena/database';
import { AppError, logger } from '@athena/shared';
import { agentRuntime, ExecutionCancelledError, RuntimeContext } from '../agent/agent-runtime';
import { workflowEngine } from '../workflows/workflow-engine';
import { executionMonitor } from '../monitor/execution-monitor';
import { continueRun, registerRunDriver, runSliceMs, scheduleRun } from './background';
import { Budget, RunState, isSuspension, parseRunState, serializeRunState } from './run-state';

/**
 * Advances runs from their checkpoints. Exactly one process advances a run at
 * a time: it holds a lease that every checkpoint renews. If that process dies,
 * the lease runs out and maintenance hands the run to another process.
 */

const LEASE_MS = 3 * 60 * 1000;
const DRIVABLE = ['pending', 'running', 'waiting_approval'];

class LeaseLostError extends AppError {
  constructor(executionId: string) {
    super('Another process took over this run', { context: { executionId } });
  }
}

export async function driveRun(executionId: string): Promise<void> {
  const leaseId = randomUUID();
  const now = new Date();
  const execution = await ExecutionModel.findOneAndUpdate(
    {
      _id: executionId,
      status: { $in: DRIVABLE },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }],
    },
    { leaseId, leaseUntil: new Date(now.getTime() + LEASE_MS) },
    { new: true }
  )
    .select('+stateJson')
    .lean();
  // Finished, or another process is advancing it
  if (!execution) return;

  const target = { id: executionId, userId: execution.userId, agentId: execution.agentId };
  const release = () =>
    ExecutionModel.updateOne({ _id: executionId, leaseId }, { leaseId: null, leaseUntil: null }).catch(() => undefined);

  let state: RunState | undefined;
  const save = async (): Promise<void> => {
    const result = await ExecutionModel.updateOne(
      { _id: executionId, leaseId },
      { stateJson: serializeRunState(state!), leaseUntil: new Date(Date.now() + LEASE_MS) }
    );
    if (result.matchedCount === 0) throw new LeaseLostError(executionId);
  };

  try {
    state = parseRunState(execution.stateJson);
    if (execution.cancelRequested) throw new ExecutionCancelledError(executionId);

    const agent = await agentRuntime.loadAgent(execution.agentId, execution.userId);
    const ctx: RuntimeContext = { executionId, agent, userId: execution.userId, startedAt: execution.startedAt };
    if (execution.status === 'pending') await executionMonitor.setStatus(target, 'running');

    const budget = new Budget(runSliceMs());
    const current = state;
    const outcome =
      current.kind === 'agent'
        ? await agentRuntime.advanceAgent(ctx, current.agent, budget, save)
        : await workflowEngine.advance(execution.workflowId!, ctx, current.workflow, budget, save);

    await release();
    if (isSuspension(outcome)) {
      if (outcome.suspended === 'budget') {
        logger.info('Run continues in a new slice', { executionId });
        continueRun(executionId);
      }
      return;
    }
    await executionMonitor.setStatus(target, 'completed', { result: outcome as Record<string, any> });
  } catch (error) {
    if (error instanceof LeaseLostError) {
      logger.warn('Run lease lost; another process continues it', { executionId });
      return;
    }
    await release();
    if (error instanceof ExecutionCancelledError) {
      await ApprovalModel.updateMany(
        { executionId, status: 'pending' },
        { status: 'expired', reviewerComment: 'Execution cancelled' }
      );
      await executionMonitor.setStatus(target, 'cancelled');
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Execution failed', error as Error, { executionId });
    await executionMonitor
      .record({ executionId, userId: execution.userId, type: 'error', output: { message }, status: 'failure' })
      .catch(() => undefined);
    await executionMonitor.setStatus(target, 'failed', { error: message });
  }
}

registerRunDriver(driveRun);

/**
 * Hand runs that nobody is advancing to a process: crashed or timed-out
 * invocations, lost continuations, and runs whose approval was decided or
 * expired while no process was listening.
 */
export async function resumeStalledRuns(): Promise<number> {
  const now = Date.now();
  const unleased = { $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date(now) } }] };

  const stalled = await ExecutionModel.find({
    status: { $in: ['pending', 'running'] },
    updatedAt: { $lt: new Date(now - 30_000) },
    ...unleased,
  })
    .select('_id')
    .limit(50)
    .lean();

  const waiting = await ExecutionModel.find({ status: 'waiting_approval', ...unleased })
    .select('_id')
    .limit(200)
    .lean();
  const waitingIds = waiting.map((w) => String(w._id));
  const stillWaiting = new Set(
    (
      await ApprovalModel.find({
        executionId: { $in: waitingIds },
        status: 'pending',
        expiresAt: { $gt: new Date(now) },
      })
        .select('executionId')
        .lean()
    ).map((a) => a.executionId)
  );

  const ids = [...stalled.map((s) => String(s._id)), ...waitingIds.filter((id) => !stillWaiting.has(id))];
  ids.forEach((id) => scheduleRun(id));
  return ids.length;
}
