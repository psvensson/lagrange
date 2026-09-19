// Witness for the lease-liveness-watermark-observed quest, receipts 1 and 2.
// Raw node:test so the anchored receipt runner selects exactly one scenario.
//
// SCOPE. In the formation traced by the second causal packet of 2026-09-19
// the seed's admin control snapshot reported `stale_usable` for 167 s because
// `resolveControlSnapshotCacheStaleWatermark` found an active-or-ready node
// whose ready lease had lapsed. That decision named nothing: not the node,
// not how far past expiry its lease was, not how long the condition had held,
// and the control snapshot owner had no logger at all.
//
// Receipt 1 drives the REAL AdminWebSocketAPI through the REAL LoggingService
// into a real log file, so the production wiring itself is the witness: delete
// `logger: this.logger` from admin-websocket-api-base.js and this test goes
// red. It then drives two concurrent requests on one real owner, because
// `capturedAt` is stamped before the diagnostics are awaited and an older
// evaluation can commit after a newer one.
//
// Receipt 2 is the steady state: repeated evaluations, out-of-order
// observations and a logger whose emission fails all leave the line count
// alone, and the next line that does get out states how many of each it
// stood in for.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {
  CONTROL_SNAPSHOT_LEASE_AGE_STATE,
  CONTROL_SNAPSHOT_STALE_WATERMARK_LOG_MSG,
  CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION,
} from '../../src/admin/admin-control-snapshot-stale-watermark-record.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const START_MS = 1_000_000;
const SECOND_MS = 1_000;
const SEED_NODE_ID = 'node-0';
const VICTIM_NODE_ID = 'node-1';
const THIRD_NODE_ID = 'node-2';
const CDC_UPDATE = 'UPDATE';
const NODE_STATUS_ACTIVE = 'active';
const CONNECTION_STATE_READY = 'ready';
const READY_LEASE_STATE_AVAILABLE = 'available';
const STEADY_EVALUATION_COUNT = 9;
const LIVE_LEASE_MS = SECOND_MS * 30;
const LOG_FLUSH_WAIT_MS = 250;
const LOG_LEVEL_INFO = 'info';
const LOG_LEVEL_ERROR = 'error';
const EMISSION_FAILURE = 'log sink unavailable';
const REENTRANT_EMISSION_COUNT = 1;
const OUT_OF_ORDER_OFFSETS_MS = Object.freeze([
  -4_000, -9_000, -1, -20_000, -2, -7_500, -100,
]);
const NODE_STATUS_ACTIVE_UPPER_CASE = 'ACTIVE';
const LIVE_LEASE_AGE_MS = -LIVE_LEASE_MS;

function writeNodeRow(
  cache, nodeId, nowMs, readyLeaseExpiresAtMs, sequence,
  status = NODE_STATUS_ACTIVE,
) {
  cache.applySystemTableChange(TABLES.NODES, CDC_UPDATE, {
    node_id: nodeId,
    status,
    connection_state: CONNECTION_STATE_READY,
    last_heartbeat: nowMs - SECOND_MS,
    ready_lease_expires_at: readyLeaseExpiresAtMs,
    updated_at_hlc: `${nowMs}-${sequence}-${nodeId}`,
  });
}

function buildRealApiHarness() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'lagrange-watermark-'),
  );
  const logFile = path.join(logDirectory, 'node.log');
  LoggingService.getInstance().initialize({
    level: LOG_LEVEL_INFO,
    nodeId: SEED_NODE_ID,
    logFile,
    prettyPrint: false,
  });
  const cache = new SystemTableCache();
  const removalFailures = [];
  let nowMs = START_MS;
  let sequence = 0;
  const api = new AdminWebSocketAPI({
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    nowFn: () => nowMs,
  });
  return {
    api,
    logDirectory,
    logFile,
    // The directory this harness created is this harness's to remove (R13).
    // A failure to remove it is noise and must never stand in for the
    // assertion that actually failed, so it is recorded rather than thrown.
    removeLogDirectory() {
      try {
        fs.rmSync(logDirectory, {recursive: true, force: true});
      } catch (error) {
        removalFailures.push(String(error?.message || error));
      }
    },
    removalFailures,
    now: () => nowMs,
    advance(deltaMs) {
      nowMs += deltaMs;
    },
    writeNodeRow(nodeId, readyLeaseExpiresAtMs) {
      sequence += 1;
      writeNodeRow(cache, nodeId, nowMs, readyLeaseExpiresAtMs, sequence);
    },
    evaluate() {
      return api.controlSnapshot.evaluateAuthoritativeControlSnapshotRepair();
    },
    async readTransitionLines() {
      await new Promise((resolve) => setTimeout(resolve, LOG_FLUSH_WAIT_MS));
      return fs.readFileSync(logFile, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
        .filter((entry) =>
          entry.msg === CONTROL_SNAPSHOT_STALE_WATERMARK_LOG_MSG.TRANSITION);
    },
  };
}

