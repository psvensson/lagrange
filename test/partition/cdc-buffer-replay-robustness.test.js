/**
 * Regression test: partial catchup triggers follow-up replay at initial delay.
 *
 * Proves that when a subscriber fails mid-catchup during handshake, the
 * follow-up replay is scheduled with the initial delay (not escalated
 * backoff), and remaining buffered events are delivered on replay.
 *
 * Feature: cdc-continuity-topology-transitions
 * Task 3.3
 * **Validates: Requirements 3.1, 3.2, 3.4**
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {NUM} from '../../src/constants/index.js';
import {
  PARTITION_SERVICE_CDC,
  PARTITION_SERVICE_DEFAULT,
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const TEST_TABLE_NAME = SYSTEM_TABLE_NAME.NODES;
const TEST_PARTITION_ID = 'test-partition-replay-robust';
const TEST_TABLE_ID = 'test-table-replay-robust';
const TEST_REPLICA_ID = 'test-partition-replay-robust-r1';
const TEST_NODE_ID = 'test-node-replay-robust';
const TOTAL_BUFFERED_EVENTS = NUM.SIX;
const FAIL_AT_INDEX = NUM.THREE;
const SUBSCRIBER_FAILURE_MSG = 'simulated subscriber failure at event 3';

function initializeTestConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: TEST_NODE_ID}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
}

/**
 * Create a minimal PartitionService for CDC replay robustness tests.
 * Uses the nodes system table so CDC events are eligible for buffering.
 */
function createTestPartition() {
  return new PartitionService({
    partitionId: TEST_PARTITION_ID,
    tableId: TEST_TABLE_ID,
    tableName: TEST_TABLE_NAME,
    replicaId: TEST_REPLICA_ID,
    replicaIds: [TEST_REPLICA_ID],
    nodeId: TEST_NODE_ID,
    dbPath: ':memory:',
  });
}

/**
 * Build a CDC event for the nodes table.
 * @param {string} nodeId - unique node identifier
 * @param {number} seqSuffix - suffix for timestamp uniqueness
 * @return {Object} CDC event
 */
function buildNodeCdcEvent(nodeId, seqSuffix) {
  return {
    tableName: TEST_TABLE_NAME,
    operation: CDC_OPERATION.INSERT,
    data: {node_id: nodeId, status: 'active'},
    timestamp: `${1000000000000 + seqSuffix}`,
    sourcePartition: TEST_PARTITION_ID,
    sourceReplica: TEST_REPLICA_ID,
  };
}

test('setup CDC buffer replay robustness tests', async (t) => {
  initializeTestConfig();
  t.pass('configuration initialized');
});

test('partial catchup schedules follow-up replay at initial delay',
  async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    const originalSetTimeout = globalThis.setTimeout;
    const scheduledTimers = [];
    globalThis.setTimeout = (fn, delay) => {
      scheduledTimers.push({fn, delay});
      return originalSetTimeout(fn, 0);
    };

    try {
      for (let i = 0; i < TOTAL_BUFFERED_EVENTS; i++) {
        const event = buildNodeCdcEvent(`node-robust-${i}`, i);
        partition.cdcEventBuffer.buffer(event);
      }

      t.equal(
        partition.cdcEventBuffer.size(), TOTAL_BUFFERED_EVENTS,
        'buffer should hold all events before subscriber registration',
      );

      let deliveryCount = 0;
      let failureTriggered = false;
      const deliveredEvents = [];
      const failingSubscriber = async (cdcEvent) => {
        if (deliveryCount === FAIL_AT_INDEX && !failureTriggered) {
          failureTriggered = true;
          throw new Error(SUBSCRIBER_FAILURE_MSG);
        }
        deliveredEvents.push(cdcEvent);
        deliveryCount++;
      };

      const handshake = await partition.subscribeToCDCWithHandshake(
        failingSubscriber,
      );

      t.equal(
        handshake.status,
        PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK,
        'handshake status should be ok despite partial catchup failure',
      );
      t.equal(
        handshake.catchup.mode,
        PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL,
        'catchup mode should be backfill when buffer has events',
      );
      t.equal(
        handshake.catchup.completed, false,
        'catchup should not be marked completed after partial failure',
      );
      t.equal(
        deliveredEvents.length, FAIL_AT_INDEX,
        'subscriber should receive events up to the failure point',
      );
      t.ok(
        partition.cdcEventBuffer.hasEvents(),
        'buffer should still have remaining events after partial catchup',
      );

      const remainingCount =
        TOTAL_BUFFERED_EVENTS - FAIL_AT_INDEX;
      t.equal(
        partition.cdcEventBuffer.size(), remainingCount,
        'buffer should contain the failed event and remaining tail',
      );

      t.equal(
        partition.cdcBufferReplayDelayMs,
        PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS,
        'replay delay should be reset to initial value after handshake',
      );
      t.equal(
        partition.getStats().cdcReplay.replayRetryDepth,
        1,
        'partition stats should expose replay retry depth after handshake failure',
      );

      const replayTimers = scheduledTimers.filter(
        (timer) => timer.delay ===
          PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS,
      );
      t.ok(
        replayTimers.length > 0,
        'scheduleBufferedCDCReplay should be called with initial delay',
      );

      await new Promise((resolve) => originalSetTimeout(resolve, NUM.TEN));

      const totalDelivered = deliveredEvents.length;
      t.equal(
        totalDelivered, TOTAL_BUFFERED_EVENTS,
        'all remaining events should be delivered via follow-up replay',
      );

      for (let i = 0; i < TOTAL_BUFFERED_EVENTS; i++) {
        t.equal(
          deliveredEvents[i].data.node_id, `node-robust-${i}`,
          `event ${i} should be delivered in original buffer order`,
        );
      }
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      await partition.shutdown();
    }
  });

