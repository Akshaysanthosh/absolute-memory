import { readDocument } from '@/server/services/document-assets';
import { identity, route } from '@/server/auth/http';
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  return route(async () => {
    const { userId } = await identity(req),
      { id } = await ctx.params;
    const file = await readDocument(userId, id);
    const inline =
      new URL(req.url).searchParams.get('view') === 'inline' &&
      /^image\/(?:png|jpeg|webp)$/.test(file.mime);
    return new Response(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
