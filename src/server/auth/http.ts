import {
  enforceInvalidKeyRateLimit,
  enforceRateLimit,
  RateLimitError,
} from '@/server/security/rate-limit';
import { logEvent } from '@/server/logging/events';
import { getConfig } from '@/server/config';
import { tokenHash } from '@/server/security/token-hash';
import { getAuth } from '@/server/auth/auth';
import { getDatabase } from '@/server/db';
import { findCaptureToken, touchCaptureToken } from '@/server/repos/capture-tokens';
import { z } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function resourceId(id: string) {
  if (!z.string().uuid().safeParse(id).success)
    throw new HttpError(404, 'This resource was not found.');
  return id;
}
export function assertSameOrigin(req: Request) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const allowed = new Set([getConfig().APP_URL]);
    if (getConfig().NODE_ENV !== 'production') {
      allowed.add('http://127.0.0.1:3000');
      allowed.add('http://localhost:3000');
    }
    if (!origin || !allowed.has(origin)) throw new HttpError(403, 'Request origin is not allowed.');
  }
}
export async function identity(req: Request, allowCaptureToken = false) {
  const bearer = req.headers.get('authorization');
  if (allowCaptureToken && bearer) {
    const db = await getDatabase();
    const secret = /^Bearer (am_ext_[A-Za-z0-9_-]{43})$/i.exec(bearer)?.[1];
    const capture = secret ? await findCaptureToken(db, tokenHash(secret)) : undefined;
    if (!capture) {
      await enforceInvalidKeyRateLimit(req, db);
      throw new HttpError(401, 'Reconnect your extension. This token is invalid or revoked.');
    }
    await enforceRateLimit('api', capture.user_id, db);
    await touchCaptureToken(db, capture.user_id, capture.id);
    return { userId: capture.user_id, channel: 'extension' as const, captureTokenId: capture.id };
  }
  assertSameOrigin(req);
  const session = await (await getAuth()).api.getSession({ headers: req.headers });
  if (!session) throw new HttpError(401, 'Sign in to continue.');
  await enforceRateLimit('api', session.user.id);
  return {
    userId: session.user.id,
    channel: 'web' as const,
    sessionCreatedAt: session.session.createdAt,
  };
}
export async function body<T>(
  req: Request,
  schema: z.ZodType<T>,
  maxBytes = 150_000,
  encoding: 'json' | 'form' = 'json',
): Promise<T> {
  if (Number(req.headers.get('content-length') || 0) > maxBytes)
    throw new HttpError(413, 'This capture is too large.');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > maxBytes) {
      void reader.cancel().catch(() => {});
      throw new HttpError(413, 'This capture is too large.');
    }
    chunks.push(r.value);
  }
  let parsed: unknown;
  try {
    const raw = Buffer.concat(chunks).toString('utf8');
    parsed = encoding === 'form' ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
  const result = schema.safeParse(parsed);
  if (!result.success)
    throw new HttpError(400, result.error.issues[0]?.message || 'Invalid input.');
  return result.data;
}
export function failure(error: unknown) {
  if (error instanceof RateLimitError)
    return Response.json(
      { error: error.message },
      {
        status: 429,
        headers: { 'Retry-After': String(error.retryAfter), 'Cache-Control': 'no-store' },
      },
    );
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  logEvent('error', 'request.failed', error);
  return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
export async function route(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (error) {
    return failure(error);
  }
}
