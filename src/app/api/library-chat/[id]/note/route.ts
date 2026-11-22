import { z } from 'zod';
import { body, identity, resourceId, route } from '@/server/auth/http';
import { afterInlineWork } from '@/server/jobs/inline';
import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';
import { saveLibraryAnswer } from '@/server/services/chat-note';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(req);
    const threadId = resourceId((await ctx.params).id);
    const { turnId } = await body(req, z.object({ turnId: z.string().uuid() }));
    const { id, created } = await saveLibraryAnswer(
      userId,
      threadId,
      turnId,
      new URL(req.url).origin,
    );
    if (created) afterInlineWork(() => runKnowledgeBatch(userId));
    return Response.json({ id }, { status: created ? 201 : 200 });
  });
}
