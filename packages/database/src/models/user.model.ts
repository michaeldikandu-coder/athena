import { model, Model } from 'mongoose';
import { IUser, UserSchema } from '../schemas/user.schema';

export const UserModel: Model<IUser> = model<IUser>('User', UserSchema);
