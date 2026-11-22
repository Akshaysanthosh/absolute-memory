import { storeRawCapture, storeSourceFacts } from '@/server/repos/source-raw';
import type { Queryable } from '@/server/db';
import { addAutomaticTags } from '@/server/services/saved-content';

import type { RawProvider, SourceFacts } from '@/shared/source-facts';

/** Bump when the shape of what we store for a provider changes, so re-derivation can branch on it. */
export const RAW_VERSION = 1;
const MAX_BYTES = 65_536;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0
    ? Math.round(v)
    : typeof v === 'string' && /^\d+$/.test(v)
      ? Number(v)
      : undefined;
const obj = (v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
function iso(v: unknown) {
  const n =
    typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(n) && n > 0 && n < Date.now() + 86_400_000
    ? new Date(n).toISOString()
    : undefined;
}
/** Hashtags from an explicit list or from #words in text; lowercase, unique, at most 12. */
export function hashtagsFrom(list: unknown, text?: string) {
  const found = [
    ...(Array.isArray(list)
      ? list.filter((t): t is string => typeof t === 'string')
      : typeof list === 'string'
        ? list.split(',')
        : []),
    ...((text || '').match(/(^|\s)#([\p{L}\p{N}_]{2,40})/gu) || []).map((t) => t.trim().slice(1)),
  ]
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter((t) => t.length >= 2 && t.length <= 40);
  return [...new Set(found)].slice(0, 12);
}

/** Shrink a response to fit the 64 KB cap: long strings are cut, long arrays shortened, then halved until it fits. */
export function capRaw(data: unknown, maxBytes = MAX_BYTES): unknown {
  let limit = { text: 8000, items: 60 };
  const walk = (value: unknown, depth: number): unknown => {
    if (typeof value === 'string')
      return value.length > limit.text ? value.slice(0, limit.text) + '…' : value;
    if (Array.isArray(value))
      return depth > 8 ? [] : value.slice(0, limit.items).map((v) => walk(v, depth + 1));
    if (value && typeof value === 'object')
      return depth > 8
        ? {}
        : Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [
              k,
              walk(v, depth + 1),
            ]),
          );
    return value;
  };
  for (let i = 0; i < 8; i++) {
    const out = walk(data, 0);
    if (Buffer.byteLength(JSON.stringify(out)) <= maxBytes) return out;
    limit = {
      text: Math.max(200, Math.floor(limit.text / 2)),
      items: Math.max(5, Math.floor(limit.items / 2)),
    };
  }
  return { truncated: true };
}

/** Pull standard facts from a stored response. Pure, so it can re-run on old rows. */
export function normalizeSource(
  provider: RawProvider,
  raw: unknown,
  capturedAt = new Date().toISOString(),
): SourceFacts {
  const d = obj(raw);
  if (provider === 'reddit') {
    const p = obj(d.post);
    const flair = str(p.link_flair_text);
    return clean({
      provider,
      text: str(p.selftext),
      authorHandle: str(p.author) ? `u/${str(p.author)}` : undefined,
      postedAt: iso(p.created_utc),
      hashtags: flair ? hashtagsFrom([flair]) : undefined,
      community:
        str(p.subreddit_name_prefixed) || (str(p.subreddit) ? `r/${str(p.subreddit)}` : undefined),
      stats: statsOf({ score: p.score, comments: p.num_comments }, capturedAt),
      mediaType: p.is_video ? 'video' : str(p.post_hint) === 'image' ? 'image' : 'post',
    });
  }
  if (provider === 'article') {
    const m = obj(d.meta),
      ld = obj(d.jsonLd);
    const ldAuthor = Array.isArray(ld.author) ? obj(ld.author[0]) : obj(ld.author);
    return clean({
      provider,
      description: str(m['og:description']) || str(m.description),
      authorName: str(m['article:author']) || str(m.author) || str(ldAuthor.name),
      authorHandle: str(m['twitter:creator']),
      postedAt: iso(m['article:published_time'] ?? ld.datePublished ?? m['date'] ?? m['pubdate']),
      hashtags: hashtagsFrom([
        ...(Array.isArray(d.tags) ? d.tags : []),
        ...(typeof ld.keywords === 'string'
          ? ld.keywords.split(',')
          : Array.isArray(ld.keywords)
            ? ld.keywords
            : []),
      ]),
      mediaType: 'article',
      language: str(d.lang),
      siteName: str(m['og:site_name']),
    });
  }
  if (provider === 'extension') {
    const text = str(d.text);
    return clean({
      provider,
      text,
      authorName: str(d.author),
      hashtags: hashtagsFrom(undefined, text),
      mediaType: d.video ? 'video' : Array.isArray(d.images) && d.images.length ? 'image' : 'post',
    });
  }
  return clean({
    provider,
    description: str(d.description),
    authorName: str(d.author),
    postedAt: iso(d.publishedAt),
    duration: num(d.duration),
    mediaType: 'audio',
  });
}
function statsOf(values: Record<string, unknown>, capturedAt: string) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) {
    const n = num(v);
    if (n !== undefined) out[k] = n;
  }
  return Object.keys(out).length ? { ...out, capturedAt } : undefined;
}
function clean(facts: SourceFacts): SourceFacts {
  return Object.fromEntries(
    Object.entries(facts).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)),
  ) as SourceFacts;
}

/** Store the provider's response for an item and merge its standard facts into source_details.source.
 * Hashtags become 'source' tags (through the same quality filter as other automatic tags). */
export async function recordSource(
  db: Queryable,
  itemId: string,
  userId: string,
  provider: RawProvider,
  raw: unknown,
) {
  const data = capRaw(raw);
  await storeRawCapture(db, itemId, userId, provider, RAW_VERSION, JSON.stringify(data));
  const facts = normalizeSource(provider, data);
  await applySourceFacts(db, itemId, facts);
  return facts;
}
export async function applySourceFacts(db: Queryable, itemId: string, facts: SourceFacts) {
  await storeSourceFacts(db, itemId, JSON.stringify(facts));
  if (facts.hashtags?.length) await addAutomaticTags(db, itemId, facts.hashtags.slice(0, 6));
}
