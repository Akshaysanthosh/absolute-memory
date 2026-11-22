import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenHash } from '../../src/server/security/token-hash';

import { loginReturnPath } from '../../src/shared/return-path';
import { createController } from '../../extension/controller.mjs';
import { appOrigin, articleUrl, hostPattern, pairingProof } from '../../extension/core.mjs';

test('pairing proofs, origin restrictions, and login redirects reject unsafe destinations', async () => {
  const p = await pairingProof();
  assert.equal(p.verifier.length, 43);
  assert.equal(p.challenge, tokenHash(p.verifier));
  assert.equal(appOrigin('http://127.0.0.1:3100/'), 'http://127.0.0.1:3100');
  assert.equal(hostPattern('https://app.example.com'), 'https://app.example.com/*');
  for (const origin of [
    'http://evil.example',
    'https://key@evil.example',
    'https://app.example/?secret=1',
    'javascript:alert(1)',
  ])
    assert.throws(() => appOrigin(origin));
  assert.throws(() => articleUrl('chrome://extensions', 'https://app.example'));
  assert.throws(() => articleUrl('https://app.example/library', 'https://app.example'));
  assert.equal(
    articleUrl('https://site.example/read?utm_source=x&important=1#part', 'https://app.example'),
    'https://site.example/read?important=1',
  );
  assert.equal(loginReturnPath('//evil.example'), '/library');
  assert.equal(
    loginReturnPath('/connect/extension?challenge=' + p.challenge),
    '/connect/extension?challenge=' + p.challenge,
  );
});

function fakeChrome(initial: Record<string, unknown> = {}) {
  const local: Record<string, unknown> = { state: initial },
    session: Record<string, unknown> = {},
    badges: string[] = [],
    opened: string[] = [],
    alarms = new Map();
  let options = 0;
  const area = (data: Record<string, unknown>) => ({
    async get(k: string) {
      return structuredClone({ [k]: data[k] });
    },
    async set(v: Record<string, unknown>) {
      Object.assign(data, structuredClone(v));
    },
    async remove(k: string) {
      delete data[k];
    },
    async setAccessLevel() {},
  });
  const chrome = {
    storage: { local: area(local), session: area(session) },
    action: {
      async setBadgeText({ text }: { text: string }) {
        badges.push(text);
      },
      async setBadgeBackgroundColor() {},
      async setTitle() {},
    },
    alarms: {
      async create(n: string, v: unknown) {
        alarms.set(n, v);
      },
      async clear(n: string) {
        alarms.delete(n);
      },
    },
    tabs: {
      async create({ url }: { url: string }) {
        opened.push(url);
      },
    },
    runtime: {
      async openOptionsPage() {
        options++;
      },
    },
  };
  return { chrome, local, session, badges, opened, options: () => options };
}
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
test('the extension pairs without putting a secret in the approval URL or its UI state', async () => {
  const f = fakeChrome();
  let approve = false;
  const controller = createController(f.chrome, async (_url, opts) => {
    assert.equal(opts?.redirect, 'error');
    const v = JSON.parse(opts?.body as string).verifier;
    return response(approve ? { connected: true, token: 'am_ext_' + v } : { connected: false });
  });
  await controller.begin('http://127.0.0.1:3100');
  const pair = f.session.pair as { verifier: string; challenge: string };
  assert.ok(f.opened[0].endsWith(pair.challenge));
  assert.ok(!f.opened[0].includes(pair.verifier));
  assert.equal(JSON.stringify(await controller.view()).includes(pair.verifier), false);
  approve = true;
  await controller.tick();
  assert.equal((await controller.view()).connected, true);
  assert.equal(f.session.pair, undefined);
  assert.equal(JSON.stringify(await controller.view()).includes('am_ext_'), false);
});
test('one-click saves, duplicate feedback and readiness polling survive a worker restart', async () => {
  const existingOrigin = 'https://different-instance.example';
  const f = fakeChrome({ origin: existingOrigin, token: 'am_ext_token', recent: [] });
  let captures = 0;
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(new URL(String(url)).origin, existingOrigin);
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer am_ext_token');
    if (String(url).endsWith('/status')) return response({ id: 'item', status: 'ready' });
    captures++;
    return response({ id: 'item', status: 'pending', duplicate: captures > 1, receipt: 'receipt' });
  };
  const first = createController(f.chrome, fetcher);
  await first.save({ url: 'https://article.example/read', title: 'A good read' });
  assert.equal((await first.view()).recent[0].status, 'pending');
  assert.equal(f.badges.at(-1), '…');
  const resumed = createController(f.chrome, fetcher);
  await resumed.init();
  assert.equal((await resumed.view()).recent[0].status, 'ready');
  assert.equal(f.badges.at(-1), '✓');
  await resumed.save({ url: 'https://article.example/read', title: 'A good read' });
  assert.equal((await resumed.view()).recent.length, 1);
  assert.equal((await resumed.view()).recent[0].duplicate, true);
});
test('offline saves are retryable, revoked connections are cleared, and disconnect must reach the server', async () => {
  const f = fakeChrome({ origin: 'https://am.example', token: 'am_ext_token', recent: [] });
  let mode = 'offline';
  const controller = createController(f.chrome, async () => {
    if (mode === 'offline') throw new Error('Offline');
    return response({ error: 'Revoked' }, 401);
  });
  await controller.save({ url: 'https://article.example/read', title: 'Read' });
  assert.equal((await controller.view()).recent[0].status, 'retry');
  assert.equal((await controller.view()).connected, true);
  await assert.rejects(controller.disconnect(), /Could not reach/);
  assert.equal((await controller.view()).connected, true);
  mode = 'revoked';
  await controller.retry((await controller.view()).recent[0].key);
  assert.equal((await controller.view()).connected, false);
  assert.equal(f.badges.at(-1), '!');
});
test('captured content survives offline restart and is removed after acknowledgment', async () => {
  const f = fakeChrome({ origin: 'https://am.example', token: 'am_ext_token', recent: [] });
  const captured = { html: '<article><p>Saved browser content</p></article>' };
  const first = createController(f.chrome, async () => {
    throw new Error('Offline');
  });
  await first.save({ url: 'https://article.example/read', title: 'Read', captured });
  const view = await first.view();
  assert.equal(view.recent[0].status, 'retry');
  assert.equal(JSON.stringify(view).includes('Saved browser content'), false);
  const stored = (f.local.state as { recent: { captured?: unknown }[] }).recent;
  assert.deepEqual(stored[0].captured, captured);
  let sent: unknown;
  const resumed = createController(f.chrome, async (_url, opts) => {
    sent = JSON.parse(opts?.body as string);
    return response({ id: 'item', status: 'ready' });
  });
  await resumed.init();
  await resumed.retry(view.recent[0].key);
  assert.deepEqual((sent as { captured: unknown }).captured, captured);
  assert.equal((await resumed.view()).recent[0].status, 'ready');
  assert.equal(JSON.stringify(f.local).includes('Saved browser content'), false);
});

