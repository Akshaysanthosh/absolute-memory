import { HttpError } from '@/server/auth/http';
import { podcastEpisodes } from '@/server/services/media/podcast';
import { savePodcast } from '@/server/services/media/save-podcast';
import { MediaError } from '@/shared/media/transcript';

export async function loadOrSavePodcast(
  userId: string,
  input: { feedUrl: string; episodeId?: string },
) {
  let episodes;
  try {
    episodes = await podcastEpisodes(input.feedUrl);
  } catch (e) {
    throw new HttpError(
      422,
      e instanceof MediaError ? e.message : 'This podcast RSS feed could not be loaded.',
    );
  }
  if (!input.episodeId)
    return {
      episodes: episodes.map(({ id, title, duration, transcriptUrl }) => ({
        id,
        title,
        duration,
        hasTranscript: !!transcriptUrl,
      })),
    };
  const episode = episodes.find((e) => e.id === input.episodeId);
  if (!episode) throw new HttpError(404, 'This episode was not found in the feed.');
  return savePodcast(userId, { episode });
}
