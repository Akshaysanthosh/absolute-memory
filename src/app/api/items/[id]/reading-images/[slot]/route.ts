import { HttpError, identity, resourceId, route } from '@/server/auth/http';
import { readArticleImage } from '@/server/services/import/images';

type Context = { params: Promise<{ id: string; slot: string }> };

export function GET(request: Request, context: Context) {
  return route(async () => {
    const { userId } = await identity(request);
    const { id, slot } = await context.params;
    if (!/^\d{1,6}$/.test(slot)) throw new HttpError(404, 'Image not found.');
    const image = await readArticleImage(userId, resourceId(id), Number(slot));
    if (!image) throw new HttpError(404, 'Image not found.');
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        'Content-Type': image.mime,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
