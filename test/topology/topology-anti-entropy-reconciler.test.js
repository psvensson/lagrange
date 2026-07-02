import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  SERVICE_TYPE,
} from '../../src/constants/index.js';
import {RECONCILE_REASON} from
  '../../src/workflow/reconcile-queue-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/publication-owner-constants.js';
import {
  RESERVATION_STATUS,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  TOPOLOGY_ANTI_ENTROPY_FIELD,
  TOPOLOGY_ANTI_ENTROPY_SCAN_REASON,
  TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS,
  TOPOLOGY_ANTI_ENTROPY_SURFACE,
} from '../../src/topology/topology-anti-entropy-constants.js';
import {TopologyAntiEntropyReconciler} from
  '../../src/topology/topology-anti-entropy-reconciler.js';

const TEST_NOW = 1000;
const TEST_SCAN_INTERVAL_MS = 500;
const TEST_ADVANCED_NOW = 2000;
const TEST_NODE_A = 'node-a';
const TEST_NODE_B = 'node-b';
const TEST_SERVICE_PARTITION = 'svc-partition-1';
const TEST_SERVICE_MESSAGE_GROUP = 'svc-message-group-1';
const TEST_OPERATION_ID = 'operation-1';
const TEST_RESERVATION_ID = 'reservation-1';
const TEST_RELEASED_RESERVATION_ID = 'reservation-released-1';
const TEST_PUBLICATION_ID = 'publication-1';
const TEST_SUPERSEDED_PUBLICATION_ID = 'publication-superseded-1';
const TEST_PUBLICATION_ID_FIELD = 'publicationId';
const TEST_PUBLICATION_ID_PERSISTED_FIELD = 'publication_id';
const TEST_RESERVATION_ID_FIELD = 'reservationId';
const TEST_OWNER_KEYS = Object.freeze([
  'node:node-a',
  'readiness-lease:node-a',
  'partition-service:svc-partition-1',
  'replica-operation:operation-1',
  'placement-target:reservation-1',
  'active-publication:publication-1',
]);
const TEST_READER_FAILURE = 'durable reader unavailable';
const TEST_TIMER_HANDLE = Object.freeze({handle: 'timer-1'});

