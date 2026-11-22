'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Maximize, Plus } from 'lucide-react';
import { api } from '@/shared/client';
import type { Item, SourceDetails } from '@/shared/types';
import styles from './saved-image-viewer.module.css';

export function SavedImageViewer({
  id,
  title,
  info,
  text,
}: {
  id: string;
  title: string;
  info?: SourceDetails['image'];
  text: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [saved, setSaved] = useState<Item | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagEdit, setTagEdit] = useState(false);
  const [tag, setTag] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setSaved(null);
    setTags([]);
    setUnavailable(false);
    setZoom(1);
    async function refresh() {
      try {
        const [knowledge, { item }] = await Promise.all([
          api<{ tags: string[]; state: string }>(`/api/items/${id}/knowledge`, {
            signal: controller.signal,
          }),
          api<{ item: Item }>(`/api/items/${id}`, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setTags(knowledge.tags);
        setSaved(item);
        if (!['ready', 'failed'].includes(knowledge.state)) timer = setTimeout(refresh, 5000);
      } catch {
        // Retain the saved image even when metadata is temporarily unavailable.
        if (!controller.signal.aborted) timer = setTimeout(refresh, 15000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);
  const details = saved?.source_details?.image || info;
  useEffect(() => {
    function syncFullscreen() {
      setExpanded(document.fullscreenElement === panel.current);
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);
  async function toggleFullscreen() {
    if (document.fullscreenElement === panel.current) {
      await document.exitFullscreen();
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    try {
      if (panel.current?.requestFullscreen) {
        await panel.current.requestFullscreen();
        return;
      }
    } catch {
      /* Fall back to filling the viewport. */
    }
    setExpanded(true);
  }
  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || zoom <= 1 || !stage.current) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: stage.current.scrollLeft,
      top: stage.current.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pan(event: PointerEvent<HTMLDivElement>) {
    const from = drag.current;
    if (from)
      stage.current?.scrollTo(
        from.left + from.x - event.clientX,
        from.top + from.y - event.clientY,
      );
  }
  return (
    <div className={styles.layout}>
      <div
        ref={panel}
        className={styles.imagePanel}
        data-expanded={expanded}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && expanded && !document.fullscreenElement) {
            event.stopPropagation();
            setExpanded(false);
          }
        }}
      >
        <button
          className={styles.expand}
          type="button"
          aria-label={expanded ? 'Exit fullscreen image' : 'Fullscreen image'}
          onClick={() => void toggleFullscreen()}
        >
          <Maximize size={16} />
        </button>
        <div
          ref={stage}
          tabIndex={0}
          aria-label="Image viewport"
          className={styles.stage}
          data-zoomed={zoom > 1}
          onPointerDown={startPan}
          onPointerMove={pan}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {unavailable ? (
            <p role="alert">The original image could not be displayed.</p>
          ) : (
            <div
              className={styles.fit}
              style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
            >
              <img
                src={`/api/items/${id}/source?view=inline`}
                alt={details?.description || title}
                draggable={false}
                onError={() => setUnavailable(true)}
              />
            </div>
          )}
        </div>
      </div>
      <aside className={styles.details} aria-label="Image details">
        {details?.description ? (
          <p>{details.description}</p>
        ) : (
          <p>Saved image. A description will appear when automatic processing finishes.</p>
        )}
        {!!tags.length && (
          <div className={styles.tags} aria-label="Image tags">
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
        {tagEdit ? (
          <form
            className={styles.tagForm}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!tag.trim() || tagBusy) return;
              setTagBusy(true);
              setTagError('');
              try {
                await api(`/api/items/${id}/knowledge`, {
                  method: 'PATCH',
                  body: JSON.stringify({ addTag: tag.trim() }),
                });
                const data = await api<{ tags: string[] }>(`/api/items/${id}/knowledge`);
                setTags(data.tags);
                setTag('');
                setTagEdit(false);
                window.dispatchEvent(new Event('am:library-changed'));
              } catch (e) {
                setTagError((e as Error).message);
              } finally {
                setTagBusy(false);
              }
            }}
          >
            <input
              autoFocus
              aria-label="New tag"
              maxLength={60}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <button disabled={tagBusy || !tag.trim()}>Save tag</button>
            <button type="button" onClick={() => setTagEdit(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button className={styles.action} onClick={() => setTagEdit(true)}>
            <Plus size={15} />
            Add tag
          </button>
        )}
        {tagError && <p role="alert">{tagError}</p>}
        {saved?.source_file?.name && (
          <details>
            <summary>Original filename</summary>
            <p>{saved.source_file.name}</p>
          </details>
        )}
        {details?.brand && (
          <p>
            <strong>Brand</strong> {details.brand}
          </p>
        )}
        {Boolean(text || saved?.passages?.length) && (
          <details>
            <summary>Text in image</summary>
            <p>{text || saved?.passages?.map((block) => block.text).join('\n\n')}</p>
          </details>
        )}
      </aside>
    </div>
  );
}
