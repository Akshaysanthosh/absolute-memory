import { z } from 'zod';

export const id = z.uuid();
export const itemKind = z.enum(['article', 'note', 'pdf', 'image', 'spreadsheet']);
export const itemStatus = z.enum(['pending', 'processing', 'ready', 'failed']);
export const listQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(256).optional(),
  tag: z.string().max(60).optional(),
  type: z.string().max(60).optional(),
  topic: z.string().max(60).optional(),
  status: itemStatus.optional(),
});
export const askInput = z.strictObject({
  question: z.string().trim().min(1).max(1500),
  itemIds: z.array(id).max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
});
export const offset = z.coerce.number().int().min(0).max(9_999_999).default(0);
export const captureReceipt = z.object({
  id,
  status: itemStatus,
  duplicate: z.boolean(),
  statusPath: z.string(),
});
export const statusResponse = z.object({ id, status: itemStatus });
export const itemSummary = z.object({
  id,
  title: z.string(),
  kind: itemKind,
  status: itemStatus,
  excerpt: z.string(),
});
export const itemList = z.object({
  items: z.array(itemSummary),
  nextCursor: z.string().nullable(),
});
const passageIndex = z.number().int().nonnegative();
const segment = z.object({
  passageIndex,
  start: passageIndex,
  end: passageIndex,
  text: z.string(),
});
export const highlightsQuery = z.object({
  itemId: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset,
});
export const highlight = z.object({
  id,
  itemId: id,
  title: z.string(),
  quote: z.string(),
  createdAt: z.iso.datetime(),
  segments: z.array(segment),
  path: z.string().nullable(),
});
export const highlightsList = z.object({
  highlights: z.array(highlight),
  nextOffset: passageIndex.nullable(),
});
export const tagsList = z.object({
  tags: z.array(z.object({ name: z.string(), count: z.number().int().nonnegative() })),
});
export const itemDetail = itemSummary.extend({
  url: z.string().nullable(),
  domain: z.string().nullable(),
  passages: z.array(
    z.object({
      index: passageIndex,
      text: z.string(),
      startMs: passageIndex.optional(),
      endMs: passageIndex.optional(),
      path: z.string(),
    }),
  ),
  nextOffset: passageIndex.nullable(),
  highlights: z.array(highlight),
});
export const answer = z.object({
  answer: z.string(),
  sources: z.array(
    z.object({
      number: z.number().int().positive(),
      itemId: id,
      title: z.string(),
      passageIndex,
      quote: z.string(),
      path: z.string(),
    }),
  ),
  degraded: z.boolean(),
});
export const apiError = z.object({ error: z.string() });

export const integrationCaptureSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('article'), url: z.string().url().max(4000) }),
  z.strictObject({
    kind: z.literal('note'),
    title: z.string().trim().min(1).max(300),
    text: z.string().trim().min(1).max(100_000),
  }),
]);
