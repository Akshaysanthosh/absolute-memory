import { z } from 'zod';
import { body, HttpError, identity, resourceId, route } from '@/server/auth/http';
import { updateReadingPosition } from '@/server/services/reading';

const position = z
  .object({
    passageIndex: z.number().int().nonnegative(),
    progress: z.number().min(0).max(1),
  })
  .strict();

export function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(request);
    const itemId = resourceId((await params).id);
    const { passageIndex, progress } = await body(request, position);
    if (!(await updateReadingPosition(userId, itemId, { passageIndex, progress }))) {
      throw new HttpError(404, 'Passage not found.');
    }
    return new Response(null, { status: 204 });
  });
}
