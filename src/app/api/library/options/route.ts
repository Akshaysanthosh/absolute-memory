import { identity, route, resourceId } from '@/server/auth/http';
import { getLibraryOptions } from '@/server/services/library-metadata';
export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req),
      cursor = new URL(req.url).searchParams.get('cursor');
    return Response.json(await getLibraryOptions(userId, cursor ? resourceId(cursor) : null), {
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
