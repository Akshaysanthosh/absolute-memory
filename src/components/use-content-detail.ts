'use client';

import { contentPlatform } from '@/shared/media/social';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/shared/client';
import type { Item } from '@/shared/types';
import { usable } from './content-detail-text';

export function useContentDetail({
  item,
  onClose,
  aiEnabled,
}: {
  aiEnabled: boolean;
  item: Item;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tags, setTags] = useState(item.tags || []);
  const [summary, setSummary] = useState(
    usable(item.source_details?.image?.description || item.excerpt),
  );
  const [loaded, setLoaded] = useState(false);
  const [tag, setTag] = useState('');
  const [tagOpen, setTagOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [favorite, setFavorite] = useState(item.favorite);
  const [broken, setBroken] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const base = `/api/items/${item.id}`;
  const post = item.source_details?.social?.post;
  const [photo, setPhoto] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const image =
    post?.images[photo]?.url ||
    (item.kind === 'image' ? `${base}/source?view=inline` : item.thumbnail?.url);
  const platform = contentPlatform(item.url);
  const video =
    post?.video ||
    item.media_kind === 'youtube' ||
    item.media_kind === 'social' ||
    item.thumbnail?.source === 'youtube';
  const type =
    platform ||
    (item.source_details?.quote
      ? 'Quote'
      : item.kind === 'image'
        ? 'Image'
        : item.bookmark_type
          ? 'Bookmark'
          : video
            ? 'Video'
            : item.media_kind === 'podcast'
              ? 'Podcast'
              : item.media_kind === 'audio'
                ? 'Audio'
                : item.kind === 'pdf'
                  ? 'PDF'
                  : item.kind === 'spreadsheet'
                    ? 'Spreadsheet'
                    : item.kind === 'note'
                      ? 'Note'
                      : 'Article');
  const source = item.url || item.media_url;
  const visualFirst = item.kind === 'image' || video || !!post;
  // Photo and text posts never have a transcript; only say so when nothing readable was saved.
  const social = item.source_details?.social;
  const nothingSaved = Boolean(
    (social?.transcriptUnavailable || social?.transcriptError) &&
    !post?.text?.trim() &&
    !item.source_details?.source?.text?.trim() &&
    !(item.words > 0),
  );
  const readHref =
    item.kind === 'image' || item.bookmark_type
      ? null
      : `${item.media_kind ? '/media' : '/read'}/${item.id}`;
  const readLabel =
    item.kind === 'pdf' || item.kind === 'spreadsheet'
      ? 'Open document'
      : video || item.media_kind
        ? 'Open transcript'
        : 'Open reader';
  useEffect(() => {
    const controller = new AbortController();
    void api<{ summary: string; tags: string[] }>(`${base}/knowledge`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setTags(data.tags);
        setSummary(
          usable(item.source_details?.image?.description) ||
            usable(data.summary) ||
            usable(item.excerpt),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Some details could not load.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [base, item, attempt]);
  // Open once per item; retrying a failed load must not reopen the dialog or move focus.
  // Wide screens get a side panel beside the library (like Raindrop), so you keep your place and can open the next card.
  const [drawer] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches,
  );
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    if (drawer) {
      node?.show();
      node?.focus();
      return () => {
        previous?.focus({ preventScroll: true });
      };
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, [drawer]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function save(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await task();
      window.dispatchEvent(new Event('am:library-changed'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return {
    aiEnabled,
    base,
    broken,
    busy,
    dialog,
    drawer,
    error,
    expanded,
    favorite,
    image,
    item,
    loaded,
    nothingSaved,
    notice,
    onClose,
    photo,
    platform,
    post,
    readHref,
    readLabel,
    save,
    setAttempt,
    setBroken,
    setError,
    setExpanded,
    setFavorite,
    setLoaded,
    setNotice,
    setPhoto,
    setTag,
    setTagOpen,
    setTags,
    source,
    summary,
    tag,
    tagOpen,
    tags,
    type,
    video,
    visualFirst,
  };
}
export type ContentDetailModel = ReturnType<typeof useContentDetail>;
