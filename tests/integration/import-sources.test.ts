import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchRedditPost,
  isRedditShareLink,
  redditPostPath,
  resolveRedditShareLink,
} from '../../src/server/services/reddit';
import { extractSavedPage, normalizeUrl } from '../../src/server/services/extract';
import { socialVideoPlatform } from '../../src/shared/media/social';

const refuse = (async () => new Response('blocked', { status: 403 })) as typeof fetch;

test('every Reddit post link shape reaches the Reddit reader', () => {
  for (const [url, path] of [
    [
      'https://www.reddit.com/r/programming/comments/1q5is3q/databases_in_2025/',
      '/r/programming/comments/1q5is3q/databases_in_2025/',
    ],
    [
      'https://sh.reddit.com/r/programming/comments/1q5is3q/x/',
      '/r/programming/comments/1q5is3q/x/',
    ],
    ['https://redd.it/1q5is3q', '/comments/1q5is3q/'],
    ['https://www.reddit.com/comments/1Q5IS3Q', '/comments/1q5is3q/'],
    ['https://www.reddit.com/gallery/1q5is3q', '/comments/1q5is3q/'],
    ['https://www.reddit.com/user/someone/comments/1q5is3q/title/', '/comments/1q5is3q/'],
    ['https://www.reddit.com/u/someone/comments/1q5is3q/', '/comments/1q5is3q/'],
  ])
    assert.equal(redditPostPath(url), path, url);
  for (const url of [
    'https://www.reddit.com/r/programming/',
    'https://redd.it/',
    'https://www.reddit.com/user/someone/',
    'https://redd.it.evil.test/1q5is3q',
    'https://www.reddit.com/r/programming/s/AbC123',
  ])
    assert.equal(redditPostPath(url), null, url);
  assert.ok(isRedditShareLink('https://www.reddit.com/r/programming/s/AbC123'));
  assert.ok(!isRedditShareLink('https://www.reddit.com/r/programming/comments/1q5is3q/'));
});

test("a Reddit share link resolves through Reddit's own redirect", async () => {
  const seen: RequestInit[] = [];
  const redirect = (async (_url: string | URL, init?: RequestInit) => {
    seen.push(init!);
    return new Response(null, {
      status: 301,
      headers: {
        location:
          'https://www.reddit.com/r/programming/comments/1q5is3q/databases_in_2025/?share_id=x',
      },
    });
  }) as typeof fetch;
  assert.equal(
    await resolveRedditShareLink('https://www.reddit.com/r/programming/s/AbC123', redirect),
    '/r/programming/comments/1q5is3q/databases_in_2025/',
  );
  assert.equal(seen[0].redirect, 'manual');
  // A share link that leads anywhere but a post (or is refused) is not a post.
  const toSubreddit = (async () =>
    new Response(null, {
      status: 307,
      headers: { location: 'https://www.reddit.com/r/programming/' },
    })) as typeof fetch;
  assert.equal(
    await resolveRedditShareLink('https://www.reddit.com/r/programming/s/AbC123', toSubreddit),
    null,
  );
  const post = await fetchRedditPost('https://www.reddit.com/r/programming/s/AbC123', refuse);
  assert.deepEqual([post?.title, post?.bookmarkType], ['Reddit post', 'website']);
});

test('a bare Reddit post id gets its title from oEmbed', async () => {
  const asked: string[] = [];
  const fetcher = (async (url: string | URL) => {
    const href = String(url);
    if (!href.startsWith('https://www.reddit.com/oembed'))
      return new Response('blocked', { status: 403 });
    asked.push(new URL(href).searchParams.get('url')!);
    return Response.json({
      title: 'Databases in 2025',
      author_name: 'pavlo',
      html: '<blockquote><a href="https://www.reddit.com/r/programming/comments/1q5is3q/databases_in_2025/">x</a></blockquote>',
    });
  }) as typeof fetch;
  const post = await fetchRedditPost('https://redd.it/1q5is3q', fetcher);
  assert.deepEqual(
    [post?.title, post?.author, post?.bookmarkType],
    ['Databases in 2025', 'u/pavlo', 'website'],
  );
  assert.deepEqual(
    asked,
    ['https://www.reddit.com/r/all/comments/1q5is3q/'],
    'oEmbed needs a subreddit segment',
  );
});

test('X and Instagram post links are recognised in every shared form', () => {
  for (const url of [
    'https://x.com/a/status/20/photo/1',
    'https://mobile.x.com/a/status/20',
    'https://x.com/i/web/status/20',
    'https://twitter.com/i/status/20',
  ])
    assert.equal(socialVideoPlatform(url), 'X', url);
  for (const url of [
    'https://x.com/a',
    'https://x.com/a/status/20/likes',
    'https://x.com/i/web/status/abc',
    'https://www.instagram.com/stories/nasa/1/',
  ])
    assert.equal(socialVideoPlatform(url), null, url);
});

test('a re-shared post keeps one address, so it is not saved twice', () => {
  for (const [input, canonical] of [
    ['https://twitter.com/jack/status/20?s=46&t=abc', 'https://x.com/jack/status/20'],
    ['https://mobile.x.com/jack/status/20/photo/1', 'https://x.com/jack/status/20'],
    ['https://x.com/i/web/status/20', 'https://x.com/i/status/20'],
    [
      'https://instagram.com/nasa/reels/C0abcDEF123/?igsh=MWx0',
      'https://www.instagram.com/reel/C0abcDEF123/',
    ],
    [
      'https://www.instagram.com/p/C0abcDEF123?img_index=2',
      'https://www.instagram.com/p/C0abcDEF123/',
    ],
    [
      'https://www.reddit.com/r/a/comments/1q5is3q/t/?share_id=XYZ&utm_source=share&context=3',
      'https://www.reddit.com/r/a/comments/1q5is3q/t/?context=3',
    ],
    [
      'https://www.tiktok.com/@a/video/123?is_from_webapp=1&sender_device=pc',
      'https://www.tiktok.com/@a/video/123',
    ],
  ])
    assert.equal(normalizeUrl(input), canonical, input);
  // Profiles, other paths and other sites keep their query strings.
  for (const url of [
    'https://x.com/jack?s=20',
    'https://www.instagram.com/nasa/?hl=en',
    'https://example.com/a?s=1&t=2',
  ])
    assert.equal(normalizeUrl(url), url);
});

