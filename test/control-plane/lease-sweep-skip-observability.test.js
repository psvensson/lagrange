// Witness for the lease-liveness-watermark-observed quest, receipt 3.
// Raw node:test so the anchored receipt runner selects exactly one scenario.
//
// SCOPE. In the formation traced by the second causal packet of 2026-09-19
// the seed logged "Skipped lease disconnect for transport-connected node" for
// the same node every 5 s, 33 times, and the line said only which node. It
// never said how far past expiry the lease already was, nor that this had
// been going on without bound (166 s at the end of the run).
//
// A RUN IS A RUN OF SKIPS. It is broken by anything else the sweep observed -
// a renewal (including a renewal to a time already past), a disconnect, a row
// that disappeared, or simply a sweep that did not skip the node - and that
// holds however the sweep ENDS, because the real owner re-throws a guarded
// disconnect write. The invariant every line is checked against here needs no
// oracle: 0 <= skippedForMs <= leaseExpiredForMs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {
  LEASE_LOG_MSG,
} from '../../src/control-plane/lease-service-constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {STATE} from '../../src/constants/index.js';

const NOW_MS = 100_000;
const SECOND_MS = 1_000;
const SWEEP_STEP_MS = 5_000;
const SEED_NODE_ID = 'node-0';
const VICTIM_NODE_ID = 'node-1';
const OTHER_NODE_ID = 'node-2';
const NODE_STATUS_ACTIVE = 'active';
const LOG_LEVEL_ERROR = 'error';
const LOG_LEVEL_INFO = 'info';
const LOG_FLUSH_WAIT_MS = 250;
const LIVE_LEASE_MS = 30_000;
const DISCONNECT_WRITE_FAILED = 'guarded disconnect write timed out';
const REJECTING_SWEEP_COUNT = 12;

function ensureSingletonsInitialized() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: LOG_LEVEL_ERROR});
  }
}

