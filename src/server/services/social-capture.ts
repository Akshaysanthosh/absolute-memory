import { z } from 'zod';
import type { SourceDetails } from '@/shared/types';
import { escapeText, prepareContent } from '@/server/services/import/content';
import { normalizeUrl } from '@/server/services/extract';
import { contentPlatform } from '@/shared/media/social';

export const socialSnapshotSchema = z.object({
  platform: z.enum(['Instagram', 'X', 'Facebook', 'Reddit', 'Pinterest', 'TikTok']),
  title: z.string().max(300),
  author: z.string().max(200).default(''),
  text: z.string().max(30000),
  images: z
    .array(z.object({ url: z.string().url().max(4000), alt: z.string().max(500).default('') }))
    .max(12),
  video: z.boolean().default(false),
});
export function socialSnapshot(url: string, raw: unknown) {
  const parsed = socialSnapshotSchema.safeParse(raw);
  if (!parsed.success || contentPlatform(url) !== parsed.data.platform) return null;
  const post = parsed.data;
  const target = new URL(url);
  const individual =
    post.platform === 'Instagram'
      ? /\/(reels?|p|tv)\/[\w-]+/.test(target.pathname)
      : post.platform === 'X'
        ? /\/status\/\d+/.test(target.pathname)
        : post.platform === 'Reddit'
          ? /\/comments\/[\w]+/.test(target.pathname)
          : post.platform === 'Pinterest'
            ? /\/pin\/\d+/.test(target.pathname)
            : post.platform === 'TikTok'
              ? /\/@[^/]+\/video\/\d+/.test(target.pathname)
              : /\/(reel|videos|posts|permalink)\//.test(target.pathname) ||
                ['v', 'story_fbid', 'fbid'].some((key) => target.searchParams.has(key));
  if (!individual) return null;
  const images = post.images.filter((image) => {
    try {
      return new URL(normalizeUrl(image.url)).protocol === 'https:';
    } catch {
      return false;
    }
  });
  if (!post.text.trim() && !images.length) return null;
  const body = post.text
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((text) => `<p>${escapeText(text)}</p>`)
    .join('');
  const figures = images
    .map((image) => {
      const src = escapeText(image.url).replaceAll('"', '&quot;');
      const alt = escapeText(image.alt).replaceAll('"', '&quot;');
      return `<figure><img src="${src}" alt="${alt}"></figure>`;
    })
    .join('');
  const reading = prepareContent(body + figures, url);
  const title = post.title.trim() || post.text.slice(0, 100) || `${post.platform} post`;
  const details: SourceDetails = {
    social: { platform: post.platform, post: { ...post, title, images } },
  };
  return {
    title,
    author: post.author,
    excerpt: post.text.slice(0, 300),
    reading,
    words: post.text.trim().split(/\s+/).filter(Boolean).length,
    details,
    video: post.video,
  };
}
