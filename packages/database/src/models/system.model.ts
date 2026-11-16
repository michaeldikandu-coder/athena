import { model, Model } from 'mongoose';
import { ISystemLock, IWebhookDelivery, SystemLockSchema, WebhookDeliverySchema } from '../schemas/system.schema';

export const WebhookDeliveryModel: Model<IWebhookDelivery> = model<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema);
export const SystemLockModel: Model<ISystemLock> = model<ISystemLock>('SystemLock', SystemLockSchema);
