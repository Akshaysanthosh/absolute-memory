'use client';

import { Fragment } from 'react';
import { ArrowUpRight, Plus, Sparkles, Layers, MessageCircle } from 'lucide-react';
import { CitedAnswer, SourceList } from './knowledge-sources';
import './knowledge.css';
import {
  ChatLayout,
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatComposer,
  ChatComposerInput,
} from '@astryxdesign/core/Chat';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { SideNavItem } from '@astryxdesign/core/SideNav';
import { useLibraryChat } from './use-library-chat';
type Render = (chat: React.ReactNode, history: React.ReactNode) => React.ReactNode;

export function LibraryChat({ render }: { render: Render }) {
  const {
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
  } = useLibraryChat();

  const history = (
    <div className="ac-history">
      <Button
        label="New chat"
        icon={<Plus size={16} />}
        width="100%"
        variant="primary"
        isDisabled={busy}
        onClick={() => {
          setThreadId(undefined);
          setTurns([]);
          setMessage('');
          richComposer.current?.focus();
        }}
      />
      <TextInput
        label="Search chats"
        isLabelHidden
        placeholder="Find a chat…"
        value={historySearch}
        onChange={setHistorySearch}
        width="100%"
      />
      <span className="ac-section-label">CONVERSATIONS</span>
      {loadingHistory ? (
        <p role="status">Loading conversations…</p>
      ) : (
        filteredThreads.map((t) => (
          <SideNavItem
            key={t.id}
            label={t.title}
            icon={<MessageCircle size={15} />}
            isSelected={threadId === t.id}
            isDisabled={busy}
            onClick={() => void open(t.id)}
          />
        ))
      )}
      {!loadingHistory && !filteredThreads.length && (
        <p>
          {threads.length ? 'No matching conversations.' : 'Your conversations will stay here.'}
        </p>
      )}
    </div>
  );
  const chat = (
    <div className="ac-chat">
      <ChatLayout
        className="ac-layout"
        density="spacious"
        emptyState={
          <div className="ac-welcome">
            <span className="ac-emblem">
              <Sparkles size={25} />
            </span>
            <h2>Follow a thought.</h2>
            <p>Ask questions across the things you’ve saved.</p>
            <div className="ac-suggestions">
              {suggestions.map((q) => (
                <Button
                  key={q}
                  label={q}
                  icon={<ArrowUpRight size={15} />}
                  variant="secondary"
                  isDisabled={busy}
                  onClick={() => void send(undefined, q)}
                />
              ))}
            </div>
          </div>
        }
        composer={
          <div className="ac-composer-wrap">
            {(message || opening) && (
              <p className="ac-status" role="status">
                {opening ? 'Opening conversation…' : message}
              </p>
            )}
            <ChatComposer
              value={question}
              onChange={setQuestion}
              onSubmit={() => void send()}
              onStop={() => abort.current?.abort()}
              isStopShown={busy && !opening}
              isDisabled={opening}
              elevation="none"
              input={
                <ChatComposerInput
                  handleRef={richComposer}
                  value={question}
                  onChange={setQuestion}
                  placeholder="Ask about your saved reading…"
                  label="Your question"
                />
              }
              footerActions={
                <div className="ac-tools">
                  <details className="ac-context">
                    <summary>
                      <Layers size={15} />
                      <span>{contextLabel}</span>
                    </summary>
                    <div className="ac-context-options">
                      <label>
                        Saved reading
                        <select
                          disabled={busy}
                          value={itemId}
                          onChange={(e) => setItemId(e.target.value)}
                        >
                          <option value="">All active items</option>
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Topic
                        <select
                          disabled={busy}
                          value={tag}
                          onChange={(e) => setTag(e.target.value)}
                        >
                          <option value="">All topics</option>
                          {[...new Set(items.flatMap((i) => i.tags || []))].sort().map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      <Button
                        label="Clear context filters"
                        size="sm"
                        variant="ghost"
                        isDisabled={busy}
                        onClick={() => {
                          setItemId('');
                          setTag('');
                        }}
                      />
                    </div>
                  </details>
                </div>
              }
            />
            <p className="ac-disclaimer">Answers link to supporting passages</p>
          </div>
        }
      >
        {turns.length > 0 ? (
          <ChatMessageList density="spacious" align="top">
            {turns.map((t) => (
              <Fragment key={t.id}>
                <ChatMessage sender="user">
                  <ChatMessageBubble>{t.question}</ChatMessageBubble>
                </ChatMessage>
                <ChatMessage sender="assistant">
                  <ChatMessageBubble variant="ghost" width="100%" name="Absolute Memory">
                    <CitedAnswer
                      answer={
                        t.answer ||
                        (t.state === 'running'
                          ? 'Looking through your saved reading…'
                          : 'No answer was generated.')
                      }
                      sources={t.sources}
                    />
                    <SourceList sources={t.sources} />
                    {t.state === 'complete' &&
                      t.answer.trim() &&
                      (savedNotes[t.id] ? (
                        <a href={`/read/${savedNotes[t.id]}`}>Open saved note ↗</a>
                      ) : (
                        <button
                          className="chat-save-note"
                          type="button"
                          disabled={!!savingNote}
                          onClick={() => void saveNote(t)}
                        >
                          {savingNote === t.id ? 'Saving…' : 'Save as note'}
                        </button>
                      ))}
                    {(t.state === 'stopped' || t.state === 'failed') && (
                      <p className="ac-status">This answer did not finish.</p>
                    )}
                  </ChatMessageBubble>
                </ChatMessage>
              </Fragment>
            ))}
          </ChatMessageList>
        ) : null}
      </ChatLayout>
    </div>
  );
  return render(chat, history);
}
