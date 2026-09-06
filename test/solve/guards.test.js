// v2 landing guards: change set, verification requirement, epic scope,
// static quality over changed paths, and the coupled-pair guard's
// registry handling.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  changedPaths, coupledPairProblems, epicScopeProblems, headSha, requiresVerification,
  staticQualityProblems,
} from '../../scripts/solve/guards.js';

const QUEST_ID = 'q';
const EPIC_ID = 'e';
const SRC = 'src/a.js';
const DOC = 'docs/a.md';
const TEXT = 'x';
const GIT_USER = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];
const ESLINT_STUB = 'node_modules/eslint/bin/eslint.js';

function git(root, args) {
  return execFileSync('git', [...GIT_USER, ...args], {cwd: root, encoding: 'utf8'});
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-guards-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  write(root, DOC, TEXT);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seed']);
  return root;
}

function epic(authorizes, legacy = false) {
  return {id: EPIC_ID, front: {authorizes, legacy}};
}

test('changedPaths unions tracked, staged and untracked changes', (t) => {
  const root = repo(t);
  assert.deepEqual(changedPaths(root), []);
  write(root, DOC, `${TEXT}${TEXT}`);
  write(root, SRC, TEXT);
  git(root, ['add', SRC]);
  write(root, 'new.txt', TEXT);
  assert.deepEqual(changedPaths(root), [DOC, 'new.txt', SRC]);
  assert.match(headSha(root), /^[0-9a-f]{40}$/u);
});

test('src/ paths require verification', () => {
  assert.equal(requiresVerification([DOC]), false);
  assert.equal(requiresVerification([DOC, SRC]), true);
});

test('epic scope: authorizes globs, quest and epic files, legacy unscoped', () => {
  const quest = {id: QUEST_ID};
  assert.deepEqual(epicScopeProblems(quest, epic(['src/**']), [SRC,
    `solve/quests/${QUEST_ID}/log.ndjson`, `solve/epics/${EPIC_ID}.md`,
    `solve/epics/${EPIC_ID}/design.md`]), []);
  assert.equal(epicScopeProblems(quest, epic(['src/**']), [DOC]).length, 1);
  assert.deepEqual(epicScopeProblems(quest, epic(['docs']), [DOC]), [], 'a prefix covers its tree');
  assert.deepEqual(epicScopeProblems(quest, epic([], true), [DOC, SRC]), []);
  assert.deepEqual(epicScopeProblems(quest, null, [DOC, SRC]), [], 'a fix has no epic');
});

test('static quality: absent checkers skip; a failing checker names itself', (t) => {
  const root = repo(t);
  write(root, SRC, TEXT);
  assert.deepEqual(staticQualityProblems(root, [SRC, DOC]), []);
  write(root, ESLINT_STUB, 'process.exitCode = 1; process.stdout.write("bad\\n");\n');
  const problems = staticQualityProblems(root, [SRC]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /eslint/u);
  assert.deepEqual(staticQualityProblems(root, [DOC]), [], 'only linted trees');
});

test('coupled pairs: fewer than two paths or no registry means nothing to guard', (t) => {
  const root = repo(t);
  assert.deepEqual(coupledPairProblems(root, [SRC]), []);
  assert.deepEqual(coupledPairProblems(root, [SRC, DOC]), []);
  write(root, 'test/shards/impact-contracts.json', '{');
  assert.equal(coupledPairProblems(root, [SRC, DOC]).length, 1, 'an unreadable registry blocks');
});
