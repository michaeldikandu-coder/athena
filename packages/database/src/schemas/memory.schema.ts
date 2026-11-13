import { Schema } from 'mongoose';

export interface IMemory {
  _id: string;
  agentId: string;
  executionId?: string;
  type: 'context' | 'conversation' | 'fact' | 'decision';
  content: string;
  metadata?: Record<string, any>;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const MemorySchema = new Schema<IMemory>(
  {
    agentId: {
      type: String,
      required: true,
      index: true,
    },
    executionId: {
      type: String,
      index: true,
    },
    type: {
      type: String,
      enum: ['context', 'conversation', 'fact', 'decision'],
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'memories',
  }
);

// Indexes
MemorySchema.index({ agentId: 1, type: 1, createdAt: -1 });
MemorySchema.index({ executionId: 1 });
MemorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
MemorySchema.index({ 'metadata.customerId': 1 }); // Example metadata index
