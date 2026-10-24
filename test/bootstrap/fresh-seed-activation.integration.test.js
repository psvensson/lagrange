// Quest fresh-seed-activation witness (owner decision 2, 2026-10-26).
// A legitimately admitted fresh seed completes protected activation, durably
// transfers its original registration and cluster-identity rights, and reaches
// normal service through the supported startup path.
//
// Entry is the actual public startLagrangeRuntime in genuinely new child
// processes (test/test-helpers/fresh-seed-activation-public-child.js): it
// composes the production data-directory owner, the startup membership and
// storage admissions, and prepareOriginalSeedAttempt itself. No grant,
// admission, phase or owner is replaced. Observation is passive.
//
// Receipts (solve/quests/fresh-seed-activation/evidence/receipt.json):
//   R1 protected activation only for openings admitted under the exact allocation
//   R2 each original right UNUSED -> SUBMITTED -> TRANSFERRED durably, never reset
//   R3 public admission closed until the handoff completes, open after
//   R4 a write and a read succeed through public admission
//   R5 restart on the same durable data reaches service or is held typed
// R5 keeps the restart obligation visible. It is not a recovery claim: the
// retained two-start handoff stays with retained-seed-original-handoff and
// the final cutover acceptance.
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
import {originalAllocationRow} from '../../src/raft/raft-rs-original-allocation-store.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_COLUMN as COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';

const CHILD = new URL('../test-helpers/fresh-seed-activation-public-child.js', import.meta.url);
const NODE_ID = '550e8400-e29b-41d4-a716-446655449971';
const TEST_TIMEOUT_MS = 180000;
const RIGHT_COLUMNS = Object.freeze([COLUMN.SERVICE_RIGHT, COLUMN.IDENTITY_RIGHT]);
const EXPECTED_SEQUENCE = Object.freeze([STATE.UNUSED, STATE.SUBMITTED, STATE.TRANSFERRED]);
const NATIVE_OPEN = 'create_node';
const CAMPAIGN = 'campaign';
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
    child.once('close', () => reject(new Error(`fresh-seed child ${mode} exited before report`)));
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
  assert.equal(report.kind, 'fresh-seed-startup-settled');
  assert.notEqual(report.pid, process.pid);
  if (attempt.child.connected) attempt.child.send('exit-after-observation');
  assert.deepEqual(await attempt.closed, {code: 0, signal: null});
  t.diagnostic(JSON.stringify({mode: report.mode, returnedRuntime: report.returnedRuntime,
    startupError: report.startupError, cleanupError: report.cleanupError,
    service: report.service, rightSequences: report.observation.rightSequences,
    admission: report.observation.admission,
    observerErrors: report.observation.observerErrors}));
  attempt.reportOutput();
  return report;
}

function holdLabel(error) {
  if (error === null) return 'none';
  return `${error.code ?? error.name}/${error.reason ?? error.message}`;
}

// Durable rights after the child released the directory, read through the
// same allocation store owner the runtime uses.
function readDurableRights(declaration) {
  const owner = acquireDataDirectoryProcessOwner(declaration.dataDir);
  try {
    const rights = {};
    for (const member of declaration.members) {
      const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
      try {
        const row = originalAllocationRow(db, member);
        rights[member.replicaId] = {native: row.native_history_state,
          ...Object.fromEntries(RIGHT_COLUMNS.filter((column) => row[column] !== null)
            .map((column) => [column, row[column]]))};
      } finally {
        db.close();
      }
    }
    return rights;
  } finally {
    owner.release();
  }
}

// R1: every campaign before startup returned is on a declared original group,
// after that group's single native opening; every declared member is opened.
function assertProtectedActivation(report) {
  const {declaration, coreEntries} = report.observation;
  const declaredGroups = new Set(declaration.members.map(({groupId}) => groupId));
  const startup = coreEntries.filter((entry) => entry.afterReturn === false);
  const opened = new Set();
  const campaigned = new Set();
  for (const entry of startup) {
    if (entry.operation === NATIVE_OPEN) opened.add(entry.groupId);
    if (entry.operation !== CAMPAIGN) continue;
    assert.ok(declaredGroups.has(entry.groupId),
      `startup campaigned ${entry.groupId}, which the exact allocation never admitted`);
    assert.ok(opened.has(entry.groupId),
      `${entry.groupId} campaigned before its admitted original opening`);
    campaigned.add(entry.groupId);
  }
  assert.deepEqual([...campaigned].sort(), [...declaredGroups].sort(),
    'every admitted original group activates; no other group activates during startup');
}