function buildOwnerHarness() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: LOG_LEVEL_ERROR});
  const cache = new SystemTableCache();
  const lines = [];
  let nowMs = START_MS;
  let sequence = 0;
  let emissionFails = false;
  let emissionRejectsAsync = false;
  let reentrantEvaluations = 0;
  const controlSnapshot = new AdminControlSnapshot({
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    ensureAuthoritativeDiscoveryCacheRepair: async () => ({applied: true}),
    nowFn: () => nowMs,
    logger: {
      info(message, fields) {
        if (emissionFails) {
          throw new Error(EMISSION_FAILURE);
        }
        if (emissionRejectsAsync) {
          return Promise.reject(new Error(EMISSION_FAILURE));
        }
        lines.push({message, fields});
        // A sink that re-enters the owner (a logs-table write that goes back
        // through the control plane) must find the record already committed,
        // or the same transition is emitted again - and again.
        if (reentrantEvaluations > 0) {
          reentrantEvaluations -= 1;
          controlSnapshot.evaluateAuthoritativeControlSnapshotRepair();
        }
      },
    },
  });
  return {
    lines,
    controlSnapshot,
    now: () => nowMs,
    advance(deltaMs) {
      nowMs += deltaMs;
    },
    failEmissions(shouldFail) {
      emissionFails = shouldFail;
    },
    rejectEmissionsAsync(shouldReject) {
      emissionRejectsAsync = shouldReject;
    },
    reenterOnNextEmission(count) {
      reentrantEvaluations = count;
    },
    writeNodeRow(nodeId, readyLeaseExpiresAtMs, status = NODE_STATUS_ACTIVE) {
      sequence += 1;
      writeNodeRow(
        cache, nodeId, nowMs, readyLeaseExpiresAtMs, sequence, status,
      );
    },
    evaluateAt(capturedAt) {
      return controlSnapshot.evaluateAuthoritativeControlSnapshotRepair(
        {capturedAt, controlPlaneDiagnostics: {}},
        {},
      );
    },
    evaluate() {
      return controlSnapshot.evaluateAuthoritativeControlSnapshotRepair();
    },
    transitionLines() {
      return lines.filter((line) =>
        line.message === CONTROL_SNAPSHOT_STALE_WATERMARK_LOG_MSG.TRANSITION);
    },
    takeOnlyLine() {
      const transitions = this.transitionLines();
      assert.equal(transitions.length, 1,
        `exactly one transition line, got ${JSON.stringify(transitions)}`);
      lines.length = 0;
      return transitions[0].fields;
    },
  };
}

async function driveInterleavedRequests() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: LOG_LEVEL_ERROR});
  const cache = new SystemTableCache();
  const lines = [];
  let nowMs = START_MS;
  let releaseSlowRead = null;
  let readinessCalls = 0;
  writeNodeRow(cache, VICTIM_NODE_ID, nowMs, nowMs + SECOND_MS * 2, 1);
  const controlSnapshot = new AdminControlSnapshot({
    nodeId: SEED_NODE_ID,
    systemTableCache: cache,
    cacheMutationTarget: cache,
    ensureAuthoritativeDiscoveryCacheRepair: async () => ({applied: true}),
    nowFn: () => nowMs,
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        readinessCalls += 1;
        if (readinessCalls === 1) {
          await new Promise((resolve) => {
            releaseSlowRead = resolve;
          });
        }
        return [];
      },
    },
    logger: {
      info(message, fields) {
        lines.push({message, fields});
      },
    },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const options = {allowAuthoritativeRepair: false};
  // Request A is captured while the lease is still live and finishes LAST.
  const slowRequest = controlSnapshot.resolveLocalControlSnapshot(options);
  await settle();
  nowMs = START_MS + SECOND_MS * 5;
  await controlSnapshot.resolveLocalControlSnapshot(options);
  await settle();
  releaseSlowRead();
  await slowRequest;
  nowMs = START_MS + SECOND_MS * 9;
  await controlSnapshot.resolveLocalControlSnapshot(options);
  nowMs = START_MS + SECOND_MS * 60;
  writeNodeRow(cache, VICTIM_NODE_ID, nowMs, nowMs + LIVE_LEASE_MS, 2);
  await controlSnapshot.resolveLocalControlSnapshot(options);
  return lines.filter((line) =>
    line.message === CONTROL_SNAPSHOT_STALE_WATERMARK_LOG_MSG.TRANSITION);
}

