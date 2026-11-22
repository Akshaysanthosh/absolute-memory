import { afterInlineWork } from '@/server/jobs/inline';
import { identity, route } from '@/server/auth/http';
import { runBatch } from '@/server/jobs/worker';

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    afterInlineWork(async () => {
      await runBatch(userId);
    });
    return Response.json({ scheduled: true }, { status: 202 });
  });
}
