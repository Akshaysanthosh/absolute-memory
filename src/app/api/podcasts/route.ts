import { z } from 'zod';
import { identity, route, body } from '@/server/auth/http';
import { afterInlineWork } from '@/server/jobs/inline';
import { runBatch } from '@/server/jobs/worker';
import { loadOrSavePodcast } from '@/server/services/media/podcast-selection';

const podcastInput = z.object({
  feedUrl: z.string().url().max(4_000),
  episodeId: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const input = await body(req, podcastInput);
    const result = await loadOrSavePodcast(userId, input);
    if ('id' in result) afterInlineWork(() => runBatch(userId));
    return Response.json(result);
  });
}
