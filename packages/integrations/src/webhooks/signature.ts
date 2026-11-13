import { createHmac, timingSafeEqual } from 'crypto';

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB);
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a generic Athena webhook signature.
 * Header format: "sha256=<hex hmac of raw body>".
 */
export function verifyHmacSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string
): boolean {
  if (!header || !secret) return false;
  const provided = header.startsWith('sha256=') ? header.slice(7) : header;
  return safeEqualHex(provided, hmacSha256Hex(secret, rawBody));
}

/**
 * Verify a Stripe webhook signature (Stripe-Signature header).
 * See https://docs.stripe.com/webhooks#verify-manually
 */
export function verifyStripeSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
  toleranceSeconds = 300
): boolean {
  if (!header || !secret) return false;

  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = value;
    if (key === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = hmacSha256Hex(secret, `${timestamp}.${rawBody.toString()}`);
  return signatures.some((sig) => safeEqualHex(sig, expected));
}

/**
 * Verify a GitHub webhook signature (X-Hub-Signature-256 header)
 */
export function verifyGithubSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string
): boolean {
  return verifyHmacSignature(rawBody, header, secret);
}
