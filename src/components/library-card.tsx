'use client';

import { plural } from '@/shared/plural';
import { useState } from 'react';
import { BookOpen, FileText, Image as ImageIcon, Mic, Play, StickyNote, Table } from 'lucide-react';
import { itemIsReady, preparationFailed } from '@/shared/item-readiness';
import { readingMinutes } from '@/shared/client';
import { articleImportFeedback, importStatus } from '@/shared/import-feedback';
import type { Item } from '@/shared/types';
import { LibraryCardActions } from './library-card-actions';
import { clean, href, kind } from './library-display';
import styles from './library-card.module.css';

export type LibraryCardAction =
  'favorite' | 'archived' | 'retry' | 'organize' | 'bookmark' | 'product' | 'delete';

const date = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const icons = {
  Podcast: Mic,
  Transcript: FileText,
  Audio: Mic,
  Note: StickyNote,
  PDF: FileText,
  Excel: Table,
  Image: ImageIcon,
  Video: Play,
  Article: BookOpen,
  Quote: FileText,
  Website: BookOpen,
  Product: ImageIcon,
};

export function LibraryCard({
  item,
  menuOpen,
  busy,
  onOpen,
  onMenu,
  onAction,
}: {
  item: Item;
  menuOpen: boolean;
  busy: boolean;
  onOpen: () => void;
  onMenu: (open: boolean) => void;
  onAction: (action: LibraryCardAction) => void;
}) {
  const [failedImage, setFailedImage] = useState('');
  const [fallback, setFallback] = useState(false);
  const type = item.media_kind === 'audio' && item.reading_ready ? 'Transcript' : kind(item);
  const Icon = icons[type as keyof typeof icons] ?? BookOpen;
  const showMedia = !['Note', 'PDF', 'Podcast', 'Transcript', 'Audio'].includes(type);
  const img = showMedia && (fallback ? item.thumbnail?.fallbackUrl : item.thumbnail?.url);
  const image = img && img !== failedImage ? img : undefined;
  const title = clean(item.title);
  const source =
    item.source_file?.name ||
    item.source_name?.trim() ||
    item.source_details?.source?.siteName?.trim() ||
    item.domain ||
    (type === 'Note' ? 'My notes' : type);
  const pages = item.source_file?.pages;
  const ready = itemIsReady(item);
  const failed = preparationFailed(item);
  const preparation = importStatus(item);
  const originalUrl = item.url || item.media_url;
  return (
    <article className={styles.card} aria-label={title} data-open={menuOpen || undefined}>
      <div className={styles.cover}>
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              if (!fallback && item.thumbnail?.fallbackUrl) setFallback(true);
              else setFailedImage(image);
            }}
          />
        ) : (
          <Icon size={32} strokeWidth={1.5} aria-hidden="true" />
        )}
        <span className={styles.type}>{type}</span>
        <LibraryCardActions
          item={item}
          articleFailure={failed && !item.media_kind ? articleImportFeedback(item.error) : null}
          bookmark={item.bookmark_type ? item.url : null}
          busy={busy}
          failed={failed}
          menuOpen={menuOpen}
          onAction={onAction}
          onMenu={onMenu}
          openHref={href(item)}
          originalUrl={originalUrl}
          preparation={preparation}
          progress={Math.round(item.progress * 100)}
          ready={ready}
          title={title}
        />
      </div>
      <div className={styles.body}>
        <p className={styles.source} title={source}>
          {source}
        </p>
        <h2>
          <button type="button" className={styles.open} onClick={onOpen}>
            {title}
          </button>
        </h2>
        <footer className={styles.meta}>
          <span>
            {ready
              ? pages
                ? plural(pages, 'page')
                : `${readingMinutes(item.words)} min read`
              : preparation}
          </span>
          <time dateTime={new Date(item.created_at).toISOString()}>
            {date.format(new Date(item.created_at))}
          </time>
        </footer>
      </div>
    </article>
  );
}
