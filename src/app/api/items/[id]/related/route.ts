import { identity, route } from '@/server/auth/http';
import { related } from '@/server/services/knowledge/item-knowledge';
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(req);
    return Response.json(
      { items: await related(userId, (await ctx.params).id) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
