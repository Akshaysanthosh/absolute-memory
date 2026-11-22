import { normalizeUrl } from '@/server/services/extract';
import type { Item } from '@/shared/types';

export type ItemThumbnail = {
  url: string;
  alt: string;
  source: 'article' | 'youtube' | 'document';
  fallbackUrl?: string;
};

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);
export function isYouTubeUrl(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      YOUTUBE_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function youtubeVideoId(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase(),
      parts = url.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if (host === 'youtu.be' && parts.length === 1) id = parts[0];
    if (host !== 'youtu.be' && isYouTubeUrl(raw)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (['shorts', 'embed', 'live'].includes(parts[0]) && parts.length === 2) id = parts[1];
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

type ThumbnailItem = Pick<Item, 'id' | 'kind' | 'url' | 'title' | 'source_details'> & {
  has_source?: boolean;
};
export function thumbnailFor(item: ThumbnailItem): ItemThumbnail | null {
  if ((item.kind === 'pdf' || item.kind === 'image') && item.has_source) {
    return {
      url: `/api/items/${item.id}/thumbnail`,
      alt: item.kind === 'pdf' ? `First page of ${item.title}` : item.title,
      source: 'document',
    };
  }
  const video = youtubeVideoId(item.url);
  if (video)
    return {
      url: `https://i.ytimg.com/vi/${video}/hqdefault.jpg`,
      fallbackUrl: `https://i.ytimg.com/vi/${video}/mqdefault.jpg`,
      alt: item.title,
      source: 'youtube',
    };
  const thumbnail = item.source_details?.thumbnailUrl;
  if (thumbnail) {
    const prefix = `/api/items/${item.id}/reading-images/`;
    if (thumbnail.startsWith(prefix) && /^\d+$/.test(thumbnail.slice(prefix.length))) {
      return { url: thumbnail, alt: item.title, source: 'article' };
    }
    try {
      return { url: normalizeUrl(thumbnail), alt: item.title, source: 'article' };
    } catch {
      /* Ignore invalid thumbnail metadata. */
    }
  }
  return null;
}
