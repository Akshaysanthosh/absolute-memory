import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { getConfig } from '@/server/config';
import { mediaProcessEnvironment } from '@/server/config/runtime-environment';

const invokeFile = promisify(execFile);

export function runFile(
  bin: string,
  args: string[],
  options: { cwd?: string; timeout?: number; maxBuffer?: number } = {},
) {
  const env = mediaProcessEnvironment();
  return invokeFile(bin, args, { ...options, env, encoding: 'utf8', killSignal: 'SIGKILL' });
}
export const mediaDownloadLimit = 200_000_000;

export function executable(name: string) {
  for (const directory of (mediaProcessEnvironment().PATH ?? '').split(delimiter).filter(Boolean)) {
    const path = join(directory, process.platform === 'win32' ? `${name}.exe` : name);
    try {
      accessSync(path, constants.X_OK);
      return path;
    } catch {
      /* Check the next directory. */
    }
  }
  return null;
}

export function mediaEnabled() {
  return getConfig().MEDIA_ENABLED ?? Boolean(executable('yt-dlp'));
}

export async function withMediaDirectory<T>(run: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), 'absolute-memory-media-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
