import { identity, resourceId, route } from '@/server/auth/http';
import {
  getLibraryConversation,
  removeLibraryConversation,
} from '@/server/services/library-conversations';

type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Context) {
  return route(async () => {
    const { userId } = await identity(req);
    const id = resourceId((await ctx.params).id);
    const result = await getLibraryConversation(userId, id);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function DELETE(req: Request, ctx: Context) {
  return route(async () => {
    const { userId } = await identity(req);
    await removeLibraryConversation(userId, resourceId((await ctx.params).id));
    return Response.json({ deleted: true });
  });
}
