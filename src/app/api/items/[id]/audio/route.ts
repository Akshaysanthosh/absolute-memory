import { HttpError, identity, resourceId, route } from '@/server/auth/http';
import { readingMedia } from '@/server/services/reading';
import { podcastAudio } from '@/server/services/media/playback';

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { userId } = await identity(request);
    const { id } = await context.params;
    const media = await readingMedia(userId, resourceId(id));
    if (media?.kind !== 'podcast' || !media.audio_url) throw new HttpError(404, 'Audio not found.');
    const audio = await podcastAudio(media.audio_url, request.headers.get('range'), request.signal);
    return new Response(audio.body, { status: audio.status, headers: audio.headers });
  });
}
