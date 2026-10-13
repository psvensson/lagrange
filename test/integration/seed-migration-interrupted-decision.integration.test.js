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
      assert.equal(recovered.decision, 'COMMIT');
      assert.equal(recovered.recoveryDiscovered, true);
      assert.equal(recovered.participants, 2);
      assert.equal(recovered.fanoutCalls, 0);
      t.diagnostic(JSON.stringify({kind: 'TX1_UNDELIVERED_DECISION',
        transactionId: marker.transactionId, replicaFiles: 12,
        sameDecisionRecovered: true, effectsNotApplied: true,
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
