'use client';
import { ItemTitle } from './item-title';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Item } from '@/shared/types';
import { SavedImageViewer } from './saved-image-viewer';
import styles from './image-detail-dialog.module.css';
export function ImageDetailDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!item) {
      if (el?.open) el.close();
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!el?.open) el?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, [item]);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onCancel={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="image-detail-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {item && (
        <>
          <header className={styles.header}>
            <div id="image-detail-title">
              <ItemTitle key={item.id} id={item.id} title={item.title} />
            </div>
            <a href={`/api/items/${item.id}/source`} download>
              Download original
            </a>
            <button onClick={onClose} aria-label="Close image">
              <X size={20} />
            </button>
          </header>
          <SavedImageViewer
            key={item.id}
            id={item.id}
            title={item.title}
            info={item.source_details?.image}
            text={item.passages?.map((block) => block.text).join('\n\n') || ''}
          />
        </>
      )}
    </dialog>
  );
}
