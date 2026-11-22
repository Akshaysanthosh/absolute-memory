import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  clientConfiguration,
  createLibraryClient,
  integrationOrigin,
} from '../../packages/cli/client.mjs';

const token = 'am_' + 't'.repeat(43);
const id = 'b10116d4-9070-4abd-a5ac-f98efd4f2314';

test('local integration clients reject unsafe origins before using a key', () => {
  for (const value of [
    'http://example.org',
    'file:///tmp/app',
    'https://alice@example.org',
    'https://example.org/api',
    'https://example.org/?q=abc',
  ]) {
    assert.throws(() => integrationOrigin(value));
  }
  assert.equal(integrationOrigin('http://127.0.0.1:3100'), 'http://127.0.0.1:3100');
  assert.equal(integrationOrigin('https://app.example.org/'), 'https://app.example.org');
  assert.throws(
    () => createLibraryClient({ token: 'am_ext_not_an_integration_key' }),
    /personal key/,
  );
});

test('CLI and MCP subprocesses share scoped API calls and preserve machine-readable results', async () => {
  const received: {
    path: string;
    method: string;
    token: string | undefined;
    key: string | string[] | undefined;
    body: string;
  }[] = [];
  let revoked = false;
  const statusPath = '/api/v1/saves/' + id;
  const record = { id, status: 'ready', duplicate: false, statusPath };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({
      path: req.url!,
      method: req.method!,
      token: req.headers.authorization,
      key: req.headers['idempotency-key'],
      body: Buffer.concat(chunks).toString(),
    });
    res.setHeader('Content-Type', 'application/json');
    const send = (status: number, data: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    if (revoked) return send(401, { error: 'The personal key is revoked.' });
    if (req.url === '/api/v1/items?q=redirect') {
      res.setHeader('Location', '/redirect-target');
      return send(302, {});
    }
    if (req.url === '/api/v1/items?q=retry') {
      res.setHeader('Retry-After', '60');
      return send(429, { error: 'Try again later.' });
    }
    if (req.url?.startsWith('/api/v1/highlights'))
      return send(200, { highlights: [], nextOffset: null });
    if (req.url === '/api/v1/ask')
      return send(200, {
        answer: 'Saved evidence [1].',
        sources: [
          {
            number: 1,
            itemId: id,
            title: 'Example',
            passageIndex: 0,
            quote: 'Original saved words.',
            path: '/read/' + id + '#p-0',
          },
        ],
        degraded: false,
      });
    if (req.url === '/api/v1/export') {
      res.setHeader('Content-Type', 'application/zip');
      return res.end('PK-fixture');
    }
    if (req.method === 'POST') return send(201, record);
    if (req.url === statusPath) return send(200, { id, status: 'ready' });
    if (req.url?.startsWith('/api/v1/items/' + id))
      return send(200, {
        id,
        kind: 'note',
        status: 'ready',
        title: 'Example',
        url: null,
        domain: null,
        nextOffset: null,
        passages: [{ index: 0, text: 'Original saved words.', path: '/read/' + id + '#p-0' }],
      });
    return send(200, {
      items: [
        { id, kind: 'note', title: 'Example', status: 'ready', excerpt: 'Original saved words.' },
      ],
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const directory = await mkdtemp(join(tmpdir(), 'absolute-memory-cli-test-'));
  const env = {
    ABSOLUTE_MEMORY_CONFIG: join(directory, 'config.json'),
    NODE_ENV: 'test' as const,
    ABSOLUTE_MEMORY_BASE_URL: 'http://127.0.0.1:' + address.port,
    ABSOLUTE_MEMORY_API_KEY: token,
  };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['packages/cli/mcp.mjs'],
    env,
    stderr: 'pipe',
  });
  const mcp = new Client({ name: 'am-test', version: '1' });
  const cli = (args: string[], stdin = '', environment = env) =>
    new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['packages/cli/cli.mjs', ...args], {
        env: environment,
      });
      let stdout = '',
        stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(stdin);
    });
  try {
    await mcp.connect(transport);
    const { tools } = await mcp.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'ask_memory',
      'get_item',
      'list_highlights',
      'list_recent',
      'save_note',
      'save_status',
      'save_url',
      'search_memory',
    ]);
    assert.equal(tools.find((tool) => tool.name === 'save_url')?.annotations?.readOnlyHint, false);
    assert.equal(tools.find((tool) => tool.name === 'get_item')?.annotations?.readOnlyHint, true);

    const note = await cli(
      ['note', '--stdin', '--title', 'Example', '--request-key', 'retry-example'],
      'Original saved words.',
    );
    assert.equal(note.code, 0);
    assert.equal(note.stderr, '');
    assert.deepEqual(JSON.parse(note.stdout), record);
    assert.equal(received[0].key, 'retry-example');
    assert.deepEqual(JSON.parse(received[0].body), {
      kind: 'note',
      title: 'Example',
      text: 'Original saved words.',
    });
    const mcpNote = await mcp.callTool({
      name: 'save_note',
      arguments: { title: 'Example', text: 'Original saved words.', requestKey: 'retry-example' },
    });
    assert.deepEqual(mcpNote.structuredContent, record);
    assert.equal(received[1].key, 'retry-example');
    assert.deepEqual(
      (await mcp.callTool({ name: 'save_url', arguments: { url: 'https://example.org/read' } }))
        .structuredContent,
      record,
    );
    assert.equal(
      (await mcp.callTool({ name: 'save_url', arguments: { url: 'file:///tmp/private' } })).isError,
      true,
    );
    assert.deepEqual(
      (await mcp.callTool({ name: 'save_status', arguments: { id } })).structuredContent,
      { id, status: 'ready' },
    );
    const item = await mcp.callTool({ name: 'get_item', arguments: { id } });
    assert.match(JSON.stringify(item.structuredContent), /Original saved words/);
    assert.equal(
      (await mcp.callTool({ name: 'search_memory', arguments: { query: 'original' } })).isError,
      undefined,
    );
    assert.equal(
      (await mcp.callTool({ name: 'list_recent', arguments: { limit: 2 } })).isError,
      undefined,
    );
    assert.deepEqual(
      (await mcp.callTool({ name: 'list_highlights', arguments: { id } })).structuredContent,
      { highlights: [], nextOffset: null },
    );
    assert.match(
      JSON.stringify(
        (
          await mcp.callTool({
            name: 'ask_memory',
            arguments: { question: 'What is saved?', itemIds: [id] },
          })
        ).structuredContent,
      ),
      /Saved evidence/,
    );
    assert.ok(received.every((req) => req.token === 'Bearer ' + token));

    const login = await cli(['login', env.ABSOLUTE_MEMORY_BASE_URL, '--stdin'], token);
    assert.equal(login.code, 0, login.stderr);
    assert.doesNotMatch(login.stdout, /am_/);
    assert.equal((await stat(env.ABSOLUTE_MEMORY_CONFIG)).mode & 0o777, 0o600);
    const savedSearch = await cli(['search', 'original'], '', {
      ...env,
      ABSOLUTE_MEMORY_API_KEY: '',
    });
    assert.equal(savedSearch.code, 0, savedSearch.stderr);
    const output = join(directory, 'library.zip');
    assert.equal((await cli(['export', '--output', output])).code, 0);
    assert.equal(await readFile(output, 'utf8'), 'PK-fixture');
    assert.equal((await cli(['export', '--output', output])).code, 1);

    const redirect = await cli(['search', 'redirect']);
    assert.equal(redirect.code, 1);
    assert.equal(redirect.stdout, '');
    assert.equal(
      received.some((req) => req.path === '/redirect-target'),
      false,
    );
    const rateLimited = await cli(['search', 'retry']);
    assert.deepEqual(JSON.parse(rateLimited.stderr), {
      error: 'Try again later.',
      status: 429,
      retryAfter: 60,
    });
    revoked = true;
    const failed = await mcp.callTool({ name: 'get_item', arguments: { id } });
    assert.equal(failed.isError, true);
    assert.doesNotMatch(JSON.stringify(failed), /am_/);
  } finally {
    await mcp.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('clients default to localhost and prefer explicit configuration', () => {
  assert.equal(clientConfiguration({}).baseUrl, 'http://localhost:3000');
  assert.deepEqual(clientConfiguration({ ABSOLUTE_MEMORY_API_KEY: token }), {
    token,
    baseUrl: 'http://localhost:3000',
  });
  assert.equal(
    clientConfiguration({
      ABSOLUTE_MEMORY_API_KEY: token,
      ABSOLUTE_MEMORY_BASE_URL: 'https://new.example',
    }).baseUrl,
    'https://new.example',
  );
});
