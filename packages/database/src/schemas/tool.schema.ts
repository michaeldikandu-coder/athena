import { Schema } from 'mongoose';

export interface ITool {
  name: string;
  description: string;
  inputSchema: Record<string, any>; // JSON Schema
  outputSchema?: Record<string, any>; // JSON Schema
  permissionLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  implementation: string; // Reference to handler function
  category?: string;
  isSystem: boolean; // System tools vs user-defined
  createdAt: Date;
  updatedAt: Date;
}

export const ToolSchema = new Schema<ITool>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    inputSchema: {
      type: Schema.Types.Mixed,
      required: true,
    },
    outputSchema: {
      type: Schema.Types.Mixed,
    },
    permissionLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: true,
      index: true,
    },
    requiresApproval: {
      type: Boolean,
      default: false,
      index: true,
    },
    implementation: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      trim: true,
      index: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'tools',
  }
);

// Indexes
ToolSchema.index({ name: 1 }, { unique: true });
ToolSchema.index({ category: 1, permissionLevel: 1 });
ToolSchema.index({ isSystem: 1 });
