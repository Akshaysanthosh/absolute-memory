import assert from 'node:assert/strict';
import test from 'node:test';
import { bufferReadable, zipFiles } from '../../src/server/services/transfers/archive';
import { transferLimits } from '../../src/server/services/transfers/limits';
import { parseLegacyImport } from '../../src/server/services/transfers/legacy-import';

const date = '2021-01-01T00:00:00.000Z';
const url = 'https://example.org/story';
const bytes = (text: string) => Buffer.from(text);

for (const [format, input, title, expectedTag] of [
  [
    'netscape',
    `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="${url}?utm_source=fixture" ADD_DATE="1609459200" TAGS="research">Saved link</A></DL>`,
    'Saved link',
    'research',
  ],
  [
    'pocket',
    `url,title,time_added,status,tags\n${url},"Pocket, story",1609459200,unread,"research,ideas"`,
    'Pocket, story',
    'research',
  ],
  [
    'instapaper',
    `URL,Title,Selection,Folder,Timestamp\n${url},Instapaper story,Selected passage,Research,1609459200`,
    'Instapaper story',
    'Research',
  ],
  [
    'raindrop',
    `title,excerpt,note,link,created,tags\nRaindrop story,The saved preview,,${url},2021-01-01T00:00:00Z,research`,
    'Raindrop story',
    'research',
  ],
] as const) {
  test(`${format} preserves the source, saved date, labels and titles`, async () => {
    const {
      entries: [row],
    } = await parseLegacyImport(format, bytes(input));
    assert.deepEqual(
      { url: row.url, title: row.title, created: row.createdAt, tag: row.tags?.[0] },
      { url, title, created: date, tag: expectedTag },
    );
    if (format === 'instapaper') assert.equal(row.highlights?.[0].quote, 'Selected passage');
  });
}

test('Pocket HTML marks archived entries and rejects non-web destinations', async () => {
  const { entries, skipped } = await parseLegacyImport(
    'pocket',
    bytes(`<h1>Archive</h1><ul>
    <li><a href="${url}" time_added="1609459200">Saved</a></li><li><a href="file:///tmp/test">Local</a></li></ul>`),
  );
  assert.equal(skipped, 1);
  assert.equal(entries[0].archived, true);
  assert.equal(entries[0].createdAt, date);
});

test('Omnivore ZIP combines metadata, saved Markdown, and highlights', async () => {
  const archive = await bufferReadable(
    zipFiles([
      [
        'metadata_0.json',
        bytes(
          JSON.stringify([
            {
              url,
              title: 'Omnivore story',
              slug: 'story',
              savedAt: date,
              labels: [{ name: 'research' }],
            },
          ]),
        ),
      ],
      ['contents/story.md', bytes('Saved article body.')],
      ['highlights/story.md', bytes('> Preserved highlight.\n')],
    ]),
    transferLimits().uploadBytes,
  );
  const {
    entries: [row],
  } = await parseLegacyImport('omnivore', archive);
  assert.equal(row.text, 'Saved article body.');
  assert.equal(row.highlights?.[0].quote, 'Preserved highlight.');
  assert.equal(row.createdAt, date);
  assert.deepEqual(row.tags, ['research']);
});

test('Readwise Reader ZIP combines document CSV and highlight CSV', async () => {
  const archive = await bufferReadable(
    zipFiles([
      ['reader.csv', bytes(`Title,URL,Date Saved,Tags\nReader story,${url},${date},research`)],
      [
        'highlights.csv',
        bytes(
          `Book Title,Book URL,Highlight,Note\nReader story,${url},A Reader highlight.,My note`,
        ),
      ],
    ]),
    transferLimits().uploadBytes,
  );
  const {
    entries: [row],
  } = await parseLegacyImport('readwise', archive);
  assert.deepEqual(row.highlights, [{ quote: 'A Reader highlight.', createdAt: undefined }]);
  assert.equal(row.createdAt, date);
  assert.deepEqual(row.tags, ['research']);
});
