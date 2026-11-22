import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNoteDocument, passagesToNoteDocument } from '../../src/shared/note-document';
import { noteReading } from '../../src/server/services/import/note';

const origin = 'https://memory.example.test';

test('rich notes retain formatting and source links in the reading representation', () => {
  const doc = validateNoteDocument({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { id: 'existing-anchor' },
        content: [
          {
            type: 'text',
            text: 'Evidence',
            marks: [{ type: 'bold' }, { type: 'link', attrs: { href: '/read/source' } }],
          },
        ],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Verify source' }] }],
          },
        ],
      },
    ],
  });
  const first = noteReading(doc, origin);
  assert.deepEqual(first, noteReading(JSON.parse(JSON.stringify(doc)), origin));
  assert.match(first.html, /<strong>Evidence<\/strong>/);
  assert.match(first.html, /href="https:\/\/memory\.example\.test\/read\/source"/);
  assert.deepEqual(first.passages, [
    { index: 0, text: 'Evidence' },
    { index: 1, text: 'Verify source' },
  ]);
  assert.equal(passagesToNoteDocument(first.passages).content?.[0].content?.[0].text, 'Evidence');
});

test('unsafe URLs and unsupported content are rejected or stripped', () => {
  const doc = validateNoteDocument({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Link',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ],
  });
  assert.doesNotMatch(noteReading(doc, origin).html, /href|javascript/);
  assert.throws(() =>
    validateNoteDocument({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'data:text/html,bad' } }],
    }),
  );
  assert.throws(() => validateNoteDocument({ type: 'doc', content: [{ type: 'script' }] }));
  assert.throws(
    () =>
      validateNoteDocument({
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { id: 'same' } },
          { type: 'paragraph', attrs: { id: 'same' } },
        ],
      }),
    /Duplicate paragraph/,
  );
});

test('rejects nested blocks that the editor cannot reopen', () => {
  assert.throws(
    () =>
      validateNoteDocument({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'heading', content: [{ type: 'text', text: 'Invalid nesting' }] }],
          },
        ],
      }),
    /Invalid note structure/,
  );
});
