import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { prepareContent, webURL } from './content';

export function extractReading(html: string, address: string) {
  const dom = new JSDOM(html, { url: address });
  try {
    const { document } = dom.window;
    const metadata = (...names: string[]) => {
      for (const name of names) {
        const content = document
          .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
          ?.getAttribute('content')
          ?.trim();
        if (content) return content;
      }
      return undefined;
    };
    const fallback = {
      title:
        metadata('og:title', 'twitter:title') || document.title.trim() || new URL(address).hostname,
      byline: metadata('author', 'article:author'),
      siteName: metadata('og:site_name', 'application-name'),
      publishedAt: metadata('article:published_time', 'datePublished'),
      description: metadata('description', 'og:description', 'twitter:description'),
      leadImage: webURL(metadata('og:image', 'twitter:image') ?? null, address),
    };
    let article: ReturnType<Readability['parse']> = null;
    try {
      article = new Readability(document, { keepClasses: false }).parse();
    } catch {
      // The metadata captured before extraction remains usable for a bookmark.
    }
    const result = prepareContent(article?.content ?? '', address);
    const readable = result.passages.length > 0;
    return {
      ...fallback,
      title: article?.title?.trim() || fallback.title,
      byline: article?.byline || fallback.byline,
      siteName: article?.siteName || fallback.siteName,
      publishedAt: article?.publishedTime || fallback.publishedAt,
      description: article?.excerpt || fallback.description,
      html: readable ? result.html : '',
      passages: readable ? result.passages : [],
      images: readable ? result.images : [],
      readable,
    };
  } finally {
    dom.window.close();
  }
}
