'use client';

import { noteExtensions } from '@/shared/note-extensions';

import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import { api, libraryOptions } from '@/shared/client';
import type { LibraryOption } from '@/shared/library-options';
import type { NoteNode } from '@/shared/note-document';
type Props = {
  open: boolean;
  itemId?: string;
  source?: { id: string; title: string };
  onClose: () => void;
  onSaved: (id: string, duplicate: boolean) => void;
};

export function useNoteCanvas({ itemId, source, onClose, onSaved }: Omit<Props, 'open'>) {
  const sourceId = source?.id,
    sourceTitle = source?.title;
  const loaded = useRef(false),
    draftStored = useRef(false),
    versionRef = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null),
    saving = useRef(false),
    dirty = useRef(false),
    draftKey = useRef(''),
    saveRef = useRef<() => void>(() => {});
  const [title, setTitle] = useState('');
  const [id, setId] = useState(itemId);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [menu, setMenu] = useState(false);
  const [link, setLink] = useState(false);
  const [url, setUrl] = useState('');
  const [image, setImage] = useState(false);
  const [items, setItems] = useState<LibraryOption[]>([]);
  const [sourceSearch, setSourceSearch] = useState('');
  const titleRef = useRef('');
  titleRef.current = title;
  versionRef.current = version;
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      ...noteExtensions(),
      Placeholder.configure({ placeholder: 'Start writing. Type / for blocks…' }),
    ],
    editorProps: {
      attributes: {
        'aria-label': 'Note body',
        role: 'textbox',
        'aria-multiline': 'true',
        class: 'note-prose',
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          saveRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (!loaded.current) return;
      draftStored.current = false;
      dirty.current = true;
      setStatus('Unsaved changes');
      if (draftKey.current)
        try {
          localStorage.setItem(
            draftKey.current,
            JSON.stringify({
              title: titleRef.current,
              document: editor.getJSON(),
              version: versionRef.current,
            }),
          );
          draftStored.current = true;
          setStatus('Draft saved on this device');
        } catch {
          setStatus('Unsaved changes — device storage is unavailable');
        }
      const { selection } = editor.state;
      setMenu(selection.$from.parent.textContent === '/');
    },
  });
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    if (!editor) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const session = await api<{ user: { id: string } }>('/api/auth/get-session', {
          signal: abort.signal,
        });
        draftKey.current = `am-note-draft:${session.user.id}:${itemId || (sourceId ? 'source-' + sourceId : 'new')}`;
        let data: { title: string; document: NoteNode; version: number } = {
          title: '',
          document: { type: 'doc', content: [{ type: 'paragraph' }] },
          version: 0,
        };
        if (sourceId && sourceTitle && !itemId) {
          data.title = `Notes on ${sourceTitle}`.slice(0, 300);
          data.document = {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: sourceTitle,
                    marks: [{ type: 'link', attrs: { href: `/read/${sourceId}` } }],
                  },
                ],
              },
              { type: 'paragraph' },
            ],
          };
        }
        if (itemId) data = await api(`/api/notes?id=${itemId}`, { signal: abort.signal });
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(draftKey.current);
        } catch {
          setStatus('Device draft storage is unavailable. Save to keep your work.');
        }
        if (stored) {
          try {
            const draft = JSON.parse(stored);
            if (draft.version === data.version) {
              data = { ...data, ...draft };
              dirty.current = true;
              draftStored.current = true;
              setStatus('Recovered your draft');
            } else setStatus('An older device draft is preserved. Showing the latest saved note.');
          } catch {
            /* Invalid local draft leaves the saved document intact. */
          }
        }
        if (abort.signal.aborted) return;
        setTitle(data.title);
        titleRef.current = data.title;
        setVersion(data.version);
        editor.commands.setContent(data.document, { emitUpdate: false });
        loaded.current = true;
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [editor, itemId, sourceId, sourceTitle]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    editor?.setEditable(!loading && !busy && loaded.current, false);
  }, [editor, loading, busy]);
  function rename(value: string) {
    draftStored.current = false;
    setTitle(value);
    titleRef.current = value;
    dirty.current = true;
    setStatus('Draft saved on this device');
    try {
      if (draftKey.current && editor)
        localStorage.setItem(
          draftKey.current,
          JSON.stringify({ title: value, document: editor.getJSON(), version: versionRef.current }),
        );
      draftStored.current = true;
    } catch {
      setStatus('Unsaved changes — device storage is unavailable');
    }
  }
  function noteForSave() {
    const document = editor?.getJSON() as NoteNode;
    if (!sourceId || !sourceTitle) return document;
    const href = `/read/${sourceId}`;
    function linksSource(node: NoteNode): boolean {
      return (
        !!node.marks?.some(
          (mark) =>
            mark.type === 'link' &&
            (mark.attrs?.href === href || mark.attrs?.href === `/media/${sourceId}`),
        ) || !!node.content?.some(linksSource)
      );
    }
    if (linksSource(document)) return document;
    const link = {
      type: 'paragraph',
      content: [{ type: 'text', text: sourceTitle, marks: [{ type: 'link', attrs: { href } }] }],
    };
    return { ...document, content: [link, ...(document.content || [])] };
  }
  async function save() {
    if (!editor || saving.current || loading || !loaded.current) return;
    if (!title.trim()) {
      setError('Give your note a title.');
      return;
    }
    if (editor.isEmpty) {
      setError('Write something before saving.');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ id: string; version: number }>('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ id, title, document: noteForSave(), version: versionRef.current }),
      });
      setId(result.id);
      setVersion(result.version);
      dirty.current = false;
      try {
        localStorage.removeItem(draftKey.current);
        draftKey.current = draftKey.current.replace(/[^:]+$/, result.id);
        draftStored.current = false;
      } catch {}
      setStatus('Saved to your library');
      onSaved(result.id, false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  saveRef.current = () => void save();
  function close() {
    if (busy) return;
    if (dirty.current && !draftStored.current && !window.confirm('Close without saving this note?'))
      return;
    onClose();
  }
  function block(action: string) {
    if (!editor) return;
    const { selection } = editor.state;
    if (selection.$from.parent.textContent === '/')
      editor
        .chain()
        .focus()
        .deleteRange({ from: selection.$from.start(), to: selection.$from.end() })
        .run();
    setMenu(false);
    const c = editor.chain().focus();
    if (action === 'heading') c.toggleHeading({ level: 2 }).run();
    if (action === 'paragraph') c.setParagraph().run();
    if (action === 'bullet') c.toggleBulletList().run();
    if (action === 'number') c.toggleOrderedList().run();
    if (action === 'quote') c.toggleBlockquote().run();
    if (action === 'code') c.toggleCodeBlock().run();
    if (action === 'task') c.toggleTaskList().run();
    if (action === 'image') {
      setImage(true);
      setLink(false);
      setUrl('');
    }
    if (action === 'link') {
      setLink(true);
      setImage(false);
      setUrl('');
      void libraryOptions()
        .then((d) => setItems(d.items.filter((i) => i.status === 'ready' && i.id !== id)))
        .catch((e) => setError(e.message));
    }
  }
  function insertLink(value: string, label?: string) {
    if (!editor) return;
    if (!/^(https?:\/\/|mailto:|\/(?!\/))/i.test(value)) {
      setError('Use a complete http(s) URL or choose a saved item.');
      return;
    }
    if (label)
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: label,
          marks: [{ type: 'link', attrs: { href: value } }],
        })
        .run();
    else if (editor.state.selection.empty)
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: value,
          marks: [{ type: 'link', attrs: { href: value } }],
        })
        .run();
    else editor.chain().focus().setLink({ href: value }).run();
    setLink(false);
    setUrl('');
    setError('');
  }

  return {
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
  };
}
export type NoteCanvasModel = ReturnType<typeof useNoteCanvas>;
