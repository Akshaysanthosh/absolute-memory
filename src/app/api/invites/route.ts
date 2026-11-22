import { z } from 'zod';
import { body, identity, route } from '@/server/auth/http';
import {
  createInstanceInvite,
  listInstanceInvites,
  revokeInstanceInvite,
} from '@/server/services/instance';

const privateHeaders = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  return route(async () => {
    const { userId } = await identity(request);
    return Response.json(
      { invites: await listInstanceInvites(userId) },
      { headers: privateHeaders },
    );
  });
}

export async function POST(request: Request) {
  return route(async () => {
    const { userId } = await identity(request);
    return Response.json(await createInstanceInvite(userId), {
      status: 201,
      headers: privateHeaders,
    });
  });
}

export async function DELETE(request: Request) {
  return route(async () => {
    const { userId } = await identity(request);
    const { id } = await body(request, z.object({ id: z.uuid() }));
    await revokeInstanceInvite(userId, id);
    return Response.json({ revoked: true }, { headers: privateHeaders });
  });
}
