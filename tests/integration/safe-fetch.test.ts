import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import {
  collectBytes,
  FetchLimitError,
  resolveFetchHost,
  safeFetch,
  validateFetchURL,
} from '../../src/server/security/safe-fetch';

test('the fetch guard rejects private IPv4 and IPv6 addresses and private DNS results', async () => {
  for (const url of [
    'http://127.0.0.1',
    'http://10.0.1.2',
    'http://169.254.169.254',
    'http://[::1]',
    'http://[fe80::1]',
    'http://[fd00::1]',
    'http://[::ffff:127.0.0.1]',
    'http://localhost.',
    'file:///tmp/input',
    'https://user:pass@example.org',
  ])
    assert.throws(() => validateFetchURL(url, false));
  await assert.rejects(resolveFetchHost('localhost', false), /Private/);
  assert.ok((await resolveFetchHost('localhost', true)).length);
});

test('guarded fetch follows checked HTTP redirects, sends a user agent, and bounds downloads', async (t) => {
  const old = process.env.ALLOW_PRIVATE_NETWORK_FETCH;
  process.env.ALLOW_PRIVATE_NETWORK_FETCH = 'true';
  t.after(() => {
    if (old === undefined) delete process.env.ALLOW_PRIVATE_NETWORK_FETCH;
    else process.env.ALLOW_PRIVATE_NETWORK_FETCH = old;
  });
  const server = createServer((req, res) => {
    if (req.url === '/start') {
      res.writeHead(302, { Location: '/user-agent' }).end();
      return;
    }
    if (req.url === '/unsupported') {
      res.writeHead(302, { Location: 'file:///tmp/input' }).end();
      return;
    }
    if (req.url === '/loop') {
      res.writeHead(302, { Location: '/loop' }).end();
      return;
    }
    if (req.url === '/size') {
      res.writeHead(200, { 'Content-Length': 100 }).end('x'.repeat(100));
      return;
    }
    if (req.url === '/stream') {
      res.write('xxxxxx');
      res.end('xxxxxx');
      return;
    }
    if (req.url === '/timeout') {
      res.write('begin');
      return;
    }
    res.end(req.headers['user-agent']);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const read = (path: string, maxBytes: number, timeoutMs?: number) =>
    safeFetch(origin + path, { maxBytes, timeoutMs }, async (_response, url, body) => ({
      path: url.pathname,
      text: (await collectBytes(body)).toString(),
    }));
  assert.deepEqual(await read('/start', 100), {
    path: '/user-agent',
    text: 'AbsoluteMemory/0.1.0',
  });
  await assert.rejects(read('/unsupported', 100), /public HTTP or HTTPS/);
  await assert.rejects(read('/loop', 100), /redirected too many times/);
  await assert.rejects(read('/size', 10), FetchLimitError);
  await assert.rejects(read('/stream', 10), FetchLimitError);
  await assert.rejects(read('/timeout', 100, 120), /abort|timeout/i);
});
