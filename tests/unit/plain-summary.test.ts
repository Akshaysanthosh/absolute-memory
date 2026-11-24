import assert from 'node:assert/strict';
import test from 'node:test';
import { plainSummary } from '../../src/server/providers/knowledge';

test('plain summaries keep prose unchanged', () => {
  assert.equal(plainSummary('  A short overview.  '), 'A short overview.');
  assert.equal(plainSummary('Braces {like these} stay.'), 'Braces {like these} stay.');
});

test('plain summaries remove a code fence around prose', () => {
  assert.equal(plainSummary('```\nA fenced overview.\n```'), 'A fenced overview.');
  assert.equal(plainSummary('```text\nA tagged fence.```'), 'A tagged fence.');
});

test('plain summaries use the summary field when a model answers with JSON', () => {
  const json = JSON.stringify({ summary: 'Borrowers return seed.', tags: ['seeds'] });
  assert.equal(plainSummary('```json\n' + json + '\n```'), 'Borrowers return seed.');
  assert.equal(plainSummary(json), 'Borrowers return seed.');
});

test('plain summaries keep JSON without a summary field rather than lose text', () => {
  assert.equal(plainSummary('{"note":"x"}'), '{"note":"x"}');
  assert.equal(plainSummary('{not json'), '{not json');
});
