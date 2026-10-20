// Diagnostic-only execution of the repository's existing read-only static
// owners. The checked subject is the exact 38-file U1 candidate, not this
// one-file diagnostic commit. No source mutation or network calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const CANDIDATE = '7e842a2c827d4287daf1c4e77ba5cfd264c99787';
const STATIC_BASE = '381750de29af647d446b19adedf1da53eb712093';
const LIMIT_MS = 240000;

test('whole-U1 existing static owners on immutable generated-candidate checkout', () => {
  const outer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'u1-static-exact-'));
  const checkout = path.join(scratch, 'source');
  const run = (cwd, command, args, timeout = LIMIT_MS) => {
    const child = spawnSync(command, args, {cwd, encoding: 'utf8', timeout,
      maxBuffer: 8 * 1024 * 1024, env: {...process.env, LAGRANGE_RETRY_FAILED_ONCE: '0'}});
    return {ok: child.status === 0, status: child.status,
      error: child.error?.message || null,
      output: (child.stdout || '') + (child.stderr || '')};
  };
  let registered = false;
  try {
    const added = run(outer, 'git', ['worktree', 'add', '--detach', checkout, CANDIDATE]);
    assert.equal(added.ok, true, 'ISOLATED_CHECKOUT_CREATION_FAILED: ' +
      added.output.slice(-1200));
    registered = true;
    assert.equal(run(checkout, 'git', ['rev-parse', 'HEAD']).output.trim(), CANDIDATE);
    fs.symlinkSync(path.join(outer, 'node_modules'),
      path.join(checkout, 'node_modules'), 'dir');
    const checks = [
      ['primary-meta', 'node', ['scripts/generate-test-primary-classes.js', '--check']],
      ['resource-meta', 'node', ['scripts/generate-test-resource-classes.js', '--check']],
      ['subsystem-meta', 'node', ['scripts/generate-test-subsystem-classes.js', '--check']],
      ['import-graph', 'node', ['scripts/generate-global-owner-debt-inventory.js',
        '--verify-import-graph']],
      ['whole-u1-fast-static', 'node', ['scripts/check-fast-static.js',
        '--base', STATIC_BASE, '--explain']],
    ];
    const results = [];
    for (const [name, bin, args] of checks) {
      const outcome = run(checkout, bin, args);
      results.push({name, ok: outcome.ok, status: outcome.status,
        error: outcome.error,
        // Include the tail for the *failed* check and one-line summary for a
        // green check. No new assertion/selection authority is invented here.
        output: outcome.ok ? outcome.output.slice(-360) : outcome.output.slice(-2200)});
    }
    const clean = run(checkout, 'git', ['status', '--porcelain']);
    assert.equal(clean.output.trim(), '', 'READ_ONLY_STATIC_CHECKS_MUTATED_SOURCE');
    const failing = results.filter((result) => !result.ok);
    if (failing.length > 0) {
      assert.fail('U1_EXACT_STATIC_DIAGNOSTIC=' + JSON.stringify({
        subject: CANDIDATE, base: STATIC_BASE, checks: results}));
    }
    assert.equal(results.length, 5);
  } finally {
    if (registered) {
      const removed = run(outer, 'git', ['worktree', 'remove', '--force', checkout]);
      if (!removed.ok) {
        throw new Error('EXACT_STATIC_WORKTREE_RETIREMENT_UNRESOLVED: ' +
          removed.output.slice(-600));
      }
    }
    fs.rmSync(scratch, {recursive: true, force: true});
  }
});
