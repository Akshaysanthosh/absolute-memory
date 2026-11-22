'use client';

import { plural } from '@/shared/plural';
import { EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  X,
  Check,
  ArrowUpRight,
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Undo,
  Redo,
  Link2,
  Plus,
  CheckSquare,
  BookOpen,
} from 'lucide-react';
import './note-editor.css';
import type { NoteCanvasModel } from './use-note-canvas';
const bubbleOptions = { placement: 'top' as const };

export function NoteCanvasView({ model }: { model: NoteCanvasModel }) {
  const {
    block,
    busy,
    close,
    dialog,
    editor,
    error,
    id,
    image,
    insertLink,
    itemId,
    items,
    link,
    loaded,
    loading,
    menu,
    rename,
    save,
    setError,
    setImage,
    setLink,
    setMenu,
    setSourceSearch,
    setUrl,
    sourceSearch,
    status,
    title,
    url,
  } = model;
  const tools = [
    {
      label: 'Bold',
      icon: Bold,
      active: editor?.isActive('bold'),
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      icon: Italic,
      active: editor?.isActive('italic'),
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Heading',
      icon: Heading2,
      active: editor?.isActive('heading'),
      run: () => block('heading'),
    },
    {
      label: 'Bullet list',
      icon: List,
      active: editor?.isActive('bulletList'),
      run: () => block('bullet'),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      active: editor?.isActive('orderedList'),
      run: () => block('number'),
    },
    {
      label: 'Checklist',
      icon: CheckSquare,
      active: editor?.isActive('taskList'),
      run: () => block('task'),
    },
    {
      label: 'Quote',
      icon: Quote,
      active: editor?.isActive('blockquote'),
      run: () => block('quote'),
    },
    {
      label: 'Code block',
      icon: Code,
      active: editor?.isActive('codeBlock'),
      run: () => block('code'),
    },
    {
      label: 'Link or saved item',
      icon: Link2,
      active: editor?.isActive('link'),
      run: () => block('link'),
    },
  ];

  return (
    <dialog
      ref={dialog}
      className="note-dialog"
      aria-labelledby="note-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          void save();
        }
      }}
    >
      <header className="note-top">
        <div>
          <span className="note-dot" />
          <span id="note-dialog-title">{itemId ? 'Edit note' : 'Your notebook'}</span>
          <span className="note-save-status" role="status">
            {busy ? 'Saving…' : status || 'Private to you'}
          </span>
        </div>
        <div>
          {id && (
            <a href={`/read/${id}`}>
              <BookOpen size={16} />
              Read
            </a>
          )}
          <button
            className="note-save"
            disabled={loading || busy || !loaded.current}
            onClick={() => void save()}
          >
            <Check size={16} />
            {busy ? 'Saving…' : 'Save note'}
          </button>
          <button aria-label="Close note editor" disabled={busy} onClick={close}>
            <X size={20} />
          </button>
        </div>
      </header>
      <div className="note-toolbar" role="toolbar" aria-label="Note formatting">
        {tools.map((t) => (
          <button
            key={t.label}
            title={t.label}
            aria-label={t.label}
            aria-pressed={!!t.active}
            disabled={!editor || loading || busy}
            onClick={t.run}
          >
            <t.icon size={18} />
          </button>
        ))}
        <span />
        <button
          aria-label="Undo"
          title="Undo"
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor || busy}
        >
          <Undo size={17} />
        </button>
        <button
          aria-label="Redo"
          title="Redo"
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor || busy}
        >
          <Redo size={17} />
        </button>
        <button
          aria-label="Insert block"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
          disabled={loading || busy}
        >
          <Plus size={19} />
        </button>
      </div>
      {error && (
        <div role="alert" className="note-error">
          {error}
        </div>
      )}
      <div className="note-scroll">
        <div className="note-paper">
          <label className="note-kicker" htmlFor="note-title">
            A SPACE FOR YOUR THINKING
          </label>
          <textarea
            rows={1}
            id="note-title"
            aria-label="Note title"
            className="note-title"
            placeholder="Untitled note"
            maxLength={300}
            value={title}
            onChange={(e) => rename(e.target.value)}
            disabled={loading || busy}
          />
          <div className="note-body-wrap">
            {loading ? (
              <p role="status">Opening your notebook…</p>
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
          {menu && (
            <div className="note-insert-menu" aria-label="Insert a block">
              {[
                ['paragraph', 'Text'],
                ['heading', 'Heading'],
                ['bullet', 'Bullet list'],
                ['number', 'Numbered list'],
                ['task', 'Checklist'],
                ['quote', 'Quote'],
                ['code', 'Code block'],
                ['image', 'Image'],
                ['link', 'Link to saved content'],
              ].map(([value, label]) => (
                <button key={value} onClick={() => block(value)}>
                  {label}
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          )}
          {(link || image) && (
            <section
              className="note-link-panel"
              aria-label={image ? 'Insert image' : 'Insert link'}
            >
              <div>
                <strong>{image ? 'Image from URL' : 'Link a source or a saved idea'}</strong>
                <button
                  aria-label="Close insert panel"
                  onClick={() => {
                    setLink(false);
                    setImage(false);
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <input
                aria-label={image ? 'Image URL' : 'Link URL'}
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button
                className="note-save"
                onClick={() => {
                  if (image) {
                    if (!/^https:\/\//.test(url)) {
                      setError('Images need a complete HTTPS URL.');
                      return;
                    }
                    editor?.chain().focus().setImage({ src: url }).run();
                    setImage(false);
                  } else insertLink(url);
                }}
              >
                Insert {image ? 'image' : 'link'}
              </button>
              {link && (
                <>
                  <input
                    aria-label="Find a saved item"
                    placeholder="Find something in your library…"
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                  />
                  <div className="note-source-options">
                    {items
                      .filter((i) => i.title.toLowerCase().includes(sourceSearch.toLowerCase()))
                      .slice(0, 6)
                      .map((i) => (
                        <button
                          key={i.id}
                          onClick={() =>
                            insertLink(`${i.media_kind ? '/media' : '/read'}/${i.id}`, i.title)
                          }
                        >
                          {i.title}
                          <ArrowUpRight size={13} />
                        </button>
                      ))}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>
      <footer className="note-bottom">
        <span>
          {plural(editor?.getText().trim().split(/\s+/).filter(Boolean).length || 0, 'word')}
        </span>
        <span>Type / to insert · ⌘/Ctrl S to save</span>
        <span>Drafts stay on this device until saved</span>
      </footer>
      {editor && (
        <BubbleMenu editor={editor} options={bubbleOptions}>
          <div className="note-bubble">
            {tools.slice(0, 2).map((t) => (
              <button key={t.label} aria-label={`Selection ${t.label}`} onClick={t.run}>
                <t.icon size={17} />
              </button>
            ))}
            <button aria-label="Link selected text" onClick={() => block('link')}>
              <Link2 size={17} />
            </button>
          </div>
        </BubbleMenu>
      )}
    </dialog>
  );
}