test('buffered replay growth is exposed via partition stats', async (t) => {
  const partition = createTestPartition();
  await partition.initialize();

  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => ({timer: true});

  try {
    partition.bufferCDCEventForRetry(
      buildNodeCdcEvent('node-buffer-growth-1', 1),
      'test-buffer-growth',
    );
    partition.bufferCDCEventForRetry(
      buildNodeCdcEvent('node-buffer-growth-2', 2),
      'test-buffer-growth',
    );

    const stats = partition.getStats().cdcReplay;
    t.equal(
      stats.replayBufferGrowthCount,
      2,
      'partition stats should expose buffered replay growth count',
    );
    t.equal(
      stats.bufferedEvents,
      2,
      'partition stats should expose current buffered replay depth',
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    await partition.shutdown();
  }
});

test('buffered replay marks replay-only delivery on replayed events',
  async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    try {
      partition.cdcEventBuffer.buffer(
        buildNodeCdcEvent('node-replay-only', 1),
      );

      const deliveredEvents = [];
      const handshake = await partition.subscribeToCDCWithHandshake(
        async (cdcEvent) => {
          deliveredEvents.push(cdcEvent);
        },
        {subscriberId: 'replay-only-subscriber'},
      );

      t.equal(
        handshake.catchup.mode,
        PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL,
        'handshake should treat buffered events as catchup replay',
      );
      t.equal(
        deliveredEvents.length,
        1,
        'subscriber should receive the replayed buffered event',
      );
      t.equal(
        deliveredEvents[0]?.replayOnly,
        true,
        'replayed buffered events should be marked as replay-only churn',
      );
    } finally {
      await partition.shutdown();
    }
  });

test('replay delay is not escalated after subscriber handshake',
  async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    try {
      const escalatedDelay =
        PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS *
        2;
      partition.cdcBufferReplayDelayMs = escalatedDelay;

      t.equal(
        partition.cdcBufferReplayDelayMs, escalatedDelay,
        'delay should start at escalated value for this test',
      );

      for (let i = 0; i < NUM.THREE; i++) {
        const event = buildNodeCdcEvent(`node-escalate-${i}`, i);
        partition.cdcEventBuffer.buffer(event);
      }

      let failOnFirst = true;
      const deliveredEvents = [];
      const subscriber = async (cdcEvent) => {
        if (failOnFirst) {
          failOnFirst = false;
          throw new Error(SUBSCRIBER_FAILURE_MSG);
        }
        deliveredEvents.push(cdcEvent);
      };

      await partition.subscribeToCDCWithHandshake(subscriber);

      t.equal(
        partition.cdcBufferReplayDelayMs,
        PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS,
        'delay should be reset to initial value, not remain escalated',
      );

      t.not(
        partition.cdcBufferReplayDelayMs, escalatedDelay,
        'delay should not remain at the pre-handshake escalated value',
      );
    } finally {
      await partition.shutdown();
    }
  });

test('buffer replay honors subscriber retryAfter readiness hints',
  async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    const originalSetTimeout = globalThis.setTimeout;
    const scheduledTimers = [];
    globalThis.setTimeout = (fn, delay) => {
      scheduledTimers.push({fn, delay});
      return originalSetTimeout(fn, 0);
    };

    try {
      partition.cdcEventBuffer.buffer(buildNodeCdcEvent('node-ready-hint', 0));

      let ready = false;
      const deliveredEvents = [];
      const subscriber = {
        canAcceptCDCEvent() {
          return ready ?
            {ready: true} :
            {
              ready: false,
              retryAfterMs: 250,
              reason: 'leader-transition',
            };
        },
        async handleCDCEvent(cdcEvent) {
          deliveredEvents.push(cdcEvent);
        },
      };

      const handshake = await partition.subscribeToCDCWithHandshake(subscriber);

      t.equal(
        handshake.catchup.completed,
        false,
        'handshake catchup should remain incomplete while subscriber reports not-ready',
      );
      t.equal(
        partition.cdcBufferReplayDelayMs,
        250,
        'buffer replay delay should honor subscriber retryAfter hints',
      );
      t.ok(
        scheduledTimers.some((timer) => timer.delay === 250),
        'follow-up replay should be scheduled using the subscriber retryAfter delay',
      );
      t.equal(
        deliveredEvents.length,
        0,
        'not-ready subscribers should not receive replayed events prematurely',
      );

      ready = true;
      await new Promise((resolve) => originalSetTimeout(resolve, NUM.TEN));

      t.equal(
        deliveredEvents.length,
        1,
        'buffered replay should resume once the subscriber becomes ready',
      );
      t.notOk(
        partition.cdcEventBuffer.hasEvents(),
        'buffer should drain after the subscriber becomes ready',
      );
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      await partition.shutdown();
    }
  });

test('buffer replay preserves downstream retryAfter hints above the legacy ' +
  'one-second ceiling', async (t) => {
  const partition = createTestPartition();
  await partition.initialize();

  try {
    partition.cdcBufferReplayDelayMs =
      PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    const deferredError = new Error('leader temporarily unavailable');
    deferredError.retryAfterMs = 5000;

    const replayDelayMs =
      partition.cdcDelivery.resolveBufferedReplayDelayAfterError(deferredError);

    t.equal(
      replayDelayMs,
      5000,
      'partition replay should preserve downstream retryAfter hints instead of clipping to 1s',
    );
    t.ok(
      replayDelayMs <= PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_MAX_DELAY_MS,
      'replay delay should remain bounded by the configured max',
    );
  } finally {
    await partition.shutdown();
  }
});

test('cleanup CDC buffer replay robustness tests', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  t.pass('cleanup complete');
});
