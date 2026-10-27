/**
 * The volatile CDC buffer's retry accounting: growth stats and the replay
 * delay derived from a downstream retryAfter hint.
 *
 * The handshake catch-up subtests (partial catch-up, replay-only marking,
 * delay reset, readiness hints during the handshake) were deleted with the
 * handshake's buffer catch-up (CDC decision D4, 2026-10-26).
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
import {
  PARTITION_SERVICE_DEFAULT,
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const TEST_TABLE_NAME = SYSTEM_TABLE_NAME.NODES;
const TEST_PARTITION_ID = 'test-partition-replay-robust';
const TEST_TABLE_ID = 'test-table-replay-robust';
const TEST_REPLICA_ID = 'test-partition-replay-robust-r1';
const TEST_NODE_ID = 'test-node-replay-robust';

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
  return new PartitionService(withFoundingStamp({
    partitionId: TEST_PARTITION_ID,
    tableId: TEST_TABLE_ID,
    tableName: TEST_TABLE_NAME,
    replicaId: TEST_REPLICA_ID,
    replicaIds: [TEST_REPLICA_ID],
    nodeId: TEST_NODE_ID,
    dbPath: ':memory:',
  }));
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
