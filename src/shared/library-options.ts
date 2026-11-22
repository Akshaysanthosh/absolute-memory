import type { Item } from '@/shared/types';
export type LibraryOption = Pick<
  Item,
  'id' | 'title' | 'status' | 'archived' | 'tags' | 'media_kind'
>;
/** Picker labels only: no source bodies, thumbnails, OCR, excerpts or media processing. */
