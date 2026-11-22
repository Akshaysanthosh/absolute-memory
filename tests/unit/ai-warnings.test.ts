import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIWarningLogger } from '../../src/server/providers/ai-warnings';
test('known compatibility notice is bounded while other warnings remain visible', () => {
  let info = 0,
    warnings = 0;
  const logger = createAIWarningLogger(
    () => info++,
    () => warnings++,
  );
  const known = {
    provider: 'deepseek.chat',
    model: 'deepseek-flash',
    warnings: [
      {
        type: 'compatibility' as const,
        feature: 'responseFormat JSON schema',
        details: 'schema supplied in prompt',
      },
    ],
  };
  logger(known);
  logger(known);
  assert.equal(info, 1);
  assert.equal(warnings, 0);
  logger({ warnings: [{ type: 'other', message: 'Provider degraded' }] });
  assert.equal(warnings, 1);
});
