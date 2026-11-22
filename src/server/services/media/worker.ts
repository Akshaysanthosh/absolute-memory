import {
  readMediaWork,
  deleteMediaSource,
  saveTimedMediaSegments,
  type MediaWorkSource,
} from '@/server/repos/media-sources';
import { completeMediaImportLease } from '@/server/repos/import-jobs';
import { finishSocialMediaFallback, finishTimedMediaItem } from '@/server/repos/media-items';
import { reanchorHighlights } from '@/server/services/reading';
import type { Database } from '@/server/db';
import { tagBookmark } from '@/server/services/bookmarks';
import { fetchArticle } from '@/server/services/extract';
import { withImportHeartbeat } from '@/server/jobs/import-lease';
import {
  canTranscribe,
  downloadPodcastAudio,
  stageUploadedAudio,
  transcribeAudio,
} from '@/server/services/media/audio';
import { publicText } from '@/server/services/media/public-text';
import { parsePublishedTranscript } from '@/server/services/media/podcast';
import { mediaEnabled, withMediaDirectory } from '@/server/services/media/tools';
import { videoAudio, videoCaptions, videoMetadata } from '@/server/services/media/video';
import { MediaError, type Transcript } from '@/shared/media/transcript';
import { mediaReading } from '@/server/services/import/transcript';
import { getConfig } from '@/server/config';
import type { Passage } from '@/shared/passages';

type Job = { id: string; item_id: string; lock_token: string; attempts?: number };
type MediaContent = {
  transcript?: Transcript | null;
  title?: string;
  author?: string;
  description?: string | null;
  duration?: number | null;
  warning?: string;
  fallbackPassages?: Passage[];
};

async function readMedia(
  source: MediaWorkSource,
  readPublished: typeof publicText,
): Promise<MediaContent> {
  const { kind, transcript_url, audio_url, audio_object_key, url } = source;
  let warning = 'No published transcript is available for this source.';
  if (kind === 'podcast' && transcript_url) {
    try {
      const published = await readPublished(transcript_url);
      return { transcript: parsePublishedTranscript(published.text, published.type) };
    } catch {
      warning = 'The published transcript could not be read.';
    }
  }
  if (kind === 'audio' || kind === 'podcast') {
    if (!canTranscribe()) {
      if (kind === 'audio')
        throw new MediaError(
          'Audio transcription is unavailable. Check the provider and ffmpeg, then upload again.',
        );
      return { warning: warning + ' Configure transcription to process the audio.' };
    }
    if (!audio_url && !audio_object_key) return { warning: 'No audio is available for this item.' };
    const max = getConfig().MEDIA_MAX_DURATION_MINUTES;
    if (source.duration_seconds && source.duration_seconds > max * 60)
      return { warning: `This episode exceeds the ${max}-minute limit.` };
    try {
      return await withMediaDirectory(async (directory) => {
        const path = audio_object_key
          ? await stageUploadedAudio(audio_object_key, directory)
          : await downloadPodcastAudio(audio_url!, directory);
        const transcript = await transcribeAudio(path, directory);
        return {
          transcript,
          duration: transcript.duration,
          warning: 'The transcription provider found no speech.',
        };
      });
    } catch (error) {
      if (kind === 'audio' || (error instanceof MediaError && error.retryable)) throw error;
      return {
        warning:
          error instanceof MediaError ? error.message : 'The podcast audio could not be read.',
      };
    }
  }
  if (!url) return { warning };
  let result: MediaContent = {
    warning: 'Video fetching is unavailable. Install yt-dlp or enable media fetching.',
  };
  if (mediaEnabled()) {
    result = await withMediaDirectory(async (directory) => {
      let info;
      try {
        info = await videoMetadata(url, directory);
      } catch (error) {
        return {
          warning:
            error instanceof MediaError ? error.message : 'Video metadata could not be retrieved.',
        };
      }
      const metadata = {
        title: info.title?.slice(0, 300),
        author: (info.uploader || info.channel)?.slice(0, 255),
        description: info.description?.slice(0, 12_000),
        duration: info.duration,
      };
      try {
        const published =
          kind === 'youtube'
            ? await videoCaptions(url, directory, info, source.source_language ?? undefined)
            : null;
        if (published) return { ...metadata, transcript: published };
        if (!canTranscribe())
          return {
            ...metadata,
            warning: warning + ' Configure transcription to process available audio.',
          };
        const path = await videoAudio(url, directory, info);
        const transcript = await transcribeAudio(path, directory);
        return { ...metadata, transcript, warning: 'The transcription provider found no speech.' };
      } catch (error) {
        if (error instanceof MediaError && error.retryable) throw error;
        return {
          ...metadata,
          warning: error instanceof MediaError ? error.message : 'Video audio could not be read.',
        };
      }
    });
  }
  if (kind === 'social' && !source.has_snapshot && !result.transcript && !result.description) {
    // A social post with no downloadable audio can still be a text article.
    try {
      const article = await fetchArticle(url);
      return {
        ...result,
        title: article.title,
        author: article.author ?? undefined,
        fallbackPassages: article.passages,
      };
    } catch {
      /* Keep the source URL and the media warning. */
    }
  }
  return result;
}

export async function processMedia(
  db: Database,
  job: Job,
  readPublished = publicText,
): Promise<boolean> {
  const {
    rows: [source],
  } = await readMediaWork(db, job.item_id);
  if (!source) return false;
  let result: MediaContent;
  try {
    result = await withImportHeartbeat(db, job.id, job.lock_token, () =>
      readMedia(source, readPublished),
    );
  } catch (error) {
    if (error instanceof MediaError && error.retryable && (job.attempts ?? 0) < 3) throw error;
    result = {
      warning: error instanceof MediaError ? error.message : 'The media source could not be read.',
    };
  }
  const transcript = result.transcript?.content.length ? result.transcript : null;
  const warning = transcript
    ? null
    : (result.warning ??
      'This save has no available transcript. You can open the original source.');

  await db.transaction(async (tx) => {
    const { rows } = await completeMediaImportLease(tx, job.id, job.lock_token);
    if (!rows.length) return;
    const description = result.description ?? source.description;
    const reading = mediaReading(transcript?.content ?? [], description, result.fallbackPassages);
    const passages = JSON.stringify(reading.passages);
    const content = reading.passages
      .map((passage) => passage.text)
      .join(' ')
      .trim();
    const words = content ? content.split(/\s+/).length : 0;
    if (!transcript && source.kind === 'social') {
      await deleteMediaSource(tx, job.item_id, source.user_id);
      await finishSocialMediaFallback(
        tx,
        job.item_id,
        source.user_id,
        result.title ?? null,
        result.author ?? null,
        passages,
        words,
        content.slice(0, 300),
        warning,
        reading.html,
      );
      await tagBookmark(tx, job.item_id);
      return;
    }

    await saveTimedMediaSegments(
      tx,
      job.item_id,
      source.user_id,
      JSON.stringify(transcript?.content ?? []),
      transcript?.lang ?? null,
      warning,
      result.duration ?? null,
    );
    await finishTimedMediaItem(
      tx,
      job.item_id,
      source.user_id,
      passages,
      words,
      content.slice(0, 300),
      result.title ?? null,
      result.author ?? null,
      description ?? null,
      reading.html,
    );
    await reanchorHighlights(tx, source.user_id, job.item_id, reading.passages);
  });
  return true;
}
