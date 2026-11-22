import { identity, route } from '@/server/auth/http';
import { readDocumentPage } from '@/server/services/document-preview';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(req);
    const { id } = await ctx.params;
    const page = Number(new URL(req.url).searchParams.get('page') || 1);
    const { data, mime } = await readDocumentPage(userId, id, page);
    return new Response(data, {
      headers: {
        'Cache-Control': 'private, max-age=60',
        'Content-Type': mime,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
