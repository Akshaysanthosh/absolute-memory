import { insertSourceTags } from '@/server/repos/item-tags';
import { canonicalTag, usefulAutomaticTag } from '@/shared/tag-names';
import type { Queryable } from '@/server/db';
import type { Item } from '@/shared/types';

/** Common English words and title filler. Title words are only tagged when they name something. */
const stopWords = new Set(
  `about above after again against all also and any are aren around back because been before being below best between both but can cannot could did does doing done down during each even ever every few for from further get gets getting going gonna got had has have having her here hers him his how into its itself just let like made make makes many may more most much must need never new next not now off official once one only other our ours out over own part per really said same say says see should since some still such than that the their them then there these they thing things this those though through too under until upon used using very video want was way ways well were what when where which while who whom whose why will with without would yet you your yours`.split(
    ' ',
  ),
);

/** Whether a single-word tag is only title filler ("was", "how", "gonna"). */
export function isFillerTag(name: string) {
  return stopWords.has(name);
}

export function captureTags(text: string) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return [
    ...new Set(
      words.filter(
        (word) =>
          (word.length >= 3 || word === 'ai') &&
          word.length <= 60 &&
          !stopWords.has(word) &&
          /\p{L}/u.test(word),
      ),
    ),
  ].slice(0, 5);
}

export async function addAutomaticTags(db: Queryable, itemId: string, tags: string[]) {
  const names = [...new Set(tags.map((tag) => canonicalTag(tag)).filter(usefulAutomaticTag))];
  if (!names.length) return;
  await insertSourceTags(db, itemId, names);
}

export function matchesSavedContent(item: Item, query: string) {
  const product = item.source_details?.product;
  const haystack = [
    item.title,
    item.excerpt,
    item.domain,
    item.searchable_text,
    item.source_details?.image?.description,
    item.source_details?.quote?.title,
    product?.brand,
    product?.retailer,
    product?.color,
    ...(item.tags || []),
  ]
    .join(' ')
    .toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}
