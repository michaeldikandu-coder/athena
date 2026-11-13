import { ApprovalModel, IApproval } from '@athena/database';
import {
  ApprovalDeniedError,
  ApprovalExpiredError,
  ApprovalPendingError,
  NotFoundError,
  logger,
} from '@athena/shared';

export interface ApprovalRequest {
  executionId: string;
  agentId: string;
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

/**
 * Approval Manager - Handles human approval workflow
 */
export class ApprovalManager {
  private static instance: ApprovalManager;
  private readonly DEFAULT_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  private constructor() {}

  static getInstance(): ApprovalManager {
    if (!ApprovalManager.instance) {
      ApprovalManager.instance = new ApprovalManager();
    }
    return ApprovalManager.instance;
  }

  /**
   * Request approval for an action
   */
  async requestApproval(request: ApprovalRequest): Promise<IApproval> {
    const expiresAt = new Date(Date.now() + (request.expiresInMs || this.DEFAULT_EXPIRY_MS));

    const approval = await ApprovalModel.create({
      executionId: request.executionId,
      agentId: request.agentId,
      requestedAction: {
        tool: request.tool,
        input: request.input,
        reason: request.reason,
      },
      status: 'pending',
      requestedAt: new Date(),
      expiresAt,
    });

    logger.info('Approval requested', {
      approvalId: approval._id,
      executionId: request.executionId,
      tool: request.tool,
      expiresAt,
    });

    return approval;
  }

  /**
   * Wait for approval decision
   */
  async waitForApproval(
    approvalId: string,
    options: {
      pollIntervalMs?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<IApproval> {
    const { pollIntervalMs = 2000, timeoutMs = 5 * 60 * 1000 } = options;
    const startTime = Date.now();

    while (true) {
      const approval = await ApprovalModel.findById(approvalId);

      if (!approval) {
        throw new NotFoundError('Approval', approvalId);
      }

      // Check if expired
      if (new Date() > approval.expiresAt) {
        if (approval.status === 'pending') {
          await ApprovalModel.findByIdAndUpdate(approvalId, { status: 'expired' });
        }
        throw new ApprovalExpiredError(approvalId);
      }

      // Check if decided
      if (approval.status === 'approved') {
        logger.info('Approval granted', {
          approvalId,
          reviewerId: approval.reviewerId,
        });
        return approval;
      }

      if (approval.status === 'rejected') {
        logger.warn('Approval rejected', {
          approvalId,
          reviewerId: approval.reviewerId,
          reason: approval.reviewerComment,
        });
        throw new ApprovalDeniedError(approval.reviewerComment);
      }

      if (approval.status === 'expired') {
        throw new ApprovalExpiredError(approvalId);
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Approval wait timeout after ${timeoutMs}ms`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  /**
   * Make an approval decision
   */
  async decide(decision: ApprovalDecision): Promise<IApproval> {
    const approval = await ApprovalModel.findById(decision.approvalId);

    if (!approval) {
      throw new NotFoundError('Approval', decision.approvalId);
    }

    // Check if already decided
    if (approval.status !== 'pending') {
      throw new Error(`Approval already ${approval.status}`);
    }

    // Check if expired
    if (new Date() > approval.expiresAt) {
      await ApprovalModel.findByIdAndUpdate(decision.approvalId, { status: 'expired' });
      throw new ApprovalExpiredError(decision.approvalId);
    }

    // Update approval
    const updated = await ApprovalModel.findByIdAndUpdate(
      decision.approvalId,
      {
        status: decision.approved ? 'approved' : 'rejected',
        reviewerId: decision.reviewerId,
        reviewerComment: decision.comment,
        reviewedAt: new Date(),
      },
      { new: true }
    );

    logger.info('Approval decision made', {
      approvalId: decision.approvalId,
      approved: decision.approved,
      reviewerId: decision.reviewerId,
    });

    return updated!;
  }

  /**
   * Get approval by ID
   */
  async getApproval(approvalId: string): Promise<IApproval | null> {
    return ApprovalModel.findById(approvalId);
  }

  /**
   * Get pending approvals
   */
  async getPendingApprovals(filters: {
    agentId?: string;
    executionId?: string;
    limit?: number;
  } = {}): Promise<IApproval[]> {
    const query: any = { status: 'pending', expiresAt: { $gt: new Date() } };

    if (filters.agentId) {
      query.agentId = filters.agentId;
    }

    if (filters.executionId) {
      query.executionId = filters.executionId;
    }

    return ApprovalModel.find(query)
      .sort({ requestedAt: -1 })
      .limit(filters.limit || 50);
  }

  /**
   * Get approval history for an execution
   */
  async getExecutionApprovals(executionId: string): Promise<IApproval[]> {
    return ApprovalModel.find({ executionId }).sort({ requestedAt: 1 });
  }

  /**
   * Cancel an approval request
   */
  async cancel(approvalId: string): Promise<void> {
    const approval = await ApprovalModel.findById(approvalId);

    if (!approval) {
      throw new NotFoundError('Approval', approvalId);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Cannot cancel approval with status: ${approval.status}`);
    }

    await ApprovalModel.findByIdAndUpdate(approvalId, { status: 'expired' });

    logger.info('Approval cancelled', { approvalId });
  }

  /**
   * Clean up expired approvals
   */
  async cleanupExpired(): Promise<number> {
    const result = await ApprovalModel.updateMany(
      {
        status: 'pending',
        expiresAt: { $lt: new Date() },
      },
      {
        status: 'expired',
      }
    );

    if (result.modifiedCount > 0) {
      logger.info('Expired approvals cleaned up', { count: result.modifiedCount });
    }

    return result.modifiedCount;
  }

  /**
   * Check if approval is required for a tool
   */
  isApprovalRequired(
    toolRequiresApproval: boolean,
    permissionLevel: 'low' | 'medium' | 'high'
  ): boolean {
    // Always require approval for high-risk tools
    if (permissionLevel === 'high') {
      return true;
    }

    // Check tool-specific requirement
    return toolRequiresApproval;
  }
}

// Export singleton instance
export const approvalManager = ApprovalManager.getInstance();
