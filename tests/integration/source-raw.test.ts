import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSource, capRaw, hashtagsFrom } from '../../src/server/services/source-raw';
import { pageMetadata } from '../../src/server/services/extract';
import { parseFeed } from '../../src/server/services/media/podcast';

const at = '2026-11-18T00:00:00.000Z';

test('Reddit, article, extension and podcast sources normalise', () => {
  const reddit = normalizeSource(
    'reddit',
    {
      post: {
        selftext: 'Body',
        author: 'pavlo',
        subreddit: 'programming',
        created_utc: 1767225600,
        score: 812,
        num_comments: 140,
        link_flair_text: 'Databases',
      },
    },
    at,
  );
  assert.equal(reddit.authorHandle, 'u/pavlo');
  assert.equal(reddit.community, 'r/programming');
  assert.equal(reddit.postedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(reddit.stats, { score: 812, comments: 140, capturedAt: at });
  assert.deepEqual(reddit.hashtags, ['databases']);
  const article = normalizeSource(
    'article',
    {
      meta: {
        'og:site_name': 'CMU',
        'article:published_time': '2026-01-04',
        'og:description': 'A review',
      },
      tags: ['PostgreSQL', 'Databases'],
      lang: 'en',
    },
    at,
  );
  assert.equal(article.siteName, 'CMU');
  assert.equal(article.postedAt, '2026-01-04T00:00:00.000Z');
  assert.deepEqual(article.hashtags, ['postgresql', 'databases']);
  assert.equal(article.language, 'en');
  const ext = normalizeSource(
    'extension',
    { text: 'Ship it #buildinpublic', author: 'Ash', video: false, images: [{ url: 'x' }] },
    at,
  );
  assert.equal(ext.mediaType, 'image');
  assert.deepEqual(ext.hashtags, ['buildinpublic']);
  const pod = normalizeSource(
    'podcast',
    {
      description: 'Notes',
      author: 'NPR',
      publishedAt: 'Tue, 18 Nov 2026 10:00:00 GMT',
      duration: 751,
    },
    at,
  );
  assert.equal(pod.postedAt, '2026-11-18T10:00:00.000Z');
  assert.equal(pod.duration, 751);
});

test('raw copies are capped at 64 KB', () => {
  const big = {
    description: 'x'.repeat(200_000),
    comments: Array.from({ length: 500 }, (_, i) => ({ body: 'y'.repeat(2000), i })),
  };
  const capped = capRaw(big);
  assert.ok(Buffer.byteLength(JSON.stringify(capped)) <= 65_536);
  assert.ok(typeof (capped as { description: string }).description === 'string');
  assert.deepEqual(hashtagsFrom(['AI', 'ai', '#rust'], 'see #Go and #go'), ['ai', 'rust', 'go']);
});

test('page metadata and podcast show notes are captured', () => {
  const meta = pageMetadata(
    '<html lang="en"><head><meta property="og:site_name" content="CMU"><meta property="article:published_time" content="2026-01-04"><meta property="article:tag" content="PostgreSQL"><script type="application/ld+json">{"@type":"BlogPosting","datePublished":"2026-01-04","author":{"name":"Andy"},"keywords":"databases, review"}</script></head><body></body></html>',
  );
  assert.equal(meta.meta['og:site_name'], 'CMU');
  assert.deepEqual(meta.tags, ['PostgreSQL']);
  assert.equal(meta.lang, 'en');
  assert.equal((meta.jsonLd as { datePublished: string }).datePublished, '2026-01-04');
  const [episode] = parseFeed(
    '<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Up First</title><item><title>Ep</title><pubDate>Tue, 18 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Today &amp;amp; more&lt;/p&gt;</description><link>https://npr.org/ep</link><enclosure url="https://example.com/a.mp3"/></item></channel></rss>',
    'https://example.com/feed',
  );
  assert.equal(episode.publishedAt, '2026-11-18T10:00:00.000Z');
  assert.equal(episode.description, 'Today & more');
  assert.equal(episode.link, 'https://npr.org/ep');
});
