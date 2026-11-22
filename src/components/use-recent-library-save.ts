'use client';

import { pollLibrary } from '@/shared/library-poll';
import { useLibrarySession } from './library-session';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/shared/client';
import type { Item } from '@/shared/types';
import type { Capabilities } from '@/shared/capabilities';

export function useRecentLibrarySave(
  items: Item[],
  refresh: ReturnType<typeof useLibrarySession>['refresh'],
  capabilities: Capabilities,
) {
  const recentSaveCard = useRef<HTMLElement>(null);
  const [recentSave, setRecentSave] = useState<{ source: string; id?: string; item?: Item } | null>(
    null,
  );

  const recentId = recentSave?.id;
  const recentInLibrary = items.some((item) => item.id === recentId);
  useEffect(() => {
    if (recentId) recentSaveCard.current?.scrollIntoView({ block: 'nearest' });
  }, [recentId]);
  useEffect(() => {
    if (!recentId || recentInLibrary) return;
    const controller = new AbortController();
    void api<{ item: Item }>(`/api/items/${recentId}`, { signal: controller.signal })
      .then(({ item }) => {
        if (!controller.signal.aborted)
          setRecentSave((current) => (current?.id === recentId ? { ...current, item } : current));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [recentId, recentInLibrary]);
  const waitingForSave = Boolean(recentId && !recentInLibrary && !recentSave?.item);
  const recentStatus = (items.find((item) => item.id === recentId) ?? recentSave?.item)?.status;
  const importing =
    waitingForSave ||
    recentStatus === 'pending' ||
    recentStatus === 'processing' ||
    items.some((item) => item.status === 'pending' || item.status === 'processing');
  const organizing =
    (capabilities.ai || capabilities.embeddings) &&
    items.some(
      (item) =>
        item.status === 'ready' && ['queued', 'running'].includes(item.knowledge_state ?? ''),
    );
  useEffect(() => {
    if (!importing && !organizing) return;
    return pollLibrary({
      importing,
      organizing,
      refresh,
      afterRefresh: async (signal) => {
        if (recentId && !recentInLibrary) {
          const { item } = await api<{ item: Item }>(`/api/items/${recentId}`, { signal });
          if (!signal.aborted)
            setRecentSave((current) => (current?.id === recentId ? { ...current, item } : current));
        }
      },
    });
  }, [importing, organizing, refresh, recentId, recentInLibrary]);

  const savedItem = items.find((item) => item.id === recentId) ?? recentSave?.item;

  return { recentSave, setRecentSave, recentSaveCard, savedItem };
}
