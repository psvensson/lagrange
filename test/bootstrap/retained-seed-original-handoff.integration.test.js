// First unchanged-source public discriminator only. No grant or admission fake.
// Future authority/public-ingress witnesses remain separate sealed obligations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {BOOTSTRAP_DEFAULT} from '../../src/bootstrap/bootstrap-constants.js';
import {MEMBERSHIP_OWNER_REASON} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {CONTROL_PARTITION} from '../test-helpers/retained-seed-public-observer.js';

const CHILD = new URL('../test-helpers/retained-seed-public-child.js', import.meta.url);
const NODE_ID = '550e8400-e29b-41d4-a716-446655449965';
const TEST_TIMEOUT_MS = 90000;
const HANDOFF_COMPLETE_CODE = 'HANDOFF_COMPLETE_SERVING_DEFERRED';
const allocator = createPortAllocator(import.meta.url);

function childAttempt(t, mode, directory, ports) {
  const child = fork(CHILD, [mode, directory, NODE_ID, JSON.stringify(ports)],
    {execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  const outputPath = path.join(directory, `${mode}-child-output.log`);
  const output = fs.createWriteStream(outputPath);
  child.stdout.on('data', (chunk) => output.write(chunk));
  child.stderr.on('data', (chunk) => output.write(chunk));
  const closed = new Promise((resolve) => child.once('close', (code, signal) => {
    output.end(() => resolve({code, signal}));
  }));
  const report = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('message', resolve);
    child.once('close', () => reject(new Error(`public child ${mode} exited before report`)));
  });
  let outputReported = false;
  const reportOutput = () => {
    if (outputReported) return;
    outputReported = true;
    const raw = fs.readFileSync(outputPath, 'utf8');
    if (raw) t.diagnostic(raw);
  };
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
    reportOutput();
  });
  return {child, closed, report, reportOutput};
}

async function finishAttempt(t, attempt) {
  const report = await attempt.report;
  assert.equal(report.kind, 'public-startup-settled');
  assert.notEqual(report.pid, process.pid);
  if (attempt.child.connected) attempt.child.send('exit-after-observation');
  assert.deepEqual(await attempt.closed, {code: 0, signal: null});
  t.diagnostic(JSON.stringify(report));
  attempt.reportOutput();
  return report;
}

function assertCleanupObserved(report) {
  assert.equal(report.cleanupError, null);
  assert.equal(report.startupError?.name === 'AggregateError', false,
    'public unwind must retain any cleanup error instead of using process exit as proof');
  assert.deepEqual(report.observation.observerErrors, []);
  assert.ok(report.observation.databases.length > 0, 'actual native databases must engage');
  assert.ok(report.observation.databases.every((db) => db.closed === true),
    'all captured original native database owners must close before child termination');
}

function assertActualExpiry(report) {
  const observed = report.observation;
  assert.equal(report.returnedRuntime, false);
  assert.equal(observed.bootstrapObserved, true);
  assert.equal(observed.budgetMs, BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs);
  assert.equal(observed.budgetMs, 30000, 'public baseline budget remains the real30s default');
  assert.equal(observed.startupServicesAdmission.empty, true);
  assert.equal(observed.membershipOwnerOutcome.reasonCode, MEMBERSHIP_OWNER_REASON.FRESH_SEED);
  const selected = observed.selected;
  assert.ok(selected, 'actual cold public startup must reach registered non-control ENABLE');
  assert.equal(selected.before, null);
  assert.equal(selected.answer.outcome, OUTCOME.OBSERVED);
  assert.deepEqual(selected.answer.origin, selected.after);
  assert.ok(selected.after.originIndex > 0 && selected.after.originTerm > 0);
  assert.ok(selected.settledAtMs < selected.request.deadlineAtMs);
  assert.equal(selected.forcedAtMs, selected.request.deadlineAtMs);
  assert.equal(selected.nativeClockUnchanged, true);
  assert.equal(selected.nodeClockUnchanged, true);
  assert.equal(selected.admissionAfterEnable.state, ADMISSION.CLOSED);
  assert.equal(selected.selectedOuter.answer.missingFact, MISSING.RELEASE_DEADLINE);
  assert.equal(selected.selectedOuter.answer.phase, ACTION.OBSERVE_APPLIED_POSITION);
  assert.ok(selected.freshIntents.every(({request}) =>
    request.deadlineAtMs === selected.request.deadlineAtMs));
  assert.ok(selected.freshIntents.some(({request, answer}) =>
    request.partitionId === CONTROL_PARTITION && answer?.outcome === OUTCOME.CUT_OVER));
  assert.equal(selected.selectedAttempt.filter(({request}) =>
    request.action === ACTION.ENABLE).length, 1);
  assert.equal(selected.selectedAttempt.some(({request}) =>
    [ACTION.OBSERVE_APPLIED_POSITION, ACTION.RESUME].includes(request.action)), false);
  assertCleanupObserved(report);
  return selected;
}

function readOrigin(dbPath) {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return readPartitionWriteOrigin(db);
  } finally {
    db.close();
  }
}

function assertDirectoryReacquired(directory) {
  const owner = acquireDataDirectoryProcessOwner(directory);
  owner.release();
}

test('cold public partial seed preserves original ENABLE and reaches exact handoff frontier',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'retained-seed-public-'));
    const ports = allocator.getListenerPorts();
    let passed = false;
    t.after(() => {
      // Every failed attempt retains its raw child output and native artifacts.
      if (passed) fs.rmSync(directory, {recursive: true, force: true});
      else t.diagnostic(`retained public baseline artifacts: ${directory}`);
    });
    const first = await finishAttempt(t, childAttempt(t, 'initial', directory, ports));
    const selected = assertActualExpiry(first);
    assertDirectoryReacquired(directory);
    assert.deepEqual(readOrigin(selected.dbPath), selected.after);
    const second = await finishAttempt(t, childAttempt(t, 'restart', directory, ports));
    assert.notEqual(second.pid, first.pid, 'restart must enter in a genuinely cold process');
    assert.equal(second.returnedRuntime, false);
    assert.equal(second.cleanupError, null);
    assert.notEqual(second.startupError?.name, 'AggregateError',
      'a second-start cleanup failure is a prerequisite, not the handoff discriminator');
    assert.deepEqual(second.observation.observerErrors, []);
    assert.ok(second.observation.databases.every((db) => db.closed === true));
    assertDirectoryReacquired(directory);
    assert.deepEqual(readOrigin(selected.dbPath), selected.after,
      'actual public refusal/recovery cannot erase the original committed origin');
    t.diagnostic(JSON.stringify({firstPublicRestartError: second.startupError,
      firstCreationRefusal: second.observation.creationRefusals[0] ?? null,
      consumedStorage: second.observation.startupServicesAdmission,
      consumedMembership: second.observation.membershipOwnerOutcome}));
    assert.equal(second.startupError?.code, HANDOFF_COMPLETE_CODE,
      'actual cold public entry must complete the bounded nonserving original handoff');
    passed = true;
  });
