import { labels, readCsv, savedDate, type ImportEntry } from './common';

export function instapaper(input: Uint8Array): ImportEntry[] {
  return readCsv(input).map((row) => ({
    url: row.url,
    title: row.title,
    createdAt: savedDate(row.timestamp ?? row.date),
    tags: labels(row.tags ?? row.folder),
    archived: /^archive$/i.test(row.folder ?? ''),
    highlights: row.selection?.trim() ? [{ quote: row.selection.trim() }] : [],
  }));
}
