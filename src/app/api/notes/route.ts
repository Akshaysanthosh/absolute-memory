import { z } from 'zod';
import { body, identity, resourceId, route } from '@/server/auth/http';
import { afterInlineWork } from '@/server/jobs/inline';
import { runKnowledgeBatch } from '@/server/jobs/knowledge-worker';
import { listRelatedNotes, readPersonalNote, savePersonalNote } from '@/server/services/notes';

const noteInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(300),
  document: z.unknown(),
  version: z.number().int().min(0).default(0),
});

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const params = new URL(req.url).searchParams;
    const source = params.get('source');
    const value = source
      ? { notes: await listRelatedNotes(userId, resourceId(source)) }
      : await readPersonalNote(userId, resourceId(params.get('id') || ''));
    return Response.json(value, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const input = await body(req, noteInput, 600_000);
    const note = await savePersonalNote(userId, input);
    afterInlineWork(() => runKnowledgeBatch(userId));
    return Response.json(note);
  });
}
