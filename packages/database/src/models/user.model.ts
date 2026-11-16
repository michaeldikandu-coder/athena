import { Model } from 'mongoose';
import { defineModel } from './define-model';
import { IUser, UserSchema } from '../schemas/user.schema';

export const UserModel: Model<IUser> = defineModel<IUser>('User', UserSchema);
