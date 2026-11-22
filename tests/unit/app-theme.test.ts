import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { APP_THEME_BOOT, parseAppTheme } from '../../src/shared/app-theme';

test('app bootstrap restores a saved theme before rendering and tolerates blocked storage', () => {
  for (const [saved, expected] of [
    ['dark', 'dark'],
    ['light', 'light'],
    ['system', 'system'],
    ['invalid', 'dark'],
    [null, 'dark'],
  ]) {
    const attributes: Record<string, string> = {};
    runInNewContext(APP_THEME_BOOT, {
      localStorage: { getItem: () => saved },
      document: {
        documentElement: {
          setAttribute: (key: string, value: string) => {
            attributes[key] = value;
          },
        },
      },
    });
    assert.equal(attributes['data-app-theme'], expected);
  }
  assert.equal(parseAppTheme(undefined), 'dark');
  const attributes: Record<string, string> = {};
  runInNewContext(APP_THEME_BOOT, {
    localStorage: {
      getItem: () => {
        throw Error('blocked');
      },
    },
    document: {
      documentElement: {
        setAttribute: (key: string, value: string) => {
          attributes[key] = value;
        },
      },
    },
  });
  assert.equal(attributes['data-app-theme'], 'dark');
});