test('capture diagnostics distinguish page content, URL fallback and video processing without exposing Chrome errors', async () => {
  for (const mode of ['page', 'denied', 'permission', 'oversized', 'empty', 'navigated', 'media']) {
    const f = fakeChrome({ origin: 'https://am.example', token: 'am_ext_token', recent: [] });
    const captured = { html: '<article>Private article text</article>' };
    let injected = 0,
      sent: any;
    const chrome = {
      ...f.chrome,
      scripting: {
        async executeScript() {
          injected++;
          if (mode === 'denied') throw new Error('Sensitive Chrome diagnostic');
          if (mode === 'permission')
            throw new Error('Cannot access contents of url private.example');
          if (mode === 'oversized') throw new Error('This page is too large for browser capture.');
          return [
            {
              result:
                mode === 'empty'
                  ? undefined
                  : {
                      ...captured,
                      documentUrl:
                        mode === 'navigated'
                          ? 'https://article.example/another'
                          : 'https://article.example/read',
                    },
            },
          ];
        },
      },
    };
    const controller = createController(chrome, async (_url, opts) => {
      sent = JSON.parse(opts?.body as string);
      return response({ id: 'item', status: 'pending', receipt: 'receipt' });
    });
    await controller.save({
      id: 1,
      url:
        mode === 'media'
          ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
          : 'https://article.example/read',
      title: 'Read',
    });
    const view = await controller.view(),
      recent = view.recent[0];
    assert.equal(
      recent.captureMethod,
      mode === 'page' ? 'page' : mode === 'media' ? 'media' : 'url',
    );
    assert.equal(injected, mode === 'media' ? 0 : 1);
    assert.equal(Boolean(sent.captured), mode === 'page');
    assert.equal(JSON.stringify(view).includes('Private article text'), false);
    assert.equal(JSON.stringify(view).includes('Sensitive Chrome diagnostic'), false);
    if (['denied', 'permission', 'oversized', 'empty', 'navigated'].includes(mode))
      assert.match(recent.captureNotice, /public URL/);
    if (mode === 'permission') assert.match(recent.captureNotice, /did not allow access/);
    if (mode === 'oversized') assert.match(recent.captureNotice, /size limit/);
    assert.equal(JSON.stringify(view).includes('private.example'), false);
    const restarted = createController(chrome, async () =>
      response({ id: 'item', status: 'ready' }),
    );
    await restarted.tick();
    assert.equal((await restarted.view()).recent[0].captureMethod, recent.captureMethod);
  }
});

