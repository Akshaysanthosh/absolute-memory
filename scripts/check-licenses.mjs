import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const lock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));
const notices = new URL('THIRD_PARTY_NOTICES.md', root);
const allowed = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '(MPL-2.0 OR Apache-2.0)',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'OFL-1.1',
  '(AFL-2.1 OR BSD-3-Clause)',
]);

// Next lists these optional image optimizer packages. The app uses its own
// media pipeline and the self-hosted image omits the unused optimizer binaries.
const unusedNativeOptimizer =
  /^@img\/sharp-(?:libvips-(?:darwin-(?:arm64|x64)|linux-(?:arm|arm64|ppc64|riscv64|s390x|x64)|linuxmusl-(?:arm64|x64))|wasm32|win32-(?:arm64|ia32|x64))$/;
const rows = new Set();
const invalid = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev) continue;
  const name = path.split('node_modules/').at(-1);
  if (entry.optional && unusedNativeOptimizer.test(name)) continue;
  // The checked-in lockfile uses "BSD" for this version. Its LICENSE identifies the three-clause terms.
  const license =
    name === 'css-mediaquery' && entry.version === '0.1.2' && entry.license === 'BSD'
      ? 'BSD-3-Clause'
      : entry.license;
  if (!allowed.has(license)) invalid.push(`${name}@${entry.version}: ${license ?? 'unknown'}`);
  rows.add(`| ${name} | ${entry.version} | ${license} |`);
}
if (invalid.length)
  throw new Error(`Unexpected production dependency licences:\n${invalid.join('\n')}`);

const output = `# Third-party notices

This inventory covers the production dependency lockfile across supported operating systems. Run \`node scripts/check-licenses.mjs --write\` after updating dependencies. Each installed package contains its own licence and copyright terms.

The image omits the optional native libraries for Next.js image optimization. Absolute Memory serves its own previews and original files.

The container includes the separately built FFmpeg and yt-dlp executables. See \`/usr/share/doc/absolute-memory-media\` in the image for the corresponding source and licence notices. The [NOTICE](NOTICE) credits code adapted from open-recall.

| Package | Version | Licence |
| --- | --- | --- |
${[...rows].sort().join('\n')}
`;
if (process.argv.includes('--write')) writeFileSync(notices, output);
else if (readFileSync(notices, 'utf8') !== output)
  throw new Error('THIRD_PARTY_NOTICES.md is out of date.');

// The docs site is built separately and its lockfile never enters the app image.
const siteLock = JSON.parse(readFileSync(new URL('website/package-lock.json', root), 'utf8'));
const siteAllowed = new Set([
  ...allowed,
  'Python-2.0',
  '(MIT OR CC0-1.0)',
  '(WTFPL OR MIT)',
  '(BSD-2-Clause OR MIT OR Apache-2.0)',
]);
// These three legacy packages declare MIT in their published package or licence file.
const siteLegacy = new Map([
  ['eval@0.1.8', 'MIT'],
  ['format@0.2.2', 'MIT'],
  ['require-like@0.1.2', 'MIT'],
]);
const siteInvalid = [];
for (const [path, entry] of Object.entries(siteLock.packages)) {
  if (!path) continue;
  const name = path.split('node_modules/').at(-1);
  const dependency = `${name}@${entry.version}`;
  const licence = entry.license ?? siteLegacy.get(dependency);
  if (!siteAllowed.has(licence)) siteInvalid.push(`${dependency}: ${licence ?? 'unknown'}`);
}
if (siteInvalid.length)
  throw new Error(`Unexpected docs site dependency licences:\n${siteInvalid.join('\n')}`);
