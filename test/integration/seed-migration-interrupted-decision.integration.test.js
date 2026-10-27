// A bounded test-only child is killed after the real M1 coordinator records
// COMMIT and before its participant COMMIT callback is allowed to deliver.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

const SOURCE = fileURLToPath(new URL('./seed-migration-cutover-persisted.integration.test.js',
  import.meta.url));
const DISK = fileURLToPath(new URL('./helpers/tx1-migration-disk-reader.js',
  import.meta.url));
const READER = fileURLToPath(new URL('./helpers/tx1-in-doubt-decision-reader.js',
  import.meta.url));
const DISK_REREAD = fileURLToPath(new URL(
  './helpers/tx1-postkill-authority-replay.js', import.meta.url));
const STARTUP_ADMISSION = fileURLToPath(new URL(
  './helpers/tx1-postkill-seed-startup.js', import.meta.url));

test('TX1 M1: a real COMMIT decision and held prepared participants survive seed process loss',
  {timeout: 185000}, async (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-held-decision-'));
    const markerPath = path.join(tmp, 'checkpoint.json');
    let childOutput = '';
    const child = spawn(process.execPath, [SOURCE], {
      env: {...process.env, LAGRANGE_TX1_M1_DECISION_KILL_MARKER_PATH: markerPath,
        LAGRANGE_RETRY_FAILED_ONCE: '0'},
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (bytes) => {
      childOutput = (childOutput + bytes.toString()).slice(-4096);
    });
    child.stderr.on('data', (bytes) => {
      childOutput = (childOutput + bytes.toString()).slice(-4096);
    });
    let ended = null;
    const completion = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        ended = {code, signal};
        resolve(ended);
      });
    });
    let marker;
    try {
      const started = Date.now();
      while (!fs.existsSync(markerPath) && Date.now() - started < 150000 &&
          ended === null) {
        await sleep(50);
      }
      assert.equal(ended, null, 'child must still own the pending COMMIT');
      assert.ok(fs.existsSync(markerPath), childOutput);
      marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      assert.equal(marker.kind, 'TX1_M1_COMMIT_DECIDED_UNDELIVERED');
      assert.equal(marker.pid, child.pid);
      assert.equal(marker.requests.length, 12);
      assert.equal(marker.pendingOpenHandles, 12);
      assert.equal(marker.neverDeliveredCommitCalls, 1);
      assert.equal(marker.persistedDecision.decision, 'COMMIT');
      assert.equal(marker.effectRowsNotApplied, true);
      child.kill('SIGKILL');
      assert.deepEqual(await completion, {code: null, signal: 'SIGKILL'});
      const read = spawnSync(process.execPath, [DISK], {input: JSON.stringify(
        marker.requests), encoding: 'utf8', timeout: 15000});
      assert.equal(read.status, 0, read.stderr);
      assert.deepEqual(JSON.parse(read.stdout), marker.expectedRows);
      const rebuilt = spawnSync(process.execPath, [READER], {
        input: JSON.stringify({transactionId: marker.transactionId,
          transactions: marker.expectedRows[6].rows,
          participants: marker.expectedRows[9].rows}),
        encoding: 'utf8', timeout: 15000,
      });
      assert.equal(rebuilt.status, 0, rebuilt.stderr);
      const recovered = JSON.parse(rebuilt.stdout);
      assert.equal(recovered.durableDecisionOnDisk, 'COMMIT');
      assert.equal(recovered.adoptedDecisionWithoutAuthority, false,
        'untrusted snapshot never authorizes COMMIT fanout');
      assert.equal(recovered.recoveryDiscovered, true);
      assert.equal(recovered.participants, 2);
      assert.equal(recovered.fanoutCalls, 0);
      // A separate process rereads the actual SQLite files again, then
      // attempts the recorded bound COMMIT with no live participant transport.
      const transactionRequests = marker.requests.slice(6, 9);
      const participantRequests = marker.requests.slice(9, 12);
      assert.equal(new Set(transactionRequests.map((row) => row.partitionId)).size, 1);
      assert.equal(new Set(participantRequests.map((row) => row.partitionId)).size, 1);
      assert.notEqual(transactionRequests[0].partitionId,
        participantRequests[0].partitionId);
      const reread = spawnSync(process.execPath, [DISK_REREAD], {
        input: JSON.stringify({transactionId: marker.transactionId,
          transactionRequests, participantRequests}),
        encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024,
      });
      assert.equal(reread.error, undefined, reread.stderr);
      assert.equal(reread.status, 0, reread.stderr);
      const bridge = JSON.parse(reread.stdout);
      assert.equal(bridge.kind, 'TX1_M1_POSTKILL_DISK_REREAD');
      assert.equal(bridge.transactionId, marker.transactionId);
      assert.equal(bridge.physicalReplicaFiles, 6);
      assert.equal(bridge.forgedRollbackIgnored, true);
      assert.equal(bridge.unavailableHeld, true);
      assert.equal(bridge.malformedAuthorityHeld, true);
      assert.equal(bridge.boundCommitAttempts, 2);
      assert.equal(bridge.rollbackCalls, 0);
      assert.equal(bridge.decisionWrites, 0);
      assert.equal(bridge.durableRowsUnchanged, true);
      assert.equal(bridge.liveParticipantReplayCertified, false);
      // A killed single-host seed cannot manufacture serving authority from
      // its colocated RF3 records. Consult the production rejoin owner.
      const startup = spawnSync(process.execPath, [STARTUP_ADMISSION], {
        input: JSON.stringify({dataDir: marker.dataDir}),
        encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024,
      });
      assert.equal(startup.error, undefined, startup.stderr);
      assert.equal(startup.status, 0, startup.stderr);
      const admission = JSON.parse(startup.stdout);
      assert.equal(admission.kind, 'TX1_M1_POSTKILL_SEED_ADMISSION');
      assert.equal(admission.durableStateDetected, true);
      assert.equal(admission.servingAuthorized, false);
      t.diagnostic(JSON.stringify({kind: 'TX1_UNDELIVERED_DECISION',
        transactionId: marker.transactionId, replicaFiles: 12,
        durableDecisionReadBack: true, cacheDiscoveryCannotDecide: true,
        diskRereadBridge: {physicalReplicaFiles: bridge.physicalReplicaFiles,
          scans: bridge.scans, forgedRollbackIgnored: bridge.forgedRollbackIgnored,
          invalidHeld: bridge.malformedAuthorityHeld,
          boundCommitAttempts: bridge.boundCommitAttempts,
          rollbackCalls: bridge.rollbackCalls,
          durableRowsUnchanged: bridge.durableRowsUnchanged},
        seedStartupAdmission: {state: admission.state,
          outcome: admission.outcome, reason: admission.reason,
          durableStateDetected: admission.durableStateDetected,
          servingAuthorized: admission.servingAuthorized},
        effectsNotApplied: true,
        fanoutReplayCertified: false}));
    } finally {
      if (ended === null) {
        child.kill('SIGKILL');
        await completion;
      }
      if (marker?.dataDir) {
        fs.rmSync(marker.dataDir, {recursive: true, force: true});
      }
      fs.rmSync(tmp, {recursive: true, force: true});
    }
  });
