/**
 * TX1 M1: SIGKILL a real seed with twelve open SQLite handles after a
 * committed RF3 schema cutover. A separate process independently reads
 * coordinator, participant and effect rows and reconstructs the production
 * transaction coordinator's immutable terminal state.
 *
 * This is not a decision-before-fanout crash/replay or power-loss proof.
 */
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

const M1 = fileURLToPath(new URL('./seed-migration-cutover-persisted.integration.test.js',
  import.meta.url));
const DISK_READER = fileURLToPath(new URL('./helpers/tx1-migration-disk-reader.js',
  import.meta.url));
const RECOVERY_READER = fileURLToPath(new URL(
  './helpers/tx1-postkill-coordinator-reader.js', import.meta.url));
const WAIT_MS = 150000;
const STEP_MS = 50;
const CHILD_OUTPUT_LIMIT = 128 * 1024;

function boundedAppend(old, chunk) {
  return (old + chunk).slice(-CHILD_OUTPUT_LIMIT);
}

async function markerBeforeExit(markerPath, exited) {
  const start = Date.now();
  while (Date.now() - start < WAIT_MS) {
    if (fs.existsSync(markerPath)) {
      return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    }
    if (exited.value) {
      throw new Error('M1 child exited before durable marker: ' +
        JSON.stringify(exited.value));
    }
    await sleep(STEP_MS);
  }
  throw new Error('M1 child did not establish committed RF3 state within wait bound');
}

test('TX1 M1: SIGKILL with RF3 SQLite handles open, then read and reconstruct ' +
  'the exact coordinator decision, participants and both effects from real disk',
{timeout: 185000}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-m1-sigkill-'));
  const markerPath = path.join(root, 'prekill.json');
  let stdout = '';
  let stderr = '';
  let marker = null;
  const exited = {value: null};
  const child = spawn(process.execPath, [M1], {
    env: {...process.env, LAGRANGE_TX1_M1_KILL_MARKER_PATH: markerPath,
      LAGRANGE_RETRY_FAILED_ONCE: '0'},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (buffer) => {
    stdout = boundedAppend(stdout, buffer.toString());
  });
  child.stderr.on('data', (buffer) => {
    stderr = boundedAppend(stderr, buffer.toString());
  });
  const completion = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      exited.value = {code, signal};
      resolve(exited.value);
    });
  });
  try {
    marker = await markerBeforeExit(markerPath, exited);
    assert.equal(marker.schemaVersion, 1);
    assert.equal(marker.kind, 'TX1_M1_PRE_KILL');
    assert.equal(marker.pid, child.pid, 'marker identifies the killed process');
    assert.equal(marker.pendingOpenHandles, 12,
      'no orderly close preceded the checkpoint');
    assert.equal(marker.requests.length, 12);
    assert.equal(new Set(marker.requests.map((request) => request.dbPath)).size, 12);
    assert.equal(marker.persistedDecision.status, 'COMMITTED');
    assert.equal(marker.persistedDecision.frozenParticipantCount, 2);
    assert.equal(marker.coordinatorRestarted, false);
    assert.ok(marker.requests.every((request) =>
      request.dbPath.startsWith(marker.dataDir + path.sep)));
    assert.equal(child.kill('SIGKILL'), true, 'must kill the live seed process');
    const death = await completion;
    assert.equal(death.signal, 'SIGKILL', 'the child must not exit gracefully');
    assert.equal(death.code, null);

    const reader = spawnSync(process.execPath, [DISK_READER], {
      input: JSON.stringify(marker.requests), encoding: 'utf8', timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(reader.error, undefined, reader.stderr);
    assert.equal(reader.signal, null);
    assert.equal(reader.status, 0, reader.stderr);
    assert.deepEqual(JSON.parse(reader.stdout), marker.expectedDiskRows,
      'the new process must read WAL/disk, not memory from the killed seed');

    assert.equal(marker.recoveryRequests.length, 9,
      'three coordinator tables with three distinct replica files each');
    const recoveryDisk = spawnSync(process.execPath, [DISK_READER], {
      input: JSON.stringify(marker.recoveryRequests), encoding: 'utf8',
      timeout: 15000, maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(recoveryDisk.error, undefined, recoveryDisk.stderr);
    assert.equal(recoveryDisk.status, 0, recoveryDisk.stderr);
    const observations = JSON.parse(recoveryDisk.stdout);
    assert.deepEqual(observations, marker.expectedRecoveryRows,
      'all RF3 coordinator replicas retain the same rows after kill');

    const payload = {};
    for (let index = 0; index < marker.recoveryRequests.length; index += 3) {
      payload[marker.recoveryRequests[index].tableName] = observations[index].rows;
    }
    const recovery = spawnSync(process.execPath, [RECOVERY_READER], {
      input: JSON.stringify({transactionId: marker.transactionId, payload}),
      encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(recovery.error, undefined, recovery.stderr);
    assert.equal(recovery.status, 0, recovery.stderr);
    const rebuilt = JSON.parse(recovery.stdout);
    assert.equal(rebuilt.status, 'COMMITTED');
    assert.equal(rebuilt.participants, 2);
    assert.equal(rebuilt.readOnlyRecovery, true);
    assert.equal(rebuilt.replayAttempted, false,
      'a read-only reconstruction cannot pretend to complete COMMIT fanout');
    t.diagnostic(JSON.stringify({kind: 'TX1_M1_SIGKILL_DISK_DURABILITY',
      killedPid: marker.pid, transactionId: marker.transactionId,
      distinctReplicaFiles: marker.requests.length,
      killedWithOpenHandles: marker.pendingOpenHandles,
      committedDecisionRecovered: true, coordinatorReconstructed: true,
      replayAttempted: false, coordinatorRestarted: false,
      limits: 'post-decision SIGKILL, no interrupted-fanout or physical-host proof'}));
  } catch (error) {
    t.diagnostic(JSON.stringify({error: error.message,
      m1ChildStdoutTail: stdout.slice(-4000),
      m1ChildStderrTail: stderr.slice(-4000)}));
    throw error;
  } finally {
    if (exited.value === null) {
      child.kill('SIGKILL');
      await completion;
    }
    if (marker?.dataDir) {
      fs.rmSync(marker.dataDir, {recursive: true, force: true});
    }
    fs.rmSync(root, {recursive: true, force: true});
  }
});
