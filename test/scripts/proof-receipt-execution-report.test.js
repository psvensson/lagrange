// Falsifiers for the proof receipt's evidence binding
// (proof-receipt-bound-to-validated-execution). A passing durable receipt may
// only be minted from a validated execution report of the exact candidate:
// every test below hands recordProof one deliberately broken report and
// proves the receipt is refused with its typed problem and that no proof ref
// reached the remote. The positive case mints from a complete report; the
// reuse case proves a receipt minted before reports existed still resolves.
//
// A file of its own, beside test/scripts/proof-authority-falsifiers.test.js:
// that file's bytes are bound by
// test/manifests/proof-authority-falsifiers.receipt.json.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  OUTCOME, PROOF, buildReceipt, buildTagBody, proofRef, recordProof, resolveProof,
} from '../../scripts/proof-authority.js';
import {computeReleaseProofIdentity} from '../../scripts/release-proof-identity.js';
import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {
  REPORT_FILE_A, REPORT_FILE_B, passingResult, validExecutionReport,
} from './execution-report-fixture.js';

const RECORDED_AT = '2026-11-02T12:00:00.000Z';
const NOW = Date.parse(RECORDED_AT);

const RUNNER = path.resolve('scripts/run-test-files.js');
const AUTHORITY = path.resolve('scripts/proof-authority.js');

function git(cwd, ...args) {
  return execGit(args, {cwd, encoding: 'utf8', env: gitProcessEnvironment()}).trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-receipt-report-'));
  const source = path.join(root, 'source');
  const remote = path.join(root, 'remote.git');
  fs.mkdirSync(source);
  git(source, 'init', '--quiet');
  git(source, 'config', 'user.name', 'Report Fixture');
  git(source, 'config', 'user.email', 'report@example.invalid');
  fs.writeFileSync(path.join(source, 'subject.txt'), 'subject\n');
  git(source, 'add', 'subject.txt');
  git(source, 'commit', '--quiet', '-m', 'subject');
  const sha = git(source, 'rev-parse', 'HEAD');
  const tree = git(source, 'rev-parse', 'HEAD^{tree}');
  git(root, 'init', '--bare', '--quiet', remote);
  git(source, 'remote', 'add', 'origin', remote);
  git(source, 'push', '--quiet', 'origin', 'HEAD:main');
  return {root, source, remote, sha, tree};
}

function remoteRef(source, proofId, sha) {
  return git(source, 'ls-remote', '--refs', 'origin', proofRef(proofId, sha));
}

function record(context, report, proofId = PROOF.CORPUS_FULL) {
  return recordProof({proofId, sha: context.sha, cwd: context.source, report,
    completedAt: RECORDED_AT, now: NOW, producer: {kind: 'test-fixture', id: 'recorder'}});
}

// The falsifier's assertion: refused, with exactly this typed problem among
// its reasons, and nothing on the remote.
function assertRefused(context, report, code, proofId = PROOF.CORPUS_FULL) {
  assert.throws(() => record(context, report, proofId), (error) => {
    const codes = (error.problems || []).map((entry) => entry.code);
    assert.ok(codes.includes(code), `expected ${code} among ${JSON.stringify(codes)}`);
    return true;
  }, `a ${code} report must be refused`);
  assert.equal(remoteRef(context.source, proofId, context.sha), '',
    'a refused report leaves no receipt on the remote');
}

function mutated(context, mutate) {
  const report = validExecutionReport(context);
  mutate(report);
  return report;
}

test('absent: no execution report mints no receipt', () => {
  const context = fixture();
  assertRefused(context, undefined, 'execution-report-absent');
});

test('partial: a report without its commands mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    delete report.commands;
  }), 'execution-report-partial');
});

test('schema: a report of another schema mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.schema = 'lagrange-test-execution-report/v0';
  }), 'execution-report-schema-mismatch');
});

test('not-clean: a report of a dirty candidate mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.candidate.clean = false;
  }), 'execution-report-candidate-not-clean');
});

test('run-failed: a runner that exited non-zero mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.runs[0].exitStatus = 1;
  }), 'execution-report-run-failed');
});

test('sha-mismatch: a report of another commit mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.candidate.sha = 'c'.repeat(40);
  }), 'execution-report-candidate-sha-mismatch');
});

