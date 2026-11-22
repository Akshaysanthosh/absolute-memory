import test from 'node:test';
import assert from 'node:assert/strict';
import { captureInputMode } from '../../src/shared/capture-input';

test('note intent wins over stale links, podcast state and previously chosen files', () => {
  for (const url of [
    'https://open.spotify.com/episode/368cYnejZJcLVaW2MviuwC',
    'https://podcasts.apple.com/us/podcast/example/id123?i=456',
    'https://example.org/article',
  ]) {
    assert.equal(captureInputMode({ kind: 'note', url, hasFile: true, podcast: true }), 'note');
  }
});
test('mixed link and file capture is rejected for ordinary articles and podcast episode links', () => {
  for (const url of [
    'https://open.spotify.com/episode/368cYnejZJcLVaW2MviuwC',
    'https://podcasts.apple.com/us/podcast/example/id123?i=456',
    'https://example.org/article',
    'https://example.org/feed.xml',
  ]) {
    assert.throws(
      () => captureInputMode({ kind: 'article', url, hasFile: true, podcast: true }),
      /one source at a time/,
    );
  }
});
test('single-source dispatch preserves public podcast, article, video and file saves', () => {
  assert.equal(
    captureInputMode({
      kind: 'article',
      url: 'https://open.spotify.com/episode/368cYnejZJcLVaW2MviuwC',
      hasFile: false,
      podcast: false,
    }),
    'podcast',
  );
  assert.equal(
    captureInputMode({
      kind: 'article',
      url: 'https://example.org/feed.xml',
      hasFile: false,
      podcast: true,
    }),
    'podcast',
  );
  assert.equal(
    captureInputMode({
      kind: 'article',
      url: 'https://youtube.com/watch?v=jNQXAC9IVRw',
      hasFile: false,
      podcast: false,
    }),
    'article',
  );
  assert.equal(
    captureInputMode({ kind: 'file', url: '  ', hasFile: true, podcast: false }),
    'file',
  );
  assert.equal(
    captureInputMode({
      kind: 'article',
      url: 'https://example.org/article',
      hasFile: false,
      podcast: false,
    }),
    'article',
  );
});
