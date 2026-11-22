'use client';

import { plural } from '@/shared/plural';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronUp } from 'lucide-react';
import { passageUrl } from '@/shared/knowledge/shared';
import './knowledge.css';
import styles from './knowledge-graph.module.css';
import { WorkspacePanel } from './workspace-context';
import type { KnowledgeGraphModel } from './use-knowledge-graph';
const ForceGraph = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <p className="kg-empty">Drawing your connections…</p>,
});

import type { Node } from './use-knowledge-graph';
export function KnowledgeGraphView({ model }: { model: KnowledgeGraphModel }) {
  const {
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
  } = model;

  return (
    <div className={styles.page}>
      <WorkspacePanel>
        <div className="workspace-graph-settings">
          <details open>
            <summary>Filters</summary>
            <label className="workspace-panel-label">
              Find an entity or item
              <input
                className="kg-input"
                aria-label="Find an entity or item"
                placeholder="Find an entity…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="workspace-panel-label">
              Topic
              <select
                className="kg-input"
                aria-label="Graph topic"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              >
                <option value="">All topics</option>
                {tags.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </details>
          <details open>
            <summary>Layout</summary>
            <label className="workspace-panel-label">
              Node spacing <output>{spacing}%</output>
              <input
                type="range"
                aria-label="Node spacing"
                min="40"
                max="220"
                step="10"
                value={spacing}
                onChange={(e) => setSpacing(Number(e.target.value))}
              />
            </label>
          </details>
          <details open>
            <summary>Appearance</summary>
            <label className="workspace-panel-check">
              <input
                type="checkbox"
                checked={labels}
                onChange={(e) => setLabels(e.target.checked)}
              />
              Show labels
            </label>
            <p className="kg-muted">
              <span className="kg-node-dot item" />
              Saved content
            </p>
            <p className="kg-muted">
              <span className="kg-node-dot" />
              Extracted entities
            </p>
          </details>
          <button
            className="kg-button"
            onClick={() => {
              setSpacing(100);
              setLabels(true);
              setSearch('');
              setTag('');
              graphRef.current?.zoomToFit(300, 70);
            }}
          >
            Reset view
          </button>
        </div>
      </WorkspacePanel>
      <h1 className={styles.srOnly}>Explore connections in your library</h1>
      {error && (
        <p className="kg-status kg-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className={styles.loading}>
          Loading connections…
        </p>
      ) : !graph.nodes.length ? (
        <div className="kg-panel kg-empty">
          <h2>Your map starts with a good read.</h2>
          <p>Connections appear as saved content is organized.</p>
          <Link className="kg-button" href="/library">
            Open your library
          </Link>
        </div>
      ) : (
        <div className={styles.content}>
          <section className={styles.mapPanel}>
            <div className={styles.toolbar} aria-label="Graph controls">
              {focusId && (
                <button
                  className="kg-button"
                  onClick={() => {
                    setFocusId(undefined);
                    setSelected(null);
                    setInspectorOpen(false);
                    fitted.current = false;
                    window.history.replaceState(window.history.state, '', '/graph');
                  }}
                >
                  Whole graph
                </button>
              )}
              <button
                className="kg-button"
                aria-pressed={list}
                onClick={() => setList((value) => !value)}
              >
                {list ? 'Show graph' : 'Show list'}
              </button>
              {!list && (
                <button className="kg-button" onClick={() => graphRef.current?.zoomToFit(300, 55)}>
                  Fit graph
                </button>
              )}
              <button
                className="kg-button"
                aria-expanded={inspectorOpen}
                aria-controls="graph-evidence"
                onClick={() => setInspectorOpen((value) => !value)}
              >
                Connection details
              </button>
            </div>
            <div className={styles.board} ref={container}>
              {!list && !search && (
                <div className={styles.canvas} aria-label="Interactive knowledge graph">
                  <ForceGraph
                    ref={graphRef}
                    onEngineTick={configureSpacing}
                    onEngineStop={() => {
                      if (!fitted.current) {
                        fitted.current = true;
                        graphRef.current?.zoomToFit(300, 70);
                      }
                    }}
                    width={width}
                    height={height}
                    graphData={drawing}
                    nodeLabel={(n) =>
                      String(n.name || '').replace(
                        /[&<>"']/g,
                        (c) =>
                          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
                            c
                          ]!,
                      )
                    }
                    nodeColor={(n) => ((n as Node).kind === 'item' ? colors.item : colors.concept)}
                    nodeVal={(n) => ((n as Node).kind === 'item' ? 5 : 2)}
                    linkColor={() => colors.link}
                    nodeCanvasObjectMode={() => 'after'}
                    onRenderFramePre={() => {
                      placedLabels.current = [];
                    }}
                    nodeCanvasObject={(node, context, scale) => {
                      if (
                        !labels ||
                        ((node as Node).kind !== 'item' && node.id !== selected?.id && scale < 2)
                      )
                        return;
                      const name = String(node.name || '');
                      const max = scale < 1.5 ? 22 : 34;
                      const text = name.length > max ? name.slice(0, max - 2) + '…' : name;
                      context.font = `${Math.max(3, 11 / scale)}px Arial`;
                      const width = context.measureText(text).width,
                        height = Math.max(3, 11 / scale) * 1.2,
                        x = (node.x || 0) - width / 2,
                        y = (node.y || 0) + 6;
                      const box = { x, y, width, height };
                      const important = node.id === selected?.id;
                      /* Skip labels that would collide with one already drawn this frame; zooming in reveals them. */ if (
                        !important &&
                        placedLabels.current.some(
                          (b) =>
                            x < b.x + b.width &&
                            x + width > b.x &&
                            y < b.y + b.height &&
                            y + height > b.y,
                        )
                      )
                        return;
                      placedLabels.current.push(box);
                      context.textAlign = 'center';
                      context.textBaseline = 'top';
                      context.fillStyle = colors.text;
                      context.fillText(text, node.x || 0, y);
                    }}
                    onNodeClick={(n) => selectNode(graph.nodes.find((g) => g.id === n.id) || null)}
                    onLinkClick={(l) => {
                      const link = graph.links.find((e) => e.id === l.id);
                      if (link) selectNode(graph.nodes.find((n) => n.id === link.source) || null);
                    }}
                    cooldownTicks={100}
                    enableNodeDrag
                  />
                </div>
              )}
              {(list || search) && <div className={styles.listView}>{renderNodes()}</div>}
            </div>
            {focusId && !drawing.nodes.some((node) => node.id === focusId) && (
              <p className={styles.graphNotice} role="status">
                This item will appear once it has been organized and is in the active library.
              </p>
            )}
            <details className={styles.drawer}>
              <summary>
                <ChevronUp size={16} aria-hidden="true" />
                Where does it lead?
              </summary>
              <p className="kg-muted">
                {selected
                  ? `Connections for ${selected.name}`
                  : 'Select a saved item or entity to see its connections.'}
              </p>
              {renderNodes()}
            </details>
          </section>
          <aside id="graph-evidence" className={styles.inspector} hidden={!inspectorOpen}>
            <div className={styles.inspectorHeading}>
              <div>
                <span className={styles.kind}>
                  {selected
                    ? selected.kind === 'item'
                      ? 'Saved content'
                      : 'Extracted entity'
                    : 'Source-backed connections'}
                </span>
                <h2>{selected?.name || 'Connection details'}</h2>
                {selected && <p className="kg-muted">{plural(evidence.length, 'connection')}</p>}
              </div>
              {selected?.kind === 'item' && (
                <Link className="kg-button" href={`/read/${selected.id}`}>
                  Open saved reading ↗
                </Link>
              )}
              <button className="kg-button" onClick={() => setInspectorOpen(false)}>
                Close
              </button>
            </div>
            {!selected && (
              <p className="kg-muted">
                Choose a node or use the list. Every relationship links to its supporting passage.
              </p>
            )}
            <div className={styles.evidence}>
              {evidenceLoading && <p role="status">Loading supporting passages…</p>}
              {evidenceError && <p role="alert">{evidenceError}</p>}
              {evidence.map((e) => (
                <Link className="kg-reading" key={e.id} href={passageUrl(e.itemId, e.passageIndex)}>
                  <strong>
                    {
                      graph.nodes.find(
                        (n) => n.id === (selected?.id === e.source ? e.target : e.source),
                      )?.name
                    }
                  </strong>
                  <span className="kg-tag">{e.label}</span>
                  <p>“{e.evidence}”</p>
                  <span className="kg-muted">Open supporting passage ↗</span>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
