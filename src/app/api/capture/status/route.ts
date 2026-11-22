import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';
import { afterInlineWork } from '@/server/jobs/inline';
import { identity, route, body, HttpError } from '@/server/auth/http';
import {
  receiptStatus,
  receiptSchema,
  extensionCors,
  withExtensionCors,
} from '@/server/auth/extension';
import { runBatch } from '@/server/jobs/worker';
export const maxDuration = 120;
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCors });
}
export async function POST(req: Request) {
  return withExtensionCors(
    await route(async () => {
      const auth = await identity(req, true);
      if (!auth.captureTokenId) throw new HttpError(401, 'An extension connection is required.');
      const { receipt } = await body(req, receiptSchema, 1000),
        result = await receiptStatus(auth.captureTokenId, auth.userId, receipt);
      if (result.status === 'pending' || result.status === 'processing')
        afterInlineWork(async () => {
          await runBatch(auth.userId);
          await runKnowledgeBatch(auth.userId);
        });
      return Response.json(result);
    }),
  );
}
