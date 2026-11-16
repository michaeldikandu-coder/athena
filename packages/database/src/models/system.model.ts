import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { ISystemLock, IWebhookDelivery, SystemLockSchema, WebhookDeliverySchema } from '../schemas/system.schema';

export const WebhookDeliveryModel: Model<IWebhookDelivery> = defineModel<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema);
export const SystemLockModel: Model<ISystemLock> = defineModel<ISystemLock>('SystemLock', SystemLockSchema);