test('the stale watermark logs set, node changed and cleared exactly once each',
  async () => {
    const harness = buildRealApiHarness();
    try {
      harness.writeNodeRow(VICTIM_NODE_ID, harness.now() - SECOND_MS * 166);
      const setEvaluation = harness.evaluate();
      assert.equal(setEvaluation.shouldRepair, true,
        'the traced input still triggers the repair it triggered on main');

      harness.advance(SECOND_MS * 7);
      harness.writeNodeRow(VICTIM_NODE_ID, harness.now() + LIVE_LEASE_MS);
      harness.writeNodeRow(THIRD_NODE_ID, harness.now() - SECOND_MS * 9);
      harness.evaluate();

      harness.advance(SECOND_MS * 11);
      harness.writeNodeRow(THIRD_NODE_ID, harness.now() + LIVE_LEASE_MS);
      const clearedEvaluation = harness.evaluate();
      assert.equal(clearedEvaluation.shouldRepair, false,
        'a renewed lease clears the trigger exactly as on main');

      const emitted = await harness.readTransitionLines();
      assert.equal(emitted.length, 3,
        `three lines reached the real node log, got ${emitted.length}`);
      const [setLine, changedLine, clearedLine] = emitted;

      assert.equal(setLine.nodeId, SEED_NODE_ID,
        'the logging service owns the top-level nodeId: it is the emitter');
      assert.equal(setLine.staleNodeId, VICTIM_NODE_ID,
        'the lapsed node is named by a role key that survives the sink');
      assert.equal(setLine.transition,
        CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.SET);
      assert.equal(setLine.previousStaleNodeId, null);
      assert.equal(setLine.status, NODE_STATUS_ACTIVE);
      assert.equal(setLine.connectionState, CONNECTION_STATE_READY);
      assert.equal(setLine.readyLeaseState, READY_LEASE_STATE_AVAILABLE);
      assert.equal(setLine.leaseAgeState,
        CONTROL_SNAPSHOT_LEASE_AGE_STATE.EXPIRED);
      assert.equal(setLine.leaseExpiredForMs, SECOND_MS * 166);
      assert.equal(setLine.setForMs, null);

      assert.equal(changedLine.transition,
        CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.NODE_CHANGED);
      assert.equal(changedLine.staleNodeId, THIRD_NODE_ID);
      assert.equal(changedLine.previousStaleNodeId, VICTIM_NODE_ID);
      assert.equal(changedLine.leaseExpiredForMs, SECOND_MS * 9);
      assert.equal(changedLine.setForMs, SECOND_MS * 7);

      assert.equal(clearedLine.transition,
        CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.CLEARED);
      assert.equal(clearedLine.staleNodeId, null);
      assert.equal(clearedLine.previousStaleNodeId, THIRD_NODE_ID);
      assert.equal(clearedLine.leaseAgeState,
        CONTROL_SNAPSHOT_LEASE_AGE_STATE.UNAVAILABLE);
      assert.equal(clearedLine.leaseExpiredForMs, null);
      assert.equal(clearedLine.setForMs, SECOND_MS * 18);
    } finally {
      try {
        await harness.api.shutdown();
      } finally {
        harness.removeLogDirectory();
      }
    }
    assert.deepEqual(harness.removalFailures, [],
      'the temp log directory this test created is gone');
    assert.equal(fs.existsSync(harness.logDirectory), false,
      'and nothing is left behind in the system temp directory');

    // One lapse and one renewal, observed by requests that finish out of
    // order: still exactly one set and one cleared, and no negative duration.
    const interleaved = await driveInterleavedRequests();
    assert.deepEqual(
      interleaved.map((line) => line.fields.transition),
      [
        CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.SET,
        CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.CLEARED,
      ],
      `one lapse and one renewal are one set and one cleared, got ${
        JSON.stringify(interleaved.map((line) => line.fields))}`);
    assert.equal(interleaved[1].fields.setForMs, SECOND_MS * 55,
      'the cleared line measures from the FIRST set of the run');
    assert.ok(interleaved[1].fields.outOfOrderObservations > 0,
      'the evaluation that finished late is stated, not acted on');
    for (const line of interleaved) {
      assert.ok(line.fields.setForMs === null || line.fields.setForMs >= 0,
        `no duration is negative: ${JSON.stringify(line.fields)}`);
    }
  });

