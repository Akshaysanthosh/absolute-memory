import type { SourceFacts } from '@/shared/source-facts';

const NO_TEXT = 'No readable text to organize.';
export const usable = (text?: string | null) => (text && text.trim() !== NO_TEXT ? text : '');

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
/** "Posted Mar 3, 2025 · @handle · r/programming · 1.2K likes" from the item's source facts. */
export function sourceLine(source?: SourceFacts) {
  if (!source) return '';
  const parts: string[] = [];
  if (source.postedAt)
    parts.push(
      `Posted ${new Date(source.postedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    );
  if (source.authorHandle) parts.push(source.authorHandle);
  else if (source.authorName && source.provider !== 'article') parts.push(source.authorName);
  if (source.community) parts.push(source.community);
  const s = source.stats;
  if (s) {
    if (s.views) parts.push(`${compact.format(s.views)} views`);
    if (s.likes) parts.push(`${compact.format(s.likes)} likes`);
    if (s.score) parts.push(`${compact.format(s.score)} points`);
    if (s.comments) parts.push(`${compact.format(s.comments)} comments`);
  }
  return parts.join(' · ');
}
