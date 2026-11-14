import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { AppError } from './errors';
import { logger } from './logger';

/**
 * Authenticated encryption (AES-256-GCM) for credentials users store in Athena.
 *
 * The key comes from ENCRYPTION_KEY (any string of 32+ characters), stretched
 * with HKDF. Ciphertext format: "v1.<iv>.<tag>.<data>" in base64url.
 * Changing ENCRYPTION_KEY makes existing ciphertext unreadable, so users would
 * have to reconnect their services.
 */

const VERSION = 'v1';
const DEV_FALLBACK = 'athena-dev-only-encryption-key-do-not-use-in-production';
let cachedKey: Buffer | undefined;
let warned = false;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  let secret = process.env.ENCRYPTION_KEY ?? '';
  if (secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('ENCRYPTION_KEY must be set to at least 32 characters', { statusCode: 500 });
    }
    if (!warned) {
      logger.warn('ENCRYPTION_KEY is missing or shorter than 32 characters; using an insecure development key');
      warned = true;
    }
    secret = DEV_FALLBACK;
  }
  cachedKey = Buffer.from(hkdfSync('sha256', secret, 'athena', 'connection-secrets-v1', 32));
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptSecret(ciphertext: string): string {
  const [version, iv, tag, data] = ciphertext.split('.');
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new AppError('Unsupported secret format', { statusCode: 500 });
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch (error) {
    throw new AppError('Stored credentials could not be decrypted (was ENCRYPTION_KEY changed?)', {
      statusCode: 500,
      cause: error as Error,
    });
  }
}

/** For tests: forget the derived key so a new ENCRYPTION_KEY takes effect */
export function resetEncryptionKeyCache(): void {
  cachedKey = undefined;
}
