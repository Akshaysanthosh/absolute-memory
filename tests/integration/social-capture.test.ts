import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
// Exercise the shipped JS exactly as Chrome injects it, without tsx naming helpers.
const captureCode = readFileSync(
  new URL('../../extension/page-capture.mjs', import.meta.url),
  'utf8',
).split('export function captureSocialPost()')[1];
const captureScript = `(function captureSocialPost()${captureCode})()`;
import { createDatabase } from '../../src/server/db';
import { capture, ownItem, captureSchema } from '../../src/server/services/library';
import { processNext } from '../../src/server/jobs/worker';

const fixtures = [
  [
    'https://x.com/creator/status/1234',
    'X',
    '<article data-testid="tweet"><a href="/creator/status/1234">Source</a><div data-testid="tweetText">Post words</div><div data-testid="User-Name">Creator</div>IMAGE</article>',
  ],
  [
    'https://instagram.com/p/ABC/',
    'Instagram',
    '<article><a href="/p/ABC/">Source</a><h1>Post words</h1>IMAGE</article>',
  ],
  [
    'https://facebook.com/creator/posts/1234',
    'Facebook',
    '<div role="article"><a href="/creator/posts/1234">Source</a><div data-ad-preview="message">Post words</div>IMAGE</div>',
  ],
  [
    'https://reddit.com/r/test/comments/abc/post/',
    'Reddit',
    '<shreddit-post post-id="t3_abc" author="Creator"><div slot="text-body">Post words</div><shreddit-comment>Private reply marker</shreddit-comment>IMAGE</shreddit-post>',
  ],
  [
    'https://pinterest.com/pin/1234/',
    'Pinterest',
    '<div data-test-id="pin-closeup"><div data-test-id="pin-description">Post words</div>IMAGE</div>',
  ],
  [
    'https://tiktok.com/@creator/video/1234',
    'TikTok',
    '<div data-e2e="browse-video"><div data-e2e="browse-video-desc">Post words</div><video></video>IMAGE</div>',
  ],
];
for (const [url, platform, markup] of fixtures)
  test(`isolated ${platform} capture keeps post and image, excludes unrelated page content`, () => {
    const dom = new JSDOM(
      `<title>Public post</title><aside>Private messages marker</aside>${markup.replace('IMAGE', '<img src="https://images.example/post.jpg" alt="Post image" width="500"><img src="https://images.example/avatar.jpg" alt="Profile picture"><form><input value="secret"></form>')}`,
      { url },
    );
    try {
      const result = runInNewContext(captureScript, { document: dom.window.document, URL });
      assert.equal(result.social.platform, platform);
      assert.equal(result.social.text, 'Post words');
      assert.equal(result.social.images.length, 1);
      assert.equal(result.social.images[0].url, 'https://images.example/post.jpg');
      assert.doesNotMatch(JSON.stringify(result), /Private|secret|avatar/);
    } finally {
      dom.window.close();
    }
  });
