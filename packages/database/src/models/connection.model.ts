import { model, Model } from 'mongoose';
import { ConnectionSchema, IConnection } from '../schemas/connection.schema';

export const ConnectionModel: Model<IConnection> = model<IConnection>('Connection', ConnectionSchema);
