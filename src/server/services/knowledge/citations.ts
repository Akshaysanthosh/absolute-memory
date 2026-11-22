import type { Queryable } from '@/server/db';
import { findCitedContent } from '@/server/repos/knowledge-retrieval';
import type { KnowledgeSource } from '@/shared/knowledge/shared';

export async function sourceAvailability(
  userId: string,
  sources: KnowledgeSource[],
  db: Queryable,
) {
  const saved = sources.filter((source) => source.type === 'saved');
  if (!saved.length) return sources;
  const { rows } = await findCitedContent(
    db,
    userId,
    [...new Set(saved.map((source) => source.itemId))],
    [...new Set(saved.map((source) => source.quote))],
  );
  return sources.map((source) =>
    source.type === 'web'
      ? source
      : {
          ...source,
          available: rows.some(
            (row) =>
              row.item_id === source.itemId &&
              row.passage_indices.includes(source.passageIndex) &&
              row.content === source.quote,
          ),
        },
  );
}
