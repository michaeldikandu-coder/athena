import { Schema } from 'mongoose';

/**
 * A third-party service connected by one user (Bachs, GitHub, Slack, or the
 * list of services OpsGuard monitors). Secret values are encrypted by the
 * caller before they reach this model and are never selected by default.
 */
export interface IConnection {
  userId: string;
  provider: 'bachs' | 'github' | 'slack' | 'services';
  /** AES-GCM ciphertext of a JSON object of secret values */
  secretsEncrypted: string;
  /** Non-secret settings, e.g. { repo: "acme/shop" } or { services: [...] } */
  config: Record<string, unknown>;
  /** Masked previews of secrets for display, e.g. { apiKey: "sk_sandbox_…f3a1" } */
  hints: Record<string, string>;
  /** Random id used in this connection's public webhook URL */
  webhookToken?: string;
  status: 'connected' | 'error';
  lastVerifiedAt?: Date;
  lastError?: string;
  lastWebhookAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const ConnectionSchema = new Schema<IConnection>(
  {
    userId: { type: String, required: true, index: true },
    provider: { type: String, enum: ['bachs', 'github', 'slack', 'services'], required: true },
    secretsEncrypted: { type: String, required: true, select: false },
    config: { type: Schema.Types.Mixed, default: {} },
    hints: { type: Schema.Types.Mixed, default: {} },
    webhookToken: { type: String },
    status: { type: String, enum: ['connected', 'error'], default: 'connected' },
    lastVerifiedAt: Date,
    lastError: String,
    lastWebhookAt: Date,
  },
  { timestamps: true, collection: 'connections', minimize: false }
);

ConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });
ConnectionSchema.index({ webhookToken: 1 }, { unique: true, sparse: true });
