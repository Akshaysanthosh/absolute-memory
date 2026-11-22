import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { clientConfiguration, integrationOrigin } from './client.mjs';

export function configFile(env = process.env) {
  return (
    env.ABSOLUTE_MEMORY_CONFIG ||
    join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'absolute-memory', 'config.json')
  );
}

export async function localConfiguration(env = process.env) {
  const configured = clientConfiguration(env);
  if (configured.token) return configured;
  let saved;
  try {
    saved = JSON.parse(await readFile(configFile(env), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT')
      throw new Error('The local Absolute Memory configuration could not be read.');
  }
  if (
    env.ABSOLUTE_MEMORY_BASE_URL &&
    saved &&
    integrationOrigin(env.ABSOLUTE_MEMORY_BASE_URL) !== integrationOrigin(saved.baseUrl)
  )
    return configured;
  return { token: saved?.token, baseUrl: saved?.baseUrl || configured.baseUrl };
}

export async function writeConfiguration(config, env = process.env) {
  const path = configFile(env);
  const temporary = path + '.' + randomUUID() + '.tmp';
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, JSON.stringify(config) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return path;
}
