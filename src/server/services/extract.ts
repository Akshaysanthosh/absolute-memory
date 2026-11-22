import { maximumUploadBytes } from '@/server/config';
import { imageMime } from '@/shared/image-file';
import { readProductMetadata } from '@/server/services/product-metadata';
import type { SourceDetails } from '@/shared/types';
import { parseHTML } from 'linkedom';
import {
  collectBytes,
  FetchLimitError,
  safeFetch,
  validateFetchURL,
} from '@/server/security/safe-fetch';
import { extractReading } from '@/server/services/import/article';
import type { Passage } from '@/shared/passages';
import { cleanSourceTitle } from '@/shared/content-title';
import { fetchRedditPost } from '@/server/services/reddit';
import type { RawProvider } from '@/shared/source-facts';

export class ArticleImportError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ArticleImportError';
  }
}

export function normalizeUrl(input: string) {
  const url = validateFetchURL(input);
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (key.startsWith('utm_') || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  canonicalPostUrl(url);
  return url.toString();
}
/** One address per social post, whichever share button or app produced the link, so a
 * re-shared post is recognised as already saved. Only post URLs on these hosts change. */
function canonicalPostUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const strip = (...keys: string[]) => {
    for (const key of keys) url.searchParams.delete(key);
  };
  if (['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com'].includes(host)) {
    const post = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/(?:video|photo)\/\d+)?\/?$/);
    const anonymous = url.pathname.match(/^\/i\/(?:web\/)?status\/(\d+)\/?$/);
    if (!post && !anonymous) return;
    url.hostname = 'x.com';
    url.pathname = post ? `/${post[1]}/status/${post[2]}` : `/i/status/${anonymous![1]}`;
    url.search = '';
  } else if (host === 'instagram.com') {
    const post = url.pathname.match(/^\/(?:[^/]+\/)?(p|reels?|tv)\/([\w-]+)\/?$/);
    if (!post) return;
    url.hostname = 'www.instagram.com';
    url.pathname = `/${post[1] === 'reels' ? 'reel' : post[1]}/${post[2]}/`;
    url.search = '';
  } else if (host === 'reddit.com' || host.endsWith('.reddit.com')) {
    strip('share_id', 'rdt', 'ref', 'ref_source', 'ref_campaign');
  } else if (host === 'tiktok.com') {
    strip('is_from_webapp', 'sender_device', '_r', '_t', 'web_id', 'q', 't');
  }
}
type SavedPage = {
  title: string;
  author: string | null;
  domain: string;
  sourceName?: string;
  publishedAt?: string;
  excerpt: string;
  readingHtml: string;
  passages: Passage[];
  words: number;
  images?: { slot: number; source: string }[];
  leadImage?: string | null;
  bookmarkType?: 'website' | 'product';
  details?: SourceDetails;
  tags?: string[];
  raw?: { provider: RawProvider; data: unknown };
};

export function pageMetadata(html: string) {
  const { document } = parseHTML(html);
  const meta: Record<string, string> = {};
  const tags: string[] = [];
  for (const element of document.querySelectorAll('meta[content]')) {
    const key = element.getAttribute('property') ?? element.getAttribute('name');
    const value = element.getAttribute('content')?.trim().slice(0, 2000);
    if (!key || !value) continue;
    if (key === 'article:tag') tags.push(value);
    else if (!(key in meta)) meta[key] = value;
  }
  if (meta.keywords)
    tags.push(
      ...meta.keywords
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
  const datasets: unknown[] = [];
  for (const element of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const value: unknown = JSON.parse(element.textContent ?? '');
      if (Array.isArray(value)) datasets.push(...value);
      else datasets.push(value);
    } catch {
      // Malformed optional metadata does not prevent reading.
    }
  }
  const jsonLd =
    datasets.find(
      (value) =>
        value &&
        typeof value === 'object' &&
        '@type' in value &&
        typeof value['@type'] === 'string' &&
        value['@type'].endsWith('Article'),
    ) ?? datasets[0];
  return {
    meta,
    tags: [...new Set(tags)].slice(0, 20),
    jsonLd,
    lang: document.documentElement.getAttribute('lang') ?? undefined,
  };
}

export function extractSavedPage(html: string, url: string): SavedPage {
  const article = extractReading(html, url);
  const domain = new URL(url).hostname.replace(/^www\./, '');
  const raw = pageMetadata(html);
  const product = raw.meta['og:type'] === 'article' ? null : readProductMetadata(html, url);
  if (product) {
    const { brand, retailer, color, price } = product;
    return {
      title: product.title,
      author: null,
      domain,
      excerpt: product.excerpt,
      readingHtml: '',
      passages: [],
      words: 0,
      bookmarkType: 'product',
      details: { thumbnailUrl: product.image, product: { brand, retailer, color, price } },
      tags: [...new Set([...raw.tags, ...product.tags.filter(Boolean)])],
      raw: { provider: 'article', data: raw },
    };
  }
  const content = article.passages
    .map((passage) => passage.text)
    .join(' ')
    .trim();
  return {
    title: cleanSourceTitle(article.title, domain),
    author: article.byline ?? null,
    domain,
    sourceName: article.siteName,
    publishedAt: article.publishedAt,
    excerpt: (article.description || content).slice(0, 300),
    readingHtml: article.html,
    passages: article.passages,
    images: article.images,
    leadImage: article.leadImage,
    words: content ? content.split(/\s+/u).length : 0,
    bookmarkType: article.readable ? undefined : 'website',
    tags: raw.tags,
    raw: { provider: 'article', data: raw },
  };
}

