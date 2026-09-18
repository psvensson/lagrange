// The publisher links the gate worktree's gitignored dependency trees from
// the main checkout. Since data/releases holds committed publication
// receipts, a fresh worktree already has a REAL data/ directory: the link
// must then be per gitignored entry, never a whole-directory symlink that
// collides with the checkout (EEXIST, release-pipeline-dry-run 2026-09-12)
// or shadows the tracked receipts.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  linkWorkspaceDependencies, pruneTestOutput, recordProvedCorpus,
} from '../../scripts/publish-head.js';

function tree(base, relativeFiles) {
  for (const relative of relativeFiles) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, relative);
  }
}

test('links only the gitignored entries when the worktree already has data/', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-root-'));
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-worktree-'));
  tree(root, ['node_modules/pkg/index.js', 'data/movielens/u.data',
    'data/cluster-rejoin-hints.json', 'data/releases/v0.0.1.json']);
  tree(worktree, ['data/releases/v0.0.1.json']);

  const links = linkWorkspaceDependencies(root, worktree);

  assert.ok(fs.lstatSync(path.join(worktree, 'node_modules')).isSymbolicLink(),
    'an absent directory is linked whole');
  assert.ok(fs.lstatSync(path.join(worktree, 'data')).isDirectory() &&
    !fs.lstatSync(path.join(worktree, 'data')).isSymbolicLink(),
  'the real data/ directory of the checkout is kept');
  assert.ok(fs.lstatSync(path.join(worktree, 'data', 'movielens')).isSymbolicLink(),
    'the gitignored dataset tree is linked into it');
  assert.ok(fs.lstatSync(path.join(worktree, 'data', 'cluster-rejoin-hints.json')).isSymbolicLink(),
    'a gitignored file is linked too');
  assert.ok(!fs.lstatSync(path.join(worktree, 'data', 'releases')).isSymbolicLink(),
    'the tracked receipts are not shadowed');
  assert.equal(fs.readFileSync(path.join(worktree, 'data', 'releases', 'v0.0.1.json'), 'utf8'),
    'data/releases/v0.0.1.json');
  assert.deepEqual(links.map((entry) => path.relative(worktree, entry.link)).sort(),
    ['data/cluster-rejoin-hints.json', 'data/movielens', 'node_modules'],
    'every link made is recorded for validation');
});

