import { z } from 'zod';
import { identity, route, body } from '@/server/auth/http';
import { getTopicPage, saveTopicPage } from '@/server/services/topic-pages';

const schema = z.object({
  topic: z.string().trim().min(1).max(100),
  overview: z.string().trim().max(20_000),
});

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const topic = new URL(req.url).searchParams.get('topic') || '';
    const page = await getTopicPage(userId, topic);
    return Response.json({ page }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function PUT(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const { topic, overview } = await body(req, schema);
    await saveTopicPage(userId, topic, overview);
    return Response.json({ ok: true });
  });
}
