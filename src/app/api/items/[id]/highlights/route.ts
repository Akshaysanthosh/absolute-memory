import { z } from 'zod';
import { body, HttpError, identity, resourceId, route } from '@/server/auth/http';
import { createHighlight, ReadingError, removeHighlight } from '@/server/services/reading';

const selection = z
  .object({
    segments: z
      .array(
        z
          .object({
            passageIndex: z.number().int().nonnegative(),
            start: z.number().int().nonnegative(),
            end: z.number().int().positive(),
            text: z.string().min(1).max(20_000),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();

type Context = { params: Promise<{ id: string }> };

export function POST(request: Request, { params }: Context) {
  return route(async () => {
    const { userId } = await identity(request);
    const itemId = resourceId((await params).id);
    const input = await body(request, selection, 60_000);
    try {
      return Response.json(await createHighlight(userId, itemId, input.segments), { status: 201 });
    } catch (error) {
      if (error instanceof ReadingError) throw new HttpError(error.status, error.message);
      throw error;
    }
  });
}

export function DELETE(request: Request, { params }: Context) {
  return route(async () => {
    const { userId } = await identity(request);
    const itemId = resourceId((await params).id);
    const { id } = await body(request, z.object({ id: z.uuid() }).strict());
    try {
      await removeHighlight(userId, itemId, id);
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof ReadingError) throw new HttpError(error.status, error.message);
      throw error;
    }
  });
}
