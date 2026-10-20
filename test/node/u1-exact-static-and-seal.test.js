// Diagnostic only: operate on an isolated detached worktree at the exact
// immutable U1 lint-corrected commit. The repository's existing owners run
// unmodified; generated changes are inspected then restored in that worktree.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const CANDIDATE = 'be25caa5f0c3612feec662d4feaa9ba28f8f34df';
const STATIC_BASE = '381750de29af647d446b19adedf1da53eb712093';

test('whole-U1 static plus generated import-graph seal on exact source', () => {
  const outer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'u1-static-seal-'));
  const checkout = path.join(scratch, 'source');
  function run(cwd, cmd, args, timeout = 240000) {
    const c = spawnSync(cmd, args, {cwd, encoding: 'utf8', timeout,
      maxBuffer: 8 * 1024 * 1024, env: {...process.env, LAGRANGE_RETRY_FAILED_ONCE: '0'}});
    return {ok: c.status === 0, status: c.status, error: c.error?.message || null,
      log: (c.stdout || '') + (c.stderr || '')};
  }
  let registered = false;
  try {
    const added = run(outer, 'git', ['worktree', 'add', '--detach', checkout, CANDIDATE]);
    assert.equal(added.ok, true, 'EXACT_CHECKOUT_UNAVAILABLE: ' + added.log.slice(-500));
    registered = true;
    assert.equal(run(checkout, 'git', ['rev-parse', 'HEAD']).log.trim(), CANDIDATE);
    fs.symlinkSync(path.join(outer, 'node_modules'),
      path.join(checkout, 'node_modules'), 'dir');
    const sealPath = path.join(checkout, 'test/shards/impact-graph-seal.json');
    const oldSeal = fs.readFileSync(sealPath, 'utf8');
    const checks = [];
    for (const [name, cmd, args] of [
      ['primary', 'node', ['scripts/generate-test-primary-classes.js', '--check']],
      ['resource', 'node', ['scripts/generate-test-resource-classes.js', '--check']],
      ['subsystem', 'node', ['scripts/generate-test-subsystem-classes.js', '--check']],
      ['graph-refresh', 'node', ['scripts/generate-global-owner-debt-inventory.js',
        '--refresh-import-graph-only']],
      ['graph-verify', 'node', ['scripts/generate-global-owner-debt-inventory.js',
        '--verify-import-graph']],
      ['whole-U1-static', 'node', ['scripts/check-fast-static.js',
        '--base', STATIC_BASE, '--explain']],
    ]) {
      const r = run(checkout, cmd, args);
      checks.push({name, ok: r.ok, status: r.status, error: r.error,
        tail: r.log.slice(-1400)});
    }
    const freshSeal = fs.readFileSync(sealPath, 'utf8');
    const changedSeal = freshSeal !== oldSeal;
    // The original tree must be pristine after the probe, including the
    // tracked seal. This is not a parallel generator or a publication path.
    fs.writeFileSync(sealPath, oldSeal);
    assert.equal(run(checkout, 'git', ['status', '--porcelain']).log.trim(), '',
      'STATIC_DIAGNOSTIC_DID_NOT_RESTORE_ORIGINAL_TREE');
    const failed = checks.filter((r) => !r.ok);
    if (failed.length || changedSeal) {
      assert.fail('U1_STATIC_SEAL_CHECKPOINT=' + JSON.stringify({
        candidate: CANDIDATE, base: STATIC_BASE,
        changedSeal, freshSeal: changedSeal ? JSON.parse(freshSeal) : null,
        checks,
      }));
    }
    assert.equal(checks.length, 6);
  } finally {
    if (registered) {
      const rm = run(outer, 'git', ['worktree', 'remove', '--force', checkout]);
      if (!rm.ok) throw new Error('STATIC_PROBE_WORKTREE_CLEANUP_REQUIRED: ' + rm.log.slice(-350));
    }
    fs.rmSync(scratch, {recursive: true, force: true});
  }
});
