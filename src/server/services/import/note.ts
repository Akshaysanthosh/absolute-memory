import { DOMSerializer } from '@tiptap/pm/model';
import { JSDOM } from 'jsdom';
import { noteSchema, type NoteNode } from '@/shared/note-document';
import { prepareContent } from './content';

const document = new JSDOM('').window.document;
const serializer = DOMSerializer.fromSchema(noteSchema);

export function noteReading(note: NoteNode, appUrl: string) {
  const node = noteSchema.nodeFromJSON(note);
  const html = document.createElement('div');
  html.append(serializer.serializeFragment(node.content, { document }));
  return prepareContent(html.innerHTML, appUrl);
}
