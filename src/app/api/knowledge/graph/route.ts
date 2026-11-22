import { identity, route, resourceId } from '@/server/auth/http';
import { graphData } from '@/server/services/knowledge/graph';
export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const params = new URL(req.url).searchParams;
    const node = params.get('node');
    return Response.json(
      await graphData(userId, params.get('tag')?.slice(0, 60), undefined, {
        compact: params.get('view') === 'topology',
        nodeId: node ? resourceId(node) : undefined,
      }),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
