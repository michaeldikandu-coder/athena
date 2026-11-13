import { model, Model } from 'mongoose';
import { IApproval, ApprovalSchema } from '../schemas/approval.schema';

export const ApprovalModel: Model<IApproval> = model<IApproval>('Approval', ApprovalSchema);
