'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpen,
  Play,
  MoreHorizontal,
  RefreshCw,
  Star,
  Archive,
  Trash2,
} from 'lucide-react';
import type { articleImportFeedback } from '@/shared/import-feedback';
import type { Item } from '@/shared/types';
import styles from './library-card.module.css';
import type { LibraryCardAction } from './library-card';
export function LibraryCardActions({
  articleFailure,
  bookmark,
  busy,
  failed,
  item,
  menuOpen,
  onAction,
  onMenu,
  openHref,
  originalUrl,
  preparation,
  progress,
  ready,
  title,
}: {
  articleFailure: ReturnType<typeof articleImportFeedback> | null;
  bookmark: string | null | undefined;
  busy: boolean;
  failed: boolean;
  item: Item;
  menuOpen: boolean;
  onAction: (action: LibraryCardAction) => void;
  onMenu: (open: boolean) => void;
  openHref: string;
  originalUrl: string | null | undefined;
  preparation: string;
  progress: number;
  ready: boolean;
  title: string;
}) {
  return (
    <div
      className={styles.actions}
      data-item-actions
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onMenu(false);
          event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
        }
      }}
    >
      <button
        className={styles.more}
        aria-label={`Actions for ${title}`}
        aria-expanded={menuOpen}
        aria-controls={`actions-${item.id}`}
        onClick={() => onMenu(!menuOpen)}
      >
        <MoreHorizontal size={19} />
      </button>
      {menuOpen && (
        <div className={styles.actionMenu} id={`actions-${item.id}`}>
          <strong>{title}</strong>
          {failed && (
            <>
              <p>
                {originalUrl && 'Your link is saved. '}
                {item.error ||
                  (item.media_kind && item.status === 'ready'
                    ? 'The readable article could not be prepared. Retry preparation.'
                    : 'This import needs attention.')}
              </p>
              {articleFailure?.retry !== false && (
                <button
                  disabled={busy}
                  onClick={() => onAction(item.status === 'ready' ? 'organize' : 'retry')}
                >
                  <RefreshCw size={15} />
                  Retry import
                </button>
              )}
              {articleFailure?.chrome && (
                <Link href="/settings?section=extension">Save a loaded page from Chrome</Link>
              )}
              {originalUrl && (
                <a href={originalUrl} target="_blank" rel="noopener noreferrer">
                  <ArrowUpRight size={15} />
                  Open original source
                </a>
              )}
            </>
          )}
          {!ready && !failed && <p role="status">{preparation}</p>}
          {ready &&
            item.knowledge_state !== 'ready' &&
            (item.knowledge_state === 'failed' ? (
              <>
                <p>Automatic organization needs attention. Your saved content is readable.</p>
                <button disabled={busy} onClick={() => onAction('organize')}>
                  <RefreshCw size={15} />
                  Retry organization
                </button>
              </>
            ) : (
              <p role="status">Organizing your content…</p>
            ))}
          <button disabled={busy} onClick={() => onAction('favorite')}>
            <Star size={15} />
            {item.favorite ? 'Remove favorite' : 'Favorite'}
          </button>
          <button disabled={busy} onClick={() => onAction('archived')}>
            <Archive size={15} />
            {item.archived ? 'Restore item' : 'Archive'}
          </button>
          {item.url &&
            item.kind === 'article' &&
            !item.media_kind &&
            item.bookmark_type !== 'website' && (
              <button disabled={busy} onClick={() => onAction('bookmark')}>
                <Star size={15} />
                Save as bookmark
              </button>
            )}
          {item.url &&
            item.kind === 'article' &&
            !item.media_kind &&
            item.bookmark_type !== 'product' && (
              <button disabled={busy} onClick={() => onAction('product')}>
                Save as product
              </button>
            )}
          {!ready && !failed && originalUrl && (
            <a href={originalUrl} target="_blank" rel="noopener noreferrer">
              Open original
            </a>
          )}
          {bookmark && (
            <a href={bookmark} target="_blank" rel="noopener noreferrer">
              <ArrowUpRight size={15} />
              Open original site
            </a>
          )}
          {ready && item.media_kind && (
            <Link href={openHref}>
              <Play size={15} />
              Transcript timestamps
            </Link>
          )}
          {ready && !bookmark && (
            <Link href={`/read/${item.id}`}>
              <BookOpen size={15} />
              {progress > 0 && progress < 100 ? 'Continue reading' : 'Open reader'}
            </Link>
          )}
          <button
            disabled={busy}
            className={styles.deleteAction}
            onClick={() => onAction('delete')}
          >
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
