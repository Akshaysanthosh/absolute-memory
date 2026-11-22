import { consumeRequestBucket } from '@/server/repos/request-quotas';
import { isIP } from 'node:net';
import { getConfig } from '@/server/config';
import { getDatabase, type Database } from '@/server/db';
import { tokenHash } from '@/server/security/token-hash';

const policies = {
  auth: { capacity: 15, seconds: 60 },
  api: { capacity: 300, seconds: 60 },
  capture: { capacity: 30, seconds: 60 },
  'auth-sign-in': { capacity: 10, seconds: 60 },
  'auth-reset': { capacity: 4, seconds: 60 },
  'auth-reset-token': { capacity: 6, seconds: 60 },
  'auth-setup': { capacity: 5, seconds: 60 },
  'integration-invalid': { capacity: 60, seconds: 60 },
  integration: { capacity: 120, seconds: 60 },
} as const;
type Policy = keyof typeof policies;

export class RateLimitError extends Error {
  constructor(readonly retryAfter: number) {
    super('Too many requests. Try again shortly.');
  }
}

const state = globalThis as typeof globalThis & {
  amRateBuckets?: Map<string, number>;
};

export function requestClient(request: Request) {
  const address = getConfig().TRUST_PROXY ? request.headers.get('x-real-ip')?.trim() : undefined;
  return address && isIP(address) ? address : undefined;
}

export async function enforceRateLimit(policy: Policy, subject: string, database?: Database) {
  const { capacity, seconds } = policies[policy];
  const db = database ?? (await getDatabase());
  const key = tokenHash(`${policy}:${subject}`);
  const interval = (seconds * 1000) / capacity;
  const burst = (capacity - 1) * interval;
  if (db.driver === 'postgres') {
    const { rows } = await consumeRequestBucket(db, key, interval, burst);
    if (!rows.length) throw new RateLimitError(Math.ceil(interval / 1000));
    return;
  }

  const now = Date.now();
  const buckets = (state.amRateBuckets ??= new Map());
  const available = buckets.get(key) ?? now;
  if (available > now + burst)
    throw new RateLimitError(Math.ceil((available - now - burst) / 1000));
  if (buckets.size >= 10000) {
    for (const [bucket, value] of buckets) if (value <= now) buckets.delete(bucket);
    if (buckets.size >= 10000 && !buckets.has(key)) throw new RateLimitError(60);
  }
  buckets.set(key, Math.max(now, available) + interval);
}

export function enforceEmailRateLimit(
  policy: 'auth-sign-in' | 'auth-reset' | 'auth-setup',
  email: string,
  database?: Database,
) {
  return enforceRateLimit(policy, email.trim().toLowerCase(), database);
}

export async function enforceAuthAddress(request: Request) {
  const address = requestClient(request);
  if (address) await enforceRateLimit('auth', address);
}

export function enforceInvalidKeyRateLimit(request: Request, database: Database) {
  return enforceRateLimit('integration-invalid', requestClient(request) ?? 'anonymous', database);
}
