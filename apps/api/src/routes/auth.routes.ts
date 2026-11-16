import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { UserModel } from '@athena/database';
import {
  AppError,
  ConflictError,
  InvalidCredentialsError,
  NotFoundError,
  commonSchemas,
  logger,
  successResponse,
} from '@athena/shared';
import { config } from '../config';
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  signSessionToken,
} from '../middleware/auth';
import { asyncHandler, validate } from '../middleware/validate';

const router = Router();
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('athena-dummy-password', BCRYPT_ROUNDS);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many attempts, try again later' } },
});

const registerBody = z.object({
  email: commonSchemas.email.max(200).transform((e) => e.toLowerCase()),
  password: commonSchemas.password.max(200),
  name: z.string().trim().min(1).max(100),
});

const loginBody = z.object({
  email: z.string().email().max(200).transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(200),
});

function publicUser(user: { _id: unknown; email: string; name: string; role: string; createdAt?: Date }) {
  return { id: String(user._id), email: user.email, name: user.name, role: user.role, createdAt: user.createdAt };
}

router.post(
  '/register',
  authLimiter,
  validate({ body: registerBody }),
  asyncHandler(async (req, res) => {
    if (!config.allowRegistration) {
      throw new AppError('Registration is disabled', { statusCode: 403 });
    }
    const { email, password, name } = req.body as z.infer<typeof registerBody>;
    if (await UserModel.exists({ email })) {
      throw new ConflictError('An account with this email already exists');
    }
    // The first account becomes the admin
    const isFirst = (await UserModel.estimatedDocumentCount()) === 0;
    const user = await UserModel.create({
      email,
      name,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: isFirst ? 'admin' : 'user',
    });
    setSessionCookie(res, signSessionToken({ id: String(user._id), role: user.role }));
    logger.info('User registered', { userId: String(user._id) });
    res.status(201).json(successResponse({ user: publicUser(user) }));
  })
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginBody }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginBody>;
    const user = await UserModel.findOne({ email }).select('+password');
    // Compare even when the user is missing so timing does not reveal accounts
    const hash = user?.password ?? DUMMY_HASH;
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid || !user.isActive) {
      logger.warn('Failed login', { email: email.replace(/(.{2}).*(@.*)/, '$1***$2') });
      throw new InvalidCredentialsError();
    }
    setSessionCookie(res, signSessionToken({ id: String(user._id), role: user.role }));
    logger.info('User logged in', { userId: String(user._id) });
    res.json(successResponse({ user: publicUser(user) }));
  })
);

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json(successResponse({ loggedOut: true }));
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user!.id).lean();
    if (!user || !user.isActive) throw new NotFoundError('User');
    res.json(successResponse({ user: publicUser(user) }));
  })
);


export default router;
