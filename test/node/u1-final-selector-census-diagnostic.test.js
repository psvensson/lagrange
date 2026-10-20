// Diagnostic-only, unchanged selector owner. A detached exact commit is read
// without executing any selected test or writing proof-scope metadata.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SUBJECT = 'be25caa5f0c3612feec662d4feaa9ba28f8f34df';
const BASE = '381750de29af647d446b19adedf1da53eb712093';

test('U1 exact changed-owner test selection census (no execution)', () => {
  const outer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'u1-selector-'));
  const source = path.join(scratch, 'source');
  function run(cwd, bin, args) {
    const result = spawnSync(bin, args, {cwd, encoding: 'utf8', timeout: 120000,
      maxBuffer: 6 * 1024 * 1024});
    return {code: result.status, out: result.stdout || '',
      err: result.stderr || '', error: result.error?.message};
  }
  let mounted = false;
  try {
    const add = run(outer, 'git', ['worktree', 'add', '--detach', source, SUBJECT]);
    assert.equal(add.code, 0, add.err);
    mounted = true;
    assert.equal(run(source, 'git', ['rev-parse', 'HEAD']).out.trim(), SUBJECT);
    // The detached read-only checkout needs the same installed dependency tree
    // as the lab placement. The symlink stays inside this disposable checkout.
    fs.symlinkSync(path.join(outer, 'node_modules'), path.join(source, 'node_modules'), 'dir');
    // The impact selector consumes its canonical generated local import
    // graph. Materialize it through the original producer in this disposable
    // worktree before asking the unchanged selector to explain the cone.
    const refresh = run(source, 'node', [
      'scripts/generate-global-owner-debt-inventory.js',
      '--refresh-import-graph-only']);
    assert.equal(refresh.code, 0, refresh.err);
    const args = ['scripts/select-change-tests.js', '--base', BASE];
    const explained = run(source, 'node', [...args, '--explain']);
    const listed = run(source, 'node', [...args, '--list']);
    const files = listed.out.trim().split('\n').filter(Boolean);
    const fingerprint = createHash('sha256').update(files.join('\n') + '\n').digest('hex');
    const report = {sourceSha: SUBJECT, base: BASE,
      explainCode: explained.code, listCode: listed.code,
      count: listed.code === 0 ? files.length : null,
      listSha256: listed.code === 0 ? fingerprint : null,
      first: files.slice(0, 6), last: files.slice(-6),
      explanation: explained.out.slice(0, 4000), error: (explained.err +
      '\n' + listed.err).slice(0, 1000)};
    console.log('U1_EXACT_SELECTION_CENSUS=' + JSON.stringify(report));
    assert.equal(explained.code, 0, 'selector must accept the original sealed base');
    assert.equal(listed.code, 0, 'selector must produce an ordinary file list');
    assert.ok(files.length >= 15, 'U1 proof selection cannot be only the short focused cone');
    assert.equal(run(source, 'git', ['status', '--porcelain']).out.trim(), '');
  } finally {
    if (mounted) {
      const rm = run(outer, 'git', ['worktree', 'remove', '--force', source]);
      assert.equal(rm.code, 0, rm.err);
    }
    fs.rmSync(scratch, {recursive: true, force: true});
  }
});
