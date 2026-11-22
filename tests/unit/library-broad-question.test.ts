import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isBroadLibraryQuestion,
  libraryFocusTerms,
} from '../../src/server/services/knowledge/retrieval';

test('broad library questions are recognised and ignore meta words', () => {
  assert.equal(isBroadLibraryQuestion('What ideas connect across my saved reading?'), true);
  assert.equal(isBroadLibraryQuestion('Where do my saved sources disagree?'), true);
  assert.equal(isBroadLibraryQuestion('What should I revisit next?'), true);
  assert.equal(isBroadLibraryQuestion('What do my sources say about data centers?'), false);
  assert.deepEqual(libraryFocusTerms('What do my sources say about data centers?'), [
    'say',
    'data',
    'centers',
  ]);
});
