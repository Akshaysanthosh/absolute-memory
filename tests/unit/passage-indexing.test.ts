import test from 'node:test';
import assert from 'node:assert/strict';
import { chunksFor } from '../../src/server/services/knowledge/content';
import { validateCitations } from '../../src/shared/knowledge/shared';

test('long chunking retains every character and valid passage ranges', () => {
  const text = 'AMD processors and memory. '.repeat(3000);
  const passages = [
    { index: 0, text },
    { index: 1, text: 'Final evidence.' },
  ];
  const chunks = chunksFor(passages);
  assert.equal(chunks.map((c) => c.content).join(''), text + '\n\nFinal evidence.');
  assert.equal(chunks.at(-1)?.passageIndices.at(-1), 1);
  assert.ok(chunks.length > 10);
});

test('grouped citations become verified links and cannot introduce invented sources', () => {
  const sources = ['1', '2', '3'].map((key) => ({ key }));
  assert.equal(
    validateCitations('Evidence [1–3] and [1, 2].', sources),
    'Evidence [1] [2] [3] and [1] [2].',
  );
  assert.equal(
    validateCitations('[2-4] [3-1] [1-999999]', sources),
    '[2] [3] [source unavailable] [source unavailable] [source unavailable]',
  );
});
