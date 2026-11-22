import { Button } from '@astryxdesign/core/Button';
import type { Ref } from 'react';

export function ReaderHelp({ dialogRef }: { dialogRef: Ref<HTMLDialogElement> }) {
  return (
    <dialog ref={dialogRef} aria-label="Reader keyboard shortcuts">
      <h2>Keyboard shortcuts</h2>
      <dl className="reading-shortcuts">
        <dt>Scroll</dt>
        <dd>J / K or ↑ / ↓</dd>
        <dt>Change text size</dt>
        <dd>[ / ]</dd>
        <dt>Highlight selection</dt>
        <dd>H</dd>
        <dt>Remove focused highlight</dt>
        <dd>Backspace</dd>
        <dt>Return to library</dt>
        <dd>Esc</dd>
      </dl>
      <form method="dialog">
        <Button type="submit" label="Close" size="sm" />
      </form>
    </dialog>
  );
}
