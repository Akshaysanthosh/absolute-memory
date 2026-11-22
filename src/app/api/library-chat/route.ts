import { z } from 'zod';
import { body, identity, route } from '@/server/auth/http';
import { listLibraryConversations } from '@/server/services/library-conversations';
import { streamLibraryAnswer } from '@/server/services/stream-library-answer';

const askInput = z.object({
  requestId: z.string().uuid(),
  threadId: z.string().uuid().optional(),
  question: z.string().trim().min(1).max(1500),
  itemIds: z.array(z.string().uuid()).max(100).default([]),
  tags: z.array(z.string().max(60)).max(20).default([]),
  excludeChatNotes: z.boolean().default(false),
});

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const threads = await listLibraryConversations(userId);
    return Response.json({ threads }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const input = await body(req, askInput, 12_000);
    const events = await streamLibraryAnswer(userId, input, req.signal);
    const encoder = new TextEncoder();
    const stream = events.pipeThrough(
      new TransformStream({
        transform(event, output) {
          output.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        },
      }),
    );
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  });
}
