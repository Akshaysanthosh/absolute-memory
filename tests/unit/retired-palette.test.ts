import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const palette = 'tests/fixtures/retired-palette.txt';

test('tracked files exclude the retired palette', () => {
  const values = readFileSync(palette, 'utf8').trim().split('\n');
  const pattern = new RegExp(values.join('|'), 'i');
  const files = execFileSync('git', ['ls-files', '--cached', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((file) => file && file !== palette && file !== 'package-lock.json');
  const violations = files.filter((file) => pattern.test(readFileSync(file, 'latin1')));
  assert.deepEqual(violations, []);
});
