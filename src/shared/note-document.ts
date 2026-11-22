import { getSchema } from '@tiptap/core';
import { noteExtensions } from '@/shared/note-extensions';
import type { Passage } from '@/shared/passages';
export type NoteNode = {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: NoteNode[];
};
export const noteSchema = getSchema(noteExtensions());
const types = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'hardBreak',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'horizontalRule',
  'image',
]);
export function safeNoteLink(value: unknown) {
  return typeof value === 'string' &&
    (/^(https?:\/\/|mailto:)/i.test(value) || /^\/(?!\/)/.test(value))
    ? value
    : undefined;
}
export function validateNoteDocument(input: unknown): NoteNode {
  let count = 0;
  const ids = new Set<string>();
  function visit(value: unknown, depth: number): NoteNode {
    if (depth > 20 || ++count > 10000 || !value || typeof value !== 'object')
      throw new Error('This note is too complex.');
    const n = value as NoteNode;
    if (!types.has(n.type)) throw new Error('Unsupported note block.');
    if (n.type === 'text' && typeof n.text !== 'string') throw new Error('Invalid note text.');
    if (n.marks && !Array.isArray(n.marks)) throw new Error('Invalid note formatting.');
    if (n.content && !Array.isArray(n.content)) throw new Error('Invalid note content.');
    const attrs: Record<string, unknown> = {};
    if (typeof n.attrs?.id === 'string' && /^[\w-]{1,100}$/.test(n.attrs.id)) attrs.id = n.attrs.id;
    if (
      ['paragraph', 'heading', 'codeBlock', 'image', 'horizontalRule'].includes(n.type) &&
      !attrs.id
    )
      attrs.id = crypto.randomUUID();
    if (typeof attrs.id === 'string') {
      if (ids.has(attrs.id)) throw new Error('Duplicate paragraph identifiers.');
      ids.add(attrs.id);
    }
    if (n.type === 'heading')
      attrs.level = [1, 2, 3].includes(Number(n.attrs?.level)) ? Number(n.attrs?.level) : 2;
    if (n.type === 'orderedList')
      attrs.start = Math.max(1, Math.min(1000, Number(n.attrs?.start) || 1));
    if (n.type === 'taskItem') attrs.checked = !!n.attrs?.checked;
    if (n.type === 'image') {
      const src = safeNoteLink(n.attrs?.src);
      if (!src || !/^https:\/\//.test(src)) throw new Error('Images need a complete HTTPS URL.');
      attrs.src = src;
      attrs.alt = String(n.attrs?.alt || '').slice(0, 300);
    }
    const marks = (n.marks || []).flatMap((m) => {
      if (['bold', 'italic', 'strike', 'underline', 'code'].includes(m.type))
        return [{ type: m.type }];
      const href = safeNoteLink(m.attrs?.href);
      return m.type === 'link' && href ? [{ type: 'link', attrs: { href } }] : [];
    });
    return {
      type: n.type,
      ...(n.text !== undefined ? { text: n.text } : {}),
      ...(Object.keys(attrs).length ? { attrs } : {}),
      ...(marks.length ? { marks } : {}),
      ...(n.content ? { content: n.content.map((c) => visit(c, depth + 1)) } : {}),
    };
  }
  const doc = visit(input, 0);
  if (doc.type !== 'doc') throw new Error('A note document is required.');
  try {
    noteSchema.nodeFromJSON(doc).check();
  } catch {
    throw new Error('Invalid note structure or formatting.');
  }
  return doc;
}

export function passagesToNoteDocument(passages: Passage[]): NoteNode {
  return {
    type: 'doc',
    content: passages.length
      ? passages.map(({ text }) => ({
          type: 'paragraph',
          ...(text ? { content: [{ type: 'text', text }] } : {}),
        }))
      : [{ type: 'paragraph' }],
  };
}