test('selected quotes are sent only as quoted text and repeated saves reuse the recent entry', async () => {
  const f = fakeChrome({
    origin: 'https://memory.example.test',
    token: 'am_ext_token',
    recent: [],
  });
  const text = '  Keep this exact passage & punctuation.  ';
  let count = 0;
  const controller = createController(f.chrome, async (url, opts) => {
    assert.equal(url, 'https://memory.example.test/api/capture');
    assert.deepEqual(JSON.parse(opts?.body as string), {
      kind: 'quote',
      sourceUrl: 'https://example.com/post',
      title: 'The post',
      text,
    });
    return response({ id: 'quote-id', status: 'ready', duplicate: count++ > 0 });
  });
  const info = { pageUrl: 'https://example.com/post', selectionText: text };
  await controller.saveQuote(info, { title: 'The post' });
  await controller.saveQuote(info, { title: 'The post' });
  const view = await controller.view();
  assert.equal(view.recent.length, 1);
  assert.equal(view.recent[0].id, 'quote-id');
  assert.equal(view.recent[0].captureMethod, 'quote');
  assert.equal(f.badges.at(-1), '✓');
  assert.equal(JSON.stringify(f.local).includes(text), false);
});

test('social transcript routes discard old whole-page DOM and use only bounded post capture', async () => {
  const { socialVideoPlatform } = await import('../../src/shared/media/social');
  const { usesTranscriptPipeline, recoveryHint, statusLabel } =
    await import('../../extension/core.mjs');
  for (const url of [
    'https://www.instagram.com/reel/ABC_123/',
    'https://www.tiktok.com/@test/video/1234',
    'https://x.com/test/status/1234',
    'https://www.facebook.com/watch/?v=1234',
    'https://www.facebook.com/reel/1234',
    'https://vm.tiktok.com/ABC/',
  ]) {
    assert.ok(socialVideoPlatform(url));
    assert.equal(usesTranscriptPipeline(url), true);
    const f = fakeChrome({ origin: 'https://memory.example.test', token: 'test', recent: [] });
    let sent: any;
    const chrome = {
      ...f.chrome,
      scripting: {
        async executeScript({ func }: any) {
          assert.equal(func.name, 'captureSocialPost');
          return [{ result: null }];
        },
      },
    };
    const controller = createController(chrome, async (_url, opts) => {
      sent = JSON.parse(opts?.body as string);
      return response({ id: 'item', status: 'pending' });
    });
    await controller.save({ id: 1, url, captured: { html: 'Old social feed content' } });
    assert.equal(sent.captured, undefined);
    assert.equal((await controller.view()).recent[0].captureMethod, 'media');
    assert.match(recoveryHint({ url }), /cannot recover/);
  }
  for (const url of [
    'https://instagram.com.evil.test/reel/a',
    'https://example.com/article',
    'https://x.com/profile',
  ])
    assert.equal(usesTranscriptPipeline(url), false);
  assert.equal(statusLabel({ status: 'ready' }), 'Saved to your library');
  assert.equal(statusLabel({ status: 'processing' }), 'Preparing…');
  assert.match(recoveryHint({ url: 'https://example.com' }), /Open the original page/);
});

test('social capture sends a bounded post snapshot and retries it after disconnection', async () => {
  const f = fakeChrome({ origin: 'https://am.example', token: 'am_ext_token', recent: [] });
  const url = 'https://x.com/creator/status/1234';
  const social = {
    platform: 'X',
    title: 'Post',
    author: 'Creator',
    text: 'Original post',
    images: [{ url: 'https://images.example/photo.jpg', alt: 'Photo' }],
    video: false,
  };
  const chrome = {
    ...f.chrome,
    scripting: {
      async executeScript({ func }: any) {
        assert.equal(func.name, 'captureSocialPost');
        return [{ result: { documentUrl: url, social } }];
      },
    },
  };
  const controller = createController(chrome, async () => {
    throw Error('Offline');
  });
  await controller.save({ id: 1, url, title: 'Post' });
  const view = await controller.view();
  assert.equal(view.recent[0].captureMethod, 'social');
  assert.equal(JSON.stringify(view).includes('Original post'), false);
  let sent: any;
  const resumed = createController(chrome, async (_url, opts) => {
    sent = JSON.parse(opts?.body as string);
    return response({ id: 'item', status: 'ready' });
  });
  await resumed.retry(view.recent[0].key);
  assert.deepEqual(sent.captured, { social });
  assert.equal(sent.captured.html, undefined);
  assert.equal(JSON.stringify(f.local).includes('Original post'), false);
});

test('unsupported capture response keeps social snapshot and explains that a server update is needed', async () => {
  const f = fakeChrome({ origin: 'https://am.example', token: 'am_ext_token', recent: [] });
  const social = {
    platform: 'Instagram',
    title: 'A reel',
    author: 'Creator',
    text: 'Caption',
    images: [],
    video: true,
  };
  const controller = createController(f.chrome, async () =>
    response({ error: 'Invalid input: expected string, received undefined' }, 400),
  );
  await controller.save({ url: 'https://www.instagram.com/reel/example/', captured: { social } });
  const view = await controller.view();
  assert.equal(view.recent[0].status, 'retry');
  assert.match(view.recent[0].error, /server needs an update/);
  assert.deepEqual(
    (f.local.state as { recent: Array<{ captured: { social: typeof social } }> }).recent[0].captured
      .social,
    social,
  );
});
