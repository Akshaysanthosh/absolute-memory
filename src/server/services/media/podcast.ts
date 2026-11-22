import { isPodcastLink, resolvePodcastLink } from '@/server/services/media/podcast-links';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { normalizeUrl } from '@/server/services/extract';
import { publicText } from '@/server/services/media/public-text';
import { MediaError, type Transcript, type Segment } from '@/shared/media/transcript';
export type Episode = {
  id: string;
  title: string;
  audioUrl: string;
  transcriptUrl: string | null;
  duration: number | null;
  author: string;
  description?: string;
  publishedAt?: string;
  link?: string;
};
function duration(text: string) {
  const parts = text.trim().split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0))
    return null;
  const value = parts.reduce((n, s) => n * 60 + s, 0);
  return value > 0 ? value : null;
}
export function parseFeed(xml: string, feedUrl: string): Episode[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new MediaError('This feed uses unsupported XML declarations.');
  let dom: JSDOM;
  try {
    dom = new JSDOM(xml, { contentType: 'text/xml' });
  } catch {
    throw new MediaError('Paste a public podcast RSS feed URL.');
  }
  try {
    const doc = dom.window.document;
    const author =
      doc.querySelector('channel > title')?.textContent?.trim().slice(0, 300) || 'Podcast';
    const episodes: Episode[] = [];
    for (const item of Array.from(doc.querySelectorAll('item')).slice(0, 100)) {
      const raw = item.querySelector('enclosure')?.getAttribute('url');
      if (!raw) continue;
      let audioUrl: string;
      try {
        audioUrl = normalizeUrl(new URL(raw, feedUrl).href);
      } catch {
        continue;
      }
      const transcript = Array.from(item.children).find((x) => x.localName === 'transcript');
      let transcriptUrl: string | null = null;
      try {
        if (transcript?.getAttribute('url'))
          transcriptUrl = normalizeUrl(new URL(transcript.getAttribute('url')!, feedUrl).href);
      } catch {}
      const guid = item.querySelector('guid')?.textContent || audioUrl;
      const child = (name: string) =>
        Array.from(item.children)
          .find((x) => x.localName === name)
          ?.textContent?.trim() || '';
      // Show notes are HTML inside RSS; keep readable text only.
      const notes = (child('summary') || child('description'))
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/[ \t]+/g, ' ')
        .trim()
        .slice(0, 8000);
      const published = Date.parse(child('pubDate'));
      episodes.push({
        id: createHash('sha256')
          .update(normalizeUrl(feedUrl) + '\n' + guid)
          .digest('hex'),
        title: (item.querySelector('title')?.textContent?.trim() || 'Podcast episode').slice(
          0,
          300,
        ),
        audioUrl,
        transcriptUrl,
        duration: duration(child('duration')),
        author,
        description: notes || undefined,
        publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : undefined,
        link: child('link').slice(0, 2000) || undefined,
      });
    }
    if (!episodes.length)
      throw new MediaError('No public audio episodes were found in this RSS feed.');
    return episodes;
  } finally {
    dom.window.close();
  }
}
export async function podcastEpisodes(feedUrl: string) {
  if (isPodcastLink(feedUrl)) return resolvePodcastLink(feedUrl);
  const doc = await publicText(feedUrl, 8000000);
  return parseFeed(doc.text, feedUrl);
}
function millis(text: string) {
  return (
    text
      .replace(',', '.')
      .split(':')
      .map(Number)
      .reduce((n, s) => n * 60 + s, 0) * 1000
  );
}
export function parsePublishedTranscript(text: string, type: string): Transcript {
  let content: Segment[] = [];
  if (type.includes('json')) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new MediaError('Invalid podcast transcript JSON.');
    }
    if (!Array.isArray(data.segments)) throw new MediaError('Unsupported podcast transcript JSON.');
    content = data.segments.map((s: { body?: string; startTime?: number; endTime?: number }) => ({
      text: s.body || '',
      offset: Number(s.startTime) * 1000,
      duration: (Number(s.endTime) - Number(s.startTime)) * 1000,
    }));
  } else if (type.includes('vtt') || /\d\d:\d\d[.,]\d+\s+-->/.test(text)) {
    for (const cue of text.replace(/\r/g, '').split(/\n\s*\n/)) {
      const lines = cue.split('\n');
      const pos = lines.findIndex((l) => l.includes('-->'));
      if (pos < 0) continue;
      const times = lines[pos].match(/([\d:.,]+)\s+-->\s+([\d:.,]+)/);
      if (!times) continue;
      content.push({
        text: lines
          .slice(pos + 1)
          .join(' ')
          .replace(/<[^>]*>/g, '')
          .trim(),
        offset: millis(times[1]),
        duration: millis(times[2]) - millis(times[1]),
      });
    }
  } else if (type.includes('text/plain'))
    content = text
      .split(/\n\s*\n/)
      .filter((s) => s.trim())
      .map((s) => ({ text: s.trim(), offset: 0, duration: 0 }));
  else throw new MediaError('This published transcript format is not supported yet.');
  if (
    !content.length ||
    content.length > 12000 ||
    content.some(
      (s, i) =>
        !s.text.trim() ||
        !Number.isFinite(s.offset) ||
        !Number.isFinite(s.duration) ||
        s.offset < 0 ||
        s.duration < 0 ||
        (i > 0 && s.offset < content[i - 1].offset),
    ) ||
    Buffer.byteLength(JSON.stringify(content)) > 700000
  )
    throw new MediaError('This podcast transcript is empty, invalid or too large.');
  return { content };
}