test('social feed/profile and ambiguous unrelated cards are not captured', () => {
  for (const url of [
    'https://x.com/home',
    'https://instagram.com/creator',
    'https://facebook.com/messages/',
    'https://pinterest.com/creator/',
  ]) {
    const dom = new JSDOM('<article>Private personalized feed</article>', { url });
    assert.equal(runInNewContext(captureScript, { document: dom.window.document, URL }), null);
    dom.window.close();
  }
});
test('social snapshot survives unavailable transcripts; photo posts are ready immediately; ownership stays isolated', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('post-a','A','post-a@test.invalid'),('post-b','B','post-b@test.invalid')`,
    );
    const post = {
      platform: 'Instagram' as const,
      title: 'Useful post',
      author: 'Creator',
      text: 'The useful original caption.',
      images: [{ url: 'https://images.example/post.jpg', alt: 'Photo' }],
      video: true,
    };
    const noOrigin = async () => {
      throw Error('No origin fetch');
    };
    const saved = await capture(
      'post-a',
      captureSchema.parse({
        kind: 'article',
        url: 'https://instagram.com/reel/POST/',
        captured: { social: post },
      }),
      'extension',
      db,
    );
    let item = await ownItem('post-a', saved.item.id, db);
    assert.equal(item.title, 'Useful post');
    assert.equal(item.passages[0].text, post.text);
    assert.equal(item.status, 'pending');
    await assert.rejects(ownItem('post-b', item.id, db), /not found/);
    await processNext(db, noOrigin, 'post-a');
    item = await ownItem('post-a', item.id, db);
    assert.equal(item.status, 'ready');
    assert.equal(item.title, 'Useful post');
    assert.equal(item.source_details?.social?.post?.images[0].url, post.images[0].url);
    assert.equal(item.source_details?.social?.transcriptUnavailable, true);
    const refreshed = await capture(
      'post-a',
      {
        kind: 'article',
        url: 'https://instagram.com/reel/POST/',
        captured: { social: { ...post, title: 'Correct title', text: 'Correct caption' } },
      },
      'extension',
      db,
    );
    assert.equal(refreshed.item.id, item.id);
    assert.equal(refreshed.item.title, 'Correct title');
    assert.equal(refreshed.item.passages[0].text, 'Correct caption');
    assert.equal(refreshed.item.source_details?.social?.transcriptUnavailable, true);
    const photo = await capture(
      'post-a',
      {
        kind: 'article',
        url: 'https://instagram.com/p/PHOTO/',
        captured: { social: { ...post, video: false } },
      },
      'extension',
      db,
    );
    assert.equal(photo.item.status, 'ready');
    assert.equal(
      (await db.query('SELECT * FROM media_source WHERE item_id=$1', [photo.item.id])).rows.length,
      0,
    );
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('recapture repairs a failed post and retains the edited title', async () => {
  process.env.AM_TEST_DB = 'memory';
  const db = await createDatabase();
  try {
    await db.query(
      `INSERT INTO "user"(id,name,email) VALUES('repair-post','A','repair-post@test.invalid')`,
    );
    const url = 'https://facebook.com/creator/posts/12345';
    const first = await capture('repair-post', { kind: 'article', url }, 'web', db);
    await db.query('DELETE FROM import_job WHERE item_id=$1', [first.item.id]);
    await db.query(
      "UPDATE item SET status='failed',source_details='{\"titleEdited\":true}',title='My title' WHERE id=$1",
      [first.item.id],
    );
    const post = {
      platform: 'Facebook' as const,
      title: 'Original title',
      author: 'Creator',
      text: 'Saved caption',
      images: [{ url: 'https://images.example/photo.jpg', alt: 'Photo' }],
      video: true,
    };
    const repaired = await capture(
      'repair-post',
      { kind: 'article', url, captured: { social: post } },
      'extension',
      db,
    );
    assert.equal(repaired.item.id, first.item.id);
    assert.equal(repaired.item.title, 'My title');
    assert.equal(repaired.item.passages[0].text, 'Saved caption');
    const noOrigin = async () => {
      throw Error('Unexpected origin fetch');
    };
    await processNext(db, noOrigin, 'repair-post');
    const item = await ownItem('repair-post', first.item.id, db);
    assert.equal(item.title, 'My title');
    assert.equal(item.source_details?.social?.post?.text, 'Saved caption');
    assert.equal(item.passages[0].text, 'Saved caption');
  } finally {
    await db.close();
    delete process.env.AM_TEST_DB;
  }
});

test('Instagram stale metadata asks for refresh instead of capturing another reel', () => {
  const dom = new JSDOM(
    '<meta property="og:url" content="https://instagram.com/reel/OTHER/"><meta property="og:description" content="Wrong caption">',
    { url: 'https://instagram.com/reel/CURRENT/' },
  );
  try {
    assert.throws(
      () => runInNewContext(captureScript, { document: dom.window.document, URL }),
      /Refresh this Instagram page/,
    );
  } finally {
    dom.window.close();
  }
});
