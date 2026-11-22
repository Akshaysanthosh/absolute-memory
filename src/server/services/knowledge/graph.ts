import { getDatabase, type Database } from '@/server/db';
import { readGraphItems } from '@/server/repos/knowledge-graph';
import { normalizedTag } from './content';

export async function graphData(
  userId: string,
  tag: string | undefined,
  database?: Database,
  options: { compact?: boolean; nodeId?: string } = {},
) {
  const db = database || (await getDatabase());
  const items = (
    await readGraphItems(
      db,
      userId,
      tag ? normalizedTag(tag) : null,
      !!options.compact,
      options.nodeId || null,
    )
  ).rows;
  const mentions = items.flatMap((i) => i.mentions),
    concepts = [
      ...new Map(
        mentions.map((m) => [
          m.entity_id,
          { id: m.entity_id, name: m.name, kind: 'concept' as const, type: m.type },
        ]),
      ).values(),
    ];
  return {
    nodes: [
      ...items.map((i) => ({ id: i.id, name: i.title, kind: 'item' as const, type: 'Saved item' })),
      ...concepts,
    ],
    links: items.flatMap((item) => [
      ...item.mentions.map((m) => ({
        id: `${m.entity_id}:${m.chunk_id}`,
        source: m.item_id,
        target: m.entity_id,
        label: 'mentions',
        ...(!options.compact ? { evidence: m.evidence, passageIndex: m.passageIndex } : {}),
        itemId: m.item_id,
      })),
      ...item.edges.map((e) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        label: e.label,
        ...(!options.compact ? { evidence: e.evidence, passageIndex: e.passageIndex } : {}),
        itemId: e.item_id,
      })),
    ]),
  };
}
