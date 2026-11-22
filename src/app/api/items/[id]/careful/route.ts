import { identity, route } from '@/server/auth/http';
import { saveCarefulVersion } from '@/server/services/document-preview';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(req);
    const { id } = await ctx.params;
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(110_000)]);
    return Response.json({ id: await saveCarefulVersion(userId, id, signal) });
  });
}
