import { isZip, readPlainTransfer, withUnpackedArchive, type TransferSource } from '../archive';
import {
  labels,
  readCsv,
  savedDate,
  type CsvRow,
  type ImportEntry,
  type ImportHighlight,
} from './common';

function documentRows(rows: CsvRow[]) {
  return rows
    .filter((row) => !(row.highlight ?? row.highlighttext))
    .map((row) => ({
      url: row.url ?? row.documenturl ?? row.sourceurl ?? row.savedurl,
      title: row.title ?? row.documenttitle,
      createdAt: savedDate(row.savedat ?? row.saveddate ?? row.datesaved ?? row.createdat),
      tags: labels(row.tags),
      archived: /archive/i.test(row.location ?? row.status ?? ''),
      highlights: [] as ImportHighlight[],
    }));
}

export async function readwise(input: TransferSource): Promise<ImportEntry[]> {
  if (!(await isZip(input))) return restore(readCsv(await readPlainTransfer(input)));
  return withUnpackedArchive(
    input,
    (name) => /\.csv$/i.test(name),
    async (files) => {
      const rows: CsvRow[] = [];
      for (const name of files.entries.keys()) {
        const file = await files.read(name);
        if (file) for (const row of readCsv(file)) rows.push(row);
      }
      return restore(rows);
    },
  );
}

function restore(rows: CsvRow[]) {
  const entries = documentRows(rows);
  const byUrl = new Map<string, (typeof entries)[number][]>();
  const byTitle = new Map<string, (typeof entries)[number][]>();
  const add = (entry: (typeof entries)[number]) => {
    for (const [value, map] of [
      [entry.url, byUrl],
      [entry.title, byTitle],
    ] as const) {
      if (!value) continue;
      const matches = map.get(value) ?? [];
      matches.push(entry);
      map.set(value, matches);
    }
  };
  for (const entry of entries) add(entry);
  for (const row of rows) {
    const quote = row.highlight ?? row.highlighttext;
    if (!quote?.trim()) continue;
    const url = row.documenturl ?? row.sourceurl ?? row.url ?? row.bookurl;
    const title = row.booktitle ?? row.documenttitle ?? row.title;
    const matches = (url ? byUrl.get(url) : byTitle.get(title)) ?? [];
    let entry = matches.length === 1 ? matches[0] : undefined;
    if (!entry && url && !matches.length) {
      entry = { url, title, createdAt: undefined, tags: [], archived: false, highlights: [] };
      entries.push(entry);
      add(entry);
    }
    entry?.highlights.push({ quote, createdAt: savedDate(row.highlightedat ?? row.date) });
  }
  return entries;
}
