'use client';

import { useKnowledgeGraph } from './use-knowledge-graph';
import { KnowledgeGraphView } from './knowledge-graph-view';

export function KnowledgeGraph(props: Parameters<typeof useKnowledgeGraph>[0]) {
  return <KnowledgeGraphView model={useKnowledgeGraph(props)} />;
}
