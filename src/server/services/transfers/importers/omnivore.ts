import { parseHTML } from 'linkedom';
import { z } from 'zod';
import { HttpError } from '@/server/auth/http';
import { isZip, readPlainTransfer, withUnpackedArchive, type TransferSource } from '../archive';
import { savedDate, textContent, type ImportEntry, type ImportHighlight } from './common';

const metadata = z.array(
  z.looseObject({
    url: z.string(),
    title: z.string().optional(),
    slug: z.string().optional(),
    labels: z.array(z.union([z.string(), z.object({ name: z.string() })])).optional(),
    highlights: z
      .array(z.looseObject({ quote: z.string().optional(), text: z.string().optional() }))
      .optional(),
  }),
);

export async function omnivore(input: TransferSource): Promise<ImportEntry[]> {
  if (!(await isZip(input))) {
    const plain = await readPlainTransfer(input);
    return readEntries(['metadata.json'], async () => plain);
  }
  return withUnpackedArchive(
    input,
    (name) =>
      /(?:^|\/)(?:metadata[^/]*\.json|(?:contents|highlights)\/[^/]+\.(?:html|md))$/i.test(name),
    (files) => readEntries([...files.entries.keys()], (name) => files.read(name)),
  );
}

async function readEntries(names: string[], read: (name: string) => Promise<Buffer | undefined>) {
  const content = new Map(names.map((path) => [path.split('/').slice(-2).join('/'), path]));
  const readContent = async (name: string) => {
    const path = content.get(name);
    return path ? read(path) : undefined;
  };
  const entries: ImportEntry[] = [];
  for (const path of names.filter((name) => /\.json$/i.test(name))) {
    const data = await read(path);
    if (!data) continue;
    let rows;
    try {
      const decoded = JSON.parse(textContent(data));
      rows = metadata.parse(Array.isArray(decoded) ? decoded : (decoded.links ?? decoded.items));
    } catch {
      throw new HttpError(422, 'This Omnivore export contains invalid metadata.');
    }
    for (const row of rows) {
      const slug = row.slug ?? '';
      const highlightFile = await readContent(`highlights/${slug}.md`);
      const highlights: ImportHighlight[] = (row.highlights ?? []).flatMap((mark) => {
        const quote = mark.quote ?? mark.text;
        return quote ? [{ quote }] : [];
      });
      if (!highlights.length && highlightFile) {
        const quotes = textContent(highlightFile).match(/(?:^>.*\n?)+/gm) ?? [];
        highlights.push(
          ...quotes
            .map((quote) => ({ quote: quote.replace(/^>\s?/gm, '').trim() }))
            .filter((mark) => mark.quote),
        );
      }
      const html = await readContent(`contents/${slug}.html`);
      const markdown = html ? undefined : await readContent(`contents/${slug}.md`);
      const text = html
        ? parseHTML(textContent(html)).document.body.textContent?.trim()
        : markdown
          ? textContent(markdown)
          : undefined;
      entries.push({
        url: row.url,
        title: row.title ?? '',
        createdAt: savedDate(row.savedAt ?? row.createdAt),
        tags: (row.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name)),
        archived: Boolean(row.isArchived),
        text,
        highlights,
      });
    }
  }
  return entries;
}
