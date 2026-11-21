import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
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

test('missing execution cannot establish affected-owner results', () => {
  assert.equal(KEY_AFFECTED_WITNESS_FILES.every((file) =>
    fs.existsSync(path.join(ROOT, file))), true);
  const proof = verifyAffectedOwnerProofs(ROOT);
  assert.equal(proof.passed, false);
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
    assert.equal(proof.passed, false);
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

test('normal Q11 evidence CLI refuses current closure and preserves the historical receipt', () => {
  const historical = path.join(ROOT,
    'solve/quests/repository-legacy-fallback-closure/evidence/receipt.json');
  const before = fs.readFileSync(historical);
  const result = spawnSync(process.execPath, [EVIDENCE_CLI], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(result.status, 1, result.stderr);
  const audit = JSON.parse(result.stdout);
  assert.equal(audit.sourceCommit, describeCheckout(ROOT).head);
  assert.equal(audit.ownerExecution.passed, false);
  assert.ok(['unresolved', 'unverified'].includes(audit.semanticClosure));
  if (audit.semanticClosure === 'unresolved') {
    assert.ok(audit.runtimeMarkers.matches.length > 0);
  }
  assert.deepEqual(fs.readFileSync(historical), before);
});
