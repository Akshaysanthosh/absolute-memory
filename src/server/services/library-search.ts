import { HttpError } from '@/server/auth/http';
import { getDatabase, type Queryable } from '@/server/db';
import {
  queryLibraryPage,
  type LibraryCursor,
  type LibraryOptions,
} from '@/server/repos/library-search';
import { listActiveTopics } from '@/server/repos/library-metadata';
import { itemSearchVector } from '@/server/services/knowledge/query-vector';
import { attachMediaReadiness } from '@/server/services/media/readiness';
import { thumbnailFor } from '@/server/services/thumbnails';
import { itemDisplayTitle } from '@/shared/content-title';
import type { LibraryPage } from '@/shared/library-page';

function searchCursor(value?: string) {
  if (!value) return null;
  let cursor: LibraryCursor;
  try {
    cursor = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    throw new HttpError(400, 'Invalid library page.');
  }
  if (
    !cursor ||
    !/^\d{4}-\d{2}-\d{2}T/.test(cursor.date) ||
    !Number.isFinite(Date.parse(cursor.date)) ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(cursor.id) ||
    (cursor.rank !== undefined && (!Number.isSafeInteger(cursor.rank) || cursor.rank < 0))
  ) {
    throw new HttpError(400, 'Invalid library page.');
  }
  return cursor;
}

/** Return ranked preview metadata without loading full stored HTML. */
export async function listLibraryPage(
  userId: string,
  db: Queryable,
  options: LibraryOptions = {},
): Promise<LibraryPage> {
  const limit = Math.max(1, Math.min(1000, options.limit ?? 60));
  const cursor = searchCursor(options.cursor);
  const query = options.query?.trim() ?? '';
  const vector = query && options.semantic !== false ? await itemSearchVector(query, db) : null;
  const tags = [...new Set([options.tag, options.topic].filter(Boolean))];
  const result = await queryLibraryPage(db, {
    userId,
    cursor,
    limit,
    query,
    tags,
    vector,
    options,
  });
  const rows = result.rows.slice(0, limit),
    last = rows.at(-1);
  const topics = await listActiveTopics(db, userId);
  return {
    topics,
    total: Number(rows[0]?.total_count || 0),
    items: await attachMediaReadiness(
      rows.map(({ page_created_at, page_rank, total_count, ...item }) => ({
        ...item,
        title: itemDisplayTitle(item),
        thumbnail: thumbnailFor({ ...item, has_source: !!item.source_file }),
      })),
      userId,
      db,
    ),
    nextCursor:
      result.rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ date: last.page_created_at, id: last.id, rank: last.page_rank }),
          ).toString('base64url')
        : null,
  };
}

/** Compatibility for bounded secondary pickers; primary library uses explicit pages. */
export async function listLibraryItems(userId: string, db: Queryable) {
  return (await listLibraryPage(userId, db, { limit: 1000 })).items;
}

export async function searchLibrary(userId: string, options: LibraryOptions) {
  return listLibraryPage(userId, await getDatabase(), options);
}
