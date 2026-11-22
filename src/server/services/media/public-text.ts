import { collectBytes, FetchLimitError, safeFetch } from '@/server/security/safe-fetch';
import { MediaError } from '@/shared/media/transcript';

export async function publicText(input: string, maxBytes = 2_000_000) {
  try {
    return await safeFetch(
      input,
      {
        maxBytes,
        accept: 'application/rss+xml,application/xml,text/xml,text/vtt,application/json,text/plain',
      },
      async (response, url, body) => {
        if (!response.ok)
          throw new MediaError(
            'This feed or published transcript is unavailable.',
            response.status === 429 || response.status >= 500,
            response.status === 404,
          );
        const text = (await collectBytes(body)).toString('utf8');
        return { text, type: response.headers.get('content-type') || '', url: url.href };
      },
    );
  } catch (error) {
    if (error instanceof FetchLimitError)
      throw new MediaError(`The feed or transcript exceeds the ${maxBytes / 1_000_000} MB limit.`);
    throw error;
  }
}
