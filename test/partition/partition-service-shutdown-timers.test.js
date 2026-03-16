/**
 * Regression test: shutdown clears all timers and prevents new creation.
 *
 * Proves that PartitionService.shutdown() clears the cdcBufferReplayTimer,
 * sets isShutdown to true, and that scheduleBufferedCDCReplay is a no-op
 * after shutdown (no new timer created).
 *
 * Feature: cdc-continuity-topology-transitions
 * Task 7.4
 * **Validates: Requirements 7.4, 7.5**
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {NUM} from '../../src/constants/index.js';
import {
  PARTITION_SERVICE_DEFAULT,
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const TEST_TABLE_NAME = SYSTEM_TABLE_NAME.NODES;
const TEST_PARTITION_ID = 'test-partition-shutdown-timers';
const TEST_TABLE_ID = 'test-table-shutdown-timers';
const TEST_REPLICA_ID = 'test-partition-shutdown-timers-r1';
const TEST_NODE_ID = 'test-node-shutdown-timers';
const BUFFERED_EVENT_COUNT = NUM.THREE;

function initializeTestConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: TEST_NODE_ID}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
}

/**
 * Create a minimal PartitionService for shutdown timer tests.
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

test('setup partition service shutdown timer tests', async (t) => {
  initializeTestConfig();
  t.pass('configuration initialized');
});

test('shutdown clears active cdcBufferReplayTimer', async (t) => {
  const partition = createTestPartition();
  await partition.initialize();

  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay) => {
    return originalSetTimeout(fn, delay);
  };

  try {
    // Buffer events and register a subscriber so replay can be scheduled
    for (let i = NUM.ZERO; i < BUFFERED_EVENT_COUNT; i++) {
      const event = buildNodeCdcEvent(`node-shutdown-${i}`, i);
      partition.cdcEventBuffer.buffer(event);
    }

    const subscriber = async (_cdcEvent) => {};
    await partition.subscribeToCDCWithHandshake(subscriber);

    // Buffer more events after subscriber is registered so
    // scheduleBufferedCDCReplay creates a timer
    for (let i = NUM.ZERO; i < BUFFERED_EVENT_COUNT; i++) {
      const event = buildNodeCdcEvent(`node-post-sub-${i}`, i + NUM.TEN);
      partition.cdcEventBuffer.buffer(event);
    }

    partition.cdcDelivery.scheduleBufferedCDCReplay('test_trigger');

    t.ok(
      partition.cdcBufferReplayTimer !== null,
      'cdcBufferReplayTimer should be active before shutdown',
    );

    await partition.shutdown();

    t.equal(
      partition.cdcBufferReplayTimer, null,
      'cdcBufferReplayTimer should be null after shutdown',
    );
    t.equal(
      partition.isShutdown, true,
      'isShutdown flag should be true after shutdown',
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    // shutdown already called above; safe to call again (idempotent)
    if (!partition.isShutdown) {
      await partition.shutdown();
    }
  }
});

test('no new cdcBufferReplayTimer created after shutdown', async (t) => {
  const partition = createTestPartition();
  await partition.initialize();

  const originalSetTimeout = globalThis.setTimeout;
  const postShutdownTimers = [];
  let shutdownComplete = false;

  try {
    // Register a subscriber first so the replay guard passes
    const subscriber = async (_cdcEvent) => {};
    await partition.subscribeToCDCWithHandshake(subscriber);

    await partition.shutdown();
    shutdownComplete = true;

    // Intercept setTimeout after shutdown to detect any new timers
    globalThis.setTimeout = (fn, delay) => {
      if (shutdownComplete) {
        postShutdownTimers.push({fn, delay});
      }
      return originalSetTimeout(fn, delay);
    };

    t.equal(
      partition.isShutdown, true,
      'isShutdown should be true before attempting new replay',
    );

    // Re-add subscribers and buffer events to simulate an async callback
    // trying to schedule work after shutdown. The cdcSubscribers were
    // cleared by shutdown, so we need to add one back to pass the
    // subscriber-count guard. This simulates a race where a callback
    // still holds a reference to the partition.
    partition.cdcSubscribers.add(subscriber);
    for (let i = NUM.ZERO; i < BUFFERED_EVENT_COUNT; i++) {
      const event = buildNodeCdcEvent(`node-after-shutdown-${i}`, i);
      partition.cdcEventBuffer.buffer(event);
    }

    // Attempt to schedule replay after shutdown
    partition.cdcDelivery.scheduleBufferedCDCReplay('post_shutdown_attempt');

    t.equal(
      partition.cdcBufferReplayTimer, null,
      'cdcBufferReplayTimer should remain null after post-shutdown schedule',
    );

    t.equal(
      postShutdownTimers.length, NUM.ZERO,
      'no new timers should be created after shutdown',
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('shutdown is idempotent for timer cleanup', async (t) => {
  const partition = createTestPartition();
  await partition.initialize();

  try {
    await partition.shutdown();

    t.equal(
      partition.isShutdown, true,
      'isShutdown should be true after first shutdown',
    );
    t.equal(
      partition.cdcBufferReplayTimer, null,
      'cdcBufferReplayTimer should be null after first shutdown',
    );

    // Second shutdown should not throw
    await partition.shutdown();

    t.equal(
      partition.isShutdown, true,
      'isShutdown should remain true after second shutdown',
    );
    t.equal(
      partition.cdcBufferReplayTimer, null,
      'cdcBufferReplayTimer should remain null after second shutdown',
    );
    t.pass('double shutdown did not throw');
  } catch (error) {
    t.fail(`shutdown should be idempotent but threw: ${error.message}`);
  }
});

test('cleanup partition service shutdown timer tests', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  t.pass('cleanup complete');
});
