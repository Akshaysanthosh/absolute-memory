#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createLibraryClient, errorDetails, integrationOrigin } from './client.mjs';
import { localConfiguration, writeConfiguration } from './local-config.mjs';

const usage = `absolute-memory login [origin] [--stdin]
absolute-memory save <url|file>
absolute-memory note --title <title> --request-key <key> (--file <path> | --stdin)
absolute-memory search <keywords>
absolute-memory ask <question>
absolute-memory export [--output <path>]
absolute-memory read <item-id> [--offset <n>]
absolute-memory highlights [--item <item-id>] [--limit <n>] [--offset <n>]
absolute-memory status <item-id>
absolute-memory mcp

Server administration
absolute-memory doctor
absolute-memory migrate
absolute-memory reset-password <email>
absolute-memory reembed
absolute-memory import <file> --format <format> --user <email>

Set ABSOLUTE_MEMORY_API_KEY and ABSOLUTE_MEMORY_BASE_URL to override local credentials.
Commands return JSON on stdout. Errors are JSON on stderr.`;

async function textInput(source, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of source) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('Input exceeds the command size limit.');
    chunks.push(chunk);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new Error('Provide valid UTF-8 text.');
  }
}

async function login(args) {
  const { values, positionals } = parseArgs({
    args,
    options: { stdin: { type: 'boolean' } },
    allowPositionals: true,
  });
  if (positionals.length > 1) throw new Error('Provide one app origin.');
  const baseUrl = integrationOrigin(
    positionals[0] || process.env.ABSOLUTE_MEMORY_BASE_URL || 'http://localhost:3000',
  );
  const token = values.stdin
    ? (await textInput(process.stdin, 1024)).trim()
    : process.env.ABSOLUTE_MEMORY_API_KEY;
  const client = createLibraryClient({ baseUrl, token });
  try {
    await client.recent(1);
  } catch (error) {
    if (error.status !== 403) throw error;
  }
  return { baseUrl, configuration: await writeConfiguration({ baseUrl, token }) };
}

async function save(client, value) {
  if (/^https?:\/\//i.test(value)) return client.saveUrl(value);
  const info = await stat(value);
  if (!info.isFile()) throw new Error('Choose a regular file.');
  const name = basename(value);
  if (/\.(?:txt|md|markdown)$/i.test(name)) {
    const text = await textInput(createReadStream(value), 400_000);
    const title = name.replace(/\.[^.]+$/, '').slice(0, 300) || 'Imported note';
    const key = createHash('sha256')
      .update(JSON.stringify([title, text]))
      .digest('hex');
    return client.saveNote(title, text, key);
  }
  return client.saveFile(name, createReadStream(value));
}

async function saveExport(client, output) {
  const path = resolve(output || 'absolute-memory-library.zip');
  const file = await open(path, 'wx', 0o600);
  try {
    const source = await client.export();
    await pipeline(Readable.fromWeb(source), file.createWriteStream());
  } catch (error) {
    await file.close().catch(() => {});
    await unlink(path);
    throw error;
  }
  return { path };
}

const administrative = {
  'reset-password': './reset-password.ts',
  reembed: './reembed.ts',
  migrate: '../../scripts/migrate.ts',
  import: './import.ts',
  doctor: './doctor.ts',
};
const optionsByCommand = {
  save: {},
  search: {},
  ask: {},
  export: { output: { type: 'string' } },
  read: { offset: { type: 'string' } },
  status: {},
  highlights: { item: { type: 'string' }, limit: { type: 'string' }, offset: { type: 'string' } },
  note: {
    title: { type: 'string' },
    'request-key': { type: 'string' },
    file: { type: 'string' },
    stdin: { type: 'boolean' },
  },
};

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') console.log(usage);
  else if (command === 'login') console.log(JSON.stringify(await login(args)));
  else if (command === 'mcp') await import('./mcp.mjs');
  else if (Object.hasOwn(administrative, command)) {
    if (command === 'reset-password' && args.length !== 1)
      throw new Error('Provide the account email address.');
    if (['reembed', 'migrate', 'doctor'].includes(command) && args.length)
      throw new Error(`Run ${command} without arguments.`);
    const script = fileURLToPath(new URL(administrative[command], import.meta.url));
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--env-file-if-exists=.env.local', script, ...args],
      { stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else {
    if (!Object.hasOwn(optionsByCommand, command))
      throw new Error('Unknown command. Run absolute-memory --help.');
    const { values, positionals } = parseArgs({
      args,
      options: optionsByCommand[command],
      allowPositionals: true,
    });
    const client = createLibraryClient(await localConfiguration());
    let result;
    if (command === 'note') {
      if (
        positionals.length ||
        !values.title ||
        !values['request-key'] ||
        Boolean(values.file) === Boolean(values.stdin)
      ) {
        throw new Error('Provide --title, --request-key and exactly one of --file or --stdin.');
      }
      result = await client.saveNote(
        values.title,
        await textInput(values.file ? createReadStream(values.file) : process.stdin, 400_000),
        values['request-key'],
      );
    } else if (command === 'export') {
      if (positionals.length) throw new Error('Use --output to select the export path.');
      result = await saveExport(client, values.output);
    } else if (command === 'highlights') {
      if (positionals.length) throw new Error('Use --item to select the saved item.');
      if (values.limit !== undefined && !/^\d{1,3}$/.test(values.limit))
        throw new Error('Limit must be an integer from 1 to 100.');
      if (values.offset !== undefined && !/^\d{1,7}$/.test(values.offset))
        throw new Error('Offset must be a nonnegative integer.');
      result = await client.highlights({
        id: values.item,
        limit: Number(values.limit ?? 20),
        offset: Number(values.offset ?? 0),
      });
    } else {
      if (positionals.length !== 1)
        throw new Error('Provide one argument. Quote searches and questions containing spaces.');
      const [value] = positionals;
      if (command === 'save') result = await save(client, value);
      if (command === 'search') result = await client.search(value);
      if (command === 'ask') result = await client.ask(value);
      if (command === 'read') {
        if (values.offset !== undefined && !/^\d{1,7}$/.test(values.offset))
          throw new Error('Offset must be a nonnegative integer.');
        result = await client.read(value, Number(values.offset ?? 0));
      }
      if (command === 'status') result = await client.status(value);
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(JSON.stringify(errorDetails(error)));
  process.exitCode = 1;
}
