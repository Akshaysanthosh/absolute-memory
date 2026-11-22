import type { Item } from '@/shared/types';

/** Import completion and a usable reading experience are separate for media. */
export function itemIsReady(item: Pick<Item, 'status' | 'media_kind' | 'reading_ready'>) {
  return item.status === 'ready' && (!item.media_kind || item.reading_ready === true);
}
export function preparationFailed(
  item: Pick<Item, 'status' | 'media_kind' | 'reading_ready' | 'knowledge_state'>,
) {
  return (
    item.status === 'failed' ||
    (item.status === 'ready' &&
      Boolean(item.media_kind) &&
      !item.reading_ready &&
      (item.knowledge_state === 'failed' || item.knowledge_state === 'ready'))
  );
}
