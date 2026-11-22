import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from '@/server/auth/http';
import type { Database } from '@/server/db';
import { findQuoteByKey, insertQuote } from '@/server/repos/item-capture';
import { lockUser } from '@/server/repos/users';
import { normalizeUrl } from '@/server/services/extract';
import { textReading } from '@/server/services/import/content';
import { addAutomaticTags, captureTags } from '@/server/services/saved-content';

export async function captureQuote(
  db: Pick<Database, 'transaction'>,
  userId: string,
  input: { sourceUrl: string; title: string; text: string },
  channel: string,
) {
  let source: string;
  try {
    source = normalizeUrl(input.sourceUrl);
  } catch {
    throw new HttpError(400, 'Enter a public source URL for the quote.');
  }
  const key = createHash('sha256')
    .update(JSON.stringify([source, input.text]))
    .digest('hex');
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const {
      rows: [previous],
    } = await findQuoteByKey(tx, userId, key);
    if (previous) return { item: previous, duplicate: true };
    const id = randomUUID(),
      domain = new URL(source).hostname;
    const reading = textReading([{ tag: 'p', text: input.text }]);
    const {
      rows: [item],
    } = await insertQuote(tx, {
      id,
      userId,
      title: input.title || `Quote from ${domain}`,
      domain,
      excerpt: input.text.slice(0, 300),
      passagesJson: JSON.stringify(reading.passages),
      words: input.text.trim().split(/\s+/).length,
      channel,
      detailsJson: JSON.stringify({ quote: { url: source, title: input.title } }),
      key,
      html: reading.html,
    });
    // Immediate tags keep a quote findable before organization; title filler words are skipped.
    await addAutomaticTags(tx, id, captureTags(input.text));
    return { item, duplicate: false };
  });
}