test('tree-mismatch: a report of another tree mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.candidate.tree = 'd'.repeat(40);
  }), 'execution-report-candidate-tree-mismatch');
});

test('identity-mismatch: a release report of another identity mints no receipt', () => {
  const context = fixture();
  const identity = computeReleaseProofIdentity(context.source);
  assertRefused(context, mutated(context, (report) => {
    report.candidate.identity = {algorithm: identity.algorithm, digest: 'e'.repeat(64)};
  }), 'execution-report-identity-mismatch', PROOF.RELEASE_FULL);
});

test('identity-unverifiable: a release proof recorded from a dirty checkout mints no receipt',
  () => {
    const context = fixture();
    const identity = computeReleaseProofIdentity(context.source);
    const report = validExecutionReport({...context,
      identity: {algorithm: identity.algorithm, digest: identity.digest}});
    fs.writeFileSync(path.join(context.source, 'subject.txt'), 'edited\n');
    assertRefused(context, report, 'execution-report-identity-mismatch', PROOF.RELEASE_FULL);
  });

test('run-other-checkout: a run in another checkout mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.runs[0].checkout = {head: 'f'.repeat(40), tree: context.tree, clean: true};
  }), 'execution-report-run-other-checkout');
});

test('failed-command: a failed command mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.commands.push({label: 'static', argv: ['npm', 'run', 'test:static'], exitStatus: 1});
  }), 'execution-report-command-failed');
});

test('failed-file: a failed planned file mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.runs[0].results[1] = {file: REPORT_FILE_B, ok: false, assertions: 2,
      attempts: [{attempt: 1, ok: false, assertions: 2, reasons: ['TAP assertions failed']}]};
  }), 'execution-report-planned-file-failed');
});

test('skipped-file: a planned file without a result mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.runs[0].results.pop();
  }), 'execution-report-planned-file-not-executed');
});

test('zero-assertion: a pass with no assertions mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.runs[0].results[0] = passingResult(REPORT_FILE_A, 0);
  }), 'execution-report-zero-assertion-pass');
});

test('truncated: a run that started and never ended mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.runs.push({runId: 'run-2', complete: false, checkout: report.runs[0].checkout,
      argv: ['test/c.test.js'], planned: ['test/c.test.js']});
  }), 'execution-report-run-truncated');
});

test('passed-on-retry: a file green only on its retry mints no clean receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.runs[0].results[0] = {file: REPORT_FILE_A, ok: true, assertions: 3, attempts: [
      {attempt: 1, ok: false, assertions: 3, reasons: ['TAP assertions failed']},
      {attempt: 2, ok: true, assertions: 3, reasons: []}]};
  }), 'execution-report-passed-on-retry');
});

test('reused-proof: a cited proof the store does not hold mints no receipt', () => {
  const context = fixture();
  assertRefused(context, mutated(context, (report) => {
    report.planned = [];
    report.runs = [];
    report.reusedProofs = [{proofId: PROOF.CORPUS_FULL, objectSha: 'a'.repeat(40)}];
  }), 'execution-report-reused-proof-unproven', PROOF.RELEASE_FULL);
});

test('qualified: an admitted retry is carried as a qualification, never a clean pass', async () => {
  const {RETRY_POLICY, executionReportProblems} =
    await import('../../scripts/test-execution-report.js');
  const context = fixture();
  const report = mutated(context, (draft) => {
    draft.runs[0].results[0] = {file: REPORT_FILE_A, ok: true, assertions: 3, attempts: [
      {attempt: 1, ok: false, assertions: 3, reasons: ['TAP assertions failed']},
      {attempt: 2, ok: true, assertions: 3, reasons: []}]};
  });
  const admitted = executionReportProblems(report, {sha: context.sha, tree: context.tree,
    retryPolicy: RETRY_POLICY.ADMIT_QUALIFIED});
  assert.deepEqual(admitted.problems, []);
  assert.equal(admitted.qualification.length, 1);
  assert.equal(admitted.qualification[0].attempts[0].ok, false,
    'the qualification keeps the first failure');
  const receipt = buildReceipt({proofId: PROOF.CORPUS_FULL, sha: context.sha,
    completedAt: RECORDED_AT, execution: {summary: admitted.summary,
      qualification: admitted.qualification}});
  assert.notEqual(receipt.outcome, 'passed', 'a qualified receipt is never a clean pass');
  assert.equal(receipt.execution.qualification.length, 1);
  // Planted on the store, a qualified receipt does not resolve as proven
  // under a contract whose sealed policy refuses qualified results.
  const objectSha = execGit(['mktag'], {cwd: context.source, encoding: 'utf8',
    input: buildTagBody({proofId: PROOF.CORPUS_FULL, sha: context.sha, receipt, now: NOW})})
    .trim();
  git(context.source, 'update-ref', 'refs/tmp/qualified', objectSha);
  git(context.source, 'push', '--quiet', 'origin',
    `refs/tmp/qualified:${proofRef(PROOF.CORPUS_FULL, context.sha)}`);
  const resolved = resolveProof({proofId: PROOF.CORPUS_FULL, sha: context.sha,
    cwd: context.source});
  assert.notEqual(resolved.outcome, OUTCOME.PROVEN);
});

