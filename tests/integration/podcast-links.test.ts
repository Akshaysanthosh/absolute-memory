import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePodcastLink } from '../../src/server/services/media/podcast-links';
const feed =
  '<rss><channel><title>Example show</title><item><title>A useful episode</title><guid>one</guid><enclosure url="https://example.org/audio.mp3"/></item></channel></rss>';
test('Apple episode resolves a unique public feed episode and show links list episodes', async () => {
  const read = async (url: string) => ({
    url,
    type: 'application/json',
    text: url.includes('lookup?id=123')
      ? JSON.stringify({ results: [{ feedUrl: 'https://example.org/rss' }] })
      : url.includes('lookup?id=456')
        ? JSON.stringify({ results: [{ trackId: 456, trackName: 'A useful episode' }] })
        : feed,
  });
  assert.equal(
    (await resolvePodcastLink('https://podcasts.apple.com/us/podcast/example/id123?i=456', read))[0]
      .title,
    'A useful episode',
  );
  assert.equal(
    (await resolvePodcastLink('https://podcasts.apple.com/us/podcast/example/id123', read)).length,
    1,
  );
  await assert.rejects(
    resolvePodcastLink('https://podcasts.apple.com/us/podcast/example/id123?i=bad', read),
    /Invalid/,
  );
});
test('Spotify requires an exact show and episode match; never substitutes an unrelated episode', async () => {
  const spotify = 'https://open.spotify.com/episode/1234567890123456789012';
  const read = async (url: string) => ({
    url,
    type: 'text/html',
    text:
      url === spotify
        ? '<script type="application/ld+json">' +
          JSON.stringify({
            '@type': 'PodcastEpisode',
            name: 'A useful episode',
            partOfSeries: { name: 'Example show' },
          }) +
          '</script>'
        : url.includes('itunes.apple.com')
          ? JSON.stringify({
              results: [{ collectionName: 'Example show', feedUrl: 'https://example.org/rss' }],
            })
          : feed,
  });
  assert.equal((await resolvePodcastLink(spotify, read))[0].title, 'A useful episode');
  await assert.rejects(
    resolvePodcastLink(spotify, async (url) => {
      const result = await read(url);
      return url.endsWith('/rss')
        ? { ...result, text: feed.replace('A useful episode', 'Different episode') }
        : result;
    }),
    /not uniquely/,
  );
  await assert.rejects(
    resolvePodcastLink('https://open.spotify.com/track/1234567890123456789012', read),
    /Music/,
  );
});

test('Spotify public embed fallback verifies episode identity before exact feed matching', async () => {
  const id = '1234567890123456789012';
  const read = async (url: string) => ({
    url,
    type: 'text/html',
    text: url.includes('/embed/')
      ? '<script id="__NEXT_DATA__">' +
        JSON.stringify({
          props: {
            pageProps: {
              state: {
                data: {
                  entity: {
                    type: 'episode',
                    id,
                    name: 'A useful episode',
                    subtitle: 'Example show',
                  },
                },
              },
            },
          },
        }) +
        '</script>'
      : url.includes('open.spotify.com')
        ? '<html></html>'
        : url.includes('itunes.apple.com')
          ? JSON.stringify({
              results: [{ collectionName: 'Example show', feedUrl: 'https://example.org/rss' }],
            })
          : feed,
  });
  assert.equal(
    (await resolvePodcastLink(`https://open.spotify.com/episode/${id}`, read))[0].title,
    'A useful episode',
  );
  await assert.rejects(
    resolvePodcastLink(`https://open.spotify.com/episode/${id}`, async (url) => {
      const result = await read(url);
      return url.includes('/embed/')
        ? { ...result, text: result.text.replace(id, 'different') }
        : result;
    }),
    /did not expose/,
  );
});
test('Apple resolves an exact episode from the show directory when standalone lookup is unavailable', async () => {
  let standaloneCalls = 0;
  const read = async (url: string) => ({
    url,
    type: 'application/json',
    text: url.includes('lookup?id=123')
      ? JSON.stringify({
          results: [
            { trackId: 123, feedUrl: 'https://example.org/rss' },
            {
              trackId: 456,
              trackName: 'A useful episode',
              episodeUrl: 'https://example.org/audio.mp3',
            },
          ],
        })
      : url.includes('lookup?id=456')
        ? (standaloneCalls++, JSON.stringify({ results: [] }))
        : feed,
  });
  assert.equal(
    (await resolvePodcastLink('https://podcasts.apple.com/us/podcast/example/id123?i=456', read))[0]
      .title,
    'A useful episode',
  );
  assert.equal(standaloneCalls, 0);
});

test('duplicate directory rows for one exact feed are accepted; distinct feeds remain ambiguous', async () => {
  const spotify = 'https://open.spotify.com/episode/1234567890123456789012';
  const read = async (url: string) => ({
    url,
    type: 'text/html',
    text:
      url === spotify
        ? '<script type="application/ld+json">' +
          JSON.stringify({
            '@type': 'PodcastEpisode',
            name: 'A useful episode',
            partOfSeries: { name: 'Example show' },
          }) +
          '</script>'
        : url.includes('itunes.apple.com')
          ? JSON.stringify({
              results: [
                { collectionName: 'Example show', feedUrl: 'https://example.org/rss' },
                { collectionName: 'Example show', feedUrl: 'https://example.org/rss' },
              ],
            })
          : feed,
  });
  assert.equal((await resolvePodcastLink(spotify, read))[0].title, 'A useful episode');
  await assert.rejects(
    resolvePodcastLink(spotify, async (url) => {
      const r = await read(url);
      return url.includes('itunes.apple.com')
        ? {
            ...r,
            text: JSON.stringify({
              results: [
                { collectionName: 'Example show', feedUrl: 'https://example.org/rss' },
                { collectionName: 'Example show', feedUrl: 'https://other.example/rss' },
              ],
            }),
          }
        : r;
    }),
    /unique public feed/,
  );
});
