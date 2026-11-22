import { identity, route } from '@/server/auth/http';
import { requireOwner } from '@/server/auth/owner';
import { testProviderConnections } from '@/server/services/capabilities';

export async function POST(request: Request) {
  return route(async () => {
    const { userId } = await identity(request);
    await requireOwner(userId);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
    return Response.json(
      { results: await testProviderConnections(signal) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
