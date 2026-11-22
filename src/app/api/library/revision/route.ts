import { identity, route } from '@/server/auth/http';
import { getLibraryRevision } from '@/server/services/library-metadata';

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const revision = await getLibraryRevision(userId);
    return Response.json({ revision }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
