import test from 'node:test';
import assert from 'node:assert/strict';
import { captureTags } from '../../src/server/services/saved-content';

test('title tags skip common words', () => {
  assert.deepEqual(captureTags('Why the new GPU was gonna change how we train models'), [
    'gpu',
    'change',
    'train',
    'models',
  ]);
});

test('singular tags keep cookie and movie intact', async () => {
  const { canonicalTag } = await import('../../src/shared/tag-names');
  assert.equal(canonicalTag('cookies'), 'cookie');
  assert.equal(canonicalTag('movies'), 'movie');
  assert.equal(canonicalTag('categories'), 'category');
});
