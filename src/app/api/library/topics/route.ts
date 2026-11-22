import { identity, route } from '@/server/auth/http';
import { getLibraryTopics } from '@/server/services/library-metadata';

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const topics = await getLibraryTopics(userId);
    return Response.json({ topics }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
