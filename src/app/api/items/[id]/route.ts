import { removeLibraryItem, updateLibraryItem } from '@/server/services/item-updates';
import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';
import { configuredCapabilities } from '@/server/services/capabilities';
import { z } from 'zod';
import { identity, route, body } from '@/server/auth/http';
import { ownItem } from '@/server/services/library';
import { afterInlineWork } from '@/server/jobs/inline';
import { runBatch } from '@/server/jobs/worker';

type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  return route(async () => {
    const { userId } = await identity(req),
      { id } = await ctx.params;
    return Response.json(
      { item: await ownItem(userId, id), aiEnabled: configuredCapabilities().ai },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
export async function PATCH(req: Request, ctx: Context) {
  return route(async () => {
    const { userId } = await identity(req),
      { id } = await ctx.params;
    const input = await body(
      req,
      z.object({
        title: z.string().trim().min(1).max(300).optional(),
        favorite: z.boolean().optional(),
        archived: z.boolean().optional(),
        progress: z.number().min(0).max(1).optional(),
        retry: z.boolean().optional(),
        bookmark: z.literal(true).optional(),
        bookmarkType: z.enum(['website', 'product']).optional(),
      }),
    );
    const { retry } = await updateLibraryItem(userId, id, input);
    if (retry)
      afterInlineWork(async () => {
        await runBatch(userId);
        await runKnowledgeBatch(userId);
      });
    return Response.json({ ok: true });
  });
}
export async function DELETE(req: Request, ctx: Context) {
  return route(async () => {
    const { userId } = await identity(req),
      { id } = await ctx.params;
    await removeLibraryItem(userId, id);
    return Response.json({ ok: true });
  });
}
