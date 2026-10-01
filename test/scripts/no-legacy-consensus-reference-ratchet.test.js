// The one-way count ratchet over the retired consensus reference scanner. The
// committed count passes, one more reference fails, fewer pass with the
// repository's tightening hint, a raised baseline is refused whether it is
// committed or only in the working tree, a missing baseline is refused, and
// the strict audit stays red on a single reference the ratchet tolerates.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import {gitProcessEnvironment} from
  '../../scripts/checks/git-process-environment.js';
import {
  BASELINE_FILE,
  findBaselineIncrease,
} from '../../scripts/checks/no-legacy-consensus-reference-ratchet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..');
const RATCHET_CHECKER =
  'scripts/checks/no-legacy-consensus-reference-ratchet.js';
const STRICT_CHECKER = 'scripts/checks/no-legacy-consensus-reference-audit.js';
const RATCHET_SCRIPT = 'audit:no-legacy-consensus-references';
const STRICT_SCRIPT = 'audit:no-legacy-consensus-references:strict';
const RUNTIME = ['Life', 'Raft'].join('');
const EXIT = Object.freeze({OK: 0, RED: 1, UNREADABLE: 2});

function git(root, args) {
  const result = spawnSync('git', args,
    {cwd: root, env: gitProcessEnvironment(), encoding: 'utf8'});
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function writeFile(root, relative, content) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), {recursive: true});
  fs.writeFileSync(path.join(root, relative), content);
}

function writeBaseline(root, count) {
  writeFile(root, BASELINE_FILE,
    `${JSON.stringify({version: 1, baselineCount: count}, null, 2)}\n`);
}

function fixture(t, {references, baseline}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-ref-ratchet-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'lagrange-test']);
  git(root, ['config', 'user.email', 'lagrange-test@example.com']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  for (let index = 0; index < references; index += 1) {
    writeFile(root, `src/seeded-${index}.js`, `// ${RUNTIME}\n`);
  }
  if (baseline !== undefined) {
    writeBaseline(root, baseline);
  }
  return root;
}

function commitBaseline(root, count) {
  writeBaseline(root, count);
  git(root, ['add', BASELINE_FILE]);
  git(root, ['commit', '-q', '-m', `baseline ${count}`]);
  return git(root, ['rev-parse', 'HEAD']);
}

function run(checker, root) {
  return spawnSync(process.execPath, [path.join(ROOT, checker)],
    {cwd: root, env: gitProcessEnvironment(), encoding: 'utf8'});
}

test('the baseline count passes without a tightening hint', (t) => {
  const root = fixture(t, {references: 2, baseline: 2});
  const result = run(RATCHET_CHECKER, root);
  assert.equal(result.status, EXIT.OK, result.stderr);
  assert.match(result.stdout, /ratchet OK: 2\/2 /);
  assert.doesNotMatch(result.stdout, /Baseline can be tightened/);
});

test('one reference above the baseline fails', (t) => {
  const root = fixture(t, {references: 3, baseline: 2});
  const result = run(RATCHET_CHECKER, root);
  assert.equal(result.status, EXIT.RED, result.stdout);
  assert.match(result.stderr,
    /3 retired consensus references exceed the one-way baseline of 2/);
  assert.match(result.stdout, /^src\/seeded-2\.js:1 content$/m);
});

test('fewer references pass with the standard tightening hint', (t) => {
  const root = fixture(t, {references: 1, baseline: 2});
  const result = run(RATCHET_CHECKER, root);
  assert.equal(result.status, EXIT.OK, result.stderr);
  assert.ok(result.stdout.includes('Baseline can be tightened from 2 to 1 ' +
    `in ${RATCHET_SCRIPT}: ${BASELINE_FILE}.`), result.stdout);
});

test('a baseline raised in the working tree is refused', (t) => {
  const root = fixture(t, {references: 3});
  const committed = commitBaseline(root, 2);
  writeBaseline(root, 3);
  const result = run(RATCHET_CHECKER, root);
  assert.equal(result.status, EXIT.RED, result.stdout);
  assert.ok(result.stderr.includes(
    `baseline raised from 2 (${committed}) to 3 (working tree)`),
  result.stderr);
});

test('a committed baseline raise is refused', (t) => {
  const root = fixture(t, {references: 3});
  const lower = commitBaseline(root, 2);
  const raised = commitBaseline(root, 3);
  const result = run(RATCHET_CHECKER, root);
  assert.equal(result.status, EXIT.RED, result.stdout);
  assert.ok(result.stderr.includes(
    `baseline raised from 2 (${lower}) to 3 (${raised})`), result.stderr);
});

test('a committed baseline decrease is accepted', (t) => {
  const root = fixture(t, {references: 1});
  commitBaseline(root, 3);
  commitBaseline(root, 1);
  const result = run(RATCHET_CHECKER, root);
  assert.equal(result.status, EXIT.OK, result.stderr);
  assert.match(result.stdout, /ratchet OK: 1\/1 /);
});

test('the first raise anywhere in a baseline history is found', () => {
  const entry = (origin, count) => ({origin, count});
  assert.equal(findBaselineIncrease(
    [entry('a', 5), entry('b', 4), entry('c', 4)]), null);
  assert.deepEqual(findBaselineIncrease(
    [entry('a', 5), entry('b', 4), entry('c', 6), entry('d', 9)]),
  {from: entry('b', 4), to: entry('c', 6)});
});

test('a missing or malformed baseline is refused, never unlimited', (t) => {
  const missing = run(RATCHET_CHECKER, fixture(t, {references: 0}));
  assert.equal(missing.status, EXIT.UNREADABLE, missing.stdout);
  assert.match(missing.stderr, /refuses to run without a baseline/);
  const malformedRoot = fixture(t, {references: 0});
  writeFile(malformedRoot, BASELINE_FILE, '{"baselineCount": -1}\n');
  const malformed = run(RATCHET_CHECKER, malformedRoot);
  assert.equal(malformed.status, EXIT.UNREADABLE, malformed.stdout);
  assert.match(malformed.stderr, /not a non-negative integer/);
});

test('the strict audit fails on any reference the ratchet tolerates', (t) => {
  const root = fixture(t, {references: 1, baseline: 1});
  assert.equal(run(RATCHET_CHECKER, root).status, EXIT.OK,
    'the ratchet tolerates its baseline');
  const strict = run(STRICT_CHECKER, root);
  assert.equal(strict.status, EXIT.RED, 'strict is red on one reference');
  assert.match(strict.stdout, /^src\/seeded-0\.js:1 content$/m);
  const clean = run(STRICT_CHECKER, fixture(t, {references: 0}));
  assert.equal(clean.status, EXIT.OK, 'strict is green only at zero');
});

test('the ordinary audit is the ratchet; strict is the bare scanner', () => {
  const {scripts} = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(scripts[RATCHET_SCRIPT], `node ${RATCHET_CHECKER}`);
  assert.equal(scripts[STRICT_SCRIPT], `node ${STRICT_CHECKER}`);
});
