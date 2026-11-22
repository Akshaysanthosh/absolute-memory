import { identity, route } from '@/server/auth/http';
import { listHighlightPage } from '@/server/services/reading';

export function GET(request: Request) {
  return route(async () => {
    const { userId } = await identity(request);
    return Response.json(await listHighlightPage(userId, { limit: 25, offset: 0 }), {
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
