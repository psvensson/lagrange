import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

import {
  selectRunnableFullProofCensus,
} from '../../scripts/checks/impact-proof-cone.js';

const root = process.cwd();
const SELECTOR = 'scripts/select-proof-cone.js';
const QUEST_PROOF = 'scripts/run-quest-proof.js';
const UTF8 = 'utf8';
// A pipe holds ~64KB before it blocks; the full census is far larger, which is
// exactly the boundary these CLIs used to lose data at.
const PIPE_BUFFER_BYTES = 65536;
const DIFF_BASE = 'HEAD~1';

function runPiped(script, args) {
  // spawnSync gives the child a PIPE for stdout, which is the condition under
  // test: Node makes a piped stdout asynchronous, so a CLI that exits with
  // data still queued silently delivers a prefix.
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: UTF8,
    maxBuffer: Infinity,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split('\n').filter(Boolean);
}

test('the selector CLI emits the complete census through a pipe', () => {
  const expected = selectRunnableFullProofCensus(root).selectedTests;
  const payloadBytes = expected.join('\n').length;
  assert.ok(payloadBytes > PIPE_BUFFER_BYTES,
    'census payload must exceed one pipe buffer to exercise the boundary ' +
    `(got ${payloadBytes} bytes)`);

  const emitted = runPiped(SELECTOR, ['--full-suite']);
  assert.equal(emitted.length, expected.length,
    'every selected test must reach the parent: a shorter list here is the ' +
    'silent truncation that produced hosted census counts of 607, 339, 219 ' +
    'and 348 against a stable 2058');
  assert.deepEqual(emitted, expected,
    'output must match the in-process selection exactly and in order');
});

test('the quest-proof dry run emits the complete selection through a pipe', () => {
  // run-quest-proof selects from a diff base rather than a --full-suite flag;
  // a whole-tree base escalates to the full census, which is the large payload
  // this boundary needs.
  const emitted = runPiped(QUEST_PROOF, ['--dry-run', '--diff-base', DIFF_BASE]);
  const payloadBytes = emitted.join('\n').length;
  assert.ok(payloadBytes > PIPE_BUFFER_BYTES,
    `dry-run payload must exceed one pipe buffer (got ${payloadBytes} bytes)`);
  const expected = selectRunnableFullProofCensus(root).selectedTests;
  assert.deepEqual(emitted, expected,
    'the dry-run path had the identical console.log-then-exit defect');
});

test('repeated invocations deliver identical complete output', () => {
  const first = runPiped(SELECTOR, ['--full-suite']);
  const second = runPiped(SELECTOR, ['--full-suite']);
  assert.deepEqual(first, second,
    'truncation was load-dependent, so equal length across runs is part of ' +
    'the contract, not an incidental property');
});
