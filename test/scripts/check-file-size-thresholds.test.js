import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  buildOwnerBoundaryGuidanceEntries,
  FILE_SIZE_BASELINES,
  FILE_SIZE_SCOPE,
  FILE_SIZE_THRESHOLDS,
} from '../../scripts/check-file-size-thresholds.js';
import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';

const SEGMENT_FILE_PATH =
  'src/rebalancer/unified-rebalancer-segment-1.js';
const NON_SEGMENT_FILE_PATH = 'src/rebalancer/operation-workflow-owner.js';
const SOURCE_SCOPE = 'source';
const SEGMENT_LINES = 901;
const SEGMENT_THRESHOLD = 800;
const SOURCE_LIMIT = FILE_SIZE_THRESHOLDS[FILE_SIZE_SCOPE.SOURCE];
const TEST_LIMIT = FILE_SIZE_THRESHOLDS[FILE_SIZE_SCOPE.TEST];
const INHERITED_LINES = SOURCE_LIMIT + 100;
const CHECKER = fileURLToPath(new URL('../../scripts/check-file-size-thresholds.js', import.meta.url));
const ENCODING = 'utf8';
const OWNER_PATH = 'src/operation-owner.js';
const MOVED_PATH = 'src/renamed-operation-owner.js';
const GIT_IDENTITY = ['-c', 'user.name=size-test', '-c', 'user.email=size-test@example.com'];

test('owner-boundary guidance targets oversized segment files only', () => {
  const guidanceEntries = buildOwnerBoundaryGuidanceEntries([
    {
      scope: SOURCE_SCOPE,
      path: SEGMENT_FILE_PATH,
      lines: SEGMENT_LINES,
      threshold: SEGMENT_THRESHOLD,
    },
    {
      scope: SOURCE_SCOPE,
      path: NON_SEGMENT_FILE_PATH,
      lines: SEGMENT_LINES,
      threshold: SEGMENT_THRESHOLD,
    },
  ]);

  assert.equal(guidanceEntries.length, 1);
  assert.equal(guidanceEntries[0].path, SEGMENT_FILE_PATH);
  assert.match(guidanceEntries[0].guidance, /semantically named owner\/boundary helper/u);
  assert.match(guidanceEntries[0].guidance, /existing entrypoint/u);
  assert.match(guidanceEntries[0].guidance,
    /do not carry segment\/stage\/part ordinals or any digit characters/u);
});

function fixtureEnvironment() {
  const env = gitProcessEnvironment();
  delete env.LAGRANGE_CHECK_BASE;
  delete env.LAGRANGE_WORKSPACE_INJECTIONS;
  return env;
}

function git(root, args) {
  return execGit([...GIT_IDENTITY, ...args], {
    cwd: root, encoding: ENCODING, env: fixtureEnvironment(),
  }).trim();
}

function writeLines(root, relative, lines, label = relative) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, Array.from({length: lines},
    (_unused, index) => `// ${label} ${index}`).join('\n'));
}

function commit(root) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'record size fixture']);
  return git(root, ['rev-parse', 'HEAD']);
}

function fixture(t, entries = [[OWNER_PATH, INHERITED_LINES]]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-size-ratchet-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.mkdirSync(path.join(root, 'test'), {recursive: true});
  fs.writeFileSync(path.join(root, 'README.md'), 'Size ratchet fixture.\n');
  for (const entry of entries) writeLines(root, ...entry);
  return {root, base: commit(root)};
}

function check(candidate, args = [], base = candidate.base) {
  const env = fixtureEnvironment();
  if (base) env.LAGRANGE_CHECK_BASE = base;
  return spawnSync(process.execPath, [CHECKER, ...args], {
    cwd: candidate.root, encoding: ENCODING, env,
  });
}

function rejected(result, reason) {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, reason);
}

test('an untracked new oversized source file is rejected below the aggregate budget', (t) => {
  const candidate = fixture(t, []);
  writeLines(candidate.root, OWNER_PATH, SOURCE_LIMIT + 1);
  rejected(check(candidate), /New source file exceeds its threshold/u);
});

test('a previously compliant file cannot cross its threshold', (t) => {
  const candidate = fixture(t, [[OWNER_PATH, SOURCE_LIMIT]]);
  writeLines(candidate.root, OWNER_PATH, SOURCE_LIMIT + 1);
  rejected(check(candidate), /Previously compliant source file exceeds its threshold/u);
});

test('an inherited oversized file cannot grow even when the total count stays constant', (t) => {
  const candidate = fixture(t);
  writeLines(candidate.root, OWNER_PATH, INHERITED_LINES + 1);
  rejected(check(candidate), /Inherited oversized source file grew/u);
});

test('unchanged size and shrinking inherited oversize remain valid bounded repairs', (t) => {
  const candidate = fixture(t);
  writeLines(candidate.root, OWNER_PATH, INHERITED_LINES, 'repaired behavior');
  assert.equal(check(candidate).status, 0);
  writeLines(candidate.root, OWNER_PATH, INHERITED_LINES - 1, 'smaller repair');
  assert.equal(check(candidate).status, 0);
});

