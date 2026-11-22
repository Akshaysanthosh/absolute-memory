'use client';

import { useState, useEffect, useRef } from 'react';
import { api, libraryOptions } from '@/shared/client';
import type { LibraryOption } from '@/shared/library-options';
import type { KnowledgeSource } from '@/shared/knowledge/shared';
import { useWorkspace } from './workspace-context';
import { type ChatComposerInputHandle } from '@astryxdesign/core/Chat';

type Turn = {
  id: string;
  question: string;
  answer: string;
  state: string;
  sources: KnowledgeSource[];
};
export function useLibraryChat() {
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState('');
  async function saveNote(turn: Turn) {
    if (!threadId || savingNote) return;
    setSavingNote(turn.id);
    try {
      const result = await api<{ id: string }>(`/api/library-chat/${threadId}/note`, {
        method: 'POST',
        body: JSON.stringify({ turnId: turn.id }),
      });
      setSavedNotes((n) => ({ ...n, [turn.id]: result.id }));
      setMessage('Saved to your library with source references.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSavingNote('');
    }
  }
  const richComposer = useRef<ChatComposerInputHandle>(null);
  const { chatDraft: question, setChatDraft: setQuestion } = useWorkspace();
  const [historySearch, setHistorySearch] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [opening, setOpening] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [threads, setThreads] = useState<{ id: string; title: string }[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<LibraryOption[]>([]);
  const [itemId, setItemId] = useState('');
  const [tag, setTag] = useState('');
  const abort = useRef<AbortController | null>(null),
    log = useRef<HTMLDivElement>(null);
  async function refresh() {
    setThreads(
      (await api<{ threads: { id: string; title: string }[] }>('/api/library-chat')).threads,
    );
  }
  // ?item=<id> scopes the chat to one save; &ask=1 sends the question straight away (one-tap actions from item details).
  const pendingAsk = useRef('');
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('topic')) setTag(p.get('topic')!);
    const item = p.get('item');
    if (item && /^[a-f0-9-]{36}$/i.test(item)) setItemId(item);
    const asked = p.get('question');
    if (asked && p.get('ask') === '1') {
      pendingAsk.current = asked;
      p.delete('ask');
      p.delete('question');
      window.history.replaceState(
        window.history.state,
        '',
        location.pathname + (p.size ? '?' + p : ''),
      );
    } else if (asked) setQuestion(asked);
  }, [setQuestion]);
  useEffect(() => {
    void Promise.all([
      api<{ threads: { id: string; title: string }[] }>('/api/library-chat'),
      libraryOptions(),
    ])
      .then(([a, b]) => {
        setThreads(a.threads);
        setItems(b.items.filter((i) => i.status === 'ready' && !i.archived));
      })
      .catch((e) => setMessage(e.message))
      .finally(() => setLoadingHistory(false));
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns]);
  useEffect(() => {
    if (loadingHistory || !pendingAsk.current) return;
    const q = pendingAsk.current;
    pendingAsk.current = '';
    void send(undefined, q); // eslint-disable-line react-hooks/exhaustive-deps
  }, [loadingHistory, itemId]);
  async function open(id: string) {
    setOpening(true);
    setBusy(true);
    setMessage('');
    try {
      const d = await api<{ turns: Turn[] }>(`/api/library-chat/${id}`);
      setThreadId(id);
      setTurns(d.turns);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      setOpening(false);
    }
  }
  async function send(e?: React.FormEvent, asked?: string) {
    e?.preventDefault();
    const text = asked ?? question;
    if (!text.trim() || busy) return;
    if (text.trim().length > 1500) {
      setMessage('Please keep your question under 1,500 characters.');
      return;
    }
    const q = text.trim();
    setQuestion('');
    setBusy(true);
    setMessage('Finding supporting passages…');
    const requestId = crypto.randomUUID();
    let current: Turn = { id: requestId, question: q, answer: '', state: 'running', sources: [] };
    setTurns((t) => [...t, current]);
    abort.current = new AbortController();
    const update = () =>
      setTurns((t) =>
        t.map((x) => (x.id === requestId || x.id === current.id ? { ...current } : x)),
      );
    try {
      const response = await fetch('/api/library-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          requestId,
          question: q,
          itemIds: itemId ? [itemId] : [],
          tags: tag ? [tag] : [],
        }),
        signal: abort.current.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'The question could not be sent.');
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = '';
      const event = (data: {
        type: string;
        threadId?: string;
        turnId?: string;
        text?: string;
        sources?: KnowledgeSource[];
        source?: KnowledgeSource;
        turn?: Turn;
        pending?: number;
        degraded?: boolean;
        error?: string;
      }) => {
        if (data.type === 'start') {
          setThreadId(data.threadId);
          setThreads((ts) =>
            ts.some((t) => t.id === data.threadId)
              ? ts
              : [{ id: data.threadId!, title: q.slice(0, 100) }, ...ts],
          );
          current = { ...current, id: data.turnId! };
        }
        if (data.type === 'context') {
          current = { ...current, sources: data.sources || [] };
          setMessage(
            [
              data.pending ? `${data.pending} saved items are still being organized.` : '',
              data.degraded
                ? 'Semantic search is unavailable; using keyword and topic matches.'
                : '',
            ]
              .filter(Boolean)
              .join(' '),
          );
        }
        if (data.type === 'delta') current = { ...current, answer: current.answer + data.text };
        if (data.type === 'source' && data.source)
          current = { ...current, sources: [...current.sources, data.source] };
        if (data.type === 'done' && data.turn) {
          current = data.turn;
          if (data.error) setMessage(data.error);
        }
        if (data.type === 'error') setMessage(data.error || 'The answer could not be saved.');
        update();
      };
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.trim()) event(JSON.parse(line));
        }
      }
      if (buffer.trim()) event(JSON.parse(buffer));
      await refresh();
    } catch (error) {
      current = { ...current, state: 'stopped' };
      update();
      setMessage(
        (error as Error).name === 'AbortError'
          ? 'Answer stopped. Reopen the conversation to see the saved partial response.'
          : (error as Error).message,
      );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  const filteredThreads = threads.filter((t) =>
    t.title.toLowerCase().includes(historySearch.toLowerCase()),
  );
  const contextLabel = itemId
    ? items.find((i) => i.id === itemId)?.title || 'Selected item'
    : tag
      ? `Topic: ${tag}`
      : 'Whole library';
  const suggestions = [
    'What ideas connect across my saved reading?',
    'Where do my saved sources disagree?',
    'What should I revisit next?',
  ];

  return {
    abort,
    busy,
    contextLabel,
    filteredThreads,
    historySearch,
    itemId,
    items,
    loadingHistory,
    message,
    open,
    opening,
    question,
    richComposer,
    saveNote,
    savedNotes,
    savingNote,
    send,
    setHistorySearch,
    setItemId,
    setMessage,
    setQuestion,
    setTag,
    setThreadId,
    setTurns,
    suggestions,
    tag,
    threadId,
    threads,
    turns,
  };
}
