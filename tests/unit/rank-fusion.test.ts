import assert from 'node:assert/strict';
import test from 'node:test';
import { reciprocalRankScores } from '../../src/server/services/knowledge/rank-fusion';

test('reciprocal rank fusion starts at rank one and sums across ranked lists', () => {
  const ranks = reciprocalRankScores([
    [{ id: 'first' }, { id: 'shared' }],
    [{ id: 'other' }, { id: 'shared' }, { id: 'third' }],
    [],
  ]);
  assert.equal(ranks.get('first'), 1 / 61);
  assert.equal(ranks.get('shared'), 2 / 62);
  assert.equal(ranks.get('other'), 1 / 61);
  assert.equal(ranks.get('third'), 1 / 63);
  assert.ok(ranks.get('shared')! > ranks.get('first')!);
  assert.equal(reciprocalRankScores([[]]).size, 0);
});
