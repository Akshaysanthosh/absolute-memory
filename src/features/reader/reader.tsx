'use client';

import { Theme } from '@astryxdesign/core/theme';
import { useEffect, useRef, useState } from 'react';
import { MediaPlayer } from '@/components/media-player';
import { memoryTheme } from '@/shared/am-theme';
import type { HighlightSegment } from '@/shared/passages';
import {
  defaults,
  readPreferences,
  savePreferences,
  sizes,
  type ReaderPreferences,
} from './preferences';
import { ReaderHeader, type ReaderDocument } from './reader-header';
import { ReaderActions } from './reader-actions';
import { ReaderHelp } from './reader-help';
import { ReaderUnavailable } from './reader-unavailable';
import '@fontsource-variable/source-serif-4/standard.css';
import '@fontsource-variable/source-serif-4/standard-italic.css';
import { renderMarks, selectedSegments, type ReaderHighlight } from './selection';
import './reader.css';
import './reader-controls.css';

type Media = { videoId?: string; audioUrl?: string; localFile?: boolean; warning: string | null };

export function ReadingPage({
  item,
  initialHighlights,
  media,
  cueTimes,
}: {
  item: ReaderDocument;
  initialHighlights: ReaderHighlight[];
  media?: Media;
  cueTimes?: (number | null)[];
}) {
  const [settings, setSettings] = useState(defaults);
  const [highlights, setHighlights] = useState(initialHighlights);
  const [selection, setSelection] = useState<HighlightSegment[]>([]);
  const [chosen, setChosen] = useState<string>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [pastTitle, setPastTitle] = useState(false);
  const [progress, setProgress] = useState(item.progress);
  const title = useRef<HTMLHeadingElement>(null);
  const bar = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const seek = useRef<(milliseconds: number) => void>(null);
  const playable = Boolean(media?.videoId || media?.audioUrl || media?.localFile);
  useEffect(() => setSettings(readPreferences()), []);
  useEffect(() => {
    const root = text.current;
    if (!root) return;
    root.innerHTML = item.reading_html;
    renderMarks(root, highlights);
    if (playable && cueTimes) {
      for (const [index, startMs] of cueTimes.entries()) {
        if (startMs === null) continue;
        const passage = root.querySelector(`#p-${index}`);
        if (!passage) continue;
        const button = document.createElement('button');
        button.className = 'reading-seek';
        button.type = 'button';
        button.dataset.seek = String(startMs);
        const seconds = Math.floor(startMs / 1000);
        const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        button.dataset.time = time;
        button.setAttribute('aria-label', `Play at ${time}`);
        passage.prepend(button);
      }
    }
  }, [item.reading_html, cueTimes, highlights, playable]);

  useEffect(() => {
    function destination() {
      const fragment = /^#p-(\d+)$/.exec(location.hash);
      const index = fragment ? Number(fragment[1]) : item.reader_position;
      const passage = document.getElementById(`p-${index}`);
      if (!passage || !text.current?.contains(passage)) return;
      passage.scrollIntoView({ block: 'start' });
      if (fragment) {
        passage.classList.add('reading-target');
        window.setTimeout(() => passage.classList.remove('reading-target'), 1800);
      }
    }
    const frame = window.requestAnimationFrame(destination);
    window.addEventListener('hashchange', destination);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', destination);
    };
  }, [item.id, item.reader_position]);

  useEffect(() => {
    let timer: number | undefined;
    function updateViewport() {
      const titleBottom = title.current?.getBoundingClientRect().bottom ?? Infinity;
      setPastTitle(titleBottom < (bar.current?.offsetHeight ?? 0));
      const maxScroll = document.documentElement.scrollHeight - innerHeight;
      const fraction = maxScroll > 0 ? Math.max(0, Math.min(1, scrollY / maxScroll)) : 0;
      setProgress(fraction);
      return fraction;
    }
    function save() {
      const nodes = text.current?.querySelectorAll<HTMLElement>('[id^="p-"][data-passage]');
      const passages = Array.from(nodes ?? []);
      const current = passages.findLast(
        (passage) => passage.getBoundingClientRect().top < innerHeight / 3,
      );
      if (!current) return;
      const position = {
        passageIndex: Number(current.dataset.passage),
        progress: updateViewport(),
      };
      void fetch(`/api/items/${item.id}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(position),
        keepalive: true,
      }).catch(() => {});
    }
    function schedule() {
      updateViewport();
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 350);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', updateViewport);
    const observer = new ResizeObserver(updateViewport);
    if (text.current) observer.observe(text.current);
    if (title.current) observer.observe(title.current);
    updateViewport();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', updateViewport);
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [item.id, item.reading_html]);

  useEffect(() => {
    function refreshSelection() {
      const active = text.current ? selectedSegments(text.current, window.getSelection()) : [];
      setSelection(active);
      if (active.length) setChosen(undefined);
    }
    document.addEventListener('selectionchange', refreshSelection);
    return () => document.removeEventListener('selectionchange', refreshSelection);
  }, []);

  function changeSettings(update: Partial<ReaderPreferences>) {
    const next = { ...settings, ...update };
    setSettings(next);
    savePreferences(next);
  }

  async function highlightAction() {
    if (pending || (!chosen && !selection.length)) return;
    setError('');
    setPending(true);
    try {
      const response = await fetch(`/api/items/${item.id}/highlights`, {
        method: chosen ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chosen ? { id: chosen } : { segments: selection }),
      });
      if (!response.ok) throw new Error('Could not update the highlight.');
      if (chosen) setHighlights((items) => items.filter((mark) => mark.id !== chosen));
      else {
        const mark: ReaderHighlight = await response.json();
        setHighlights((items) => [mark, ...items]);
      }
      setChosen(undefined);
      setSelection([]);
      window.getSelection()?.removeAllRanges();
    } catch {
      setError('Could not update the highlight. Try again.');
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target;
      if (event.ctrlKey || event.metaKey || event.altKey || (event.shiftKey && event.key !== '?'))
        return;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]'))
        return;
      if (event.defaultPrevented || appearanceOpen || dialog.current?.open) return;
      if (target instanceof Element && target.closest('[role="radiogroup"]')) return;
      if (event.key === '?' || event.key === 'Escape') {
        event.preventDefault();
        if (event.key === '?') dialog.current?.showModal();
        else location.assign('/library');
      } else if ((event.key === 'h' && selection.length) || (event.key === 'Backspace' && chosen)) {
        event.preventDefault();
        void highlightAction();
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const change = event.key === '[' ? -1 : 1;
        changeSettings({
          size: sizes[
            Math.max(0, Math.min(sizes.length - 1, sizes.indexOf(settings.size) + change))
          ],
        });
      } else if (['j', 'k', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        window.scrollBy(0, event.key === 'j' || event.key === 'ArrowDown' ? 75 : -75);
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });

  function chooseMark(target: EventTarget | null) {
    if (!(target instanceof Element)) return;
    const mark = target.closest<HTMLElement>('mark[data-highlight]');
    if (!mark || !text.current?.contains(mark)) return;
    setSelection([]);
    setChosen(mark.dataset.highlight);
  }
  function clickPassage(target: EventTarget | null) {
    if (!(target instanceof Element)) return;
    if (target.closest('mark[data-highlight]')) {
      chooseMark(target);
      return;
    }
    const button = target.closest<HTMLElement>('button[data-seek]');
    if (button) {
      seek.current?.(Number(button.dataset.seek));
      return;
    }
    if (target.closest('a')) return;
    const passage = target.closest<HTMLElement>('[id^="p-"][data-passage]');
    const start = passage && cueTimes?.[Number(passage.dataset.passage)];
    if (typeof start === 'number') seek.current?.(start);
  }
  return (
    <Theme theme={memoryTheme} mode={settings.theme}>
      <main
        className="reading-page"
        data-color={settings.theme}
        data-size={settings.size}
        data-measure={settings.measure}
      >
        <ReaderHeader
          item={item}
          titleRef={title}
          barRef={bar}
          progress={progress}
          pastTitle={pastTitle}
          settings={settings}
          onChange={changeSettings}
          onAppearanceOpen={setAppearanceOpen}
          onHelp={() => dialog.current?.showModal()}
        />
        <div className="reading-column">
          {playable && (
            <MediaPlayer
              title={item.title}
              videoId={media?.videoId}
              audioUrl={media?.audioUrl}
              localFile={media?.localFile}
              playerRef={seek}
            />
          )}
          {media?.warning && <p className="reading-meta">{media.warning}</p>}
          {item.reading_html ? (
            <article
              ref={text}
              className="reading-text"
              onClick={(event) => {
                if (window.getSelection()?.isCollapsed !== false) clickPassage(event.target);
              }}
              onFocus={(event) => chooseMark(event.target)}
              dangerouslySetInnerHTML={{ __html: item.reading_html }}
            />
          ) : (
            <ReaderUnavailable item={item} />
          )}
        </div>
        <ReaderActions
          active={Boolean(chosen || selection.length || error)}
          chosen={chosen}
          disabled={pending || (!chosen && !selection.length)}
          error={error}
          onAction={() => void highlightAction()}
        />
        <ReaderHelp dialogRef={dialog} />
      </main>
    </Theme>
  );
}
