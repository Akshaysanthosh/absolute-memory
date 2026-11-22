import { safeMetadataFetch } from '@/server/security/safe-fetch';
import { getConfig } from '@/server/config';
import { textReading, type TextSection } from '@/server/services/import/content';
import { cleanSourceTitle } from '@/shared/content-title';

const HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'new.reddit.com',
  'np.reddit.com',
  'm.reddit.com',
  'sh.reddit.com',
  'i.reddit.com',
]);
const UA = 'web:absolute-memory:0.1.0';

/** A Reddit post link, normalized to a path the API and oEmbed accept. Covers subreddit
 * and profile posts, comment permalinks, galleries, bare /comments/ID and redd.it/ID. */
export function redditPostPath(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === 'redd.it') {
      const id = url.pathname.match(/^\/([a-z0-9]{4,12})\/?$/i)?.[1];
      return id ? `/comments/${id.toLowerCase()}/` : null;
    }
    if (!HOSTS.has(host)) return null;
    const match = url.pathname.match(/^\/r\/[^/]+\/comments\/[a-z0-9]+(?:\/[^/]*)?\/?/i);
    if (match) return match[0].replace(/\/?$/, '/');
    const id = url.pathname.match(
      /^\/(?:(?:user|u)\/[^/]+\/)?(?:comments|gallery)\/([a-z0-9]{4,12})(?:\/|$)/i,
    )?.[1];
    return id ? `/comments/${id.toLowerCase()}/` : null;
  } catch {
    return null;
  }
}

/** The app's Share button produces /r/<sub>/s/<code>, which only Reddit can resolve. */
export function isRedditShareLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      HOSTS.has(url.hostname.toLowerCase()) &&
      /^\/(?:r\/[^/]+\/)?s\/[A-Za-z0-9]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/** Follow Reddit's own redirect from a share link to the post; null when Reddit refuses. */
export async function resolveRedditShareLink(
  value: string,
  fetcher: typeof fetch = safeMetadataFetch,
): Promise<string | null> {
  if (!isRedditShareLink(value)) return null;
  try {
    const response = await fetcher(value, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8_000),
    });
    await response.body?.cancel();
    const location = response.headers.get('location');
    return response.status >= 300 && response.status < 400 && location
      ? redditPostPath(new URL(location, value).href)
      : null;
  } catch {
    return null;
  }
}

/** "databases_in_2025" → "Databases in 2025": a readable title when Reddit refuses every request. */
export function redditSlugTitle(path: string): string {
  const slug = path.split('/').filter(Boolean)[4];
  if (!slug) return 'Reddit post';
  const text = decodeURIComponent(slug).replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Reddit post';
}

type Listing = { data?: { children?: { kind: string; data: Record<string, unknown> }[] } };
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p && p !== '[deleted]' && p !== '[removed]');

/** Turn Reddit's public JSON for a post into reader passages: the post, its link, then top comments. */
export function redditPostFromJson(json: unknown, path: string) {
  const [postListing, commentListing] = Array.isArray(json) ? (json as Listing[]) : [];
  const post = postListing?.data?.children?.find((c) => c.kind === 't3')?.data;
  if (!post) throw new Error('No post in response');
  const subreddit = str(post.subreddit_name_prefixed) || `r/${str(post.subreddit)}`;
  const title = cleanSourceTitle(str(post.title) || redditSlugTitle(path), 'reddit.com');
  const sections: TextSection[] = [];
  const add = (tag: TextSection['tag'], text: string) => sections.push({ tag, text });
  add('p', `Posted in ${subreddit} by u/${str(post.author) || 'unknown'}`);
  for (const p of paragraphs(str(post.selftext))) add('p', p);
  const link =
    str(post.url_overridden_by_dest) ||
    (str(post.url) && !str(post.url).includes('/comments/') ? str(post.url) : '');
  if (link) add('p', `Link: ${link}`);
  const comments = (commentListing?.data?.children || [])
    .filter(
      (c) =>
        c.kind === 't1' &&
        !c.data.stickied &&
        str(c.data.body) &&
        !['[deleted]', '[removed]'].includes(str(c.data.body)),
    )
    .sort((a, b) => Number(b.data.score || 0) - Number(a.data.score || 0))
    .slice(0, 8);
  if (comments.length) {
    add('h2', 'Top comments');
    for (const c of comments) {
      const body = paragraphs(str(c.data.body)).join(' ');
      if (body) add('p', `u/${str(c.data.author) || 'unknown'}: ${body.slice(0, 2000)}`);
    }
  }
  const { passages, html: readingHtml } = textReading(sections);
  const text = passages.map((passage) => passage.text).join(' ');
  const keep = [
    'title',
    'selftext',
    'author',
    'subreddit',
    'subreddit_name_prefixed',
    'created_utc',
    'score',
    'upvote_ratio',
    'num_comments',
    'link_flair_text',
    'url',
    'url_overridden_by_dest',
    'permalink',
    'post_hint',
    'is_video',
    'over_18',
    'domain',
  ];
  const raw = {
    post: Object.fromEntries(keep.filter((k) => k in post).map((k) => [k, post[k]])),
    comments: comments.map((c) => ({
      author: c.data.author,
      body: c.data.body,
      score: c.data.score,
      created_utc: c.data.created_utc,
    })),
  };
  return {
    raw: { provider: 'reddit' as const, data: raw },
    title,
    author: str(post.author) ? `u/${str(post.author)}` : null,
    domain: 'reddit.com',
    excerpt: (paragraphs(str(post.selftext))[0] || link || title).slice(0, 300),
    passages,
    readingHtml,
    words: text.split(/\s+/).filter(Boolean).length,
  };
}

