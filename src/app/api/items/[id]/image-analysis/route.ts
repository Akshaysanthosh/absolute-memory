import { identity, resourceId, route } from '@/server/auth/http';
import { analyzeSavedImage } from '@/server/services/image-analysis';
import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';
import { afterInlineWork } from '@/server/jobs/inline';

export const maxDuration = 120;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(request);
    await analyzeSavedImage(
      userId,
      resourceId((await params).id),
      AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
    );
    afterInlineWork(() => runKnowledgeBatch(userId).then(() => {}));
    return Response.json({ ok: true });
  });
}
