import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  redditPostPath,
  redditSlugTitle,
  redditPostFromJson,
  fetchRedditPost,
} from '../../src/server/services/reddit';

const sample = [
  {
    data: {
      children: [
        {
          kind: 't3',
          data: {
            title: 'Databases in 2025',
            subreddit: 'programming',
            subreddit_name_prefixed: 'r/programming',
            author: 'pavlo',
            selftext: '',
            url: 'https://www.cs.cmu.edu/~pavlo/blog/x.html',
            url_overridden_by_dest: 'https://www.cs.cmu.edu/~pavlo/blog/x.html',
          },
        },
      ],
    },
  },
  {
    data: {
      children: [
        { kind: 't1', data: { author: 'a', body: 'Great write-up.', score: 5 } },
        { kind: 't1', data: { author: 'b', body: '[deleted]', score: 50 } },
        { kind: 't1', data: { author: 'mod', body: 'Rules', score: 99, stickied: true } },
        { kind: 't1', data: { author: 'c', body: 'Postgres keeps winning.\n\nAgain.', score: 20 } },
      ],
    },
  },
];

import { configureTemporaryStorage } from '../fixtures/storage';
configureTemporaryStorage();

test('reddit post links are recognised and normalised', () => {
  assert.equal(
    redditPostPath(
      'https://www.reddit.com/r/programming/comments/1q5is3q/databases_in_2025/?utm=x',
    ),
    '/r/programming/comments/1q5is3q/databases_in_2025/',
  );
  assert.equal(
    redditPostPath('https://old.reddit.com/r/programming/comments/1q5is3q'),
    '/r/programming/comments/1q5is3q/',
  );
  assert.equal(redditPostPath('https://www.reddit.com/r/programming/'), null);
  assert.equal(redditPostPath('https://example.com/r/x/comments/abc/'), null);
  assert.equal(
    redditSlugTitle('/r/programming/comments/1q5is3q/databases_in_2025/'),
    'Databases in 2025',
  );
});

test('reddit JSON becomes post text, link and top comments', () => {
  const post = redditPostFromJson(sample, '/r/programming/comments/1q5is3q/databases_in_2025/');
  assert.equal(post.title, 'Databases in 2025');
  assert.equal(post.author, 'u/pavlo');
  const texts = post.passages.map((b) => b.text);
  assert.deepEqual(texts, [
    'Posted in r/programming by u/pavlo',
    'Link: https://www.cs.cmu.edu/~pavlo/blog/x.html',
    'Top comments',
    'u/c: Postgres keeps winning. Again.',
    'u/a: Great write-up.',
  ]);
  assert.ok(post.words > 5);
});

test('reddit falls back to a titled bookmark when every endpoint refuses', async () => {
  const refuse = (async () => new Response('blocked', { status: 403 })) as typeof fetch;
  const post = await fetchRedditPost(
    'https://www.reddit.com/r/programming/comments/1q5is3q/databases_in_2025/',
    refuse,
  );
  assert.equal(post?.title, 'Databases in 2025');
  assert.equal(post?.bookmarkType, 'website');
});

const TINY_PDF =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA3MCA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDcyIDcyMCBUZCAoQXR0ZW50aW9uIGlzIHdoYXQgeW91IG5lZWQgZm9yIHRlc3RpbmcuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago2IDAgb2JqCjw8IC9UaXRsZSAoQXR0ZW50aW9uIFRlc3QgUGFwZXIpID4+CmVuZG9iagp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDM2MSAwMDAwMCBuIAowMDAwMDAwNDMxIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNyAvUm9vdCAxIDAgUiAvSW5mbyA2IDAgUiA+PgpzdGFydHhyZWYKNDgyCiUlRU9GCg==';

test('a PDF link is stored as a readable PDF item', async () => {
  const { createDatabase } = await import('../../src/server/db');
  const { capture } = await import('../../src/server/services/library');
  const { processNext } = await import('../../src/server/jobs/worker');
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(`INSERT INTO "user"(id,name,email) VALUES('pdf-a','P','pdf-a@example.invalid')`);
    // Not an arXiv link: the arXiv lookup is a live network call and would replace the PDF's own title.
    const saved = await capture(
      'pdf-a',
      { kind: 'article', url: 'https://papers.example.org/attention.pdf' },
      'web',
      db,
    );
    const data = new Uint8Array(Buffer.from(TINY_PDF, 'base64'));
    const extract = async () => ({
      title: 'attention',
      author: null,
      domain: 'papers.example.org',
      excerpt: '',
      passages: [],
      readingHtml: '',
      words: 0,
      pdf: { data, name: 'attention.pdf' },
    });
    await processNext(db, extract as never, 'pdf-a');
    const item = (
      await db.query<{
        kind: string;
        status: string;
        title: string;
        words: number;
        error: string | null;
      }>('SELECT kind,status,title,words,error FROM item WHERE id=$1', [saved.item.id])
    ).rows[0];
    assert.equal(item.error, null);
    assert.equal(item.status, 'ready');
    assert.equal(item.kind, 'pdf');
    assert.equal(item.title, 'Attention Test Paper');
    assert.ok(item.words >= 6);
    const file = (
      await db.query<{ mime: string; pages: number }>(
        'SELECT mime,pages FROM source_file WHERE item_id=$1',
        [saved.item.id],
      )
    ).rows[0];
    assert.deepEqual([file.mime, file.pages], ['application/pdf', 1]);
  } finally {
    await db.close();
  }
});

test('reddit uses the official API when credentials are configured', async () => {
  const { resetRedditToken } = await import('../../src/server/services/reddit');
  process.env.REDDIT_CLIENT_ID = 'id';
  process.env.REDDIT_CLIENT_SECRET = 'secret';
  resetRedditToken();
  const calls: string[] = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url).endsWith('/api/v1/access_token')) {
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
        status: 200,
      });
    }
    if (String(url).startsWith('https://oauth.reddit.com/')) {
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer tok');
      return new Response(JSON.stringify(sample), { status: 200 });
    }
    return new Response('blocked', { status: 403 });
  }) as typeof fetch;
  try {
    const post = await fetchRedditPost(
      'https://www.reddit.com/r/programming/comments/1q5is3q/databases_in_2025/',
      fetcher,
    );
    assert.equal(post?.title, 'Databases in 2025');
    assert.ok(post && post.words > 5);
    assert.equal(
      calls.filter((c) => c.includes('www.reddit.com/r/')).length,
      0,
      'public endpoints not needed',
    );
  } finally {
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
    resetRedditToken();
  }
});

test('arXiv links resolve to paper details', async () => {
  const { arxivId, parseArxivFeed } = await import('../../src/server/services/arxiv');
  assert.equal(arxivId('https://arxiv.org/pdf/1706.03762'), '1706.03762');
  assert.equal(arxivId('https://arxiv.org/pdf/1706.03762v7.pdf'), '1706.03762');
  assert.equal(arxivId('https://arxiv.org/abs/2401.00001'), '2401.00001');
  assert.equal(arxivId('https://example.com/pdf/1706.03762'), null);
  const paper = parseArxivFeed(
    '<feed><entry><title>Attention Is All\n You Need</title><summary> The dominant models… </summary><published>2017-06-12T17:57:34Z</published><author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author><category term="cs.CL"/></entry></feed>',
  );
  assert.equal(paper?.title, 'Attention Is All You Need');
  assert.deepEqual(paper?.authors, ['Ashish Vaswani', 'Noam Shazeer']);
  assert.equal(paper?.published, '2017-06-12T17:57:34Z');
});