const page = (title: string, description: string, site: string) =>
  `<html><head><title>${title}</title><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:site_name" content="${site}"><meta property="og:type" content="article"></head><body><div id="root"></div></body></html>`;

test('metadata-only social pages retain source information as bookmarks', () => {
  const description = 'Shipped the new parser today.';
  const bsky = extractSavedPage(
    page('Ada (@ada.bsky.social)', description, 'Bluesky Social'),
    'https://bsky.app/profile/ada.bsky.social/post/3l6oveex3ii2l',
  );
  assert.equal(bsky.title, 'Ada (@ada.bsky.social)');
  assert.equal(bsky.excerpt, description);
  assert.equal(bsky.sourceName, 'Bluesky Social');
  assert.equal(bsky.bookmarkType, 'website');
  assert.deepEqual(bsky.passages, []);
  const toot = extractSavedPage(
    page('Eugen (@Gargron@mastodon.social)', 'Hello world', 'Mastodon'),
    'https://mastodon.social/@Gargron/1',
  );
  assert.deepEqual([toot.excerpt, toot.sourceName, toot.words], ['Hello world', 'Mastodon', 0]);
});

test('a sign-in wall with metadata is retained as an unreadable link', () => {
  const item = extractSavedPage(
    page('Sign in | LinkedIn', 'Join to see more.', 'LinkedIn'),
    'https://www.linkedin.com/posts/x',
  );
  assert.equal(item.bookmarkType, 'website');
  assert.deepEqual(item.passages, []);
  assert.equal(item.excerpt, 'Join to see more.');
});

test('profile, story and timeline links on X and Instagram are refused with a clear reason', async () => {
  const { createDatabase } = await import('../../src/server/db');
  const { capture } = await import('../../src/server/services/library');
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(`INSERT INTO "user"(id,name,email) VALUES('src-a','S','src-a@example.invalid')`);
    for (const [url, reason] of [
      ['https://x.com/jack', /\/status\//],
      ['https://www.instagram.com/stories/nasa/3200000000000000000/', /stories/],
      ['https://www.instagram.com/nasa/', /post or reel/],
    ] as const)
      await assert.rejects(
        capture('src-a', { kind: 'article', url }, 'web', db),
        (e: Error & { status?: number }) => e.status === 422 && reason.test(e.message),
        url,
      );
    const saved = await capture(
      'src-a',
      { kind: 'article', url: 'https://twitter.com/jack/status/20?s=46' },
      'web',
      db,
    );
    const again = await capture(
      'src-a',
      { kind: 'article', url: 'https://x.com/jack/status/20/photo/1' },
      'web',
      db,
    );
    assert.equal(again.item.id, saved.item.id);
    assert.equal(again.duplicate, true);
  } finally {
    await db.close();
  }
});

test('an arXiv abstract link is named from the arXiv API, not the page', async () => {
  const { createDatabase } = await import('../../src/server/db');
  const { capture } = await import('../../src/server/services/library');
  const { processNext } = await import('../../src/server/jobs/worker');
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  const { fetchArxivPaper } = await import('../../src/server/services/arxiv');
  const fixture: typeof fetch = async (url) => {
    assert.match(String(url), /^https:\/\/export\.arxiv\.org\/api\/query\?id_list=1706\.03762/);
    return new Response(
      '<feed><entry><title>Attention Is All You Need</title><summary>The dominant sequence transduction models are based on recurrent networks.</summary><published>2017-06-12T17:57:34Z</published><author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author></entry></feed>',
    );
  };
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('arxiv-a','A','arxiv-a@example.invalid')`,
    );
    const saved = await capture(
      'arxiv-a',
      { kind: 'article', url: 'https://arxiv.org/abs/1706.03762' },
      'web',
      db,
    );
    // What the page parser produces for an abstract page.
    const extract = async () => ({
      title: 'Attention Is All You Need',
      author: '[Submitted on 12 Jun 2017 (v1)]',
      domain: 'arxiv.org',
      excerpt: 'View PDF HTML (experimental) Abstract:The dominant…',
      blocks: [
        {
          id: 'b0',
          type: 'paragraph',
          text: 'View PDF HTML (experimental) Abstract:The dominant…',
        },
      ],
      words: 6,
    });
    await processNext(db, extract as never, 'arxiv-a', (id) => fetchArxivPaper(id, fixture));
    const item = (
      await db.query<{
        status: string;
        title: string;
        author: string;
        excerpt: string;
        passages: { text: string }[];
      }>('SELECT status,title,author,excerpt,passages FROM item WHERE id=$1', [saved.item.id])
    ).rows[0];
    assert.equal(item.status, 'ready');
    assert.equal(item.author, 'Ashish Vaswani, Noam Shazeer');
    assert.match(item.excerpt, /^The dominant sequence/);
    assert.deepEqual(
      item.passages.map((b) => b.text),
      ['The dominant sequence transduction models are based on recurrent networks.'],
    );
  } finally {
    await db.close();
  }
});
