// Read-only V4 surgical selector for the existing full C6 integration oracle.
// Runs its original named test unchanged, not a synthetic handler substitute.
// Prevents unrelated neighboring integration cases from masking the direct
// wakePending lost-wake result in a broad file-level red.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const original = 'test/wasm-service/bound-creation-restart.integration.test.js';
const target = 'U1 memo wake: real HELD J retains one wake behind exact F through handler gate release';

test('V4 isolated existing owner oracle: HELD J wake survives F execution gate', () => {
  const result = spawnSync(process.execPath,
    ['--test', '--test-reporter=tap', '--test-name-pattern', target, original],
    {cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 6 * 1024 * 1024,
      env: {...process.env, LAGRANGE_RETRY_FAILED_ONCE: '0'}});
  const log = String(result.stdout || '') + String(result.stderr || '');
  assert.equal(result.error, undefined,
    'ORIGINAL_V4_TEST_PROCESS_FAILED_TO_RUN: ' + (result.error?.message || ''));
  // At least one original scoped assertion has to run, never a false green
  // produced by misspelling the pattern or skipping every test.
  assert.match(log, /# tests [1-9][0-9]*/u, 'V4_ORIGINAL_CASE_NOT_DISCOVERED');
  if (result.status !== 0) {
    assert.fail('V4_ORIGINAL_WAKE_ORACLE_RED: exit=' + result.status + '\n' +
      log.slice(-6500));
  }
  assert.match(log, /# fail 0/u);
});
