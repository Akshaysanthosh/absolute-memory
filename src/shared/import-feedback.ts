import { itemIsReady, preparationFailed } from '@/shared/item-readiness';
export function articleImportFeedback(error: string | null | undefined) {
  const message = error ?? '';
  if (/HTTP 401\b/.test(message)) return { label: 'Sign-in required', retry: false, chrome: true };
  if (/HTTP 403\b/.test(message))
    return { label: 'Website blocked retrieval', retry: false, chrome: true };
  if (/not found or is no longer available|HTTP (404|410)\b/.test(message)) {
    return { label: 'Source unavailable', retry: false, chrome: false };
  }
  if (
    /not an article webpage|redirects too many times|too large to import|extracted-content limit/.test(
      message,
    )
  ) {
    return { label: 'Unsupported content', retry: false, chrome: false };
  }
  if (/too little text|could not read that article|this page was empty/i.test(message)) {
    return { label: 'Article text unavailable', retry: false, chrome: true };
  }
  return { label: 'Import failed', retry: true, chrome: false };
}

/** Import stages have no numeric progress from the providers. */
export function importStatus(
  item: Pick<
    import('@/shared/types').Item,
    'status' | 'media_kind' | 'media_stage' | 'reading_ready' | 'knowledge_state'
  >,
) {
  if (itemIsReady(item)) return 'Ready';
  if (preparationFailed(item)) return 'Needs attention';
  return 'Preparing…';
}
