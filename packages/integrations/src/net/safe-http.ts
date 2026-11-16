import dns, { LookupAddress } from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';

/**
 * Outbound requests to URLs that users type in (health checks, custom tools)
 * must not reach loopback, private, link-local (cloud metadata) or other
 * internal ranges. They are allowed by default outside production so local
 * development can call localhost; OPSGUARD_ALLOW_PRIVATE_URLS overrides.
 */
const PRIVATE_RANGES = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  PRIVATE_RANGES.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE_RANGES.addSubnet(address, prefix, 'ipv6');
}

export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return PRIVATE_RANGES.check(mapped[1], 'ipv4');
  const family = net.isIP(address);
  if (family === 4) return PRIVATE_RANGES.check(address, 'ipv4');
  if (family === 6) return PRIVATE_RANGES.check(address, 'ipv6');
  return false;
}

export function privateUrlsAllowed(): boolean {
  const setting = process.env.OPSGUARD_ALLOW_PRIVATE_URLS;
  if (setting === 'true') return true;
  if (setting === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

export class BlockedAddressError extends Error {
  code = 'EBLOCKEDADDRESS';
  constructor(address: string) {
    super(`Refusing to connect to private address ${address}`);
  }
}

/**
 * DNS lookup that rejects private addresses at connect time, so a hostname
 * that resolves (or re-resolves) to an internal IP is blocked too.
 */
function guardedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    if (!privateUrlsAllowed()) {
      const blocked = addresses.find((a) => isPrivateAddress(a.address));
      if (blocked) return callback(new BlockedAddressError(blocked.address), '', 0);
    }
    if (options.all) return callback(null, addresses);
    const first = addresses[0];
    return callback(null, first.address, first.family);
  });
}

/** Agents to pass to axios (httpAgent / httpsAgent) together with proxy: false */
export const guardedAgents = {
  httpAgent: new http.Agent({ lookup: guardedLookup as never }),
  httpsAgent: new https.Agent({ lookup: guardedLookup as never }),
};

/** IP-literal hosts skip DNS, so they are checked here before the request */
export function assertPublicUrl(url: string): void {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !privateUrlsAllowed() && isPrivateAddress(host)) {
    throw new BlockedAddressError(host);
  }
}
