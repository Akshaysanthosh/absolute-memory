import { z } from 'zod';
import { requireIntegrations } from '@/server/auth/integration-identity';
import { body, HttpError, identity, route } from '@/server/auth/http';
import {
  createIntegrationKey,
  integrationKeySchema,
  listIntegrationKeys,
  revokeIntegrationKey,
} from '@/server/services/integration-keys';

async function manage(req: Request, fn: (userId: string) => Promise<Response>) {
  const response = await route(async () => {
    requireIntegrations();
    const session = await identity(req);
    if (
      req.method === 'POST' &&
      (session.channel !== 'web' ||
        Date.now() - new Date(session.sessionCreatedAt).getTime() >= 300_000)
    ) {
      throw new HttpError(403, 'Sign in again before creating a personal API key.');
    }
    return fn(session.userId);
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(req: Request) {
  return manage(req, async (userId) => Response.json({ keys: await listIntegrationKeys(userId) }));
}

export async function POST(req: Request) {
  return manage(req, async (userId) => {
    const input = await body(req, integrationKeySchema, 1000);
    return Response.json(await createIntegrationKey(userId, input), {
      status: 201,
    });
  });
}

export async function DELETE(req: Request) {
  return manage(req, async (userId) => {
    const { id } = await body(req, z.strictObject({ id: z.uuid() }), 1000);
    await revokeIntegrationKey(userId, id);
    return Response.json({ ok: true });
  });
}
