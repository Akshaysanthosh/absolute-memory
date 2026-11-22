import { JSDOM } from 'jsdom';
import { z } from 'zod';
import { publicText } from '@/server/services/media/public-text';
import { parseFeed, type Episode } from '@/server/services/media/podcast';
import { MediaError } from '@/shared/media/transcript';
import { normalizeUrl } from '@/server/services/extract';
const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
type Read = typeof publicText;
export function isPodcastLink(input: string) {
  try {
    return ['podcasts.apple.com', 'open.spotify.com'].includes(new URL(input).hostname);
  } catch {
    return false;
  }
}
const directoryEntry = z.object({
  trackId: z.union([z.number(), z.string()]).optional(),
  feedUrl: z.string().optional(),
  trackName: z.string().optional(),
  episodeUrl: z.string().optional(),
  collectionName: z.string().optional(),
});
const directoryResponse = z.object({ results: z.array(z.unknown()).default([]) });
const episodeNode = z.object({
  '@type': z.literal('PodcastEpisode'),
  name: z.string().optional(),
  partOfSeries: z.object({ name: z.string().optional() }).optional(),
});
const graphNodes = z.object({ '@graph': z.array(z.unknown()) });
const spotifyEmbed = z.object({
  props: z.object({
    pageProps: z.object({
      state: z.object({
        data: z.object({
          entity: z.object({
            type: z.literal('episode'),
            id: z.string(),
            name: z.string(),
            subtitle: z.string(),
          }),
        }),
      }),
    }),
  }),
});

async function directory(url: string, read: Read) {
  try {
    const { results } = directoryResponse.parse(JSON.parse((await read(url)).text));
    return results.flatMap((entry) => {
      const parsed = directoryEntry.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    throw new MediaError(
      'The podcast directory could not resolve this link. Try its public RSS feed.',
    );
  }
}

function spotifyMetadata(html: string) {
  const dom = new JSDOM(html);
  try {
    for (const script of dom.window.document.querySelectorAll(
      'script[type="application/ld+json"]',
    )) {
      let value: unknown;
      try {
        value = JSON.parse(script.textContent || 'null');
      } catch {
        continue;
      }
      const graph = graphNodes.safeParse(value);
      const nodes = Array.isArray(value) ? value : graph.success ? graph.data['@graph'] : [value];
      for (const node of nodes) {
        const parsed = episodeNode.safeParse(node);
        if (parsed.success)
          return { title: parsed.data.name, showName: parsed.data.partOfSeries?.name };
      }
    }
  } finally {
    dom.window.close();
  }
  return {};
}
function select(episodes: Episode[], title: string, audio?: string) {
  const matches = episodes.filter((e) =>
    audio ? e.audioUrl === audio : norm(e.title) === norm(title),
  );
  if (matches.length !== 1)
    throw new MediaError(
      'This episode was not uniquely found in its public feed. Paste the public RSS feed and select the episode.',
    );
  return matches;
}
export async function resolvePodcastLink(
  input: string,
  read: Read = publicText,
): Promise<Episode[]> {
  const url = new URL(input);
  let feed: string | undefined,
    title = '',
    audio: string | undefined;
  if (url.hostname === 'podcasts.apple.com') {
    const showId = url.pathname.match(/\/id(\d+)$/)?.[1],
      episodeId = url.searchParams.get('i');
    if (!showId) throw new MediaError('Use an Apple Podcasts show or episode link.');
    const show = await directory(
      `https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&limit=200`,
      read,
    );
    feed = show[0]?.feedUrl;
    if (episodeId) {
      if (!/^\d+$/.test(episodeId)) throw new MediaError('Invalid Apple episode link.');
      const matchesEpisode = (entry: z.infer<typeof directoryEntry>) =>
        String(entry.trackId) === episodeId;
      const result =
        show.find(matchesEpisode) ??
        (
          await directory(
            `https://itunes.apple.com/lookup?id=${episodeId}&entity=podcastEpisode`,
            read,
          )
        ).find(matchesEpisode);
      title = result?.trackName || '';
      audio = result?.episodeUrl;
      if (!title && !audio)
        throw new MediaError(
          'Apple did not return a public match for this episode. Try its RSS feed in Add content → Podcast.',
        );
    }
  } else if (url.hostname === 'open.spotify.com') {
    if (!/^\/episode\/[A-Za-z0-9]{22}\/?$/.test(url.pathname))
      throw new MediaError(
        'Use a Spotify podcast episode link. Music and private/exclusive content cannot be imported.',
      );
    const page = await read(url.href);
    const metadata = spotifyMetadata(page.text);
    let showName = metadata.showName;
    title = metadata.title || '';
    if (!showName || !title) {
      // Public embed metadata identifies the episode; never use preview audio as the source.
      const id = url.pathname.split('/')[2];
      const embedded = await read(`https://open.spotify.com/embed/episode/${id}`);
      const embedDom = new JSDOM(embedded.text);
      try {
        const response = spotifyEmbed.safeParse(
          JSON.parse(
            embedDom.window.document.querySelector('script#__NEXT_DATA__')?.textContent || 'null',
          ),
        );
        const entity = response.success
          ? response.data.props.pageProps.state.data.entity
          : undefined;
        if (entity?.id === id) {
          title = entity.name;
          showName = entity.subtitle;
        }
      } catch {
      } finally {
        embedDom.window.close();
      }
    }
    if (!showName || !title)
      throw new MediaError(
        'Spotify did not expose a public episode/show match. Paste the podcast RSS feed instead.',
      );
    const results = await directory(
      `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=5&term=${encodeURIComponent(showName)}`,
      read,
    );
    const normalizedName = norm(showName);
    // Directory storefronts can repeat the same show and feed.
    const feeds = [
      ...new Set(
        results.flatMap((show) => {
          if (!show.feedUrl || !show.collectionName || norm(show.collectionName) !== normalizedName)
            return [];
          try {
            return [normalizeUrl(show.feedUrl)];
          } catch {
            return [];
          }
        }),
      ),
    ];
    if (feeds.length !== 1)
      throw new MediaError(
        'A unique public feed was not found for this Spotify show. Paste its RSS feed instead.',
      );
    feed = feeds[0];
  } else throw new MediaError('Unsupported podcast link.');
  if (typeof feed !== 'string') throw new MediaError('This podcast has no public RSS feed.');
  const response = await read(feed, 8_000_000),
    episodes = parseFeed(response.text, response.url);
  return title || audio ? select(episodes, title, audio) : episodes;
}
