import { copyFile, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { getConfig } from '@/server/config';
import { withMediaProxy } from '@/server/security/media-proxy';
import { validatePublicDestination } from '@/server/security/safe-fetch';
import {
  executable,
  mediaDownloadLimit,
  mediaEnabled,
  runFile,
} from '@/server/services/media/tools';
import { parsePublishedTranscript } from '@/server/services/media/podcast';
import { MediaError, type Transcript } from '@/shared/media/transcript';

const captionLimit = 2_000_000;
type CaptionFormats = Record<string, { ext?: string }[]>;
type VideoInfo = {
  title?: string;
  uploader?: string;
  channel?: string;
  description?: string;
  duration?: number;
  language?: string;
  subtitles?: CaptionFormats;
  automatic_captions?: CaptionFormats;
  requested_downloads?: { filesize?: number; filesize_approx?: number }[];
};

export function captionLanguages(metadata: VideoInfo, preferred?: string) {
  const manual = Object.keys(metadata.subtitles ?? {}).filter((key) => key !== 'live_chat');
  const automatic = Object.keys(metadata.automatic_captions ?? {}).filter(
    (key) => key !== 'live_chat',
  );
  const available = [...new Set([...manual, ...automatic])].filter((key) =>
    /^[a-z\d-]{1,36}$/i.test(key),
  );
  const pick = (language: string) =>
    available.filter((key) => key === language || key.startsWith(language + '-'));
  return [...new Set([...(preferred ? pick(preferred) : []), ...pick('en'), ...available])];
}

function sizeKnown(info: VideoInfo) {
  const sizes =
    info.requested_downloads?.map((format) => format.filesize ?? format.filesize_approx ?? 0) ?? [];
  return sizes.reduce((total, size) => total + size, 0);
}

async function ytdlp(
  url: string,
  directory: string,
  args: string[],
  limit: number,
  timeout: number,
) {
  const bin = executable('yt-dlp');
  if (!bin || !mediaEnabled())
    throw new MediaError('Video fetching is disabled or yt-dlp is unavailable.');
  const endpoint = await validatePublicDestination(url);
  const config = getConfig();
  const cookieArgs: string[] = [];
  if (config.YTDLP_COOKIES_FILE) {
    const cookies = join(directory, 'session-cookies.txt');
    await copyFile(config.YTDLP_COOKIES_FILE, cookies);
    cookieArgs.push('--cookies', cookies);
  }
  try {
    return await withMediaProxy(limit, (proxy) =>
      runFile(
        bin,
        [
          '--ignore-config',
          '--no-plugin-dirs',
          '--no-remote-components',
          '--no-js-runtimes',
          '--js-runtimes',
          'node',
          '--no-cache-dir',
          '--no-playlist',
          '--no-progress',
          '--socket-timeout',
          '15',
          '--retries',
          '1',
          '--fragment-retries',
          '1',
          '--proxy',
          proxy,
          '--user-agent',
          'AbsoluteMemory/0.1.0',
          '--downloader',
          'native',
          ...cookieArgs,
          ...args,
          '--',
          endpoint.href,
        ],
        { cwd: directory, timeout, maxBuffer: 8_000_000 },
      ),
    );
  } catch {
    throw new MediaError(
      'The video source could not be fetched. The source may require sign-in or restrict downloads.',
      false,
      true,
    );
  }
}

export async function videoMetadata(url: string, directory: string): Promise<VideoInfo> {
  const { stdout } = await ytdlp(
    url,
    directory,
    ['--dump-single-json', '--skip-download', '-f', 'bestaudio/best'],
    15_000_000,
    55_000,
  );
  try {
    return JSON.parse(stdout) as VideoInfo;
  } catch {
    throw new MediaError('Video metadata could not be read.');
  }
}

function checkDuration(info: VideoInfo) {
  const maxMinutes = getConfig().MEDIA_MAX_DURATION_MINUTES;
  if (typeof info.duration === 'number' && info.duration > maxMinutes * 60) {
    throw new MediaError(`This video exceeds the ${maxMinutes}-minute limit.`);
  }
}

export async function videoCaptions(
  url: string,
  directory: string,
  info: VideoInfo,
  preferred?: string,
): Promise<Transcript | null> {
  checkDuration(info);
  const choices = captionLanguages(info, preferred ?? info.language);
  // Try at most one language per preference to bound duplicate network requests.
  const preferredChoice = choices.find(
    (language) => language.split('-')[0] === (preferred ?? info.language)?.split('-')[0],
  );
  const english = choices.find((language) => language === 'en' || language.startsWith('en-'));
  const other = choices.find((language) => language !== preferredChoice && language !== english);
  for (const language of new Set([preferredChoice, english, other].filter(Boolean))) {
    try {
      await ytdlp(
        url,
        directory,
        [
          '--skip-download',
          '--write-subs',
          '--write-auto-subs',
          '--sub-format',
          'vtt',
          '--sub-langs',
          `^${language}$`,
          '-o',
          'caption.%(ext)s',
        ],
        15_000_000,
        55_000,
      );
      const path = join(directory, `caption.${language}.vtt`);
      if ((await stat(path)).size > captionLimit) continue;
      const transcript = parsePublishedTranscript(await readFile(path, 'utf8'), 'text/vtt');
      return { ...transcript, lang: language };
    } catch {
      /* A different published caption language may be available. */
    }
  }
  return null;
}

export async function videoAudio(url: string, directory: string, info: VideoInfo) {
  checkDuration(info);
  if (sizeKnown(info) > mediaDownloadLimit)
    throw new MediaError('Video audio exceeds the download limit.');
  const { MEDIA_MAX_DURATION_MINUTES } = getConfig();
  await ytdlp(
    url,
    directory,
    [
      '-f',
      new URL(url).hostname === 'www.youtube.com' ? 'bestaudio' : 'bestaudio/best',
      '--no-post-overwrites',
      '--max-filesize',
      `${mediaDownloadLimit}`,
      '--match-filters',
      `!is_live & duration <= ${MEDIA_MAX_DURATION_MINUTES * 60}`,
      '-o',
      'audio.%(ext)s',
    ],
    mediaDownloadLimit + 20_000_000,
    8 * 60_000,
  );
  const output = (await readdir(directory)).find(
    (name) => /^audio\.[a-z\d]+$/i.test(name) && !name.endsWith('.part'),
  );
  if (!output) throw new MediaError('No downloadable audio was available.');
  const path = join(directory, output);
  if ((await stat(path)).size > mediaDownloadLimit)
    throw new MediaError('Video audio exceeds the download limit.');
  return path;
}