export type ImportedImage = {
  data: Uint8Array;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  name: string;
};
export type ImportedPdf = { data: Uint8Array; name: string };
export type ImportedPage = SavedPage & { image?: ImportedImage; pdf?: ImportedPdf };
export async function fetchArticle(input: string): Promise<ImportedPage> {
  const target = normalizeUrl(input);
  const reddit = await fetchRedditPost(target);
  if (reddit) return reddit;
  const limit = maximumUploadBytes();
  return safeFetch(
    target,
    {
      maxBytes: (response) =>
        /^(image\/|application\/pdf|(?:application|binary)\/octet-stream)/i.test(
          response.headers.get('content-type') || '',
        ) || !response.headers.has('content-type')
          ? limit
          : 6_000_000,
      accept: 'text/html,application/xhtml+xml,application/pdf,image/png,image/jpeg,image/webp',
    },
    async (response, finalURL, body) => {
      const url = finalURL.href;
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401)
          throw new ArticleImportError(
            'This site requires sign-in (HTTP 401). Open the source and sign in. If you can read the article, save it from Chrome.',
          );
        if (response.status === 403)
          throw new ArticleImportError(
            `This site blocked article retrieval (HTTP ${response.status}). If you can read it in Chrome, save it with the loaded-page capture extension, or copy permitted text into a note.`,
          );
        if (response.status === 404 || response.status === 410)
          throw new ArticleImportError(
            'That page was not found or is no longer available. Check the link.',
          );
        throw new ArticleImportError(
          `The site returned HTTP ${response.status}. Try again or save the text as a note.`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const isImage = ['image/png', 'image/jpeg', 'image/webp'].includes(mime);
      // PDF links (arXiv, papers, reports) are read like uploaded PDFs.
      const isPdf =
        mime === 'application/pdf' ||
        (['application/octet-stream', 'binary/octet-stream', ''].includes(mime) &&
          /\.pdf$/i.test(new URL(url).pathname));
      if (!isImage && !isPdf && !['text/html', 'application/xhtml+xml'].includes(mime)) {
        throw new ArticleImportError(
          'This link is not a supported webpage, PDF or image. Upload Excel files using Add content.',
        );
      }
      const chunks = await collectBytes(body).catch((error) => {
        if (!(error instanceof FetchLimitError)) throw error;
        const megabytes = limit / 1024 / 1024;
        throw new ArticleImportError(
          isImage
            ? `Images must be ${megabytes} MB or smaller.`
            : isPdf
              ? `PDFs must be ${megabytes} MB or smaller. Download it and upload a smaller section.`
              : 'This page is too large to import (6 MB limit).',
        );
      });
      if (isImage) {
        const data = chunks,
          verified = imageMime(data);
        if (!verified || verified !== mime)
          throw new ArticleImportError(
            'This image file is invalid or does not match its declared format.',
          );
        let name = new URL(url).pathname.split('/').pop() || 'Saved image';
        try {
          name = decodeURIComponent(name);
        } catch {
          /* Keep encoded source name. */
        }
        name = name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255) || 'Saved image';
        return {
          title: name.replace(/\.(png|jpe?g|webp)$/i, ''),
          author: null,
          domain: new URL(url).hostname.replace(/^www\./, ''),
          excerpt: '',
          passages: [],
          readingHtml: '',
          words: 0,
          image: { data, mime: verified, name },
        };
      }
      if (isPdf) {
        const data = new Uint8Array(chunks);
        if (Buffer.from(data.subarray(0, 5)).toString() !== '%PDF-')
          throw new ArticleImportError('This link did not return a valid PDF.');
        const parsed = new URL(url);
        let name = parsed.pathname.split('/').filter(Boolean).pop() || 'Document';
        try {
          name = decodeURIComponent(name);
        } catch {
          /* Keep encoded source name. */
        }
        name = name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 250) || 'Document';
        if (!/\.pdf$/i.test(name)) name += '.pdf';
        return {
          title: name.replace(/\.pdf$/i, ''),
          author: null,
          domain: parsed.hostname.replace(/^www\./, ''),
          excerpt: '',
          passages: [],
          readingHtml: '',
          words: 0,
          pdf: { data, name },
        };
      }
      return extractSavedPage(chunks.toString('utf8'), url);
    },
  );
}
