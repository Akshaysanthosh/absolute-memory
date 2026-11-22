'use client';

import { Button } from '@astryxdesign/core/Button';
import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { LibraryWorkspaceModel } from './use-library-workspace';

export function LibraryTopics({
  model,
  drawer,
  close,
}: {
  model: LibraryWorkspaceModel;
  drawer?: boolean;
  close: () => void;
}) {
  const [query, setQuery] = useState('');
  const id = drawer ? 'drawer-topics-title' : 'library-topics-title';
  const topics = model.allTopics.filter(([name]) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  function select(name: string) {
    model.setTopic(name);
    model.setFilter('all');
    window.scrollTo(0, 0);
    if (drawer) close();
  }
  return (
    <section className="library-topics" aria-labelledby={id}>
      <div className="library-topics-heading">
        <h2 id={id}>Topics</h2>
        <Button
          label="Close topics"
          isIconOnly
          icon={<X size={17} />}
          size="sm"
          variant="ghost"
          onClick={close}
        />
      </div>
      <input
        type="search"
        aria-label="Search topics"
        placeholder="Search topics…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button
        type="button"
        className="library-topic"
        aria-pressed={!model.topic && model.filter === 'all'}
        onClick={() => select('')}
      >
        <span>All saved</span>
        <small>{model.counts['status:all'] ?? ''}</small>
      </button>
      <div className="library-topics-label">Topics</div>
      {topics.map(([name, count]) => (
        <button
          key={name}
          type="button"
          className="library-topic"
          aria-pressed={model.topic === name}
          onClick={() => select(name)}
        >
          <span>{name}</span>
          <small>{count}</small>
        </button>
      ))}
      {query && !topics.length && <p className="library-topics-label">No matching topics.</p>}
    </section>
  );
}

export function useTopicsDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  return { dialog, open: () => dialog.current?.showModal(), close: () => dialog.current?.close() };
}
