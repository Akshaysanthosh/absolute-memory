export { passageHref as passageUrl } from '@/shared/passages';
export type Evidence = {
  id: string;
  itemId: string;
  title: string;
  text: string;
  passageIndex: number;
  score?: number;
};
export type SavedSource = {
  type: 'saved';
  key: string;
  itemId: string;
  title: string;
  passageIndex: number;
  quote: string;
  available?: boolean;
};
export type WebSource = { type: 'web'; key: string; url: string; title: string };
export type KnowledgeSource = SavedSource | WebSource;
export type KnowledgeInfo = {
  state: string;
  stage: string;
  error: string | null;
  summary: string;
  tags: string[];
  completed: number;
  total: number;
};
export function validateCitations(text: string, sources: ReadonlyArray<{ key: string }>) {
  const valid = new Set(sources.map((source) => source.key));
  // A model may group source numbers even when the prompt asks for individual citations.
  return text
    .replace(/\[(\d+)\s*[-–—]\s*(\d+)\]/g, (_all, first, last) => {
      const start = Number(first);
      const end = Number(last);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        end < start ||
        end - start > 99
      )
        return '[source unavailable]';
      return Array.from({ length: end - start + 1 }, (_, index) => `[${start + index}]`).join(' ');
    })
    .replace(/\[((?:\d+\s*[,;]\s*)+\d+)\]/g, (_all, keys: string) =>
      keys
        .split(/\s*[,;]\s*/)
        .map((key) => `[${key}]`)
        .join(' '),
    )
    .replace(/\[(\d+)\]/g, (_all, key) =>
      valid.has(String(Number(key))) ? `[${Number(key)}]` : '[source unavailable]',
    )
    .replace(/\](?=\[\d+\])/g, '] ');
}
export function sameWebSource(left: string, right: string) {
  try {
    const normalize = (raw: string) => {
      const u = new URL(raw);
      if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return '';
      u.hash = '';
      for (const k of [...u.searchParams.keys()])
        if (k.startsWith('utm_')) u.searchParams.delete(k);
      u.searchParams.sort();
      return u.href;
    };
    const a = normalize(left);
    return !!a && a === normalize(right);
  } catch {
    return false;
  }
}
