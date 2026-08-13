import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {
  publishExactHead,
  parsePublishArgs,
  validatePublishRequest,
} from '../../scripts/publish-head.js';

function git(cwd, args) {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim();
}

function fixture(hookBody = 'cat >/dev/null\nexit 0') {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-head-'));
  const root = path.join(parent, 'repo');
  const remote = path.join(parent, 'remote.git');
  fs.mkdirSync(root);
  git(parent, ['init', '--bare', remote]);
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'publish@example.com']);
  git(root, ['config', 'user.name', 'Publish Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['config', 'core.hooksPath', '.githooks']);
  fs.mkdirSync(path.join(root, '.githooks'));
  const hook = path.join(root, '.githooks', 'pre-push');
  fs.writeFileSync(hook, `#!/bin/sh\n${hookBody}\n`);
  fs.chmodSync(hook, 0o755);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'one\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'initial']);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '-u', 'origin', 'main']);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'two\n');
  git(root, ['commit', '-am', 'publish exact head']);
  return {parent, root, remote};
}

tap.test('publish validates runner and red-main attribution without mutation', (t) => {
  t.equal(validatePublishRequest({
    headMessage: 'plain commit', runner: null, fixesRed: null,
    reason: null, remoteSha: 'a'.repeat(40),
  }), 'github', 'GitHub-hosted is the default push runner');
  t.throws(() => validatePublishRequest({
    headMessage: 'plain commit', runner: 'self-hosted', fixesRed: null,
    reason: null, remoteSha: 'a'.repeat(40),
  }), /requires \[ci:self-hosted\]/u);
  t.equal(validatePublishRequest({
    headMessage: 'local gate [ci:self-hosted]', runner: 'self-hosted',
    fixesRed: null, reason: null, remoteSha: 'a'.repeat(40),
  }), 'self-hosted', 'the marker enables the explicit self-hosted route');
  t.throws(() => validatePublishRequest({
    headMessage: 'local gate [ci:self-hosted]', runner: null, fixesRed: null,
    reason: null, remoteSha: 'a'.repeat(40),
  }), /conflicts with the HEAD commit CI routing marker/u);
  t.throws(() => validatePublishRequest({
    headMessage: 'local gate [ci:self-hosted]', runner: 'github', fixesRed: null,
    reason: null, remoteSha: 'a'.repeat(40),
  }), /conflicts with the HEAD commit CI routing marker/u);
  t.throws(() => validatePublishRequest({
    headMessage: 'plain commit', runner: null, fixesRed: 'a'.repeat(40),
    reason: 'fix', remoteSha: 'b'.repeat(40),
  }), /current origin\/main SHA/u);
  t.throws(() => parsePublishArgs(['--runner']), /requires a value/u);
  t.throws(() => parsePublishArgs(['--reason', '--runner', 'github']),
    /requires a value/u);
  t.end();
});

tap.test('publish gates and pushes only the exact committed HEAD', (t) => {
  const {parent, root, remote} = fixture();
  const beforeStatus = git(root, ['status', '--porcelain']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const receipt = publishExactHead(root, {}, {queryCi: false});
  t.equal(receipt.head, head);
  t.equal(receipt.runner, 'github',
    'the default publication receipt records GitHub-hosted routing');
  t.equal(git(root, ['status', '--porcelain']), beforeStatus,
    'publisher does not stage, commit, amend, or sweep the working tree');
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), head,
    'remote main is the exact gated HEAD');
  t.equal(JSON.parse(fs.readFileSync(receipt.receipt, 'utf8')).head, head,
    'receipt is bound to the published commit');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish exposes installed dependencies only while gating', (t) => {
  const {parent, root, remote} = fixture(
    'cat >/dev/null\ntest ! -f .git || ' +
      'test "${LAGRANGE_PUSH_SKIP_TESTS:-}" = 1 || ' +
      'test -f node_modules/.publish-marker',
  );
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules', '.publish-marker'), 'ready\n');
  const head = git(root, ['rev-parse', 'HEAD']);
  publishExactHead(root, {}, {queryCi: false});
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), head,
    'the exact-HEAD gate resolves the workspace installation');
  t.notOk(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink(),
    'the publisher never replaces the workspace installation');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish fails closed when the gate mutates tracked content', (t) => {
  const {parent, root, remote} = fixture(
    'cat >/dev/null\necho gate-mutated >> tracked.txt\nexit 0',
  );
  const remoteBefore = git(remote, ['rev-parse', 'refs/heads/main']);
  t.throws(() => publishExactHead(root, {}, {queryCi: false}),
    /gate mutated the exact-HEAD worktree/u);
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), remoteBefore,
    'nothing is pushed after a mutating gate');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish fails closed when the gate creates untracked content', (t) => {
  const {parent, root, remote} = fixture(
    'cat >/dev/null\necho created > gate-created.js\nexit 0',
  );
  const remoteBefore = git(remote, ['rev-parse', 'refs/heads/main']);
  t.throws(() => publishExactHead(root, {}, {queryCi: false}),
    /gate mutated the exact-HEAD worktree/u);
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), remoteBefore);
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish rejects a non-fast-forward HEAD', (t) => {
  const {parent, root, remote} = fixture();
  const sibling = path.join(parent, 'sibling');
  git(parent, ['clone', '--branch', 'main', remote, sibling]);
  git(sibling, ['config', 'user.email', 'sibling@example.com']);
  git(sibling, ['config', 'user.name', 'Sibling']);
  fs.writeFileSync(path.join(sibling, 'remote.txt'), 'advance\n');
  git(sibling, ['add', 'remote.txt']);
  git(sibling, ['commit', '-m', 'advance remote']);
  git(sibling, ['push', 'origin', 'main']);
  t.throws(() => publishExactHead(root, {}, {queryCi: false}),
    /not a fast-forward/u);
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});
