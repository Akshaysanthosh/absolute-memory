import { z } from 'zod';
import { HttpError, identity, route } from '@/server/auth/http';
import { searchLibrary } from '@/server/services/library-search';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value);
    return (
      value.slice(0, 4) !== '0000' &&
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const range = z
  .object({
    status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
    after: date.optional(),
    before: date.optional(),
  })
  .refine((value) => !value.after || !value.before || value.after <= value.before);

export async function GET(req: Request) {
  return route(async () => {
    const { userId } = await identity(req);
    const params = new URL(req.url).searchParams;
    const result = range.safeParse(
      Object.fromEntries(
        ['status', 'after', 'before'].flatMap((key) =>
          params.get(key) ? [[key, params.get(key)]] : [],
        ),
      ),
    );
    if (!result.success) throw new HttpError(400, 'Choose a valid date range and import status.');
    const { status, after, before } = result.data;
    const lastDay = before ? new Date(Date.parse(before) + 86_400_000).toISOString() : undefined;
    const page = await searchLibrary(userId, {
      newestFirst: true,
      query: (params.get('q') || '').slice(0, 500),
      cursor: params.get('cursor') || undefined,
      filter: params.get('filter') || undefined,
      topic: (params.get('topic') || '').slice(0, 60),
      tag: (params.get('tag') || '').slice(0, 60),
      type: params.get('type') || undefined,
      status,
      after,
      before: lastDay,
    });
    return Response.json(page, { headers: { 'Cache-Control': 'no-store' } });
  });
}
