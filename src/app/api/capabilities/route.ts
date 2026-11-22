import { identity, route } from '@/server/auth/http';
import { getCapabilities } from '@/server/services/capabilities';

export async function GET(request: Request) {
  return route(async () => {
    const { userId } = await identity(request);
    return Response.json(await getCapabilities(userId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
