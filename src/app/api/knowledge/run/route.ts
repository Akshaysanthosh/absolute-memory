import { afterInlineWork } from '@/server/jobs/inline';
import { identity, route } from '@/server/auth/http';
import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    afterInlineWork(async () => {
      await runKnowledgeBatch(userId);
    });
    return Response.json({ scheduled: true }, { status: 202 });
  });
}
