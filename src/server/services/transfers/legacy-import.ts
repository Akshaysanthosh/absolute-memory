import {
  findImportedHighlight,
  lockLegacyImportDuplicate,
  insertLegacyImportItem,
} from '@/server/repos/transfer-restoration';
import { lockUser } from '@/server/repos/users';
import { restoreManualTags } from '@/server/repos/item-tags';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '@/server/auth/http';
import type { Queryable } from '@/server/db';
import { plainReading } from '@/server/services/import/content';
import { insertHighlight } from '@/server/repos/reading';
import { normalizedTag } from '@/server/services/knowledge/content';
import { findQuote, type Passage } from '@/shared/passages';
import { readPlainTransfer, type TransferSource } from './archive';
import { canonicalImportUrl } from './portable-import';
import type { ImportEntry, ImportHighlight } from './importers/common';
import { instapaper } from './importers/instapaper';
import { netscape } from './importers/netscape';
import { omnivore } from './importers/omnivore';
import { pocket } from './importers/pocket';
import { raindrop } from './importers/raindrop';
import { readwise } from './importers/readwise';

export const importFormats = [
  'absolute-memory',
  'netscape',
  'pocket',
  'instapaper',
  'omnivore',
  'readwise',
  'raindrop',
] as const;
export const importFormatSchema = z.enum(importFormats);
export type ImportFormat = z.infer<typeof importFormatSchema>;
const parsers = { instapaper, netscape, pocket, raindrop };

export async function parseLegacyImport(
  format: Exclude<ImportFormat, 'absolute-memory'>,
  source: TransferSource,
) {
  const entries =
    format === 'omnivore'
      ? await omnivore(source)
      : format === 'readwise'
        ? await readwise(source)
        : await parsers[format](await readPlainTransfer(source));
  if (entries.length > 100_000)
    throw new HttpError(
      413,
      'This file contains more than 100,000 saves. Split it into smaller files.',
    );
  const valid = entries.flatMap((entry) => {
    if (typeof entry.url !== 'string' || entry.url.length > 4000) return [];
    try {
      return [{ ...entry, url: canonicalImportUrl(entry.url) }];
    } catch {
      return [];
    }
  });
  if (!valid.length) throw new HttpError(422, 'The file contains no usable HTTP or HTTPS saves.');
  return { entries: valid, skipped: entries.length - valid.length };
}

async function restoreMark(
  tx: Queryable,
  userId: string,
  itemId: string,
  passages: Passage[],
  mark: ImportHighlight,
) {
  const quote = mark.quote.trim().slice(0, 12_000);
  if (!quote) return;
  const duplicate = await findImportedHighlight(tx, userId, itemId, quote);
  if (duplicate.rows.length) return;
  await insertHighlight(
    tx,
    userId,
    itemId,
    randomUUID(),
    quote,
    findQuote(passages, quote),
    mark.createdAt,
  );
}

export async function insertLegacyEntries(tx: Queryable, userId: string, entries: ImportEntry[]) {
  await lockUser(tx, userId);
  let created = 0;
  for (const row of entries) {
    const existing = (await lockLegacyImportDuplicate(tx, userId, row.url)).rows[0];
    const id = existing?.id ?? randomUUID();
    const reading = plainReading((row.text ?? '').slice(0, 100_000));
    const passages = existing?.passages ?? reading.passages;
    if (!existing) {
      const domain = new URL(row.url).hostname;
      const title = row.title?.trim().slice(0, 300) || domain;
      const plain = passages.map((passage) => passage.text).join(' ');
      await insertLegacyImportItem(
        tx,
        id,
        userId,
        title,
        row.url,
        domain,
        plain.slice(0, 300),
        JSON.stringify(passages),
        plain ? plain.split(/\s+/).length : 0,
        row.createdAt ?? null,
        row.archived ?? false,
        row.favorite ?? false,
        plain ? null : 'website',
        reading.html,
      );
      created++;
    }
    const tags = [...new Set((row.tags ?? []).map(normalizedTag).filter(Boolean))].slice(0, 20);
    if (tags.length) await restoreManualTags(tx, userId, id, tags);
    for (const highlight of (row.highlights ?? []).slice(0, 20_000))
      await restoreMark(tx, userId, id, passages, highlight);
  }
  return { created, duplicates: entries.length - created };
}
