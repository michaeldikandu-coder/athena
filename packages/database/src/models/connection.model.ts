import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { ConnectionSchema, IConnection } from '../schemas/connection.schema';

export const ConnectionModel: Model<IConnection> = defineModel<IConnection>('Connection', ConnectionSchema);
