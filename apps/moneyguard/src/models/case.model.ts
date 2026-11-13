import { Schema, model, models, Model } from 'mongoose';

export interface ICase {
  userId: string;
  agentId: string;
  executionId: string;
  chargeId: string;
  customerId?: string;
  title: string;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: string;
  status: 'open' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}

const CaseSchema = new Schema<ICase>(
  {
    userId: { type: String, required: true, index: true },
    agentId: { type: String, required: true },
    executionId: { type: String, required: true, index: true },
    chargeId: { type: String, required: true, index: true },
    customerId: { type: String, index: true },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], required: true },
    recommendedAction: { type: String, required: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
  },
  { timestamps: true, collection: 'moneyguard_cases' }
);

CaseSchema.index({ userId: 1, createdAt: -1 });

export const CaseModel: Model<ICase> =
  (models.MoneyGuardCase as Model<ICase>) || model<ICase>('MoneyGuardCase', CaseSchema);
