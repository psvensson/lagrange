import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  readPassingVerificationReceipt,
  semanticProjection,
  verificationInputs,
  verificationReceiptPath,
  writePassingVerificationReceipt,
} from '../../scripts/checks/verification-receipt.js';

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

function write(root, relative, content) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-receipt-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'receipt@example.invalid']);
  git(root, ['config', 'user.name', 'Receipt']);
  write(root, 'src/value.js', 'export const value = 1;\n');
  write(root, 'scripts/solve/owner.js', 'export const owner = true;\n');
  write(root, 'solve/log/history.ndjson', '{"event":"old"}\n');
  write(root, 'package-lock.json', '{"lockfileVersion":3}\n');
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  return root;
}

function plan(base = null) {
  return {
    schemaVersion: 1,
    profile: 'affected',
    base,
    selection: 'WIDENED',
    changedPaths: ['src/value.js'],
    commands: [{id: 'probe', executable: 'node', argv: ['--version']}],
    tests: ['test/example.test.js'],
  };
}

function passingResult() {
  return {
    selection: 'WIDENED',
    changedPaths: ['src/value.js'],
    selectedCount: 1,
    runCount: 1,
    deduplicatedCount: 0,
    leaves: [{id: 'probe', elapsedMs: 1, exitCode: 0}],
    elapsedMs: 1,
  };
}

test('semantic projection ignores Solver ledger data but binds executable inputs', () => {
  const root = fixture();
  const before = semanticProjection(root).digest;
  write(root, 'solve/log/history.ndjson', '{"event":"new"}\n');
  assert.equal(semanticProjection(root).digest, before,
    'inert Solver history must not invalidate a source proof');
  write(root, 'scripts/solve/owner.js', 'export const owner = false;\n');
  assert.notEqual(semanticProjection(root).digest, before,
    'executable Solver code remains a semantic verification input');
  fs.rmSync(root, {recursive: true, force: true});
});

test('equivalent semantic bases share a key even when Solver metadata changed', () => {
  const root = fixture();
  const beforeSolve = git(root, ['rev-parse', 'HEAD']);
  write(root, 'solve/log/history.ndjson', '{"event":"metadata-only"}\n');
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'solver metadata']);
  const afterSolve = git(root, ['rev-parse', 'HEAD']);
  const first = verificationInputs(root, plan(beforeSolve));
  const second = verificationInputs(root, plan(afterSolve));
  assert.notEqual(first.provenance.base, second.provenance.base);
  assert.equal(first.baseSemanticDigest, second.baseSemanticDigest);
  assert.equal(first.key, second.key,
    'commit provenance is recorded but is not the reuse authority');
  fs.rmSync(root, {recursive: true, force: true});
});

test('only an exact, valid PASS receipt is reusable', () => {
  const root = fixture();
  const inputs = verificationInputs(root, plan());
  assert.equal(readPassingVerificationReceipt(root, inputs), null);
  const written = writePassingVerificationReceipt(
    root, inputs, passingResult());
  assert.equal(readPassingVerificationReceipt(root, inputs)?.receipt.outcome,
    'PASS');

  fs.writeFileSync(written.receiptPath, '{');
  assert.equal(readPassingVerificationReceipt(root, inputs), null,
    'partial or corrupt receipts are rejected');
  fs.writeFileSync(written.receiptPath, JSON.stringify({
    schemaVersion: 1,
    outcome: 'FAIL',
    key: inputs.key,
    profile: inputs.profile,
    semanticDigest: inputs.semanticDigest,
    planDigest: inputs.planDigest,
  }));
  assert.equal(readPassingVerificationReceipt(root, inputs), null,
    'failed receipts are never reusable');

  writePassingVerificationReceipt(root, inputs, passingResult());
  const foreign = {...inputs, key: '0'.repeat(64)};
  assert.equal(readPassingVerificationReceipt(root, foreign), null,
    'a foreign content key cannot reuse this PASS');
  const leftovers = fs.readdirSync(path.dirname(
    verificationReceiptPath(root, inputs.key)))
    .filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, [], 'atomic writes leave no partial file');
  fs.rmSync(root, {recursive: true, force: true});
});

test('policy, source, environment, and toolchain-lock drift invalidate reuse', () => {
  const root = fixture();
  const originalNodeOptions = process.env.NODE_OPTIONS;
  const initial = verificationInputs(root, plan());
  write(root, 'src/value.js', 'export const value = 2;\n');
  assert.notEqual(verificationInputs(root, plan()).key, initial.key);
  write(root, 'src/value.js', 'export const value = 1;\n');
  assert.notEqual(verificationInputs(root, {
    ...plan(), tests: ['test/different.test.js'],
  }).key, initial.key);
  process.env.NODE_OPTIONS = '--no-warnings';
  assert.notEqual(verificationInputs(root, plan()).key, initial.key);
  if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS;
  else process.env.NODE_OPTIONS = originalNodeOptions;
  fs.rmSync(root, {recursive: true, force: true});
});