test('deleting inherited debt cannot fund a different new oversized file', (t) => {
  const candidate = fixture(t);
  fs.rmSync(path.join(candidate.root, OWNER_PATH));
  writeLines(candidate.root, MOVED_PATH, INHERITED_LINES, 'different responsibility');
  git(candidate.root, ['add', '-A']);
  rejected(check(candidate), /New source file exceeds its threshold/u);
});

test('a byte-identical move can retain one inherited file identity', (t) => {
  const candidate = fixture(t);
  git(candidate.root, ['mv', OWNER_PATH, MOVED_PATH]);
  assert.equal(check(candidate).status, 0);
});

test('a copy is new debt while its original remains', (t) => {
  const candidate = fixture(t);
  fs.copyFileSync(path.join(candidate.root, OWNER_PATH), path.join(candidate.root, MOVED_PATH));
  rejected(check(candidate), /New source file exceeds its threshold/u);
});

test('one deleted identity cannot be inherited by two copies', (t) => {
  const candidate = fixture(t);
  const original = fs.readFileSync(path.join(candidate.root, OWNER_PATH));
  fs.rmSync(path.join(candidate.root, OWNER_PATH));
  fs.writeFileSync(path.join(candidate.root, MOVED_PATH), original);
  fs.writeFileSync(path.join(candidate.root, 'src/second-operation-owner.js'), original);
  git(candidate.root, ['add', '-A']);
  rejected(check(candidate), /New source file exceeds its threshold/u);
});

test('a similarity-detected edited rename does not establish inherited identity', (t) => {
  const candidate = fixture(t);
  git(candidate.root, ['mv', OWNER_PATH, MOVED_PATH]);
  fs.appendFileSync(path.join(candidate.root, MOVED_PATH), ' changed');
  rejected(check(candidate), /New source file exceeds its threshold/u);
});

test('moving a source file out of scan scope is refused', (t) => {
  const candidate = fixture(t);
  fs.mkdirSync(path.join(candidate.root, 'notes'));
  git(candidate.root, ['mv', OWNER_PATH, 'notes/operation-owner.js']);
  rejected(check(candidate), /Moved source file outside the file-size scan scope/u);
});

test('changing from test scope to source scope does not transfer the larger allowance', (t) => {
  const candidate = fixture(t, [['test/operation-owner.test.js', TEST_LIMIT + 1]]);
  git(candidate.root, ['mv', 'test/operation-owner.test.js', OWNER_PATH]);
  rejected(check(candidate), /New source file exceeds its threshold/u);
});

test('committed growth is measured from the declared base, not the latest HEAD', (t) => {
  const candidate = fixture(t);
  writeLines(candidate.root, OWNER_PATH, INHERITED_LINES + 1);
  commit(candidate.root);
  rejected(check(candidate), /Inherited oversized source file grew/u);
});

test('an unresolved declared base refuses instead of silently using HEAD', (t) => {
  const candidate = fixture(t);
  rejected(check(candidate, [], 'missing-proof-base'), /declared check base does not name a commit/u);
});

test('an explicit base takes precedence over the environment', (t) => {
  const candidate = fixture(t);
  assert.equal(check(candidate, ['--base', candidate.base], 'missing-proof-base').status, 0);
});

test('worktree-only checks compare changed files to HEAD when no publication base exists', (t) => {
  const candidate = fixture(t);
  writeLines(candidate.root, OWNER_PATH, INHERITED_LINES + 1);
  rejected(check(candidate, [], null), /Inherited oversized source file grew/u);
});

test('the aggregate oversized-file budget remains enforced for unchanged inherited files', (t) => {
  const sourceCount = FILE_SIZE_BASELINES[FILE_SIZE_SCOPE.SOURCE] + 1;
  const entries = Array.from({length: sourceCount}, (_unused, index) =>
    [`src/owner-${index}.js`, INHERITED_LINES]);
  const candidate = fixture(t, entries);
  rejected(check(candidate), /Source oversized-file count .* exceeds baseline/u);
});

test('strict mode still rejects inherited oversize even without growth', (t) => {
  const candidate = fixture(t);
  rejected(check(candidate, ['--strict']), /Oversized source file/u);
});

test('changed script and JavaScript module files use the source threshold', (t) => {
  const candidate = fixture(t, []);
  writeLines(candidate.root, 'scripts/operation-proof.mjs', SOURCE_LIMIT + 1);
  rejected(check(candidate), /New source file exceeds its threshold/u);
});

test('an explicit file selection uses the declared comparison base', (t) => {
  const candidate = fixture(t);
  writeLines(candidate.root, OWNER_PATH, INHERITED_LINES + 1);
  rejected(check(candidate, [OWNER_PATH]), /Inherited oversized source file grew/u);
});
