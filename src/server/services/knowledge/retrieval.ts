import { reciprocalRankScores } from './rank-fusion';
import {
  findLexicalEvidence,
  findSemanticEvidence,
  findGraphEvidence,
  findScopedEvidence,
  findRecentEvidence,
  findLexicalPassages,
  type EvidenceRow,
} from '@/server/repos/knowledge-retrieval';
import { findEntityMatches } from '@/server/repos/knowledge-graph';
import { countPendingKnowledge } from '@/server/repos/knowledge-jobs';
import { findOwnedItemIds } from '@/server/repos/items';
import { getDatabase, type Database } from '@/server/db';
import { HttpError } from '@/server/auth/http';
import { embeddingAvailability } from '@/server/services/embeddings';
import { liveKnowledgeProvider, type KnowledgeProvider } from '@/server/providers';
import { recordCall } from '@/server/services/knowledge/usage';
import { normalizedTag } from './content';
import { mergeScoredResults, normalizeSearchText } from './upstream/retrieval';
import type { Evidence } from '@/shared/knowledge/shared';

export type SearchScope = { itemIds?: string[]; tags?: string[]; excludeChatNotes?: boolean };
/** Words that describe the library itself rather than a topic in it. Matching on
 * them made broad questions retrieve the app's own walkthrough and test uploads. */
const LIBRARY_META_WORDS = new Set([
  'my',
  'me',
  'i',
  'we',
  'our',
  'saved',
  'save',
  'saves',
  'saving',
  'reading',
  'read',
  'library',
  'sources',
  'source',
  'items',
  'item',
  'things',
  'stuff',
  'ideas',
  'idea',
  'connect',
  'connects',
  'connected',
  'connection',
  'connections',
  'across',
  'between',
  'where',
  'what',
  'which',
  'why',
  'how',
  'do',
  'does',
  'did',
  'should',
  'next',
  'revisit',
  'disagree',
  'disagrees',
  'agree',
  'themes',
  'theme',
  'patterns',
  'pattern',
  'common',
  'thread',
  'overall',
  'everything',
  'all',
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'to',
  'and',
  'or',
  'is',
  'are',
  'that',
  'this',
  'these',
  'those',
  'about',
  'from',
  'with',
  'for',
  'most',
  'any',
  'some',
]);
export function libraryFocusTerms(query: string) {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !LIBRARY_META_WORDS.has(w));
}
/** "What ideas connect across my saved reading?" is about the whole library, not a topic. */
export function isBroadLibraryQuestion(query: string) {
  return libraryFocusTerms(query).length === 0;
}
export async function retrieve(
  userId: string,
  query: string,
  scope: SearchScope = {},
  database?: Database,
  provider: KnowledgeProvider = liveKnowledgeProvider,
) {
  const db = database || (await getDatabase());
  const broad = !scope.itemIds?.length && !scope.tags?.length && isBroadLibraryQuestion(query);
  const itemIds = scope.itemIds || [],
    tags = (scope.tags || []).map(normalizedTag);
  if (itemIds.length) {
    const r = await findOwnedItemIds(db, userId, itemIds);
    if (r.rows.length !== new Set(itemIds).size)
      throw new HttpError(404, 'One of the selected items was not found.');
  }
  // Match the question's topic words (all of them, stemmed): "my saved agents" searches for "agent".
  const terms = libraryFocusTerms(query).join(' ');
  const lexical =
    broad || !terms
      ? { rows: [] as EvidenceRow[] }
      : await findLexicalEvidence(db, userId, itemIds, tags, terms, !!scope.excludeChatNotes);
  let semantic: EvidenceRow[] = [];
  let degraded = false;
  const started = Date.now();
  const status = provider === liveKnowledgeProvider ? await embeddingAvailability(db) : null;
  if (!status || (status.enabled && status.initialized))
    try {
      const r = await provider.embed([query]);
      await recordCall(db, userId, 'query-embedding', started, r);
      const v = r.value[0];
      if (
        !v.length ||
        (status?.dimensions && v.length !== status.dimensions) ||
        !v.every(Number.isFinite)
      )
        throw new Error('Invalid embedding');
      semantic = (
        await findSemanticEvidence(
          db,
          userId,
          itemIds,
          tags,
          JSON.stringify(v),
          !!scope.excludeChatNotes,
        )
      ).rows;
    } catch {
      degraded = true;
    }
  // Entity names are matched in Postgres instead of loading every entity: same rule as
  // scoreEntityNameMatch (whole-phrase containment either way after normalization).
  const normalizedQuery = normalizeSearchText(query);
  const matched = normalizedQuery
    ? (await findEntityMatches(db, userId, normalizedQuery)).rows.map((e) => e.id)
    : [];
  const graph = matched.length
    ? (await findGraphEvidence(db, userId, itemIds, tags, matched, !!scope.excludeChatNotes)).rows
    : [];
  // Reciprocal rank fusion prevents incomparable lexical and cosine scores from dominating.
  const rank = reciprocalRankScores([lexical.rows, semantic, graph]);
  const merged = mergeScoredResults(
    [lexical.rows, semantic, graph].map((xs) => xs.map((x) => ({ ...x, score: rank.get(x.id)! }))),
    { limit: 72 },
  );
  const perItem = new Map<string, number>();
  const evidence: Evidence[] = [];
  const perItemLimit = broad ? 1 : 3;
  for (const r of merged) {
    if ((perItem.get(r.item_id) || 0) >= perItemLimit) continue;
    perItem.set(r.item_id, (perItem.get(r.item_id) || 0) + 1);
    evidence.push({
      id: r.id,
      itemId: r.item_id,
      title: r.title,
      text: r.content,
      passageIndex: r.passage_index,
      score: r.score,
    });
    if (evidence.length === 12) break;
  }
  // An explicit topic/item scope is itself a retrieval signal. Imported libraries
  // may have no embeddings yet, and broad synthesis questions need representative
  // passages even when every word in the question does not occur in one chunk.
  if (!evidence.length && (itemIds.length || tags.length)) {
    const scoped = await findScopedEvidence(db, userId, itemIds, tags, !!scope.excludeChatNotes);
    for (const r of scoped.rows)
      evidence.push({
        id: r.id,
        itemId: r.item_id,
        title: r.title,
        text: r.content,
        passageIndex: r.passage_index,
      });
  }
  // Broad questions need a representative spread of the library: one opening
  // passage from each of the most recently read or saved items not already cited.
  if (broad && evidence.length < 12) {
    const spread = await findRecentEvidence(
      db,
      userId,
      itemIds,
      tags,
      [...perItem.keys()],
      12 - evidence.length,
      !!scope.excludeChatNotes,
    );
    for (const r of spread.rows)
      evidence.push({
        id: r.id,
        itemId: r.item_id,
        title: r.title,
        text: r.content,
        passageIndex: r.passage_index,
      });
  }
  if (terms && evidence.length) {
    const { rows } = await findLexicalPassages(
      db,
      userId,
      evidence.map((source) => source.id),
      terms,
    );
    const indices = new Map(rows.map((row) => [row.id, row.passage_index]));
    for (const source of evidence)
      source.passageIndex = indices.get(source.id) ?? source.passageIndex;
  }
  const pending = Number((await countPendingKnowledge(db, userId)).rows[0].count);
  return { evidence, pending, degraded };
}
