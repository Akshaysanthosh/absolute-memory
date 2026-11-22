import type { Item } from '@/shared/types';
/** Short display name; original upload filenames remain in source_file. */
export function conciseTitle(value: string, max = 90) {
  const clean = value
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  const end = clean.slice(0, max - 1);
  const split = end.lastIndexOf(' ');
  return (split > max / 2 ? end.slice(0, split) : end) + '…';
}
export function genericFileName(value: string) {
  return /^(screenshot|screen shot|screencapture[-_ ]|codex image |whatsapp image |img[_ -]?\d|image[_ -]?\d|document$|scan[_ -]?\d|[a-f0-9-]{24,})/i.test(
    value.trim(),
  );
}
export function documentTitle(name: string, heading?: string) {
  if (heading?.trim()) return conciseTitle(heading);
  const filename = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim();
  if (filename && !genericFileName(filename)) return conciseTitle(filename);
  return /\.(png|jpe?g|webp)$/i.test(name)
    ? 'Saved image'
    : /\.xlsx$/i.test(name)
      ? 'Saved workbook'
      : 'Saved document';
}
export function itemDisplayTitle(item: Pick<Item, 'title' | 'kind' | 'source_details'>) {
  if (item.source_details?.titleEdited) return item.title;
  if (item.kind === 'image' && genericFileName(item.title)) {
    const description = item.source_details?.image?.description?.trim();
    return description ? conciseTitle(description.split(/[.!?](?:\s|$)/)[0]) : 'Saved image';
  }
  return item.title;
}

const SITE_NAMES: Record<string, string> = {
  'instagram.com': 'Instagram link',
  'open.spotify.com': 'Spotify link',
  'spotify.com': 'Spotify link',
  'linkedin.com': 'LinkedIn post',
  'reddit.com': 'Reddit post',
  'x.com': 'Post on X',
  'twitter.com': 'Post on X',
  'youtube.com': 'YouTube video',
  'youtu.be': 'YouTube video',
  'tiktok.com': 'TikTok video',
  'facebook.com': 'Facebook post',
  'threads.net': 'Threads post',
};
/** Page titles straight from the browser carry noise: unread counts ("(5) "), " / X" suffixes,
 * t.co links and "Name on X: "…"" wrappers. Return the readable part. */
export function cleanSourceTitle(raw: string, domain?: string | null): string {
  let title = raw
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const host = (domain || '').replace(/^www\./, '').toLowerCase();
  title = title.replace(/^\(\d{1,4}\+?\)\s+/, '');
  title = title.replace(/\s*https?:\/\/t\.co\/\S+/g, '');
  title = title.replace(/\s+\/\s+(X|Twitter)$/, '');
  const wrapped = title.match(
    /^(.{1,80}?) on (X|Twitter|Instagram|Threads|TikTok|LinkedIn): [“"](.*?)[”"]?$/s,
  );
  if (wrapped) {
    const text = wrapped[3].trim().replace(/[”"]$/, '').trim();
    title = text ? `${wrapped[1].trim()}: ${text}` : wrapped[1].trim();
  }
  title = title.replace(/\s+[-–—|]\s*$/, '').trim();
  // A bare hostname is a placeholder, not a title.
  const bare = title.replace(/^www\./i, '').toLowerCase();
  if (!title || bare === host || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title)) {
    const site = SITE_NAMES[host] || SITE_NAMES[bare.replace(/^www\./, '')];
    return site || (host ? `Link from ${host}` : 'Saved link');
  }
  return conciseTitle(title, 200);
}