function setupLogging() {
  LoggingService.resetInstance();
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function teardownLogging() {
  LoggingService.resetInstance();
}

function createDurableSnapshot() {
  return {
    [TOPOLOGY_ANTI_ENTROPY_SURFACE.NODES]: [
      {[COLUMN.NODE_ID]: TEST_NODE_A},
    ],
    [TOPOLOGY_ANTI_ENTROPY_SURFACE.READINESS_LEASES]: [
      {
        [COLUMN.NODE_ID]: TEST_NODE_A,
        [COLUMN.READY_LEASE_EXPIRES_AT]: TEST_ADVANCED_NOW,
      },
    ],
    [TOPOLOGY_ANTI_ENTROPY_SURFACE.PARTITION_SERVICES]: [
      {
        [COLUMN.SERVICE_ID]: TEST_SERVICE_PARTITION,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      },
      {
        [COLUMN.SERVICE_ID]: TEST_SERVICE_MESSAGE_GROUP,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      },
    ],
    [TOPOLOGY_ANTI_ENTROPY_SURFACE.REPLICA_OPERATIONS]: [
      {[COLUMN.OPERATION_ID]: TEST_OPERATION_ID},
    ],
    [TOPOLOGY_ANTI_ENTROPY_SURFACE.PLACEMENT_TARGETS]: [
      {
        [TEST_RESERVATION_ID_FIELD]: TEST_RESERVATION_ID,
        [COLUMN.TARGET_NODE_ID]: TEST_NODE_B,
        [COLUMN.STATUS]: RESERVATION_STATUS.ACTIVE,
      },
      {
        [COLUMN.RESERVATION_ID]: TEST_RELEASED_RESERVATION_ID,
        [COLUMN.TARGET_NODE_ID]: TEST_NODE_A,
        [COLUMN.STATUS]: RESERVATION_STATUS.RELEASED,
      },
    ],
    [TOPOLOGY_ANTI_ENTROPY_SURFACE.ACTIVE_PUBLICATIONS]: [
      {
        [TEST_PUBLICATION_ID_FIELD]: TEST_PUBLICATION_ID,
        [COLUMN.STATUS]: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      },
      {
        [TEST_PUBLICATION_ID_PERSISTED_FIELD]: TEST_SUPERSEDED_PUBLICATION_ID,
        [COLUMN.STATUS]: CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED,
      },
    ],
  };
}

function createRecordingSink() {
  const calls = [];
  return {
    calls,
    enqueue(ownerKey, reason, context) {
      calls.push({ownerKey, reason, context});
      return true;
    },
  };
}

test('TopologyAntiEntropyReconciler - durable truth scan enqueues exact ' +
  'owner keys for all topology surfaces', async (t) => {
  setupLogging();
  const sink = createRecordingSink();
  const reconciler = new TopologyAntiEntropyReconciler({
    durableTruthReader: {
      readTopologyAntiEntropySnapshot: async () => createDurableSnapshot(),
    },
    enqueueSink: sink,
    nowFn: () => TEST_NOW,
    scanIntervalMs: TEST_SCAN_INTERVAL_MS,
  });

  const outcome = await reconciler.triggerScan({
    [TOPOLOGY_ANTI_ENTROPY_FIELD.FORCE]: true,
  });

  assert.equal(
    outcome[TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS],
    TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS.COMPLETED,
  );
  assert.equal(
    outcome[TOPOLOGY_ANTI_ENTROPY_FIELD.ENQUEUE_COUNT],
    TEST_OWNER_KEYS.length,
  );
  assert.deepEqual(
    sink.calls.map((call) => call.ownerKey),
    TEST_OWNER_KEYS,
  );
  assert.deepEqual(
    sink.calls.map((call) => call.reason),
    TEST_OWNER_KEYS.map(() =>
      RECONCILE_REASON.TOPOLOGY_DURABLE_TRUTH_SCAN),
  );
  assert.equal(
    sink.calls[0].context[TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACE],
    TOPOLOGY_ANTI_ENTROPY_SURFACE.NODES,
  );
  assert.equal(
    sink.calls[0].context[TOPOLOGY_ANTI_ENTROPY_FIELD.EVIDENCE_KEY],
    TEST_NODE_A,
  );
  assert.equal(
    outcome[TOPOLOGY_ANTI_ENTROPY_FIELD.SURFACES][2][
      TOPOLOGY_ANTI_ENTROPY_FIELD.ELIGIBLE_ROW_COUNT
    ],
    1,
    'partition service surface excludes non-partition services',
  );
  teardownLogging();
  t.end();
});

test('TopologyAntiEntropyReconciler - scan is enqueue-only and does not ' +
  'call local repair mutation delegates', async (t) => {
  setupLogging();
  const sink = createRecordingSink();
  const mutationCalls = [];
  const mutationSink = {
    repair(row) {
      mutationCalls.push(row);
    },
    upsert(row) {
      mutationCalls.push(row);
    },
  };
  const reconciler = new TopologyAntiEntropyReconciler({
    durableTruthReader: {
      readDurableTopologyTruth: async () => createDurableSnapshot(),
    },
    enqueueSink: sink,
    mutationSink,
    nowFn: () => TEST_NOW,
    scanIntervalMs: TEST_SCAN_INTERVAL_MS,
  });

  await reconciler.triggerScan({
    [TOPOLOGY_ANTI_ENTROPY_FIELD.FORCE]: true,
  });

  assert.equal(sink.calls.length, TEST_OWNER_KEYS.length);
  assert.equal(mutationCalls.length, 0);
  teardownLogging();
  t.end();
});

test('TopologyAntiEntropyReconciler - single in-flight scan and cooldown ' +
  'prevent duplicate low-rate scans', async (t) => {
  setupLogging();
  const sink = createRecordingSink();
  let now = TEST_NOW;
  let releaseReader;
  const readerGate = new Promise((resolve) => {
    releaseReader = resolve;
  });
  const reconciler = new TopologyAntiEntropyReconciler({
    durableTruthReader: {
      readSnapshot: async () => {
        await readerGate;
        return createDurableSnapshot();
      },
    },
    enqueueSink: sink,
    nowFn: () => now,
    scanIntervalMs: TEST_SCAN_INTERVAL_MS,
  });

  const firstScan = reconciler.triggerScan({
    [TOPOLOGY_ANTI_ENTROPY_FIELD.FORCE]: true,
  });
  const inFlightOutcome = await reconciler.triggerScan({
    [TOPOLOGY_ANTI_ENTROPY_FIELD.FORCE]: true,
  });

  assert.equal(
    inFlightOutcome[TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS],
    TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS.SKIPPED,
  );
  assert.equal(
    inFlightOutcome[TOPOLOGY_ANTI_ENTROPY_FIELD.REASON],
    TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.SCAN_IN_FLIGHT,
  );

  releaseReader();
  await firstScan;

  const cooldownOutcome = await reconciler.triggerScan();
  assert.equal(
    cooldownOutcome[TOPOLOGY_ANTI_ENTROPY_FIELD.REASON],
    TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.COOLDOWN_ACTIVE,
  );

  now = TEST_ADVANCED_NOW;
  const laterOutcome = await reconciler.triggerScan();
  assert.equal(
    laterOutcome[TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS],
    TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS.COMPLETED,
  );
  teardownLogging();
  t.end();
});

test('TopologyAntiEntropyReconciler - unavailable reader is classified ' +
  'without enqueueing repairs', async (t) => {
  setupLogging();
  const sink = createRecordingSink();
  const reconciler = new TopologyAntiEntropyReconciler({
    durableTruthReader: {
      readTopologyAntiEntropySnapshot: async () => {
        throw new Error(TEST_READER_FAILURE);
      },
    },
    enqueueSink: sink,
    nowFn: () => TEST_NOW,
    scanIntervalMs: TEST_SCAN_INTERVAL_MS,
  });

  const outcome = await reconciler.triggerScan({
    [TOPOLOGY_ANTI_ENTROPY_FIELD.FORCE]: true,
  });

  assert.equal(
    outcome[TOPOLOGY_ANTI_ENTROPY_FIELD.STATUS],
    TOPOLOGY_ANTI_ENTROPY_SCAN_STATUS.UNAVAILABLE,
  );
  assert.equal(
    outcome[TOPOLOGY_ANTI_ENTROPY_FIELD.REASON],
    TOPOLOGY_ANTI_ENTROPY_SCAN_REASON.READER_UNAVAILABLE,
  );
  assert.equal(
    outcome[TOPOLOGY_ANTI_ENTROPY_FIELD.ERROR_MESSAGE],
    TEST_READER_FAILURE,
  );
  assert.equal(sink.calls.length, 0);
  teardownLogging();
  t.end();
});

test('TopologyAntiEntropyReconciler - start and stop manage low-rate ' +
  'periodic timer state', async (t) => {
  setupLogging();
  const scheduled = [];
  const cleared = [];
  const sink = createRecordingSink();
  const reconciler = new TopologyAntiEntropyReconciler({
    durableTruthReader: {
      readTopologyAntiEntropySnapshot: async () => createDurableSnapshot(),
    },
    enqueueSink: sink,
    nowFn: () => TEST_NOW,
    scanIntervalMs: TEST_SCAN_INTERVAL_MS,
    setTimer(callback, delayMs) {
      scheduled.push({callback, delayMs});
      return TEST_TIMER_HANDLE;
    },
    clearTimer(timerHandle) {
      cleared.push(timerHandle);
    },
  });

  const started = reconciler.start();
  assert.equal(started[TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED], true);
  assert.equal(started[TOPOLOGY_ANTI_ENTROPY_FIELD.PENDING_TIMER], true);
  assert.equal(scheduled[0].delayMs, TEST_SCAN_INTERVAL_MS);

  const stopped = reconciler.stop();
  assert.equal(stopped[TOPOLOGY_ANTI_ENTROPY_FIELD.STARTED], false);
  assert.equal(stopped[TOPOLOGY_ANTI_ENTROPY_FIELD.PENDING_TIMER], false);
  assert.deepEqual(cleared, [TEST_TIMER_HANDLE]);
  teardownLogging();
  t.end();
});