function buildHarness() {
  ensureSingletonsInitialized();
  const state = {
    rows: new Map([[VICTIM_NODE_ID, NOW_MS - SECOND_MS]]),
    connectionStates: {[VICTIM_NODE_ID]: STATE.CONNECTED},
    disconnectThrows: false,
    hasLeader: true,
  };
  const lines = [];
  const disconnected = [];
  let nowMs = NOW_MS;
  const service = new LeaseService({
    nodeId: SEED_NODE_ID,
    now: () => nowMs,
    nodeLeaseOwner: {
      async disconnectNodeDueToLeaseExpiry(node) {
        if (state.disconnectThrows) {
          throw new Error(DISCONNECT_WRITE_FAILED);
        }
        disconnected.push(node.node_id);
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    },
    systemTableCache: {getAll: () => []},
    controlPlaneSystemTableGateway: {
      async readRows() {
        return {
          success: true,
          rows: [...state.rows].map(([nodeId, expiresAt]) => ({
            node_id: nodeId,
            status: NODE_STATUS_ACTIVE,
            ready_lease_expires_at: expiresAt,
            last_heartbeat: NOW_MS - SECOND_MS * 2,
          })),
        };
      },
      async updateSystemTableRow() {
        return {success: true};
      },
    },
    messageGroupServices: new Set([
      {isLeaderReplica: () => state.hasLeader},
    ]),
    messageRouter: {
      getConnectionState: (nodeId) =>
        state.connectionStates[nodeId] ?? null,
    },
  });
  service.initialize();
  const record = () => (message, fields) => {
    lines.push({message, fields});
  };
  service.logger = {
    trace: record(), debug: record(), info: record(),
    warn: record(), error: record(),
  };
  return {
    state,
    disconnected,
    service,
    now: () => nowMs,
    async sweep(deltaMs = 0) {
      nowMs += deltaMs;
      lines.length = 0;
      let rejected = null;
      try {
        await service.sweepExpiredLeases();
      } catch (error) {
        rejected = String(error?.message || error);
      }
      const skipLines = lines.filter((line) =>
        line.message === LEASE_LOG_MSG.SWEEP_SKIPPED_TRANSPORT_CONNECTED);
      for (const line of skipLines) {
        assertSkipLineInvariant(line.fields);
      }
      return {rejected, skipLines};
    },
  };
}

// The invariant a reader can check on every emitted line, with no oracle and
// no knowledge of the sweep history.
function assertSkipLineInvariant(fields) {
  assert.ok(fields.skippedForMs >= 0,
    `skippedForMs is never negative: ${JSON.stringify(fields)}`);
  assert.ok(Number.isFinite(fields.leaseExpiredForMs),
    `a skipped node always has a lease age: ${JSON.stringify(fields)}`);
  assert.ok(fields.skippedForMs <= fields.leaseExpiredForMs,
    'a node cannot have been skipped longer than its lease has been past ' +
    `expiry: ${JSON.stringify(fields)}`);
}

// A LeaseService whose logger is the real one, writing to a real file.
function buildRealSinkHarness() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  const logDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'lagrange-lease-skip-'),
  );
  const logFile = path.join(logDirectory, 'node.log');
  LoggingService.getInstance().initialize({
    level: LOG_LEVEL_INFO,
    nodeId: SEED_NODE_ID,
    logFile,
    prettyPrint: false,
  });
  const removalFailures = [];
  const service = new LeaseService({
    nodeId: SEED_NODE_ID,
    now: () => NOW_MS,
    nodeLeaseOwner: {
      async disconnectNodeDueToLeaseExpiry() {
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    },
    systemTableCache: {getAll: () => []},
    controlPlaneSystemTableGateway: {
      async readRows() {
        return {
          success: true,
          rows: [{
            node_id: VICTIM_NODE_ID,
            status: NODE_STATUS_ACTIVE,
            ready_lease_expires_at: NOW_MS - SECOND_MS,
            last_heartbeat: NOW_MS - SECOND_MS * 2,
          }],
        };
      },
    },
    messageGroupServices: new Set([{isLeaderReplica: () => true}]),
    messageRouter: {getConnectionState: () => STATE.CONNECTED},
  });
  service.initialize();
  return {
    service,
    logDirectory,
    removalFailures,
    // The directory this harness created is this harness's to remove (R13).
    // A failed removal is recorded, never thrown over a real failure.
    removeLogDirectory() {
      try {
        fs.rmSync(logDirectory, {recursive: true, force: true});
      } catch (error) {
        removalFailures.push(String(error?.message || error));
      }
    },
    async readSkipLines() {
      await new Promise((resolve) => setTimeout(resolve, LOG_FLUSH_WAIT_MS));
      return fs.readFileSync(logFile, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
        .filter((entry) =>
          entry.msg === LEASE_LOG_MSG.SWEEP_SKIPPED_TRANSPORT_CONNECTED);
    },
  };
}

function onlySkipFields(outcome) {
  assert.equal(outcome.skipLines.length, 1,
    `exactly one skip line, got ${JSON.stringify(outcome.skipLines)}`);
  return outcome.skipLines[0].fields;
}

test('the skipped lease disconnect line states the lease age and the skip duration',
  async () => {
    const harness = buildHarness();

    assert.deepEqual(onlySkipFields(await harness.sweep()), {
      nodeId: VICTIM_NODE_ID,
      skippedNodeId: VICTIM_NODE_ID,
      leaseExpiredForMs: SECOND_MS,
      skippedForMs: 0,
    }, 'the pre-existing nodeId is untouched; the run starts at zero');

    assert.deepEqual(onlySkipFields(await harness.sweep(SWEEP_STEP_MS)), {
      nodeId: VICTIM_NODE_ID,
      skippedNodeId: VICTIM_NODE_ID,
      leaseExpiredForMs: SECOND_MS + SWEEP_STEP_MS,
      skippedForMs: SWEEP_STEP_MS,
    }, 'the second consecutive skip accumulates');

    assert.deepEqual(onlySkipFields(await harness.sweep(SWEEP_STEP_MS)), {
      nodeId: VICTIM_NODE_ID,
      skippedNodeId: VICTIM_NODE_ID,
      leaseExpiredForMs: SECOND_MS + SWEEP_STEP_MS * 2,
      skippedForMs: SWEEP_STEP_MS * 2,
    }, 'the third consecutive skip keeps accumulating');

    // A clock that steps BACKWARDS while the run is open cannot measure it.
    // That one observation reports nothing rather than a negative duration,
    // and it does not restart the run either.
    const steppedBack = onlySkipFields(
      await harness.sweep(-(SWEEP_STEP_MS * 2 + SECOND_MS / 2)),
    );
    assert.equal(steppedBack.skippedForMs, 0,
      'a backwards step reports nothing, never a negative duration');
    assert.equal(steppedBack.leaseExpiredForMs, SECOND_MS / 2,
      'and the lease age is still the one this observation measured');
    assert.equal(
      onlySkipFields(
        await harness.sweep(SWEEP_STEP_MS * 3 + SECOND_MS / 2),
      ).skippedForMs,
      SWEEP_STEP_MS * 3,
      'the run itself survives: it is still measured from its own start');

    // A renewal to a time that is ALREADY PAST: the node is still expired and
    // still skipped, but this is a new lease and so a new run.
    harness.state.rows.set(VICTIM_NODE_ID, harness.now() + SWEEP_STEP_MS - 1);
    assert.deepEqual(onlySkipFields(await harness.sweep(SWEEP_STEP_MS)), {
      nodeId: VICTIM_NODE_ID,
      skippedNodeId: VICTIM_NODE_ID,
      leaseExpiredForMs: 1,
      skippedForMs: 0,
    }, 'a renewal starts a new run even while the node keeps being skipped');

    // A sweep that REJECTS after the read still reconciles what it observed.
    // A second node joins the skipped set, then drops its transport; the
    // guarded disconnect write for it throws, which the real owner re-throws.
    harness.state.rows.set(OTHER_NODE_ID, harness.now() - SECOND_MS);
    harness.state.connectionStates[OTHER_NODE_ID] = STATE.CONNECTED;
    await harness.sweep(SWEEP_STEP_MS);
    assert.equal(harness.service.leaseSkipObservations.size, 2,
      'both connected expired nodes are being skipped');
    harness.state.connectionStates[OTHER_NODE_ID] = STATE.DISCONNECTED;
    harness.state.disconnectThrows = true;
    const rejecting = await harness.sweep(SWEEP_STEP_MS);
    assert.equal(rejecting.rejected, DISCONNECT_WRITE_FAILED,
      'the owner re-throws the guarded write failure, exactly as on main');
    assert.deepEqual(
      [...harness.service.leaseSkipObservations.keys()],
      [VICTIM_NODE_ID],
      'a rejecting sweep keeps the run it did skip and forgets the other');
    assert.equal(
      onlySkipFields(rejecting).skippedForMs,
      SWEEP_STEP_MS * 2,
      'the node it did skip keeps accumulating across the rejection');

    // It also cannot grow while every sweep rejects.
    for (let index = 0; index < REJECTING_SWEEP_COUNT; index += 1) {
      await harness.sweep(SWEEP_STEP_MS);
    }
    assert.ok(harness.service.leaseSkipObservations.size <= 1,
      'the map stays bounded by the nodes actually being skipped');

    harness.state.disconnectThrows = false;
    harness.state.connectionStates[OTHER_NODE_ID] = STATE.CONNECTED;
    harness.state.rows.set(OTHER_NODE_ID, harness.now() - SECOND_MS);
    const afterDisconnect = await harness.sweep(SWEEP_STEP_MS);
    const otherLine = afterDisconnect.skipLines.find((line) =>
      line.fields.skippedNodeId === OTHER_NODE_ID);
    assert.equal(otherLine.fields.skippedForMs, 0,
      'a disconnect resets the consecutive-skip accumulation');

    // A sweep this node does not lead sweeps nothing, so no run survives it.
    harness.state.hasLeader = false;
    const notLeader = await harness.sweep(SWEEP_STEP_MS);
    assert.deepEqual(notLeader.skipLines, [],
      'a non-leader sweep skips nothing');
    assert.equal(harness.service.leaseSkipObservations.size, 0,
      'and it leaves no run behind');

    harness.state.hasLeader = true;
    harness.state.rows.delete(OTHER_NODE_ID);
    assert.equal(
      onlySkipFields(await harness.sweep(SWEEP_STEP_MS)).skippedForMs,
      0,
      'the next skip after a non-leader sweep starts a new run');

    // A renewal to a live lease is not even expired, so nothing is skipped.
    harness.state.rows.set(VICTIM_NODE_ID, harness.now() + LIVE_LEASE_MS);
    assert.deepEqual((await harness.sweep(SWEEP_STEP_MS)).skipLines, [],
      'a live lease is not expired, so nothing is skipped');
    harness.state.rows.set(VICTIM_NODE_ID, harness.now() - SECOND_MS);
    assert.deepEqual(onlySkipFields(await harness.sweep(SWEEP_STEP_MS)), {
      nodeId: VICTIM_NODE_ID,
      skippedNodeId: VICTIM_NODE_ID,
      leaseExpiredForMs: SECOND_MS + SWEEP_STEP_MS,
      skippedForMs: 0,
    }, 'and the run that follows starts from zero');

    harness.service.stop();
    assert.equal(harness.service.leaseSkipObservations.size, 0,
      'stopping the service keeps nothing');

    // The same line through the REAL logging service. `buildConsolePayload`
    // rewrites a top-level `nodeId` to the EMITTING node, so the skipped node
    // is named by a role key that survives the sink - while the line's
    // pre-existing `nodeId` field is still passed exactly as main passes it.
    const realSink = buildRealSinkHarness();
    try {
      await realSink.service.sweepExpiredLeases();
      const emitted = await realSink.readSkipLines();
      assert.equal(emitted.length, 1,
        `one skip line reached the real node log, got ${emitted.length}`);
      const [line] = emitted;
      assert.equal(line.nodeId, SEED_NODE_ID,
        'the logging service owns the top-level nodeId: it is the emitter');
      assert.equal(line.contextNodeId, VICTIM_NODE_ID,
        'the pre-existing nodeId field still carries the skipped node');
      assert.equal(line.skippedNodeId, VICTIM_NODE_ID,
        'and the role key names it where a reader can rely on it');
      assert.equal(line.leaseExpiredForMs, SECOND_MS);
      assert.equal(line.skippedForMs, 0);
    } finally {
      try {
        realSink.service.stop();
      } finally {
        realSink.removeLogDirectory();
      }
    }
    assert.deepEqual(realSink.removalFailures, [],
      'the temp log directory this test created is gone');
    assert.equal(fs.existsSync(realSink.logDirectory), false,
      'and nothing is left behind in the system temp directory');
  });
