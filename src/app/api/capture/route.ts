import { enforceRateLimit } from '@/server/security/rate-limit';
import { captureSource } from '@/server/services/capture-source';
import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';
import { issueReceipt } from '@/server/auth/extension';
import { identity, route, body } from '@/server/auth/http';
import { captureSchema } from '@/server/services/library';
import { afterInlineWork } from '@/server/jobs/inline';
import { runBatch } from '@/server/jobs/worker';
export const runtime = 'nodejs';
export const maxDuration = 120;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
export async function POST(req: Request) {
  const response = await route(async () => {
    const { userId, channel, captureTokenId } = await identity(req, true);
    await enforceRateLimit('capture', userId);

    const input = await body(req, captureSchema, 1_500_000);
    const result = await captureSource(userId, input, channel);
    afterInlineWork(async () => {
      if (result.item.status === 'pending') await runBatch(userId);
      await runKnowledgeBatch(userId);
    });
    return Response.json(
      {
        id: result.item.id,
        duplicate: result.duplicate,
        status: result.item.status,
        ...(captureTokenId ? { receipt: await issueReceipt(captureTokenId, result.item.id) } : {}),
      },
      { status: result.duplicate ? 200 : 201 },
    );
  });
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
  return response;
}
