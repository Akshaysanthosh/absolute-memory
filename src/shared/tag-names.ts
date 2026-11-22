/** One canonical spelling per tag so "AI-Agents", "ai agents" and "ai agent" collapse together. */
const KEEP_PLURAL = /(ss|us|is|ics|news|series|species|ways|ers' |ous)$/;
const SHORT_OK = new Set([
  'ai',
  'ml',
  'ux',
  'ui',
  'vr',
  'ar',
  'us',
  'uk',
  'eu',
  'tv',
  'pc',
  'go',
  'r',
]);
/** Single words that say nothing about a topic. Automatic tags with these names are dropped. */
const JUNK = new Set([
  'image',
  'images',
  'photo',
  'picture',
  'screenshot',
  'bookmark',
  'article',
  'video',
  'podcast',
  'interesting',
  'misc',
  'other',
  'introduces',
  'introduce',
  'building',
  'build',
  'away',
  'synthetic',
  'get started',
  'topic notes',
  'library',
  'test',
  'content',
  'capture-status',
  'capture status',
  'audio import test',
  'app domain',
  'cooperate',
  'describes',
  'select',
]);
const COLOR =
  /^(black|white|gray|grey|blue|red|green|yellow|orange|pink|purple|brown|beige|cream|navy|teal|gold|silver|dark|light)(?:[- ]|$)/;
const VISUAL_NOUN =
  /\b(shirt|armchair|tablet|slice|portrait|lenses?|paper|background|wall|table|desk|chair|jacket|dress|sofa|cup|mug)\b/;

function singular(word: string) {
  if (word === 'ais') return 'ai';
  if (word.length <= 3 || KEEP_PLURAL.test(word)) return word;
  if (/[kvz]ies$/.test(word)) return word.slice(0, -1); // cookies, movies, zombies
  if (/[^aeiou]ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Lowercase, hyphen/underscore to space, trim punctuation and, for generated tags, use the singular.
 * Manual tags keep the user's own plural ("chips" stays "chips"). */
export function canonicalTag(
  raw: string,
  { singularize = true }: { singularize?: boolean } = {},
): string {
  const cleaned = raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_‐-―-]+/g, ' ')
    .replace(/[^\p{L}\p{N}&+.' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.' ]+|[.' ]+$/g, '');
  if (!cleaned) return '';
  const words = cleaned.split(' ');
  if (singularize) words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ').slice(0, 60);
}

/** Whether an automatically generated tag is worth showing in filters. Manual tags are always kept. */
export function usefulAutomaticTag(name: string): boolean {
  if (!name || JUNK.has(name)) return false;
  if (name.length < 3 && !SHORT_OK.has(name)) return false;
  if (name.split(' ').length > 4) return false;
  if (COLOR.test(name) && VISUAL_NOUN.test(name)) return false;
  if (/^\d+$/.test(name)) return false;
  return true;
}
