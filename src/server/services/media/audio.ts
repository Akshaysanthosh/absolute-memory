import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getConfig, maximumUploadBytes } from '@/server/config';
import { getStorage, getTranscriber } from '@/server/providers';
import { safeFetch } from '@/server/security/safe-fetch';
import { executable, mediaDownloadLimit, runFile } from '@/server/services/media/tools';
import { MediaError, type Segment, type Transcript } from '@/shared/media/transcript';

const sampleRate = 16_000;
const bytesPerSecond = sampleRate * 2;
const chunkSeconds = 600;
const overlapSeconds = 2;

export function canTranscribe() {
  return Boolean(executable('ffmpeg') && getTranscriber());
}

async function writeAudio(path: string, stream: AsyncIterable<Uint8Array>, maxBytes: number) {
  let length = 0;
  async function* bounded() {
    for await (const chunk of stream) {
      length += chunk.byteLength;
      if (length > maxBytes) throw new MediaError('Audio exceeds the download limit.');
      yield chunk;
    }
  }
  await pipeline(Readable.from(bounded()), createWriteStream(path, { flags: 'wx' }));
  if (!length) throw new MediaError('The audio file is empty.');
  return path;
}

export async function downloadPodcastAudio(url: string, directory: string) {
  return safeFetch(
    url,
    { maxBytes: mediaDownloadLimit, timeoutMs: 180_000 },
    async (res, _url, stream) => {
      if (!res.ok)
        throw new MediaError(
          'This podcast enclosure could not be downloaded.',
          res.status === 429 || res.status >= 500,
        );
      return writeAudio(join(directory, 'episode'), stream, mediaDownloadLimit);
    },
  );
}

export async function stageUploadedAudio(key: string, directory: string) {
  const source = await getStorage().get(key);
  try {
    return await writeAudio(join(directory, 'upload'), source, maximumUploadBytes());
  } finally {
    source.destroy();
  }
}

function wavHeader(size: number) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(size + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(bytesPerSecond, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(size, 40);
  return header;
}

export function stitchAudioSegments(
  segments: Segment[],
  from: number,
  until: number,
  overlap: number,
) {
  return segments.flatMap((segment) => {
    const untimed = segment.offset === 0 && segment.duration === 0;
    const offset = from + (untimed ? overlap / 2 : segment.offset);
    const end = Math.min(until, offset + segment.duration);
    if (offset >= until || offset + (end - offset) / 2 < from + overlap / 2) return [];
    return [{ ...segment, offset, duration: Math.max(0, end - offset) }];
  });
}

export async function transcribeAudio(
  path: string,
  directory: string,
): Promise<Transcript & { duration: number }> {
  const ffmpeg = executable('ffmpeg');
  const transcriber = getTranscriber();
  if (!ffmpeg || !transcriber)
    throw new MediaError(
      'Audio transcription requires ffmpeg and a configured transcription provider.',
    );
  const maxMinutes = getConfig().MEDIA_MAX_DURATION_MINUTES;
  const maxSeconds = maxMinutes * 60;
  const pcm = join(directory, 'normalized.pcm');
  try {
    await runFile(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'file',
        '-format_whitelist',
        'aac,flac,matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,mp3,ogg,wav',
        '-i',
        path,
        '-vn',
        '-sn',
        '-dn',
        '-map',
        '0:a:0',
        '-ac',
        '1',
        '-ar',
        String(sampleRate),
        '-t',
        String(maxSeconds + 1),
        '-fs',
        String((maxSeconds + 2) * bytesPerSecond),
        '-f',
        's16le',
        '-n',
        pcm,
      ],
      { cwd: directory, timeout: 180_000, maxBuffer: 1_000_000 },
    );
  } catch {
    throw new MediaError('The file does not contain readable audio or could not be normalized.');
  }

  const { size } = await stat(pcm);
  if (!size) throw new MediaError('The file does not contain readable audio.');
  if (size > maxSeconds * bytesPerSecond)
    throw new MediaError(`This audio exceeds the ${maxMinutes}-minute limit.`);
  const content: Segment[] = [];
  let lang: string | undefined;
  for (let offset = 0; offset < size; offset += (chunkSeconds - overlapSeconds) * bytesPerSecond) {
    const end = Math.min(size, offset + chunkSeconds * bytesPerSecond);
    const length = end - offset;
    if (offset && length <= overlapSeconds * bytesPerSecond) break;
    async function* wav() {
      yield wavHeader(length);
      yield* createReadStream(pcm, { start: offset, end: end - 1 });
    }
    let response;
    try {
      response = await transcriber.transcribe(Readable.from(wav()), {
        maxBytes: chunkSeconds * bytesPerSecond + 44,
        language: lang,
      });
    } catch {
      throw new MediaError(
        'The transcription provider could not process this audio. Check the provider or retry.',
        true,
      );
    }
    lang ||= response.language?.match(/^[a-z]{2}$/i)?.[0];
    const overlap = offset ? overlapSeconds * 1000 : 0;
    content.push(
      ...stitchAudioSegments(
        response.segments,
        (offset / bytesPerSecond) * 1000,
        (end / bytesPerSecond) * 1000,
        overlap,
      ),
    );
    if (content.length > 12_000 || Buffer.byteLength(JSON.stringify(content)) > 700_000) {
      throw new MediaError('The transcript exceeds the size limit. Try a shorter section.');
    }
  }
  return { content, lang, duration: size / bytesPerSecond };
}
