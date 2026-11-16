import { Schema } from 'mongoose';

/**
 * Webhook deliveries already processed, so provider retries run once.
 * Documents expire after a day.
 */
export interface IWebhookDelivery {
  _id: string;
  createdAt: Date;
}

export const WebhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    _id: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
  },
  { collection: 'webhook_deliveries', versionKey: false }
);

/**
 * Named locks with a timestamp, used to run periodic maintenance at most once
 * per interval across many server instances.
 */
export interface ISystemLock {
  _id: string;
  at: Date;
}

export const SystemLockSchema = new Schema<ISystemLock>(
  {
    _id: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { collection: 'system_locks', versionKey: false }
);
