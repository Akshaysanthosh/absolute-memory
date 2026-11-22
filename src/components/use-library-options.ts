'use client';

import { useLibraryPreference, useLibrarySession } from './library-session';
import { useEffect, useState } from 'react';
import { api } from '@/shared/client';
import { statusOptions } from './library-display';

export function useLibraryOptions() {
  const { items, topics } = useLibrarySession();
  const [filter, setFilter] = useLibraryPreference('filter');
  const [topic, setTopic] = useLibraryPreference('topic');
  const [search, setSearch] = useLibraryPreference('search');
  const [type, setType] = useLibraryPreference('type');
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const controller = new AbortController();
    void api<{ counts: Record<string, number> }>('/api/library/counts', {
      signal: controller.signal,
    })
      .then((data) => setCounts(data.counts))
      .catch(() => {});
    return () => controller.abort();
  }, [items]);

  const allTopics = topics.map((name) => [name, counts[`topic:${name}`] ?? 0] as const);
  function clear() {
    window.history.replaceState(window.history.state, '', '/library');
    setFilter('all');
    setTopic('');
    setSearch('');
    setType('All types');
  }
  return {
    filter,
    setFilter,
    topic,
    setTopic,
    search,
    setSearch,
    type,
    setType,
    allTopics,
    counts,
    clear,
    title: topic || statusOptions.find(({ value }) => filter === value)?.label || 'All saved',
  };
}
