import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '@athena/shared';
import { config } from '../config';

export interface AuthUser {
  id: string;
  role: 'admin' | 'user';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      rawBody?: Buffer;
    }
  }
}

interface TokenPayload {
  sub: string;
  role: 'admin' | 'user';
  aud: string;
}

export function signSessionToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: user.id,
    audience: 'session',
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string, audience: 'session'): AuthUser {
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      audience,
      algorithms: ['HS256'],
    }) as TokenPayload;
    return { id: payload.sub, role: payload.role };
  } catch {
    throw new UnauthorizedError('Invalid or expired session');
  }
}

function extractToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.[config.cookieName];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) return next(new UnauthorizedError('Authentication required'));
  try {
    req.user = verifyToken(token, 'session');
    next();
  } catch (error) {
    next(error);
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.isProduction || config.cookieSameSite === 'none',
    sameSite: config.cookieSameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.isProduction || config.cookieSameSite === 'none',
    sameSite: config.cookieSameSite,
    path: '/',
  });
}
