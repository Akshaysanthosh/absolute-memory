import { safeMetadataFetch } from '@/server/security/safe-fetch';
import { parseHTML } from 'linkedom';
import type { RawProvider } from '@/shared/source-facts';

/** "1706.03762" from arxiv.org/pdf/1706.03762(v7)(.pdf) or /abs/… links. */
export function arxivId(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/(^|\.)arxiv\.org$/i.test(url.hostname)) return null;
    const match = url.pathname.match(
      /^\/(?:pdf|abs)\/([a-z-]*\/?\d{4}\.\d{4,5}|[a-z-]+\/\d{7})(v\d+)?(?:\.pdf)?\/?$/i,
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export type ArxivPaper = {
  title: string;
  authors: string[];
  abstract: string;
  published?: string;
  categories: string[];
};

/** Parse the Atom response of export.arxiv.org/api/query. */
export function parseArxivFeed(xml: string): ArxivPaper | null {
  const { document } = parseHTML(xml);
  const entry = document.querySelector('entry');
  const text = (el: Element | null | undefined) =>
    (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const title = text(entry?.querySelector('title'));
  if (!entry || !title || /^error$/i.test(title)) return null;
  return {
    title,
    authors: Array.from(entry.querySelectorAll('author > name'))
      .map((el) => text(el))
      .filter(Boolean)
      .slice(0, 50),
    abstract: text(entry.querySelector('summary')).slice(0, 6000),
    published: text(entry.querySelector('published')) || undefined,
    categories: Array.from(entry.querySelectorAll('category'))
      .map((el) => el.getAttribute('term') || '')
      .filter(Boolean)
      .slice(0, 10),
  };
}

/** Name an imported page after its paper: title, first authors, abstract as excerpt, and the
 * arXiv record as the raw source. */
export function applyArxivPaper(
  article: {
    title: string;
    author?: string | null;
    excerpt: string;
    raw?: { provider: RawProvider; data: unknown };
  },
  id: string,
  paper: ArxivPaper,
) {
  article.title = paper.title.slice(0, 300);
  article.author =
    paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '') || null;
  if (paper.abstract) article.excerpt = paper.abstract.slice(0, 300);
  article.raw = {
    provider: 'article',
    data: {
      meta: {
        'og:title': paper.title,
        'og:description': paper.abstract,
        'og:site_name': 'arXiv',
        author: paper.authors.join(', '),
        'article:published_time': paper.published,
      },
      tags: [],
      arxiv: { id, ...paper },
    },
  };
}

/** Paper details from arXiv's public API; null when unavailable (the PDF still imports). */
export async function fetchArxivPaper(
  id: string,
  fetcher: typeof fetch = safeMetadataFetch,
): Promise<ArxivPaper | null> {
  try {
    const response = await fetcher(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`,
      {
        headers: { 'User-Agent': 'AbsoluteMemory/0.1.0 (paper metadata)' },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    return parseArxivFeed(await response.text());
  } catch {
    return null;
  }
}