test('an unchanged watermark state logs nothing across repeated evaluations',
  async () => {
    const quiet = buildOwnerHarness();
    quiet.writeNodeRow(VICTIM_NODE_ID, quiet.now() + LIVE_LEASE_MS);
    for (let index = 0; index <= STEADY_EVALUATION_COUNT; index += 1) {
      quiet.advance(SECOND_MS);
      quiet.evaluate();
    }
    assert.deepEqual(quiet.transitionLines(), [],
      'a watermark that was never set says nothing at all');

    const harness = buildOwnerHarness();
    harness.writeNodeRow(VICTIM_NODE_ID, harness.now() - SECOND_MS);
    harness.evaluate();
    const setFields = harness.takeOnlyLine();
    assert.equal(setFields.transition,
      CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.SET);
    assert.equal(setFields.suppressedEvaluations, 0,
      'the first line of a run reports no suppressed evaluations');
    assert.equal(setFields.outOfOrderObservations, 0);
    assert.equal(setFields.failedEmissions, 0);

    for (let index = 0; index < STEADY_EVALUATION_COUNT; index += 1) {
      harness.advance(SECOND_MS);
      harness.evaluate();
    }
    for (const offset of OUT_OF_ORDER_OFFSETS_MS) {
      harness.evaluateAt(harness.now() + offset);
    }
    assert.deepEqual(harness.transitionLines(), [],
      'neither repetition nor an older observation emits anything');

    harness.advance(SECOND_MS);
    harness.writeNodeRow(VICTIM_NODE_ID, harness.now() + LIVE_LEASE_MS);
    harness.evaluate();
    const clearedFields = harness.takeOnlyLine();
    assert.equal(clearedFields.transition,
      CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.CLEARED);
    assert.equal(clearedFields.suppressedEvaluations,
      STEADY_EVALUATION_COUNT,
      'the next line states how many identical evaluations it suppressed');
    assert.equal(clearedFields.outOfOrderObservations,
      OUT_OF_ORDER_OFFSETS_MS.length,
      'and how many observations arrived older than the committed one');
    assert.ok(clearedFields.setForMs >= 0,
      'an out-of-order observation can never produce a negative duration');

    // A SECOND cycle: the counters reset with the line that reported them.
    for (let index = 0; index < STEADY_EVALUATION_COUNT; index += 1) {
      harness.advance(SECOND_MS);
      harness.evaluate();
    }
    harness.advance(SECOND_MS);
    harness.writeNodeRow(VICTIM_NODE_ID, harness.now() - SECOND_MS);
    harness.evaluate();
    const secondSetFields = harness.takeOnlyLine();
    assert.equal(secondSetFields.suppressedEvaluations,
      STEADY_EVALUATION_COUNT,
      'the suppressed count is per run, not cumulative over the process');
    assert.equal(secondSetFields.outOfOrderObservations, 0,
      'the out-of-order count resets with the line that reported it');

    // An evaluation at exactly the last committed observation time is not an
    // older one: it still reports its transition.
    const tied = buildOwnerHarness();
    tied.writeNodeRow(VICTIM_NODE_ID, tied.now() - SECOND_MS);
    tied.evaluate();
    tied.takeOnlyLine();
    tied.writeNodeRow(VICTIM_NODE_ID, tied.now() + LIVE_LEASE_MS);
    tied.writeNodeRow(THIRD_NODE_ID, tied.now() - SECOND_MS);
    tied.evaluateAt(tied.now());
    const tiedFields = tied.takeOnlyLine();
    assert.equal(tiedFields.transition,
      CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.NODE_CHANGED,
      'a tied observation time is not an out-of-order observation');
    assert.equal(tiedFields.staleNodeId, THIRD_NODE_ID);
    assert.equal(tiedFields.outOfOrderObservations, 0);

    // The watermark predicate also admits a row whose lease has NOT lapsed:
    // it lowercases the status while the readiness owner compares the raw
    // value, so `status: 'ACTIVE'` with a live lease sets the watermark. The
    // line says so by name; it never prints a negative "expired for".
    const notExpired = buildOwnerHarness();
    notExpired.writeNodeRow(
      VICTIM_NODE_ID,
      notExpired.now() + LIVE_LEASE_MS,
      NODE_STATUS_ACTIVE_UPPER_CASE,
    );
    const notExpiredEvaluation = notExpired.evaluate();
    assert.equal(notExpiredEvaluation.shouldRepair, true,
      'the predicate admits this row on main and still does');
    const notExpiredFields = notExpired.takeOnlyLine();
    assert.equal(notExpiredFields.leaseAgeState,
      CONTROL_SNAPSHOT_LEASE_AGE_STATE.NOT_EXPIRED,
      'a lease that has not lapsed is a named state');
    assert.equal(notExpiredFields.leaseExpiredForMs, null,
      'and never a negative expiry age');
    assert.equal(notExpiredFields.readyLeaseAgeMs, LIVE_LEASE_AGE_MS,
      'the signed age is still stated, so nothing is hidden');

    // A sink that re-enters the owner sees a record that has already moved
    // on, so the transition it is reporting is not reported a second time.
    harness.reenterOnNextEmission(REENTRANT_EMISSION_COUNT);
    harness.advance(SECOND_MS);
    harness.writeNodeRow(VICTIM_NODE_ID, harness.now() + LIVE_LEASE_MS);
    harness.evaluate();
    assert.equal(harness.transitionLines().length, 1,
      're-entering from the sink cannot replay the transition being emitted');
    harness.takeOnlyLine();

    // An emission that fails is counted, never swallowed, and stated on the
    // next line that does get out.
    harness.failEmissions(true);
    harness.advance(SECOND_MS);
    harness.writeNodeRow(VICTIM_NODE_ID, harness.now() - SECOND_MS);
    harness.evaluate();
    harness.advance(SECOND_MS);
    harness.writeNodeRow(VICTIM_NODE_ID, harness.now() + LIVE_LEASE_MS);
    harness.evaluate();
    assert.deepEqual(harness.transitionLines(), [],
      'a failing sink emits nothing and raises nothing');
    harness.failEmissions(false);
    harness.advance(SECOND_MS);
    harness.writeNodeRow(VICTIM_NODE_ID, harness.now() - SECOND_MS);
    harness.evaluate();
    const afterFailures = harness.takeOnlyLine();
    assert.equal(afterFailures.failedEmissions, 2,
      'the next line that gets out states how many did not');
    assert.equal(afterFailures.transition,
      CONTROL_SNAPSHOT_STALE_WATERMARK_TRANSITION.SET,
      'and the record moved on: the lost transitions are not replayed');

    // A sink that returns a REJECTING promise is a failed emission too. The
    // rejection is counted rather than left for the process to report, and
    // counting it at all is only possible because a handler was attached.
    harness.rejectEmissionsAsync(true);
    harness.advance(SECOND_MS);
    harness.writeNodeRow(VICTIM_NODE_ID, harness.now() + LIVE_LEASE_MS);
    harness.evaluate();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(harness.transitionLines(), [],
      'an asynchronously failing sink emits nothing and raises nothing');
    harness.rejectEmissionsAsync(false);
    harness.advance(SECOND_MS);
    harness.writeNodeRow(VICTIM_NODE_ID, harness.now() - SECOND_MS);
    harness.evaluate();
    assert.equal(harness.takeOnlyLine().failedEmissions, 1,
      'the asynchronous rejection was counted like any other failure');
  });
