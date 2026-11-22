'use client';

import { useLibrarySession } from './library-session';
import { useSearchParams } from 'next/navigation';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type LibraryCardAction } from './library-card';

import { api } from '@/shared/client';
import type { Item } from '@/shared/types';
import type { Capabilities } from '@/shared/capabilities';
import { contentTypes, statusOptions, clean } from './library-display';
import { useLibraryOptions } from './use-library-options';
import { useRecentLibrarySave } from './use-recent-library-save';
export function useLibraryWorkspace(capabilities: Capabilities) {
  const [captureKind, setCaptureKind] = useState<'article' | 'note'>('article');
  const session = useLibrarySession();
  const { items, error, refresh } = session;
  // Only the very first load replaces the collection; later reloads keep cards visible.
  const loading = session.initialLoading;
  const routeParams = useSearchParams();
  const [imageItem, setImageItem] = useState<Item | null>(null);
  const openedItem = useRef<string | null>(null);
  // Keep the open item in the address bar so the detail view can be shared or reopened.
  const shownItem = useRef(false);
  useEffect(() => {
    // Leave an incoming ?item= link alone until that item has actually opened.
    if (imageItem) shownItem.current = true;
    if (!shownItem.current) return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get('item');
    if (imageItem?.id === current || (!imageItem && !current)) return;
    if (imageItem) url.searchParams.set('item', imageItem.id);
    else url.searchParams.delete('item');
    openedItem.current = imageItem?.id ?? null;
    window.history.replaceState(
      window.history.state,
      '',
      url.pathname + (url.search ? url.search : '') + url.hash,
    );
  }, [imageItem]);
  const options = useLibraryOptions();
  const { setFilter, setTopic, setSearch, setType } = options;

  const [capture, setCapture] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const { recentSave, setRecentSave, recentSaveCard, savedItem } = useRecentLibrarySave(
    items,
    refresh,
    capabilities,
  );
  const [menuId, setMenuId] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const saved = params.get('saved');
    // ?add=link opens the save dialog (the getting-started checklist links here).
    if (params.get('add') === 'link') {
      setCaptureKind('article');
      setCapture(true);
    }
    if (saved && /^[a-f0-9-]{36}$/i.test(saved)) {
      void api<{ item: Item }>(`/api/items/${saved}`)
        .then(({ item }) => {
          setRecentSave((current) => current || { id: item.id, source: item.title, item });
        })
        .catch(() => {});
    }
    // ?item=<id> opens that item's details, so a detail view can be linked and reopened.
    const linked = params.get('item');
    if (linked && /^[a-f0-9-]{36}$/i.test(linked) && linked !== openedItem.current) {
      openedItem.current = linked;
      void api<{ item: Item }>(`/api/items/${linked}`)
        .then(({ item }) => setImageItem(item))
        .catch(() => {});
    }
    const rest = new URLSearchParams(params);
    rest.delete('item');
    if (session.initialized.current && !rest.toString()) return;
    session.initialized.current = true;
    setSearch(params.get('q') || '');
    setTopic(params.get('tag') || params.get('topic') || '');
    setType(contentTypes.find(({ value }) => value === params.get('type'))?.value || 'All types');
    setFilter(statusOptions.find(({ label }) => label === params.get('filter'))?.value || 'all');
  }, [routeParams]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        document.querySelector('dialog[open],[aria-modal="true"]')
      )
        return;
      if (event.key === '/') {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCaptureKind('article');
        setCapture(true);
      }
    }
    function onPointer(event: PointerEvent) {
      if (event.target instanceof Element && !event.target.closest('[data-item-actions]'))
        setMenuId(null);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  async function mutate(item: Item, action: LibraryCardAction) {
    if (busy) return;
    if (
      action === 'delete' &&
      !window.confirm(`Permanently delete “${clean(item.title)}” from your library?`)
    )
      return;
    setBusy(true);
    try {
      if (action === 'bookmark' || action === 'product')
        await api(`/api/items/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ bookmarkType: action === 'product' ? 'product' : 'website' }),
        });
      else if (action === 'organize')
        await api(`/api/items/${item.id}/knowledge`, { method: 'POST' });
      else if (action === 'delete') await api(`/api/items/${item.id}`, { method: 'DELETE' });
      else
        await api(`/api/items/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify(action === 'retry' ? { retry: true } : { [action]: !item[action] }),
        });
      if (action === 'delete')
        setRecentSave((current) => (current?.id === item.id ? null : current));
      await refresh();
      setMenuId(null);
      setNotice(action === 'delete' ? 'Item deleted.' : 'Library updated.');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const openCapture = (kind: 'article' | 'note') => {
    setCaptureKind(kind);
    setCapture(true);
  };
  useLayoutEffect(() => {
    if (loading) return;
    window.scrollTo(0, session.scroll.current);
    return () => {
      session.scroll.current = window.scrollY;
    };
  }, [loading, session.scroll]);

  return {
    ...options,
    session,
    items,
    error,
    loading,
    busy,
    capture,
    captureKind,
    imageItem,
    notice,
    menuId,
    mutate,
    openCapture,
    refresh,
    savedItem,
    recentSave,
    recentSaveCard,
    searchInput,
    setCapture,
    setImageItem,
    setNotice,
    setRecentSave,
    setMenuId,
  };
}
export type LibraryWorkspaceModel = ReturnType<typeof useLibraryWorkspace>;
