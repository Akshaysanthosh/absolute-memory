import test from 'node:test';
import assert from 'node:assert/strict';

import { chatNoteText } from '../../src/server/services/chat-note';
test('saved answers retain reference keys, quotes and passage targets', () => {
  const text = chatNoteText(
    'Question',
    'Answer [1] [2]',
    [
      {
        type: 'saved',
        key: '1',
        itemId: 'item',
        title: 'Source',
        quote: 'Exact evidence',
        passageIndex: 0,
      },
      { type: 'web', key: '2', title: 'Web source', url: 'https://example.com/article' },
    ],
    'http://localhost:3100',
  );
  assert.match(text, /Answer \[1\] \[2\]/);
  assert.match(text, /localhost:3100\/read\/item#p-0/);
  assert.match(text, /Exact evidence/);
  assert.match(text, /https:\/\/example.com\/article/);
});
