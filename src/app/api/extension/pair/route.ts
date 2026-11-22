import { identity, route, body } from '@/server/auth/http';
import { approvePair, pairSchema } from '@/server/auth/extension';
export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req),
      { challenge } = await body(req, pairSchema, 1000);
    await approvePair(userId, challenge);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
