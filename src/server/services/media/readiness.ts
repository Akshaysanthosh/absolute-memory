import type { Queryable } from '@/server/db';

export async function attachMediaReadiness<
  T extends {
    id: string;
    status: string;
    media_kind?: string | null;
  },
>(items: T[], _userId: string, _db: Queryable): Promise<(T & { reading_ready?: boolean })[]> {
  return items.map((item) =>
    item.media_kind ? { ...item, reading_ready: item.status === 'ready' } : item,
  );
}
