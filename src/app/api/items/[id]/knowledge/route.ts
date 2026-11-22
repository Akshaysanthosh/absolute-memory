import { identity, route, body } from '@/server/auth/http';
import {
  knowledgeInfo,
  setTags,
  addTag,
  retryKnowledge,
} from '@/server/services/knowledge/item-knowledge';
import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';
import { afterInlineWork } from '@/server/jobs/inline';
import { z } from 'zod';
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  return route(async () => {
    const { userId } = await identity(req);
    return Response.json(await knowledgeInfo(userId, (await ctx.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
export async function PATCH(req: Request, ctx: Context) {
  return route(async () => {
    const { userId } = await identity(req),
      { id } = await ctx.params;
    const input = await body(
      req,
      z.union([
        z.object({ tags: z.array(z.string().min(1).max(60)).max(20) }),
        z.object({ addTag: z.string().trim().min(1).max(60) }),
      ]),
      4000,
    );
    if ('addTag' in input) await addTag(userId, id, input.addTag);
    else await setTags(userId, id, input.tags);
    return Response.json({ ok: true });
  });
}
export async function POST(req: Request, ctx: Context) {
  return route(async () => {
    const { userId } = await identity(req);
    await retryKnowledge(userId, (await ctx.params).id);
    afterInlineWork(() => runKnowledgeBatch(userId).then(() => {}));
    return Response.json({ scheduled: true }, { status: 202 });
  });
}
