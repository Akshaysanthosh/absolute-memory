import { randomUUID } from 'node:crypto';
import { getDatabase, type Database, type Queryable } from '@/server/db';
import {
  deleteHighlight,
  getHighlights,
  getReadingItem,
  getReadingMedia,
  insertHighlight,
  replaceHighlightSegments,
  saveReadingPosition,
} from '@/server/repos/reading';
import {
  findQuote,
  passageHref,
  validateSegments,
  type HighlightSegment,
  type Passage,
} from '@/shared/passages';

export class ReadingError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

export async function createHighlight(
  userId: string,
  itemId: string,
  segments: HighlightSegment[],
  database?: Database,
) {
  const db = database ?? (await getDatabase());
  return db.transaction(async (tx) => {
    const item = await getReadingItem(tx, userId, itemId, true);
    if (!item) throw new ReadingError(404, 'Item not found.');
    if (!validateSegments(item.passages, segments)) {
      throw new ReadingError(400, 'Select text from the current reading.');
    }
    const quote = segments.map((segment) => segment.text).join('\n');
    if (!quote.trim()) throw new ReadingError(400, 'Select some text to highlight.');
    const id = randomUUID();
    await insertHighlight(tx, userId, itemId, id, quote, segments);
    return { id, itemId, quote, segments };
  });
}

export async function removeHighlight(userId: string, itemId: string, id: string) {
  if (!(await deleteHighlight(await getDatabase(), userId, itemId, id))) {
    throw new ReadingError(404, 'Highlight not found.');
  }
}

export async function listHighlightPage(
  userId: string,
  options: { itemId?: string; limit: number; offset: number },
  database?: Database,
) {
  const rows = await getHighlights(database ?? (await getDatabase()), userId, {
    ...options,
    limit: options.limit + 1,
  });
  return {
    highlights: rows.slice(0, options.limit).map((highlight) => ({
      ...highlight,
      path: highlight.segments.length
        ? passageHref(highlight.itemId, highlight.segments[0].passageIndex)
        : null,
    })),
    nextOffset: rows.length > options.limit ? options.offset + options.limit : null,
  };
}

export async function reanchorHighlights(
  db: Queryable,
  userId: string,
  itemId: string,
  passages: Passage[],
) {
  const highlights = await getHighlights(db, userId, { itemId, limit: null, offset: 0 });
  for (const highlight of highlights) {
    if (validateSegments(passages, highlight.segments)) continue;
    const segments = findQuote(passages, highlight.quote);
    if (segments.length || highlight.segments.length)
      await replaceHighlightSegments(db, highlight.id, segments);
  }
}

export async function readerData(userId: string, itemId: string) {
  const db = await getDatabase();
  const [item, highlights, mediaSource] = await Promise.all([
    getReadingItem(db, userId, itemId),
    getHighlights(db, userId, { itemId, limit: null, offset: 0 }),
    getReadingMedia(db, userId, itemId),
  ]);
  return { item, highlights, mediaSource };
}

export async function updateReadingPosition(
  userId: string,
  itemId: string,
  position: { passageIndex: number; progress: number },
) {
  return saveReadingPosition(
    await getDatabase(),
    userId,
    itemId,
    position.passageIndex,
    position.progress,
  );
}

export async function readingMedia(userId: string, itemId: string) {
  return getReadingMedia(await getDatabase(), userId, itemId);
}
