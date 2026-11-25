import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const privateTerms = [
  /\b(?:stripe|posthog|sentry|supadata|assemblyai|resend|relamai|athman|gloss|vercel|billing|entitlements?)\b/i,
  /absolutememory\.app|admin_owner_email|operations_token|sample_template_user_id/i,
  /\b(?:Free|Plus|Pro) plan\b|\bIncluded with (?:Plus|Pro)\b|\/api\/usage\b|\/plans\b/i,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{70,}|AKIA[A-Z0-9]{16}/,
];
const dependencyMetadata = [
  '@vercel/oidc',
  '@vercel/postgres',
  'https://registry.npmjs.org/@vercel/oidc/-/oidc-3.2.0.tgz',
];

const hostedLinkFiles = new Set(['README.md', 'COMMERCIAL.md', 'LICENSE.md']);

const hygieneFiles = new Set([
  'tests/repo-hygiene.test.ts',
  'tests/integration/repo-hygiene.test.ts',
]);

function invalidPath(file: string) {
  return (
    /(?:^|\/)\.env(?!\.example$)(?:\.|$)|\.(?:pem|key|p12)$/i.test(file) ||
    privateTerms.some((pattern) => pattern.test(file))
  );
}

function invalidContents(file: string, data: Buffer) {
  if (data.includes(0)) return false;
  let contents = data.toString('utf8');
  if (file === 'package-lock.json') {
    for (const value of dependencyMetadata) contents = contents.replaceAll(value, '');
  }
  if (file === 'THIRD_PARTY_NOTICES.md')
    contents = contents.replace(/^\| @vercel\/oidc \| 3\.2\.0 \| Apache-2\.0 \|$/m, '');
  // These files may link the hosted edition. Every other private term is still checked in them.
  if (hostedLinkFiles.has(file))
    contents = contents.replaceAll(/(?:https:\/\/)?absolutememory\.app/g, '');
  if (file === '.gitignore') contents = contents.replace(/^\.vercel\/$/m, '');
  return privateTerms.some((pattern) => pattern.test(contents));
}

test('the release tree excludes private product code and configuration', () => {
  const files = new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  );
  const violations = [...files].filter(
    (file) =>
      !hygieneFiles.has(file) &&
      existsSync(file) &&
      (invalidPath(file) || invalidContents(file, readFileSync(file))),
  );
  assert.deepEqual(violations, []);
});

test('the committed history excludes private product code and configuration', () => {
  const commits = execFileSync('git', ['rev-list', 'HEAD'], { encoding: 'utf8' })
    .trim()
    .split('\n');
  // During the replacement, the local worktree records the paths excluded from provenance review.
  // A fresh release clone has no local exclusion manifest and checks its entire history.
  const localRemovedPaths = 'docs/build/PHASE-1-REMOVED-PATHS.txt';
  const localRemovedBlobs = 'docs/build/PHASE-1-REMOVED-BLOBS.txt';
  const readExclusions = (path: string) =>
    new Set(existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean) : []);
  const excludedPaths = readExclusions(localRemovedPaths);
  const excludedBlobs = readExclusions(localRemovedBlobs);
  const checked = new Map<string, boolean>();
  const violations = [];
  for (const commit of commits) {
    const entries = execFileSync('git', ['ls-tree', '-rz', commit], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    for (const entry of entries) {
      const divider = entry.indexOf('\t');
      const file = entry.slice(divider + 1);
      if (hygieneFiles.has(file)) continue;
      const [, type, hash] = entry.slice(0, divider).split(' ');
      if (type !== 'blob' || excludedPaths.has(file) || excludedBlobs.has(hash)) continue;
      const key = hash + ':' + file;
      let invalid = checked.get(key);
      if (invalid === undefined) {
        invalid =
          invalidPath(file) ||
          invalidContents(
            file,
            execFileSync('git', ['cat-file', 'blob', hash], { maxBuffer: 20_000_000 }),
          );
        checked.set(key, invalid);
      }
      if (invalid) violations.push(`${commit.slice(0, 8)}:${file}`);
    }
  }
  assert.deepEqual(violations, []);
});
