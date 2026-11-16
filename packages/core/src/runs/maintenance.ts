import { SystemLockModel } from '@athena/database';
import { logger } from '@athena/shared';
import { approvalManager } from '../approvals/approval-manager';
import { workflowEngine } from '../workflows/workflow-engine';
import { resumeStalledRuns } from './run-driver';

/**
 * Periodic work: start due scheduled workflows, expire approvals, and resume
 * runs nobody is advancing. Triggered by a timer on long-lived servers and by
 * a cron request or dashboard traffic on serverless hosts.
 */
export async function runMaintenance(): Promise<{ scheduled: number; resumed: number; expired: number }> {
  const expired = await approvalManager.cleanupExpired();
  const resumed = await resumeStalledRuns();
  const scheduled = await workflowEngine.runScheduled();
  if (scheduled || resumed || expired) logger.info('Maintenance', { scheduled, resumed, expired });
  return { scheduled, resumed, expired };
}

/**
 * Run maintenance unless another process did within `intervalMs`. Safe to
 * call often and from many instances.
 */
export async function maybeRunMaintenance(intervalMs = 60_000): Promise<boolean> {
  const now = new Date();
  const due = await SystemLockModel.updateOne(
    { _id: 'maintenance', at: { $lt: new Date(now.getTime() - intervalMs) } },
    { at: now }
  );
  if (due.matchedCount === 0) {
    try {
      await SystemLockModel.create({ _id: 'maintenance', at: now });
    } catch {
      return false; // exists and is not due yet
    }
  }
  await runMaintenance();
  return true;
}
