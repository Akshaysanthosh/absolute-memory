import type { Item } from '@/shared/types';

export const statusOptions = [
  { label: 'All saved', value: 'all' },
  { label: 'In progress', value: 'progress' },
  { label: 'Finished', value: 'finished' },
  { label: 'Favorites', value: 'favorites' },
  { label: 'Archived', value: 'archived' },
] as const;
export const contentTypes = [
  { label: 'Articles', value: 'Article' },
  { label: 'Videos', value: 'Video' },
  { label: 'Podcasts', value: 'Podcast' },
  { label: 'Audio', value: 'Audio' },
  { label: 'Notes', value: 'Note' },
  { label: 'PDFs', value: 'PDF' },
  { label: 'Spreadsheets', value: 'Excel' },
  { label: 'Images', value: 'Image' },
  { label: 'Bookmarks', value: 'Bookmarks' },
  { label: 'Quotes', value: 'Quote' },
] as const;
export const clean = (text: string) =>
  text
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&lsquo;|&#8216;/g, '‘')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, '—');
export const kind = (item: Item) =>
  item.source_details?.quote
    ? 'Quote'
    : item.bookmark_type === 'product'
      ? 'Product'
      : item.bookmark_type === 'website'
        ? 'Website'
        : item.media_kind === 'youtube'
          ? 'Video'
          : item.media_kind === 'podcast'
            ? 'Podcast'
            : item.media_kind === 'audio'
              ? 'Audio'
              : {
                  article: 'Article',
                  note: 'Note',
                  pdf: 'PDF',
                  spreadsheet: 'Excel',
                  image: 'Image',
                }[item.kind];
export const category = (item: Item) => (item.bookmark_type ? 'Bookmarks' : kind(item));
export const href = (item: Item) => `${item.media_kind ? '/media' : '/read'}/${item.id}`;
