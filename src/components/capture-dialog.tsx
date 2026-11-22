'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useCaptureForm } from './use-capture-form';
import { CaptureFormView } from './capture-form-view';
const NoteEditor = dynamic(() => import('./note-editor').then((m) => m.NoteEditor), { ssr: false });

import type { CaptureDialogProps } from './use-capture-form';
export function CaptureDialog(props: CaptureDialogProps) {
  const [note, setNote] = useState(props.initialKind === 'note');
  useEffect(() => {
    if (props.open) setNote(props.initialKind === 'note');
  }, [props.open, props.initialKind]);
  if (!props.open) return null;
  if (note) return <NoteEditor open onClose={props.onClose} onSaved={props.onSaved} />;
  return <CaptureForm {...props} onNote={() => setNote(true)} />;
}
function CaptureForm(props: Parameters<typeof useCaptureForm>[0]) {
  return <CaptureFormView model={useCaptureForm(props)} />;
}
