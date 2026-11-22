import { identity, resourceId, route } from '@/server/auth/http';
import { documentThumbnail } from '@/server/services/document-thumbnail';
import { thumbnailMime } from '@/server/services/document-assets';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(req),
      { id } = await ctx.params;
    const { bytes, etag } = await documentThumbnail(
      userId,
      resourceId(id),
      undefined,
      req.headers.get('if-none-match'),
    );
    const headers = {
      'Cache-Control': 'private, no-cache',
      ETag: etag,
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers.get('if-none-match') === etag)
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, 'Content-Type': thumbnailMime(bytes) },
    });
  });
}
