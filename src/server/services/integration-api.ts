import {
  insertIntegrationSave,
  findIntegrationRequest,
  storeIntegrationRequest,
  findIntegrationSave,
} from '@/server/repos/integration-saves';
import { selectIntegrationTags } from '@/server/repos/item-tags';
import { listLibraryPage } from '@/server/services/library-search';
import { tokenHash } from '@/server/security/token-hash';
import { randomBytes, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { captureSource } from '@/server/services/capture-source';
import { getDatabase, type Database } from '@/server/db';
import type { KeyIdentity } from '@/server/repos/integration-tokens';
import { lockUser } from '@/server/repos/users';
import { HttpError } from '@/server/auth/http';
import type { integrationCaptureSchema, listQuery } from '@/server/http/integration-contracts';
import { passageHref } from '@/shared/passages';
import { listHighlightPage } from '@/server/services/reading';
import { getReadingItem } from '@/server/repos/reading';
import { capture, ownItem } from '@/server/services/library';

export async function saveIntegrationItem(
  key: KeyIdentity,
  input: z.infer<typeof integrationCaptureSchema>,
  requestKey: string | null,
  database?: Database,
) {
  const db = database ?? (await getDatabase());
  if (input.kind === 'article') {
    const result = await captureSource(key.user_id, input, 'api', db);
    await recordIntegrationSave(key, result.item.id, db);
    return result;
  }
  if (!requestKey || !/^[A-Za-z0-9._-]{8,128}$/.test(requestKey)) {
    throw new HttpError(
      400,
      'Notes require an Idempotency-Key with 8–128 letters, numbers, dots, underscores or hyphens.',
    );
  }
  const requestHash = tokenHash(requestKey);
  const inputHash = tokenHash(JSON.stringify([input.title, input.text]));
  return db.transaction(async (tx) => {
    await lockUser(tx, key.user_id);
    const {
      rows: [previous],
    } = await findIntegrationRequest(tx, key.id, key.user_id, requestHash);
    if (previous) {
      if (previous.input_hash !== inputHash)
        throw new HttpError(409, 'This idempotency key already belongs to a different note.');
      return { item: await ownItem(key.user_id, previous.item_id, tx), duplicate: true };
    }
    const result = await capture(key.user_id, input, 'api', { transaction: async (fn) => fn(tx) });
    await storeIntegrationRequest(tx, key.id, key.user_id, result.item.id, requestHash, inputHash);
    return result;
  });
}

export async function integrationSaveStatus(key: KeyIdentity, id: string, db?: Database) {
  const {
    rows: [item],
  } = await findIntegrationSave(db ?? (await getDatabase()), key.id, key.user_id, id);
  if (!item) throw new HttpError(404, 'This save was not found.');
  return item;
}

export async function listIntegrationItems(
  userId: string,
  input: z.infer<typeof listQuery>,
  database?: Database,
) {
  const db = database ?? (await getDatabase());
  const { items, nextCursor } = await listLibraryPage(userId, db, {
    query: input.q,
    filter: 'all',
    limit: input.limit,
    cursor: input.cursor,
    tag: input.tag,
    type: input.type,
    topic: input.topic,
    status: input.status,
  });
  return {
    items: items.map(({ id, title, kind, status, excerpt }) => ({
      id,
      title,
      kind,
      status,
      excerpt: excerpt.slice(0, 300),
    })),
    nextCursor,
  };
}

export async function searchIntegrationItems(userId: string, query: string, db: Database) {
  return (await listIntegrationItems(userId, { q: query, limit: 20 }, db)).items;
}

export async function listIntegrationTags(userId: string, db?: Database) {
  return (await selectIntegrationTags(db ?? (await getDatabase()), userId)).rows;
}

export async function recordIntegrationSave(key: KeyIdentity, itemId: string, db?: Database) {
  await insertIntegrationSave(db ?? (await getDatabase()), key, itemId);
}

export async function readIntegrationItem(
  userId: string,
  id: string,
  offset: number,
  database?: Database,
) {
  const db = database ?? (await getDatabase());
  const item = await getReadingItem(db, userId, id);
  if (!item) throw new HttpError(404, 'This item was not found.');
  const { title, kind, url, domain, status, passages, excerpt } = item;
  const page = passages.slice(offset, offset + 12);
  const { highlights } = await listHighlightPage(userId, { itemId: id, limit: 100, offset: 0 }, db);
  return {
    id,
    title,
    kind,
    url,
    domain,
    status,
    excerpt,
    highlights,
    passages: page.map((passage) => ({ ...passage, path: passageHref(id, passage.index) })),
    nextOffset: offset + page.length < passages.length ? offset + page.length : null,
  };
}
