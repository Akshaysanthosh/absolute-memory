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

const tones = {
  Video: 'video',
  Podcast: 'podcast',
  Audio: 'audio',
  Transcript: 'audio',
  PDF: 'pdf',
  Note: 'note',
  Quote: 'note',
  Excel: 'pdf',
  Image: 'article',
} as const;

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
  const img = fallback ? item.thumbnail?.fallbackUrl : item.thumbnail?.url;
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
  const tone = tones[type as keyof typeof tones] ?? 'article';
  return (
    <article
      className={styles.card}
      aria-label={title}
      data-open={menuOpen || undefined}
      data-tone={tone}
    >
      {image ? (
        <img
          className={styles.image}
          data-source={item.thumbnail?.source}
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => {
            // YouTube answers a missing size with a 120px placeholder instead of an error.
            if (item.thumbnail?.source === 'youtube' && event.currentTarget.naturalWidth <= 120) {
              if (!fallback && item.thumbnail.fallbackUrl) setFallback(true);
              else setFailedImage(image);
            }
          }}
          onError={() => {
            if (!fallback && item.thumbnail?.fallbackUrl) setFallback(true);
            else setFailedImage(image);
          }}
        />
      ) : (
        <div className={styles.editorial} aria-hidden="true">
          {type === 'Note' || type === 'Quote' ? (
            <>
              <span className={styles.quoteMark}>“</span>
              <p>{clean(item.excerpt || title)}</p>
            </>
          ) : (
            <>
              <span className={styles.monogram}>
                {source
                  .replace(/^www\./, '')
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <Icon size={30} strokeWidth={1.4} />
            </>
          )}
        </div>
      )}
      <div className={styles.shade} />
      <span className={styles.type}>
        <Icon size={12} strokeWidth={2} aria-hidden="true" />
        {type}
      </span>
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
