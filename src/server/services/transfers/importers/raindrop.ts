import { labels, readCsv, savedDate, type ImportEntry } from './common';

export function raindrop(input: Uint8Array): ImportEntry[] {
  return readCsv(input).map((row) => ({
    url: row.link ?? row.url,
    title: row.title,
    createdAt: savedDate(row.created ?? row.createdat),
    tags: labels(row.tags ?? row.collection),
    favorite: /^(?:yes|true|1)$/i.test(row.favorite ?? ''),
    text: row.excerpt || undefined,
    highlights: row.highlight?.trim() ? [{ quote: row.highlight.trim() }] : [],
  }));
}
