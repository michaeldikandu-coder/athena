import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { IApproval, ApprovalSchema } from '../schemas/approval.schema';

export const ApprovalModel: Model<IApproval> = defineModel<IApproval>('Approval', ApprovalSchema);