test('positive: a complete report of the exact candidate mints a receipt bound to it', () => {
  const context = fixture();
  const identity = computeReleaseProofIdentity(context.source);
  const report = validExecutionReport({...context,
    identity: {algorithm: identity.algorithm, digest: identity.digest}});
  const recorded = record(context, report, PROOF.RELEASE_FULL);
  assert.equal(recorded.outcome, OUTCOME.PROVEN, recorded.because);
  assert.equal(recorded.receipt.outcome, 'passed');
  assert.equal(recorded.receipt.execution.summary.executed, 2);
  assert.equal(recorded.receipt.execution.summary.assertions, 6);
  assert.equal(recorded.receipt.execution.producer.id, 'report-run');
  assert.match(recorded.receipt.execution.reportDigest, /^[0-9a-f]{64}$/u);
  assert.notEqual(remoteRef(context.source, PROOF.RELEASE_FULL, context.sha), '');
});

test('reuse: a receipt minted before reports existed still resolves', () => {
  const context = fixture();
  const receipt = buildReceipt({proofId: PROOF.CORPUS_FULL, sha: context.sha,
    completedAt: RECORDED_AT, producer: {kind: 'test-fixture', id: 'legacy-run'}});
  const objectSha = execGit(['mktag'], {cwd: context.source, encoding: 'utf8',
    input: buildTagBody({proofId: PROOF.CORPUS_FULL, sha: context.sha,
      receipt: {schema: receipt.schema, proofId: receipt.proofId,
        subjectSha: receipt.subjectSha, outcome: 'passed', reuse: receipt.reuse,
        completedAt: receipt.completedAt, producer: receipt.producer}, now: NOW})}).trim();
  git(context.source, 'update-ref', 'refs/tmp/legacy', objectSha);
  git(context.source, 'push', '--quiet', 'origin',
    `refs/tmp/legacy:${proofRef(PROOF.CORPUS_FULL, context.sha)}`);
  const resolved = resolveProof({proofId: PROOF.CORPUS_FULL, sha: context.sha,
    cwd: context.source});
  assert.equal(resolved.outcome, OUTCOME.PROVEN, resolved.because);
  assert.equal(resolved.objectSha, objectSha);
  // A reused receipt answers a later record with a valid report unchanged.
  const again = record(context, validExecutionReport(context));
  assert.equal(again.reused, true);
  assert.equal(again.objectSha, objectSha);
});

test('cli: record without --report is refused with its typed problem', () => {
  const context = fixture();
  const result = spawnSync(process.execPath,
    [AUTHORITY, 'record', PROOF.CORPUS_FULL, context.sha],
    {cwd: context.source, encoding: 'utf8', env: gitProcessEnvironment()});
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /execution-report-absent/u);
  assert.equal(remoteRef(context.source, PROOF.CORPUS_FULL, context.sha), '');
});

