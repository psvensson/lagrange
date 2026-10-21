// Invoke repository-owned static checks without changing their inputs, rules,
// manifests or baselines. This is CLI integration evidence, not startup proof.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scripts = [
  'test:deps',
  'audit:impact-contracts',
  'audit:shards',
];

for (const script of scripts) {
  test(`original handoff candidate: canonical ${script}`, () => {
    const result = spawnSync('npm', ['run', '--silent', script], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    });
    // Retain the complete returned output, including earlier checker failures.
    // A signal, spawn failure or output overflow is never a successful check.
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    assert.equal(result.error, undefined, `${script}: invocation failed`);
    assert.equal(result.signal, null, `${script}: terminated by signal`);
    assert.equal(result.status, 0, `${script}: canonical check failed`);
  });
}