let cachedToken: { value: string; expires: number } | null = null;
/** App-only OAuth token (client credentials). Reddit serves cloud servers through its API,
 * not its public pages. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to enable it. */
async function redditToken(fetcher: typeof fetch) {
  const id = getConfig().REDDIT_CLIENT_ID,
    secret = getConfig().REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const response = await fetcher('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedToken = {
    value: data.access_token,
    expires: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}
export function resetRedditToken() {
  cachedToken = null;
}

/** Reddit blocks most server requests to its pages. Order: official API (when configured),
 * public JSON, oEmbed for the title, and finally a bookmark titled from the URL. */
export async function fetchRedditPost(input: string, fetcher: typeof fetch = safeMetadataFetch) {
  const share = isRedditShareLink(input);
  const path =
    redditPostPath(input) ?? (share ? await resolveRedditShareLink(input, fetcher) : null);
  if (!path) {
    if (!share) return null;
    // Reddit refused to resolve the share link: keep it as a bookmark rather than
    // scraping the page, which Reddit blocks for servers.
    return {
      title: 'Reddit post',
      author: null,
      domain: 'reddit.com',
      excerpt: '',
      passages: [],
      readingHtml: '',
      words: 0,
      bookmarkType: 'website' as const,
    };
  }
  try {
    const token = await redditToken(fetcher);
    if (token) {
      const response = await fetcher(
        `https://oauth.reddit.com${path}.json?raw_json=1&limit=20&sort=top`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': UA,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (response.ok)
        return {
          ...redditPostFromJson(await response.json(), path),
          bookmarkType: undefined as 'website' | undefined,
        };
      if (response.status === 401) resetRedditToken();
      await response.body?.cancel();
    }
  } catch {
    /* fall through to public sources */
  }
  for (const host of ['https://www.reddit.com', 'https://old.reddit.com']) {
    try {
      const response = await fetcher(`${host}${path}.json?raw_json=1&limit=20&sort=top`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });
      if (response.ok)
        return {
          ...redditPostFromJson(await response.json(), path),
          bookmarkType: undefined as 'website' | undefined,
        };
      await response.body?.cancel();
    } catch {
      /* try the next source */
    }
  }
  let title = redditSlugTitle(path),
    author: string | null = null;
  try {
    // oEmbed needs a subreddit in the address but ignores which one, answering with the
    // post's real permalink; bare /comments/<id>/ links borrow a placeholder.
    const embedPath = path.startsWith('/comments/') ? `/r/all${path}` : path;
    const response = await fetcher(
      `https://www.reddit.com/oembed?url=${encodeURIComponent('https://www.reddit.com' + embedPath)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8_000) },
    );
    if (response.ok) {
      const data = (await response.json()) as {
        title?: string;
        author_name?: string;
        html?: string;
      };
      const permalink = redditPostPath(
        data.html?.match(/href="(https:\/\/www\.reddit\.com\/r\/[^"]+\/comments\/[^"]+)"/)?.[1] ||
          '',
      );
      if (permalink && path.startsWith('/comments/')) title = redditSlugTitle(permalink);
      if (data.title) title = cleanSourceTitle(data.title, 'reddit.com');
      if (data.author_name) author = `u/${data.author_name}`;
    } else await response.body?.cancel();
  } catch {
    /* fall back to the slug */
  }
  return {
    title,
    author,
    domain: 'reddit.com',
    excerpt: '',
    passages: [],
    readingHtml: '',
    words: 0,
    bookmarkType: 'website' as const,
  };
}