// The runner side: a run whose environment names a sections file writes the
// start and end sections the report is assembled from, the retry included.
test('runner: sections carry the checkout, assertion counts and the retry record', () => {
  const context = fixture();
  const marker = path.join(context.root, 'first-attempt-done');
  fs.mkdirSync(path.join(context.source, 'test'), {recursive: true});
  fs.writeFileSync(path.join(context.source, REPORT_FILE_A),
    'import {test} from \'node:test\';\nimport assert from \'node:assert\';\n' +
    'test(\'a\', () => { assert.ok(true); });\n');
  fs.writeFileSync(path.join(context.source, REPORT_FILE_B),
    'import {test} from \'node:test\';\nimport assert from \'node:assert\';\n' +
    'import fs from \'node:fs\';\n' +
    `const marker = ${JSON.stringify(marker)};\n` +
    'test(\'b\', () => { const first = !fs.existsSync(marker); ' +
    'fs.writeFileSync(marker, \'x\'); assert.ok(!first); });\n');
  git(context.source, 'add', 'test');
  git(context.source, 'commit', '--quiet', '-m', 'tests');
  const head = git(context.source, 'rev-parse', 'HEAD');
  const sections = path.join(context.root, 'sections.ndjson');
  const env = {...gitProcessEnvironment(), LAGRANGE_EXECUTION_REPORT: sections,
    LAGRANGE_RETRY_FAILED_ONCE: '1'};
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [RUNNER, REPORT_FILE_A, REPORT_FILE_B],
    {cwd: context.source, encoding: 'utf8', env});
  assert.equal(result.status, 0, 'the retry passed, so the runner exits green');
  const lines = fs.readFileSync(sections, 'utf8').trim().split('\n').map((line) =>
    JSON.parse(line));
  assert.deepEqual(lines.map((line) => line.kind), ['start', 'end']);
  assert.equal(lines[0].checkout.head, head);
  assert.equal(lines[0].checkout.clean, true);
  assert.deepEqual(lines[0].planned, [REPORT_FILE_A, REPORT_FILE_B]);
  const byFile = new Map(lines[1].results.map((entry) => [entry.file, entry]));
  assert.equal(byFile.get(REPORT_FILE_A).attempts.length, 1);
  assert.ok(byFile.get(REPORT_FILE_A).assertions > 0);
  const retried = byFile.get(REPORT_FILE_B);
  assert.deepEqual(retried.attempts.map((attempt) => attempt.ok), [false, true],
    'the first failure is kept beside the retry pass');
  assert.equal(lines[1].exitStatus, 0);
});

// A runner a test spawns is that test's fixture, never part of the proof run
// that reports it: the corpus holds tests that drive the runner over
// deliberately failing files in throwaway repositories. Were the sections
// file inherited, every real whole-corpus report would carry those runs.
test('runner: a test file never inherits the sections file its run reports to', () => {
  const context = fixture();
  fs.mkdirSync(path.join(context.source, 'test'), {recursive: true});
  const nested = path.join(context.root, 'nested.test.js');
  fs.writeFileSync(nested, 'import {test} from \'node:test\';\n' +
    'test(\'nested\', () => { throw new Error(\'a fixture failure\'); });\n');
  fs.writeFileSync(path.join(context.source, REPORT_FILE_A),
    'import {test} from \'node:test\';\nimport assert from \'node:assert\';\n' +
    'import {spawnSync} from \'node:child_process\';\n' +
    `const runner = ${JSON.stringify(RUNNER)};\n` +
    `const nested = ${JSON.stringify(nested)};\n` +
    'test(\'a\', () => {\n' +
    '  const env = {...process.env};\n' +
    '  delete env.NODE_TEST_CONTEXT;\n' +
    `  const run = spawnSync(process.execPath, [runner, nested], {cwd: ${
      JSON.stringify(context.root)}, env, encoding: 'utf8'});\n` +
    '  assert.notEqual(run.status, 0, \'the nested fixture run is red\');\n' +
    '});\n');
  git(context.source, 'add', 'test');
  git(context.source, 'commit', '--quiet', '-m', 'tests');
  const sections = path.join(context.root, 'sections.ndjson');
  const env = {...gitProcessEnvironment(), LAGRANGE_EXECUTION_REPORT: sections};
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [RUNNER, REPORT_FILE_A],
    {cwd: context.source, encoding: 'utf8', env});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const lines = fs.readFileSync(sections, 'utf8').trim().split('\n').map((line) =>
    JSON.parse(line));
  assert.deepEqual(lines.map((line) => [line.kind, line.planned ?? line.results?.length]),
    [['start', [REPORT_FILE_A]], ['end', 1]],
    'only the proof run itself reports; the run its test spawned does not');
});
