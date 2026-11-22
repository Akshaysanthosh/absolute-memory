import { Button } from '@astryxdesign/core/Button';
import { Highlighter, X } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';

export function ReaderActions({
  active,
  chosen,
  disabled,
  error,
  onAction,
}: {
  active: boolean;
  chosen?: string;
  disabled: boolean;
  error: string;
  onAction: () => void;
}) {
  const bar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!active || !bar.current) return;
    const target = chosen
      ? document.querySelector(`mark[data-highlight="${CSS.escape(chosen)}"]`)
      : null;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const bounds = (target ?? range)?.getBoundingClientRect();
    if (!bounds) return;
    const available = bar.current.getBoundingClientRect().top - 12;
    if (bounds.bottom > available) window.scrollBy({ top: bounds.bottom - available });
  }, [active, chosen]);
  return (
    <aside ref={bar} className="reading-actions" aria-label="Highlight actions" inert={!active}>
      {error && <p role="alert">{error}</p>}
      <Button
        label={chosen ? 'Remove highlight' : 'Highlight'}
        icon={chosen ? <X size={16} /> : <Highlighter size={16} />}
        size="sm"
        variant="primary"
        isDisabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={onAction}
      />
    </aside>
  );
}
