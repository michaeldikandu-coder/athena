import { ApprovalModel, IApproval } from '@athena/database';
import { ApprovalExpiredError, ConflictError, NotFoundError, logger } from '@athena/shared';
import { eventBus } from '../events/event-bus';

export interface ApprovalRequest {
  executionId: string;
  agentId: string;
  userId: string;
  tool: string;
  input: Record<string, any>;
  reason: string;
  expiresInMs?: number;
}

export interface ApprovalDecision {
  approvalId: string;
  reviewerId: string;
  approved: boolean;
  comment?: string;
}

export type ApprovalDoc = IApproval & { _id: unknown };

export type ApprovalOutcome =
  | { status: 'approved'; approval: ApprovalDoc }
  | { status: 'rejected'; approval: ApprovalDoc }
  | { status: 'expired'; approval: ApprovalDoc }
  | { status: 'cancelled' };

const DEFAULT_EXPIRY_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

/**
 * Approval Manager - human-in-the-loop decisions for sensitive tool calls.
 * Decisions wake waiting executions through the event bus; a slow DB poll
 * is kept as a fallback in case a decision is written by another process.
 */
export class ApprovalManager {
  private static instance: ApprovalManager;

  private constructor() {}

  static getInstance(): ApprovalManager {
    if (!ApprovalManager.instance) {
      ApprovalManager.instance = new ApprovalManager();
    }
    return ApprovalManager.instance;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDoc> {
    const expiresAt = new Date(Date.now() + (request.expiresInMs ?? DEFAULT_EXPIRY_MS));
    const doc = await ApprovalModel.create({
      executionId: request.executionId,
      agentId: request.agentId,
      userId: request.userId,
      requestedAction: { tool: request.tool, input: request.input, reason: request.reason },
      status: 'pending',
      requestedAt: new Date(),
      expiresAt,
    });
    const approval = doc.toObject() as ApprovalDoc;

    eventBus.emit('approval.requested', {
      userId: request.userId,
      approvalId: String(approval._id),
      executionId: request.executionId,
      tool: request.tool,
    });
    logger.info('Approval requested', {
      approvalId: String(approval._id),
      executionId: request.executionId,
      tool: request.tool,
    });
    return approval;
  }

  /**
   * Resolve once the approval is decided, expires, or isCancelled() returns true.
   */
  waitForDecision(approvalId: string, isCancelled: () => Promise<boolean>): Promise<ApprovalOutcome> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let pollTimer: NodeJS.Timeout | undefined;

      const finish = (outcome: ApprovalOutcome | Error): void => {
        if (settled) return;
        settled = true;
        unsubscribe();
        if (pollTimer) clearTimeout(pollTimer);
        if (outcome instanceof Error) reject(outcome);
        else resolve(outcome);
      };

      const evaluate = async (): Promise<void> => {
        try {
          const approval = (await ApprovalModel.findById(approvalId).lean()) as ApprovalDoc | null;
          if (!approval) return finish(new NotFoundError('Approval', approvalId));

          if (approval.status === 'pending' && new Date() > new Date(approval.expiresAt)) {
            await ApprovalModel.updateOne(
              { _id: approvalId, status: 'pending' },
              { status: 'expired' }
            );
            return finish({ status: 'expired', approval: { ...approval, status: 'expired' } });
          }
          if (approval.status === 'approved') return finish({ status: 'approved', approval });
          if (approval.status === 'rejected') return finish({ status: 'rejected', approval });
          if (approval.status === 'expired') return finish({ status: 'expired', approval });
          if (await isCancelled()) {
            await ApprovalModel.updateOne(
              { _id: approvalId, status: 'pending' },
              { status: 'expired', reviewerComment: 'Execution cancelled' }
            );
            return finish({ status: 'cancelled' });
          }
          pollTimer = setTimeout(() => void evaluate(), POLL_INTERVAL_MS);
        } catch (error) {
          finish(error as Error);
        }
      };

      const unsubscribe = eventBus.on('approval.decided', (event) => {
        if (event.approvalId === approvalId) {
          if (pollTimer) clearTimeout(pollTimer);
          void evaluate();
        }
      });

      void evaluate();
    });
  }

  /**
   * Record a reviewer decision. Only the approval owner may decide; the caller
   * must pass the authenticated user's id as reviewerId.
   */
  async decide(decision: ApprovalDecision, ownerUserId: string): Promise<ApprovalDoc> {
    const approval = (await ApprovalModel.findById(decision.approvalId).lean()) as ApprovalDoc | null;
    if (!approval || approval.userId !== ownerUserId) {
      throw new NotFoundError('Approval', decision.approvalId);
    }
    if (approval.status !== 'pending') {
      throw new ConflictError(`Approval already ${approval.status}`);
    }
    if (new Date() > new Date(approval.expiresAt)) {
      await ApprovalModel.updateOne({ _id: decision.approvalId }, { status: 'expired' });
      throw new ApprovalExpiredError(decision.approvalId);
    }

    const status = decision.approved ? 'approved' : 'rejected';
    // Conditional update prevents two concurrent decisions from both succeeding
    const updated = (await ApprovalModel.findOneAndUpdate(
      { _id: decision.approvalId, status: 'pending' },
      {
        status,
        reviewerId: decision.reviewerId,
        reviewerComment: decision.comment,
        reviewedAt: new Date(),
      },
      { new: true }
    ).lean()) as ApprovalDoc | null;

    if (!updated) {
      throw new ConflictError('Approval was decided concurrently');
    }

    eventBus.emit('approval.decided', {
      userId: approval.userId,
      approvalId: decision.approvalId,
      executionId: approval.executionId,
      status,
    });
    logger.info('Approval decided', { approvalId: decision.approvalId, status });
    return updated;
  }

  async getApproval(approvalId: string, userId: string): Promise<ApprovalDoc | null> {
    const approval = (await ApprovalModel.findById(approvalId).lean()) as ApprovalDoc | null;
    return approval && approval.userId === userId ? approval : null;
  }

  async list(filters: {
    userId: string;
    status?: IApproval['status'];
    executionId?: string;
    limit?: number;
  }): Promise<ApprovalDoc[]> {
    const query: Record<string, any> = { userId: filters.userId };
    if (filters.status) query.status = filters.status;
    if (filters.executionId) query.executionId = filters.executionId;
    if (filters.status === 'pending') query.expiresAt = { $gt: new Date() };

    return (await ApprovalModel.find(query)
      .sort({ requestedAt: -1 })
      .limit(Math.min(filters.limit ?? 50, 200))
      .lean()) as ApprovalDoc[];
  }

  async cleanupExpired(): Promise<number> {
    const result = await ApprovalModel.updateMany(
      { status: 'pending', expiresAt: { $lt: new Date() } },
      { status: 'expired' }
    );
    return result.modifiedCount;
  }
}

export const approvalManager = ApprovalManager.getInstance();
