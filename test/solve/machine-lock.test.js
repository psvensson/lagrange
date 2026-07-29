import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {
  evidenceLockDir,
  evidenceLockStatus,
  tryAcquireEvidenceLock,
  acquireEvidenceLock,
  releaseEvidenceLock,
  ownerIsStale,
} from '../../scripts/solve/machine-lock.js';

// A real (tiny) git repo per test: the lock resolves the git common dir, so
// the fixture must be an actual repository, not a bare temp directory.
function makeRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'machine-lock-'));
  execFileSync('git', ['init', '-q'], {cwd: dir});
  t.teardown(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

tap.test('machine evidence lock', async (t) => {
  t.test('acquire, contend, release', (t) => {
    const repo = makeRepo(t);
    t.same(evidenceLockStatus(repo), {held: false, owner: null, stale: false});

    const first = tryAcquireEvidenceLock(repo, {label: 'benchmark-a'});
    t.equal(first.acquired, true);
    t.equal(first.owner.label, 'benchmark-a');
    t.equal(first.owner.pid, process.pid);

    const second = tryAcquireEvidenceLock(repo, {label: 'benchmark-b'});
    t.equal(second.acquired, false, 'a held lock refuses a second acquirer');
    t.equal(second.owner.label, 'benchmark-a', 'the loser learns the holder');

    releaseEvidenceLock(repo);
    t.equal(evidenceLockStatus(repo).held, false);
    t.equal(tryAcquireEvidenceLock(repo, {label: 'benchmark-b'}).acquired,
      true, 'release makes the lock available again');
    releaseEvidenceLock(repo);
    t.end();
  });

  t.test('a dead pid or missing worktree is stale and gets stolen', (t) => {
    const repo = makeRepo(t);
    const dir = evidenceLockDir(repo);
    fs.mkdirSync(dir, {recursive: true});
    const deadPid = 999999999;
    fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({
      pid: deadPid, worktree: repo, label: 'crashed-run',
    }));
    t.equal(ownerIsStale({pid: deadPid, worktree: repo}), true,
      'dead pid is stale');
    t.equal(ownerIsStale({pid: process.pid, worktree: repo}), false,
      'live pid with existing worktree is not stale');
    t.equal(ownerIsStale(
      {pid: process.pid, worktree: path.join(repo, 'gone')}), true,
    'missing worktree is stale even with a live pid');

    const attempt = tryAcquireEvidenceLock(repo, {label: 'successor'});
    t.equal(attempt.acquired, true, 'the stale lock is stolen, not queued');
    t.equal(evidenceLockStatus(repo).owner.label, 'successor');
    releaseEvidenceLock(repo);
    t.end();
  });

  t.test('an unreadable owner under a held lock is live, never stolen', (t) => {
    const repo = makeRepo(t);
    fs.mkdirSync(evidenceLockDir(repo), {recursive: true});
    // No owner.json — the mkdir-to-write window. Must NOT be treated stale.
    const attempt = tryAcquireEvidenceLock(repo, {label: 'greedy'});
    t.equal(attempt.acquired, false,
      'the mkdir-to-owner-write window does not invite a steal');
    releaseEvidenceLock(repo);
    t.end();
  });

  t.test('a fresh steal guard serializes stealers; an old one is swept', (t) => {
    const repo = makeRepo(t);
    const dir = evidenceLockDir(repo);
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({
      pid: 999999999, worktree: repo, label: 'crashed-run',
    }));
    const guard = `${dir}.steal-guard`;
    fs.mkdirSync(guard);
    const contended = tryAcquireEvidenceLock(repo, {label: 'second-stealer'});
    t.equal(contended.acquired, false,
      'while another process holds the steal guard, this one backs off');
    t.ok(fs.existsSync(guard), 'a fresh guard is not swept');

    const oldTime = new Date(Date.now() - 60 * 1000);
    fs.utimesSync(guard, oldTime, oldTime);
    const sweepRound = tryAcquireEvidenceLock(repo, {label: 'sweeper'});
    t.equal(sweepRound.acquired, false,
      'the sweep round only clears the abandoned guard');
    t.notOk(fs.existsSync(guard), 'the abandoned guard is gone');
    const stealRound = tryAcquireEvidenceLock(repo, {label: 'successor'});
    t.equal(stealRound.acquired, true,
      'the next round steals the stale lock normally');
    releaseEvidenceLock(repo);
    t.end();
  });

  t.test('unforced release never clobbers a foreign lock', (t) => {
    const repo = makeRepo(t);
    const dir = evidenceLockDir(repo);
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({
      pid: process.pid + 1, worktree: repo, label: 'third-party',
    }));
    t.equal(releaseEvidenceLock(repo, {force: false}), false,
      'a finishing wrapper refuses to remove a lock it does not own');
    t.equal(evidenceLockStatus(repo).owner.label, 'third-party',
      'the foreign lock survives');
    t.equal(releaseEvidenceLock(repo), true, 'forced release still works');
    t.end();
  });

  t.test('a live wrapped child keeps a dead-wrapper lock un-stealable', (t) => {
    const repo = makeRepo(t);
    t.equal(ownerIsStale(
      {pid: 999999999, childPid: process.pid, worktree: repo}), false,
    'a running benchmark child protects the lock of a SIGKILLed wrapper');
    t.equal(ownerIsStale(
      {pid: 999999999, childPid: 999999998, worktree: repo}), true,
    'both pids dead is stale');
    t.end();
  });

  t.test('waiting acquire times out with the holder named', (t) => {
    const repo = makeRepo(t);
    tryAcquireEvidenceLock(repo, {label: 'long-benchmark'});
    t.throws(
      () => acquireEvidenceLock(repo,
        {label: 'impatient', pollMs: 10, timeoutMs: 50}),
      /long-benchmark/, 'the timeout error names the current holder');
    releaseEvidenceLock(repo);
    t.end();
  });

  t.test('the with-wrapper CLI serializes and propagates exit codes', (t) => {
    const repo = makeRepo(t);
    const script = path.resolve('scripts/solve/machine-lock.js');
    const run = (args, env = {}) => {
      try {
        return {status: 0, out: execFileSync(process.execPath,
          [script, ...args], {cwd: repo, encoding: 'utf8',
            env: {...process.env, ...env}})};
      } catch (error) {
        return {status: error.status, out: String(error.stdout || '')};
      }
    };
    const ok = run(['with', '--label', 'wrapped', '--',
      process.execPath, '-e', 'process.exit(0)']);
    t.equal(ok.status, 0, 'a passing command exits 0');
    t.equal(evidenceLockStatus(repo).held, false,
      'the lock is released after the run');

    const fail = run(['with', '--', process.execPath, '-e', 'process.exit(7)']);
    t.equal(fail.status, 7, 'the wrapped exit code propagates');
    t.equal(evidenceLockStatus(repo).held, false,
      'the lock is released even on failure');

    tryAcquireEvidenceLock(repo, {label: 'holder'});
    const bypass = run(['with', '--', process.execPath, '-e', 'process.exit(0)'],
      {LAGRANGE_EVIDENCE_LOCK_BYPASS: '1'});
    t.equal(bypass.status, 0, 'bypass runs despite a held lock');
    t.equal(evidenceLockStatus(repo).owner.label, 'holder',
      'bypass does not release a lock it never took');
    releaseEvidenceLock(repo);
    t.end();
  });
});
