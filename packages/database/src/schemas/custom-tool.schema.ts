import { Schema } from 'mongoose';

/**
 * An HTTP tool a user defined in the dashboard. The agent fills in the
 * inputs; Athena builds the request from the URL template and sends it.
 */
export interface ICustomToolInput {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
}

export interface ICustomTool {
  userId: string;
  /** Registry id the model sees, e.g. "custom_shopify_order_a1b2" */
  toolId: string;
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** URL with {input} placeholders, e.g. https://api.example.com/orders/{orderId} */
  url: string;
  inputs: ICustomToolInput[];
  /** Non-secret headers */
  headers: Record<string, string>;
  /** Header that carries a secret, e.g. "Authorization" */
  secretHeaderName?: string;
  /** AES-GCM ciphertext of the secret header value */
  secretEncrypted?: string;
  secretHint?: string;
  requiresApproval: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const InputSchema = new Schema<ICustomToolInput>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['string', 'number', 'boolean'], required: true },
    description: { type: String, default: '' },
    required: { type: Boolean, default: true },
  },
  { _id: false }
);

export const CustomToolSchema = new Schema<ICustomTool>(
  {
    userId: { type: String, required: true, index: true },
    toolId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    method: { type: String, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], required: true },
    url: { type: String, required: true },
    inputs: { type: [InputSchema], default: [] },
    headers: { type: Schema.Types.Mixed, default: {} },
    secretHeaderName: String,
    secretEncrypted: { type: String, select: false },
    secretHint: String,
    requiresApproval: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'custom_tools', minimize: false }
);