// R2: monotonic durable consumption observed from the live process.
function assertRightSequences(report) {
  const {declaration, rightSequences} = report.observation;
  const expectedKeys = declaration.members.flatMap((member) => [
    `${member.replicaId}:${COLUMN.SERVICE_RIGHT}`,
    ...(member.replicaId === declaration.anchorReplicaId ?
      [`${member.replicaId}:${COLUMN.IDENTITY_RIGHT}`] : []),
  ]).sort();
  assert.deepEqual(Object.keys(rightSequences).sort(), expectedKeys,
    'every declared SERVICES birth right and the anchor identity right is observed');
  for (const [key, sequence] of Object.entries(rightSequences)) {
    assert.deepEqual(sequence, EXPECTED_SEQUENCE,
      `${key} must move UNUSED -> SUBMITTED -> TRANSFERRED exactly once, never reset`);
  }
}

// R3: no public surface acts before every right is TRANSFERRED; it acts after.
function assertAdmissionFence(report) {
  const {admission} = report.observation;
  for (const sample of admission) {
    assert.equal(sample.rightsTransferred, true,
      `${sample.surface} admitted a public request before the handoff completed`);
  }
  assert.equal(report.service.ready, true, 'public readiness opens after the handoff');
  assert.ok(admission.some((sample) => sample.afterReturn && sample.surface === 'rest-readyz'));
}

test('fresh seed completes protected activation, transfers its original rights ' +
  'and serves through the supported startup path', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'fresh-seed-activation-'));
  const ports = allocator.getListenerPorts();
  let passed = false;
  t.after(() => {
    // A failed attempt retains its child output and native artifacts.
    if (passed) fs.rmSync(directory, {recursive: true, force: true});
    else t.diagnostic(`retained fresh-seed artifacts: ${directory}`);
  });

  const first = await finishAttempt(t, childAttempt(t, 'initial', directory, ports));
  assert.equal(first.returnedRuntime, true,
    'a legitimately admitted fresh seed must reach service; startup refused ' +
    `${holdLabel(first.startupError)}`);
  assert.equal(first.cleanupError, null);
  assert.deepEqual(first.observation.observerErrors, []);
  assert.ok(first.observation.declaration, 'the live issuer prepared one exact allocation');

  assertProtectedActivation(first);
  assertRightSequences(first);
  assertAdmissionFence(first);

  // R4: a write and a read through public admission.
  assert.equal(first.service.error, undefined,
    `public write/read failed: ${JSON.stringify(first.service.error)}`);
  assert.equal(first.service.write.affectedRows, 1);
  assert.deepEqual(first.service.read.rows,
    [{id: 'row-1', value: 'written-before-restart'}]);

  const declaration = {...first.observation.declaration, dataDir: directory};
  const transferred = readDurableRights(declaration);
  for (const [replicaId, rights] of Object.entries(transferred)) {
    assert.equal(rights.native, HISTORY.ESTABLISHED, `${replicaId} established`);
    for (const column of RIGHT_COLUMNS) {
      if (column in rights) {
        assert.equal(rights[column], STATE.TRANSFERRED, `${replicaId} ${column} durable`);
      }
    }
  }

  // R5: same durable data, genuinely new process. Service again through the
  // retained path, or a typed hold; either way no right is reset or re-spent.
  const second = await finishAttempt(t, childAttempt(t, 'restart', directory, ports));
  assert.notEqual(second.pid, first.pid, 'restart enters in a genuinely cold process');
  assert.equal(second.cleanupError, null);
  assert.deepEqual(second.observation.observerErrors, []);
  if (second.returnedRuntime) {
    assert.deepEqual(second.service.read.rows,
      [{id: 'row-1', value: 'written-before-restart'}],
      'the restarted seed serves the pre-restart write');
  } else {
    assert.equal(second.startupError?.code, STATE.HOLD,
      `an unserved restart must be an owner-named hold, got ${holdLabel(second.startupError)}`);
    t.diagnostic(`restart obligation held: ${holdLabel(second.startupError)}`);
  }
  assert.deepEqual(readDurableRights(declaration), transferred,
    'a restart never resets, re-arms or re-spends an original right');
  passed = true;
});
