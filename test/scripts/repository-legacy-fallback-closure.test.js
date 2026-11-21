import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {execFile, spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {
  KEY_AFFECTED_WITNESS_FILES,
  auditClassificationDispositions,
  auditCurrentClosure,
  verifyAffectedOwnerProofs,
} from '../../scripts/checks/check-repository-legacy-fallback-closure.js';
import {
  buildExecutionReport, describeCheckout, EXECUTION_PROBLEM, fileResultRecord,
} from '../../scripts/test-execution-report.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const EVIDENCE_CLI = 'scripts/quest-evidence/repository-legacy-fallback-closure.js';
const CHECKER_CLI = 'scripts/checks/check-repository-legacy-fallback-closure.js';
const HISTORICAL = path.join(ROOT,
  'solve/quests/repository-legacy-fallback-closure/evidence/receipt.json');
const runCli = promisify(execFile);

test('missing execution cannot establish affected-owner results', () => {
  assert.equal(KEY_AFFECTED_WITNESS_FILES.every((file) =>
    fs.existsSync(path.join(ROOT, file))), true);
  const proof = verifyAffectedOwnerProofs(ROOT);
  assert.equal(proof.reportApplicable, false);
  assert.deepEqual(proof.problems.map(({code}) => code), [EXECUTION_PROBLEM.REPORT_ABSENT]);
});

function incompleteReport({source, exitStatus = 0, result} = {}) {
  const checkout = describeCheckout(ROOT);
  const planned = KEY_AFFECTED_WITNESS_FILES;
  const results = result ? [fileResultRecord({file: planned[0], ...result})] : [];
  return buildExecutionReport({
    candidate: {sha: source ?? checkout.head, tree: checkout.tree, clean: checkout.clean},
    producer: {kind: 'negative-fixture', id: 'incomplete-owner-selection'},
    commands: [{label: 'classified owner witnesses', exitStatus}],
    planned,
    runs: [{runId: 'incomplete', checkout, complete: true, exitStatus, planned, results}],
  });
}

test('affected owner proof rejects missing, failed, empty and foreign execution', () => {
  for (const [report, required] of [
    [incompleteReport(), EXECUTION_PROBLEM.PLANNED_FILE_NOT_EXECUTED],
    [incompleteReport({exitStatus: 1, result: {ok: false, assertions: 1}}),
      EXECUTION_PROBLEM.PLANNED_FILE_FAILED],
    [incompleteReport({result: {ok: true, assertions: 0}}), EXECUTION_PROBLEM.ZERO_ASSERTION_PASS],
    [incompleteReport({source: '0'.repeat(40)}), EXECUTION_PROBLEM.CANDIDATE_SHA_MISMATCH],
  ]) {
    const proof = verifyAffectedOwnerProofs(ROOT, report);
    assert.equal(proof.reportApplicable, false);
    assert.ok(proof.problems.some(({code}) => code === required), required);
  }
});

test('valid classification labels and no searched runtime markers leave semantics unverified',
  (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'q11-closure-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const classifications = path.join(root, 'scripts/checks');
    fs.mkdirSync(classifications, {recursive: true});
    fs.writeFileSync(path.join(classifications, 'code-navigability-fallback-classification.json'),
      JSON.stringify({entries: [{classification: 'documented-default', reason: 'declared'}]}));
    const classification = auditClassificationDispositions(root);
    assert.equal(classification.dispositionsWellFormed, true);
    const audit = auditCurrentClosure(root);
    assert.equal(audit.runtimeMarkers.matches.length, 0);
    assert.equal(audit.semanticClosure, 'unverified');
  });

test('both Q11 entrypoints replace a stale scratch pass and print the incomplete result',
  async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'q11-scratch-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const before = fs.readFileSync(HISTORICAL);
    const source = describeCheckout(ROOT).head;
    await Promise.all([EVIDENCE_CLI, CHECKER_CLI].map(async (script, index) => {
      const output = path.join(directory, `receipt-${index}.json`);
      fs.writeFileSync(output, '{"status":"pass"}\n');
      const options = index === 0 ? ['--output', output] : [`--output=${output}`];
      await assert.rejects(runCli(process.execPath, [script, ...options], {cwd: ROOT}),
        (result) => {
          assert.equal(result.code, 1, result.stderr);
          const audit = JSON.parse(result.stdout);
          assert.equal(audit.scope, 'current-closure-diagnostic');
          assert.equal(audit.sourceCommit, source);
          assert.equal(audit.ownerExecution.reportApplicable, false);
          assert.ok(['unresolved', 'unverified'].includes(audit.semanticClosure));
          assert.equal(fs.readFileSync(output, 'utf8'), result.stdout);
          return true;
        });
    }));
    assert.deepEqual(fs.readFileSync(HISTORICAL), before);
  });

test('Q11 refuses historical output aliases and keeps verification read-only', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'q11-protected-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const before = fs.readFileSync(HISTORICAL);
  const fileAlias = path.join(directory, 'file-link.json');
  const directoryAlias = path.join(directory, 'evidence-link');
  fs.symlinkSync(HISTORICAL, fileAlias);
  fs.symlinkSync(path.dirname(HISTORICAL), directoryAlias, 'dir');
  for (const output of [HISTORICAL, fileAlias, path.join(directoryAlias, 'receipt.json')]) {
    const run = spawnSync(process.execPath, [EVIDENCE_CLI, '--output', output],
      {cwd: ROOT, encoding: 'utf8'});
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Cannot write diagnostics to the sealed historical receipt/u);
  }
  const verification = spawnSync(process.execPath, [EVIDENCE_CLI, '--check-verification'],
    {cwd: ROOT, encoding: 'utf8'});
  const historicalVerification = JSON.parse(verification.stdout);
  assert.equal(typeof historicalVerification.approved, 'boolean');
  assert.equal(verification.status, historicalVerification.approved ? 0 : 1);
  assert.deepEqual(fs.readFileSync(HISTORICAL), before);
});
