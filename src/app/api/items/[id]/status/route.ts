import { identity, route } from '@/server/auth/http';
import { itemPreparationStatus } from '@/server/services/item-status';
export const runtime = 'nodejs';
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(req),
      { id } = await ctx.params;
    return Response.json(await itemPreparationStatus(userId, id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
