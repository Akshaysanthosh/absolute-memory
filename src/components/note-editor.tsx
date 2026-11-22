'use client';

import { useNoteCanvas } from './use-note-canvas';
import { NoteCanvasView } from './note-canvas-view';

type Props = {
  open: boolean;
  itemId?: string;
  source?: { id: string; title: string };
  onClose: () => void;
  onSaved: (id: string, duplicate: boolean) => void;
};
export function NoteEditor({ open, itemId, source, onClose, onSaved }: Props) {
  return open ? (
    <NoteCanvas
      key={itemId || source?.id || 'new'}
      itemId={itemId}
      source={source}
      onClose={onClose}
      onSaved={onSaved}
    />
  ) : null;
}
function NoteCanvas(props: Omit<Props, 'open'>) {
  return <NoteCanvasView model={useNoteCanvas(props)} />;
}
