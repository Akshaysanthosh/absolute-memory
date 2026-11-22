import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { HttpError } from '@/server/auth/http';

export const exportFormat = 'absolute-memory-export';
export const exportVersion = 1;
export const exportFilename = 'absolute-memory-library.zip';
export const dataFiles = ['items', 'highlights', 'notes', 'chats'] as const;
const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const index = z.number().int().nonnegative();
const passage = z
  .object({ index, text: z.string(), startMs: index.optional(), endMs: index.optional() })
  .refine(({ startMs, endMs }) =>
    startMs === undefined ? endMs === undefined : endMs !== undefined && endMs >= startMs,
  );
const segment = z
  .object({ passageIndex: index, start: index, end: index, text: z.string().min(1) })
  .refine(({ start, end }) => end > start);
export const readingImage = z.object({
  slot: index,
  size: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
});
export type PortableImage = z.infer<typeof readingImage>;
export function readingImagePath(itemId: string, image: PortableImage) {
  return `reading-images/${itemId}/${image.slot}.${mimeExtensions[image.mime]}`;
}
const file = z.object({
  digest: z.string().regex(/^[a-f\d]{64}$/),
  size: z.number().int().positive(),
  path: z.string().regex(/^files\/[a-f\d]{64}\.(?:pdf|png|jpg|webp|xlsx)$/),
  name: z.string().max(255),
  mime: z.enum([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]),
  pages: z.number().int().positive(),
  method: z.string().max(255),
});
export const mimeExtensions: Record<z.infer<typeof file>['mime'], string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
export const manifestSchema = z.object({
  format: z.literal(exportFormat),
  version: z.literal(exportVersion),
  exported_at: timestamp,
  app_version: z.string(),
  counts: z.object({
    items: z.number().int().nonnegative(),
    highlights: z.number().int().nonnegative(),
    reading_images: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
    chats: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
  }),
});
export const portableItem = z.looseObject({
  id: uuid,
  kind: z.enum(['article', 'note', 'pdf', 'image', 'spreadsheet']),
  title: z.string().max(300),
  url: z.string().nullable(),
  reading_html: z.string(),
  passages: z.array(passage),
  reading_images: z.array(readingImage).max(13),
  status: z.enum(['pending', 'processing', 'ready', 'failed']),
  created_at: timestamp,
  updated_at: timestamp,
  tags: z.array(z.string().max(60)),
  topics: z.array(z.string().max(60)),
  file: file.nullish(),
});
export const portableHighlight = z.object({
  id: uuid,
  item_id: uuid,
  quote: z.string().min(1).max(60_000),
  created_at: timestamp,
  segments: z.array(segment).max(100),
});
export const portableNote = z.looseObject({
  item_id: uuid,
  document: z.json(),
  version: z.number().int().positive(),
  markdown: z.string(),
  updated_at: timestamp,
});
export const portableChat = z.looseObject({
  id: uuid,
  created_at: timestamp,
  messages: z.array(
    z.looseObject({ id: uuid, question: z.string(), answer: z.string(), created_at: timestamp }),
  ),
});

export function decodeJson<T>(data: Buffer | undefined, schema: z.ZodType<T>, name: string) {
  try {
    return schema.parse(JSON.parse(data?.toString('utf8') ?? 'null'));
  } catch {
    throw new HttpError(422, `Invalid ${name} in the library archive.`);
  }
}

export async function decodeJsonl<T>(path: string | undefined, schema: z.ZodType<T>, name: string) {
  if (!path) throw new HttpError(422, `Missing ${name} in the library archive.`);
  const source = createReadStream(path);
  const lines = createInterface({ input: source, crlfDelay: Infinity });
  const rows: T[] = [];
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        rows.push(schema.parse(JSON.parse(line)));
      } catch {
        throw new HttpError(422, `Invalid record ${rows.length + 1} in ${name}.`);
      }
    }
    return rows;
  } finally {
    lines.close();
    source.destroy();
  }
}
