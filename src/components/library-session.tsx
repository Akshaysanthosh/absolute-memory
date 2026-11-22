'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { api } from '@/shared/client';
import { createLibraryRevisionCache } from '@/shared/library-revision-cache';
import { createSessionRefresh } from '@/shared/session-refresh';
import type { LibraryPage } from '@/shared/library-page';
import type { Item } from '@/shared/types';

type Preferences = {
  filter: 'all' | 'progress' | 'finished' | 'favorites' | 'archived';
  topic: string;
  search: string;
  type: string;
};
const defaults: Preferences = {
  filter: 'all',
  topic: '',
  search: '',
  type: 'All types',
};
function useSessionState(enabled: boolean) {
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  // After the first page arrives, later reloads (search, filters) keep the current cards on screen.
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [preferences, setPreferences] = useState(defaults);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageVersion = useRef(0),
    moreBusy = useRef(false),
    refreshBusy = useRef(false);
  const [query, setQuery] = useState('');
  // The header's Home button means "back to everything": drop search, topic and filters.
  useEffect(() => {
    const home = () =>
      setPreferences((old) => ({
        ...old,
        search: '',
        topic: '',
        filter: 'all',
        type: 'All types',
      }));
    window.addEventListener('am:library-home', home);
    return () => window.removeEventListener('am:library-home', home);
  }, []);
  const [topics, setTopics] = useState<string[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(preferences.search.trim()), 220);
    return () => clearTimeout(timer);
  }, [preferences.search]);
  const drafts = useRef(new Map<string, { text: string; passage: string }>());
  const lastLoaded = useRef(0),
    loadedCount = useRef(60);
  const scroll = useRef(0);
  const initialized = useRef(false);
  const queue = useRef<ReturnType<typeof createSessionRefresh<LibraryPage | null>> | null>(null);
  const invalidateRevision = useRef<() => void>(() => {});
  const refresh = useCallback(() => {
    invalidateRevision.current();
    return queue.current?.refresh() || Promise.resolve();
  }, []);
  useEffect(() => {
    if (!enabled) return;
    ++pageVersion.current;
    loadedCount.current = 60;
    setLoading(true);
    const reader = createLibraryRevisionCache(
      async () => (await api<{ revision: string }>('/api/library/revision')).revision,
      async () => {
        ++pageVersion.current;
        refreshBusy.current = true;
        const target = loadedCount.current;
        let page = await api<LibraryPage>(
          '/api/items?' +
            new URLSearchParams({
              filter: preferences.filter,
              topic: preferences.topic,
              type: preferences.type,
              q: query,
            }),
        );
        const total = page.total;
        const items = [...page.items];
        while (page.nextCursor && items.length < target) {
          page = await api<LibraryPage>(
            '/api/items?' +
              new URLSearchParams({
                filter: preferences.filter,
                topic: preferences.topic,
                type: preferences.type,
                q: query,
                cursor: page.nextCursor,
              }),
          );
          items.push(...page.items);
        }
        return { ...page, items, total };
      },
    );
    invalidateRevision.current = reader.invalidate;
    const current = createSessionRefresh({
      load: reader.read,
      commit: (data) => {
        lastLoaded.current = Date.now();
        if (!data) return;
        loadedCount.current = Math.max(60, data.items.length);
        setItems(data.items);
        setTotal(data.total ?? data.items.length);
        setTopics(data.topics || []);
        setNextCursor(data.nextCursor);
        setError('');
        lastLoaded.current = Date.now();
      },
      error: (e) => setError(e instanceof Error ? e.message : 'Could not load your library.'),
      settled: () => {
        refreshBusy.current = false;
        setLoading(false);
        setLoadedOnce(true);
      },
    });
    queue.current = current;
    void current.refresh();
    return () => {
      ++pageVersion.current;
      current.dispose();
      refreshBusy.current = false;
      if (queue.current === current) queue.current = null;
    };
  }, [enabled, query, preferences.filter, preferences.topic, preferences.type]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      queue.current?.invalidate();
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 250);
    };
    const focus = () => {
      if (document.visibilityState !== 'hidden' && Date.now() - lastLoaded.current > 60000)
        void queue.current?.refresh();
    };
    const warn = (event: BeforeUnloadEvent) => {
      if ([...drafts.current.values()].some((d) => d.text.trim())) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const readerProgress = (event: Event) => {
      const { id, pct, at } = (event as CustomEvent<{ id: string; pct: number; at: number }>)
        .detail;
      // Reading updates the existing cards without fetching every loaded page per scroll.
      setItems((old) =>
        old.map((item) =>
          item.id === id
            ? {
                ...item,
                progress: Math.max(item.progress || 0, pct),
                last_read_at: new Date(at).toISOString(),
              }
            : item,
        ),
      );
      invalidateRevision.current();
    };
    window.addEventListener('am:reader-progress', readerProgress);
    window.addEventListener('am:library-changed', update);
    window.addEventListener('focus', focus);
    window.addEventListener('beforeunload', warn);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('am:reader-progress', readerProgress);
      window.removeEventListener('am:library-changed', update);
      window.removeEventListener('focus', focus);
      window.removeEventListener('beforeunload', warn);
    };
  }, [refresh]);
  const loadMore = useCallback(async () => {
    if (!nextCursor || moreBusy.current || refreshBusy.current || loading) return;
    const version = pageVersion.current;
    moreBusy.current = true;
    setLoadingMore(true);
    try {
      const page = await api<LibraryPage>(
        '/api/items?' +
          new URLSearchParams({
            filter: preferences.filter,
            topic: preferences.topic,
            type: preferences.type,
            q: query,
            cursor: nextCursor,
          }),
      );
      if (version !== pageVersion.current) return;
      setItems((old) => {
        const seen = new Set(old.map((i) => i.id));
        const combined = [...old, ...page.items.filter((i) => !seen.has(i.id))];
        loadedCount.current = combined.length;
        return combined;
      });
      setNextCursor(page.nextCursor);
      setError('');
    } catch (e) {
      if (version === pageVersion.current)
        setError(e instanceof Error ? e.message : 'Could not load more items.');
    } finally {
      moreBusy.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, query, loading, preferences.filter, preferences.topic, preferences.type]);
  return {
    items,
    total,
    topics,
    loading,
    initialLoading: loading && !loadedOnce,
    updating: loading && loadedOnce,
    error,
    refresh,
    loadMore,
    hasMore: !!nextCursor,
    loadingMore,
    searching: query !== preferences.search.trim(),
    preferences,
    setPreferences,
    scroll,
    initialized,
    drafts,
  };
}
const Context = createContext<ReturnType<typeof useSessionState> | null>(null);
/** Scoped to the server-verified account; remounted on identity changes. No persistent content cache. */
export function LibrarySessionProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const state = useSessionState(enabled);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useLibrarySession() {
  const value = useContext(Context);
  if (!value) throw Error('Library session missing');
  return value;
}
export function useLibraryPreference<K extends keyof Preferences>(
  key: K,
): [Preferences[K], Dispatch<SetStateAction<Preferences[K]>>] {
  const { preferences, setPreferences } = useLibrarySession();
  const set = useCallback<Dispatch<SetStateAction<Preferences[K]>>>(
    (value) =>
      setPreferences((old) => ({
        ...old,
        [key]:
          typeof value === 'function'
            ? (value as (previous: Preferences[K]) => Preferences[K])(old[key])
            : value,
      })),
    [key, setPreferences],
  );
  return [preferences[key], set];
}
