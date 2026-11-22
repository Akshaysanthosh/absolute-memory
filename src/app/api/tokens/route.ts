import { z } from 'zod';
import { identity, route, body } from '@/server/auth/http';
import {
  getCaptureTokens,
  issueCaptureToken,
  revokeCaptureToken,
} from '@/server/services/capture-tokens';

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    return Response.json({ tokens: await getCaptureTokens(userId) });
  });
}

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
    const token = await issueCaptureToken(userId, name);
    return Response.json({ token }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function DELETE(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const { id } = await body(req, z.object({ id: z.string().uuid() }));
    await revokeCaptureToken(userId, id);
    return Response.json({ ok: true });
  });
}
