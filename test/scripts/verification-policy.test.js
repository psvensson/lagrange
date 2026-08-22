import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  buildVerificationPlan,
} from '../../scripts/checks/verification-policy.js';
import {
  materializeVerificationBoundary,
} from '../../scripts/run-verification.js';
import {removeWorktree} from '../../scripts/session-worktree.js';

const repositoryRoot = process.cwd();

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

function selectorFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-policy-'));
  fs.cpSync(path.join(repositoryRoot, 'src'), path.join(root, 'src'),
    {recursive: true});
  fs.cpSync(path.join(repositoryRoot, 'wit'), path.join(root, 'wit'),
    {recursive: true});
  fs.cpSync(path.join(repositoryRoot, 'scripts/solve'),
    path.join(root, 'scripts/solve'), {recursive: true});
  fs.cpSync(path.join(repositoryRoot, 'test/shards'), path.join(root, 'test/shards'),
    {recursive: true});
  fs.copyFileSync(path.join(repositoryRoot, 'package.json'),
    path.join(root, 'package.json'));
  const classes = JSON.parse(fs.readFileSync(
    path.join(root, 'test/shards/primary-classes.json'), 'utf8')).classes;
  for (const testPath of Object.keys(classes)) {
    const absolute = path.join(root, testPath);
    fs.mkdirSync(path.dirname(absolute), {recursive: true});
    fs.writeFileSync(absolute, '');
  }
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'policy@example.invalid']);
  git(root, ['config', 'user.name', 'Policy']);
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  return root;
}

test('prepush is one deduplicated affected plus fast test union', () => {
  const root = selectorFixture();
  const classes = JSON.parse(fs.readFileSync(
    path.join(root, 'test/shards/primary-classes.json'), 'utf8')).classes;
  const bootstrap = Object.keys(classes).find(
    (testPath) => testPath.startsWith('test/bootstrap/'));
  assert.ok(bootstrap, 'fixture must contain a bootstrap test');
  fs.writeFileSync(path.join(root, bootstrap), '// changed\n');

  const plan = buildVerificationPlan({root, profile: 'prepush'});
  assert.ok(plan.tests.includes(bootstrap),
    'an affected bootstrap test cannot be hidden by test:fast exclusions');
  assert.equal(new Set(plan.tests).size, plan.tests.length,
    'every behavioral file executes at most once');
  assert.equal(plan.commands.filter(
    (command) => command.id === 'static-audits').length, 1);
  assert.equal(plan.commands.some(
    (command) => command.argv.includes('test:gate:postpush')), false);
  fs.rmSync(root, {recursive: true, force: true});
});

test('release has one complete DAG entry and no subset replay', () => {
  const plan = buildVerificationPlan({root: repositoryRoot, profile: 'release'});
  assert.deepEqual(plan.commands, [{
    id: 'release-proof', executable: 'npm', argv: ['run', '-s', 'test:gate'],
  }]);
  assert.deepEqual(plan.tests, []);
});

test('index and ref boundaries materialize their exact owned state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-boundary-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'boundary@example.invalid']);
  git(root, ['config', 'user.name', 'Boundary']);
  fs.writeFileSync(path.join(root, 'value.txt'), 'base\n');
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  const base = git(root, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(root, 'value.txt'), 'staged\n');
  git(root, ['add', 'value.txt']);
  fs.writeFileSync(path.join(root, 'value.txt'), 'unstaged\n');

  const indexTree = materializeVerificationBoundary(root, {boundary: 'index'});
  try {
    assert.equal(fs.readFileSync(path.join(indexTree, 'value.txt'), 'utf8'),
      'staged\n');
  } finally {
    removeWorktree(root, indexTree);
  }
  const refTree = materializeVerificationBoundary(
    root, {boundary: 'ref', ref: base});
  try {
    assert.equal(fs.readFileSync(path.join(refTree, 'value.txt'), 'utf8'),
      'base\n');
  } finally {
    removeWorktree(root, refTree);
  }
  fs.rmSync(root, {recursive: true, force: true});
});

test('hooks bind final index and every pushed ref without bypass vocabulary', () => {
  const precommit = fs.readFileSync('.githooks/pre-commit', 'utf8');
  const prepush = fs.readFileSync('.githooks/pre-push', 'utf8');
  assert.ok(precommit.indexOf('git add solve/changes/') <
    precommit.indexOf('--boundary index'),
  'inventory regeneration precedes final-index verification');
  assert.match(prepush, /PUSH_REFS\+=/u);
  assert.match(prepush, /--boundary ref --ref "\$\{local_sha\}"/u);
  assert.doesNotMatch(prepush, /PUSHED_SHA|LAGRANGE_PUSH_SKIP_TESTS/u);
});
