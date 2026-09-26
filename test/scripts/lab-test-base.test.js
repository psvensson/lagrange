// Contract: `lab test changed --base-sha COMMIT` measures the change cone from
// the named commit, and without it from the selector's own default - the merge
// base with origin/main.
//
// The lab builds no selection of its own. It hands the base to the selector,
// whose command line resolves it (resolvedCheckBase) and plans the range
// (planChangeProof). This witness drives that same chain against a fixture
// repository, so what it proves is the base reaching the owner of the changed
// set, including the release-surface refusal: an unpublished branch whose
// Dockerfile changed before the named base must not be refused for it.
//
//   c0 (origin/main) -- c1 (Dockerfile) -- c2 (docs/notes.md)   head = c2

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, test} from 'node:test';

import {labTestSelectorArgs} from '../../scripts/lab/probe.js';
import {planChangeProof} from '../../scripts/select-change-tests.js';
import {resolvedCheckBase} from '../../scripts/checks/changed-paths.js';
import {
  REFUSAL_RELEASE_PROOF_REQUIRED,
  SAFETY_SPINE_PATH,
  SELECTION_PRECISE,
  SELECTION_REFUSED,
} from '../../scripts/checks/change-selection-constants.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';

const UTF8 = 'utf8';
const SELECTOR_BASE_FLAG = '--base';
const RELEASE_SURFACE = 'Dockerfile';
const LATER_CHANGE = 'docs/notes.md';
const SPINE_TEST = 'test/spine.test.js';
// No ambient range: the default must be the publication merge base itself.
const NO_RANGE_ENV = Object.freeze({});

function git(repo, args) {
  return execFileSync('git', args,
    {cwd: repo, encoding: UTF8, stdio: 'pipe', env: gitProcessEnvironment()}).trim();
}

function buildBranchRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-test-base-'));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), {recursive: true});
    fs.writeFileSync(path.join(repo, file), text, UTF8);
  };
  const commit = (message) => {
    git(repo, ['add', '.']);
    git(repo, ['commit', '--quiet', '-m', message]);
    return git(repo, ['rev-parse', 'HEAD']);
  };
  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'user.name', 'fixture']);
  write(SAFETY_SPINE_PATH, JSON.stringify({tests: [SPINE_TEST]}));
  write(SPINE_TEST, '');
  write(RELEASE_SURFACE, 'FROM one\n');
  const c0 = commit('published');
  git(repo, ['update-ref', 'refs/remotes/origin/main', c0]);
  write(RELEASE_SURFACE, 'FROM two\n');
  const c1 = commit('release surface, early on the branch');
  write(LATER_CHANGE, 'later\n');
  const c2 = commit('the change under verification');
  return {repo, c0, c1, c2};
}

const {repo, c0, c1, c2} = buildBranchRepo();
after(() => fs.rmSync(repo, {recursive: true, force: true}));

// What the lab asks the selector for, and the plan the selector makes of it:
// the base the invocation carries, resolved as the selector's command line
// resolves it, planned over base..head.
function labChangePlan(baseSha) {
  const args = labTestSelectorArgs({sha: c2, baseSha});
  const at = args.indexOf(SELECTOR_BASE_FLAG);
  const named = at === -1 ? null : args[at + 1];
  const base = resolvedCheckBase(named, NO_RANGE_ENV, repo);
  return {args, base, plan: planChangeProof({base, head: c2, planRoot: repo})};
}

test('without --base-sha the cone is measured from the merge base with origin/main', () => {
  const {args, base, plan} = labChangePlan(null);
  assert.ok(!args.includes(SELECTOR_BASE_FLAG),
    'the lab leaves the default to the selector rather than restating it');
  assert.equal(base, c0, 'the default base is the publication merge base');
  assert.deepEqual(plan.changedPaths, [RELEASE_SURFACE, LATER_CHANGE]);
  assert.equal(plan.kind, SELECTION_REFUSED);
  assert.equal(plan.refusalCode, REFUSAL_RELEASE_PROOF_REQUIRED);
});

test('a named base controls the changed set and the release-surface refusal', () => {
  const {args, base, plan} = labChangePlan(c1);
  assert.deepEqual(args.slice(-2), [SELECTOR_BASE_FLAG, c1]);
  assert.equal(base, c1);
  assert.deepEqual(plan.changedPaths, [LATER_CHANGE],
    'a release-surface file changed only before the base is not part of the change');
  assert.equal(plan.kind, SELECTION_PRECISE);
  assert.equal(plan.refusalCode, null);
  assert.deepEqual(plan.tests.map((entry) => entry.path), [SPINE_TEST]);
});

test('the same head yields different plans for two bases', () => {
  const published = labChangePlan(c0).plan;
  const branchPoint = labChangePlan(c1).plan;
  assert.deepEqual(published, labChangePlan(null).plan,
    'naming origin/main\'s merge base is the default');
  assert.notDeepEqual(published, branchPoint);
});