// The whole corpus is a fact about the commit, so a gate run that proved it
// leaves a durable receipt the post-push canary reads instead of re-proving.
// It is recorded HERE, after the push: inside the gate the sha is not on
// origin/main yet, so the receipt's own push could not be exempt from the
// gate and the recording always timed out (proof-ref-push-fast-path).
test('the publisher records the corpus receipt the gate proved', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-receipt-'));
  try {
    const worktree = path.join(workspace, 'gate');
    const head = 'a'.repeat(40);
    const scopeFile = path.join(worktree, 'test-output/proof-scope.json');
    fs.mkdirSync(path.dirname(scopeFile), {recursive: true});
    const writeScope = (value) =>
      fs.writeFileSync(scopeFile, `${JSON.stringify(value)}\n`, 'utf8');
    const calls = [];
    const run = (command, args, options) => {
      calls.push({args, command, cwd: options.cwd, timeout: options.timeout});
      return {status: 0, stdout: ''};
    };
    const said = [];
    const say = (value) => said.push(value);

    writeScope({sha: head, fullCorpus: true});
    assert.equal(recordProvedCorpus(run, workspace, worktree, head, say), true);
    assert.equal(calls.length, 1, 'one recording');
    assert.deepEqual(calls[0].args,
      ['scripts/proof-authority.js', 'record', 'corpus-full-v1', head],
      'the authority records its own contract for the published sha');
    assert.equal(calls[0].cwd, workspace,
      'recorded from the repository, not the disposable gate worktree');
    assert.ok(calls[0].timeout > 0,
      'bounded: bookkeeping cannot hang a finished publish');
    assert.match(said.join(''), /whole-corpus receipt recorded for a{40}/u);

    // A cone proof proves no corpus, and a scope for another sha proves
    // nothing about this one. Neither may mint a receipt.
    for (const scope of [{sha: head, fullCorpus: false},
      {sha: 'b'.repeat(40), fullCorpus: true}, {fullCorpus: true},
      {sha: head}, {sha: head, fullCorpus: 'true'}]) {
      calls.length = 0;
      writeScope(scope);
      assert.equal(recordProvedCorpus(run, workspace, worktree, head, say),
        false, JSON.stringify(scope));
      assert.deepEqual(calls, [], 'the authority is never called');
    }

    // An inherited answer is not this scope's answer: the own-property
    // clauses are what reject it.
    calls.length = 0;
    writeScope({sha: head});
    try {
      Reflect.defineProperty(Object.prototype, 'fullCorpus',
        {configurable: true, value: true});
      assert.equal(recordProvedCorpus(run, workspace, worktree, head, say),
        false, 'a polluted prototype must not mint a receipt');
      assert.deepEqual(calls, []);
    } finally {
      Reflect.deleteProperty(Object.prototype, 'fullCorpus');
    }

    // A gate that wrote no scope at all leaves no receipt.
    calls.length = 0;
    fs.rmSync(scopeFile);
    assert.equal(recordProvedCorpus(run, workspace, worktree, head, say), false);
    assert.deepEqual(calls, []);

    // A refused recording is reported, never raised: the publish has already
    // succeeded by the time this runs.
    writeScope({sha: head, fullCorpus: true});
    said.length = 0;
    assert.equal(recordProvedCorpus(
      () => ({status: 1, stderr: 'proof store unavailable\n'}),
      workspace, worktree, head, say), false);
    assert.match(said.join(''), /receipt not recorded: proof store unavailable/u);

    // A throwing runner is reported too: the publish has succeeded and the
    // publication receipt still has to be written.
    said.length = 0;
    assert.equal(recordProvedCorpus(() => {
      throw new Error('spawn exploded');
    }, workspace, worktree, head, say), false);
    assert.match(said.join(''), /receipt not recorded: spawn exploded/u);
  } finally {
    fs.rmSync(workspace, {recursive: true, force: true});
  }
});

// Retention is bookkeeping that runs after a publish has already succeeded, so
// it is bounded and never raised - a failed prune must not turn a finished
// publish into a failed one (artifact-retention-routine).
test('retention is bounded and never fails a finished publish', () => {
  const said = [];
  const say = (value) => said.push(value);
  const calls = [];
  assert.equal(pruneTestOutput((command, args, options) => {
    calls.push({args, cwd: options.cwd, timeout: options.timeout});
    return {status: 0, stdout: 'Deleted 12 artifact entries (3MB).\nPolicy: ...\n'};
  }, '/repo', say), true);
  assert.deepEqual(calls[0].args, ['scripts/prune-test-output.js', '--apply',
    '--keep-days', '7', '--keep-reports', '24', '--keep-report-playbacks', '24']);
  assert.equal(calls[0].cwd, '/repo', 'the checkout the publish came from');
  assert.ok(calls[0].timeout > 0, 'bounded');
  assert.match(said.join(''), /retention: Deleted 12 artifact entries/u);

  said.length = 0;
  assert.equal(pruneTestOutput(() => ({status: 2, stderr: 'EACCES\n'}),
    '/repo', say), false);
  assert.match(said.join(''), /retention skipped: EACCES/u);

  said.length = 0;
  assert.equal(pruneTestOutput(() => {
    throw new Error('spawn exploded');
  }, '/repo', say), false, 'a throwing runner is reported, not raised');
  assert.match(said.join(''), /retention skipped: spawn exploded/u);

  // A timeout returns no status and no output: the error and the signal are
  // the only reason there is, and a bare "no reason" would hide it.
  said.length = 0;
  assert.equal(pruneTestOutput(() => ({status: null, signal: 'SIGTERM',
    error: new Error('spawnSync node ETIMEDOUT'), stdout: '', stderr: ''}),
  '/repo', say), false);
  assert.match(said.join(''), /retention skipped: spawnSync node ETIMEDOUT/u);
  said.length = 0;
  assert.equal(pruneTestOutput(() => ({status: null, signal: 'SIGKILL',
    stdout: '', stderr: ''}), '/repo', say), false);
  assert.match(said.join(''), /retention skipped: the pruner was stopped by SIGKILL/u);
});
