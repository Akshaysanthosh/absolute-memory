'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { api } from '@/shared/client';
import { useAppTheme } from './app-theme';
export type Node = { id: string; name: string; kind: 'item' | 'concept'; type: string };
type Edge = {
  id: string;
  source: string;
  target: string;
  label: string;
  evidence: string;
  itemId: string;
  passageIndex: number;
};
type Graph = { nodes: Node[]; links: Edge[] };
export function useKnowledgeGraph({ initialItemId }: { initialItemId?: string }) {
  const { resolved } = useAppTheme();
  const colors =
    resolved === 'dark'
      ? { item: '#FAFAFA', concept: '#A3A3A3', link: '#737373', text: '#FAFAFA' }
      : { item: '#25634B', concept: '#425FD6', link: '#87948B', text: '#202522' };
  const [graph, setGraph] = useState<Graph>({ nodes: [], links: [] });
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState(false);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(435);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [focusId, setFocusId] = useState(initialItemId);
  const [spacing, setSpacing] = useState(100);
  const [labels, setLabels] = useState(true);
  const container = useRef<HTMLDivElement>(null),
    graphRef = useRef<ForceGraphMethods | undefined>(undefined),
    fitted = useRef(false),
    placedLabels = useRef<{ x: number; y: number; width: number; height: number }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ topics: string[] }>('/api/library/topics', { signal: controller.signal })
      .then((d) => setTags(d.topics))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void api<Graph>(
      `/api/knowledge/graph?view=topology${tag ? '&tag=' + encodeURIComponent(tag) : ''}`,
    )
      .then((g) => {
        if (active) {
          setGraph(g);
          const focused = g.nodes.find((node) => node.kind === 'item' && node.id === initialItemId);
          setSelected(focused || null);
          setInspectorOpen(Boolean(focused));
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tag, initialItemId]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
      setHeight(Math.floor(entry.contentRect.height));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [list, loading, search]);
  useEffect(() => {
    fitted.current = false;
  }, [graph]);
  const configuredGraph = useRef<{ instance: ForceGraphMethods; spacing: number } | null>(null);
  const configureSpacing = () => {
    const instance = graphRef.current;
    if (
      instance &&
      (configuredGraph.current?.instance !== instance ||
        configuredGraph.current.spacing !== spacing)
    ) {
      instance.d3Force('charge')?.strength((-30 * spacing) / 100);
      configuredGraph.current = { instance, spacing };
      instance.d3ReheatSimulation();
    }
  };
  useEffect(() => {
    configureSpacing();
  }, [spacing]);

  function selectNode(node: Node | null) {
    setSelected(node);
    if (node) setInspectorOpen(true);
  }
  const drawing = useMemo(() => {
    const focus = graph.nodes.find((node) => node.kind === 'item' && node.id === focusId);
    const connected = new Set<string>();
    if (focus) {
      connected.add(focus.id);
      for (const link of graph.links)
        if (link.source === focus.id || link.target === focus.id) {
          connected.add(link.source);
          connected.add(link.target);
        }
      const concepts = new Set(connected);
      for (const link of graph.links)
        if (link.label === 'mentions' && concepts.has(link.target)) connected.add(link.source);
    }
    return {
      nodes: graph.nodes
        .filter((node) => !focus || connected.has(node.id))
        .map((node) => ({ ...node })),
      links: graph.links
        .filter((link) => !focus || (connected.has(link.source) && connected.has(link.target)))
        .map((link) => ({ ...link })),
    };
  }, [graph, focusId]);
  const nodes = drawing.nodes.filter((node) =>
    node.name.toLowerCase().includes(search.toLowerCase()),
  );
  const [evidence, setEvidence] = useState<Edge[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  useEffect(() => {
    setEvidence([]);
    setEvidenceError('');
    if (!selected || !inspectorOpen) {
      setEvidenceLoading(false);
      return;
    }
    const controller = new AbortController();
    setEvidenceLoading(true);
    void api<Graph>(
      `/api/knowledge/graph?node=${encodeURIComponent(selected.id)}${tag ? '&tag=' + encodeURIComponent(tag) : ''}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setEvidence(data.links);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setEvidenceError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setEvidenceLoading(false);
      });
    return () => controller.abort();
  }, [selected?.id, inspectorOpen, tag]);
  const renderNodes = () => (
    <div className="kg-graph-list">
      {nodes.map((node) => (
        <button
          key={node.id}
          className="kg-graph-node"
          aria-pressed={selected?.id === node.id}
          aria-controls="graph-evidence"
          onClick={() => selectNode(node)}
        >
          <span className={`kg-node-dot ${node.kind}`} />
          {node.name}
          <small className="kg-muted"> · {node.type}</small>
        </button>
      ))}
      {!nodes.length && <p className="kg-empty">No matches.</p>}
    </div>
  );

  return {
    colors,
    configureSpacing,
    container,
    drawing,
    error,
    evidence,
    evidenceError,
    evidenceLoading,
    fitted,
    focusId,
    graph,
    graphRef,
    height,
    inspectorOpen,
    labels,
    list,
    loading,
    placedLabels,
    renderNodes,
    search,
    selectNode,
    selected,
    setFocusId,
    setInspectorOpen,
    setLabels,
    setList,
    setSearch,
    setSelected,
    setSpacing,
    setTag,
    spacing,
    tag,
    tags,
    width,
  };
}
export type KnowledgeGraphModel = ReturnType<typeof useKnowledgeGraph>;
