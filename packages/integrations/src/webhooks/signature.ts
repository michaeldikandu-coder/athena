import { createHmac, timingSafeEqual } from 'crypto';

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[a-fA-F0-9]+$/.test(a) || !/^[a-fA-F0-9]+$/.test(b)) return false;
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

type HeaderGetter = (name: string) => string | undefined;

/**
 * Verify a Bachs webhook (https://docs.bachs.io/guides/webhooks/overview).
 *
 * Bachs signs HMAC-SHA256(secret, "<timestamp>." + raw body). The preferred
 * header is X-Bachs-Signature-V2: "t=<unix>,v1=<hex>[,v1=<hex>]" (several v1
 * values during secret rotation). The legacy X-Bachs-Timestamp and
 * X-Bachs-Signature pair is also accepted. A malformed V2 header never falls
 * back to the legacy headers. Matches the official @bachs/sdk behavior.
 */
export function verifyBachsSignature(
  rawBody: Buffer | string,
  getHeader: HeaderGetter,
  secret: string,
  toleranceSeconds = 300
): boolean {
  if (!secret) return false;

  let timestamp: string | undefined;
  let signatures: string[];
  const v2 = getHeader('x-bachs-signature-v2');
  if (v2 !== undefined) {
    const fields = v2.split(',').map((p) => p.trim());
    const timestamps = fields.filter((p) => p.startsWith('t='));
    if (timestamps.length !== 1) return false;
    timestamp = timestamps[0].slice(2);
    signatures = fields.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  } else {
    timestamp = getHeader('x-bachs-timestamp');
    const legacy = getHeader('x-bachs-signature');
    signatures = legacy ? [legacy] : [];
  }

  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`, 'utf8').update(body).digest('hex');
  return signatures.some((sig) => /^[a-fA-F0-9]{64}$/.test(sig) && safeEqualHex(sig, expected));
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
