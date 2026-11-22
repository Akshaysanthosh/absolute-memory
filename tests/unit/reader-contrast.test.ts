import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { defaults, themes } from '../../src/features/reader/preferences';
import { memoryTheme } from '../../src/shared/am-theme';

const colorPair = /^light-dark\((#[a-f0-9]{6}),\s*(#[a-f0-9]{6})\)$/i;
const solid = /^#[a-f0-9]{6}$/i;

function luminance(hex: string) {
  const linear = (offset: number) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
}

function contrast(foreground: string, background: string) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('reader text, metadata and highlights meet WCAG AA in each theme', async () => {
  const css = await readFile(
    new URL('../../src/features/reader/reader.css', import.meta.url),
    'utf8',
  );
  const colors = (name: string) => {
    const role = css.match(new RegExp(`--reading-${name}: var\\((--[a-z-]+)\\);`))?.[1];
    assert.ok(role, `Expected a theme role for ${name}`);
    const value = memoryTheme.tokens[role];
    if (solid.test(value)) return [value, value];
    const pair = value?.match(colorPair);
    assert.ok(pair, `Expected a solid light/dark colour for ${name}`);
    return pair.slice(1);
  };

  const samples = [
    ['ink', 'canvas', 4.5],
    ['muted', 'canvas', 4.5],
    ['link', 'canvas', 4.5],
    ['ink', 'surface', 4.5],
    ['muted', 'surface', 4.5],
    ['link', 'muted-surface', 4.5],
    ['highlight-ink', 'highlight', 4.5],
    ['highlight-link', 'highlight', 4.5],
    ['progress-fill', 'canvas', 3],
  ] as const;
  for (const [foreground, background, minimum] of samples) {
    for (const [i, color] of colors(foreground).entries()) {
      const ratio = contrast(color, colors(background)[i]);
      assert.ok(
        ratio >= minimum,
        `${i === 0 ? 'Light' : 'Dark'} ${foreground} on ${background}: ${ratio.toFixed(2)}`,
      );
    }
  }
  assert.deepEqual(themes, ['light', 'dark']);
  assert.equal(defaults.theme, 'light');
  for (const theme of themes) {
    const selector = `\\.reading-page\\[data-color='${theme}'\\]\\s*\\{\\s*color-scheme:\\s*${theme}\\b`;
    assert.match(css, new RegExp(selector));
  }
});
