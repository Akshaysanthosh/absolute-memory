import { identity, route } from '@/server/auth/http';
import { getLibraryCounts } from '@/server/services/library-metadata';

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const counts = await getLibraryCounts(userId);
    return Response.json({ counts }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
