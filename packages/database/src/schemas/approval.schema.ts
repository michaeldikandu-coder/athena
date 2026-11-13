import { Schema } from 'mongoose';

export interface IApprovalRequestedAction {
  tool: string;
  input: Record<string, any>;
  reason: string;
}

export interface IApproval {
  executionId: string;
  agentId: string;
  userId: string;
  requestedAction: IApprovalRequestedAction;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewerId?: string;
  reviewerComment?: string;
  requestedAt: Date;
  reviewedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalRequestedActionSchema = new Schema<IApprovalRequestedAction>(
  {
    tool: {
      type: String,
      required: true,
    },
    input: {
      type: Schema.Types.Mixed,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

export const ApprovalSchema = new Schema<IApproval>(
  {
    executionId: {
      type: String,
      required: true,
      index: true,
    },
    agentId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    requestedAction: {
      type: ApprovalRequestedActionSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'expired'],
      default: 'pending',
      index: true,
    },
    reviewerId: {
      type: String,
      index: true,
    },
    reviewerComment: {
      type: String,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reviewedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'approvals',
  }
);

// Indexes
ApprovalSchema.index({ status: 1, requestedAt: -1 });
ApprovalSchema.index({ executionId: 1, status: 1 });
ApprovalSchema.index({ reviewerId: 1, reviewedAt: -1 });
ApprovalSchema.index({ expiresAt: 1 });
