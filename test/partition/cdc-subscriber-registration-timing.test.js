/**
 * Regression test: CDC subscriber registered before first Raft entry delivery.
 *
 * Proves that subscribeToCDCWithHandshake replays all buffered CDC events
 * during handshake catchup, and that the subscriber receives subsequent
 * events in steady state.
 *
 * Feature: cdc-continuity-topology-transitions
 * Task 2.3
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {NUM} from '../../src/constants/index.js';
import {
  PARTITION_SERVICE_CDC,
  PARTITION_SERVICE_EVENT,
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

/**
 * Table name for CDC events that are eligible for buffering.
 * The nodes table is a CDC-propagated system table.
 */
const TEST_TABLE_NAME = SYSTEM_TABLE_NAME.NODES;
const TEST_PARTITION_ID = 'test-partition-cdc-timing';
const TEST_TABLE_ID = 'test-table-cdc-timing';
const TEST_REPLICA_ID = 'test-partition-cdc-timing-r1';
const TEST_NODE_ID = 'test-node-cdc-timing';

function initializeTestConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: TEST_NODE_ID}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
}

/**
 * Create a minimal PartitionService for CDC timing tests.
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
 * @param {string} operation - CDC operation type
 * @param {number} seqSuffix - suffix for timestamp uniqueness
 * @return {Object} CDC event
 */
function buildNodeCdcEvent(nodeId, operation, seqSuffix) {
  return {
    tableName: TEST_TABLE_NAME,
    operation,
    data: {node_id: nodeId, status: 'active'},
    timestamp: `${1000000000000 + seqSuffix}`,
    sourcePartition: TEST_PARTITION_ID,
    sourceReplica: TEST_REPLICA_ID,
  };
}

test('setup CDC subscriber registration timing tests', async (t) => {
  initializeTestConfig();
  t.pass('configuration initialized');
});

test('subscribeToCDCWithHandshake replays all buffered events', async (t) => {
  const partition = createTestPartition();
  await partition.initialize();

  try {
    const event1 = buildNodeCdcEvent('node-buf-1', CDC_OPERATION.INSERT, NUM.ONE);
    const event2 = buildNodeCdcEvent('node-buf-2', CDC_OPERATION.INSERT, NUM.TWO);
    const event3 = buildNodeCdcEvent(
      'node-buf-3', CDC_OPERATION.INSERT, NUM.THREE,
    );

    partition.cdcEventBuffer.buffer(event1);
    partition.cdcEventBuffer.buffer(event2);
    partition.cdcEventBuffer.buffer(event3);

    t.equal(
      partition.cdcEventBuffer.size(), NUM.THREE,
      'buffer should hold 3 events before subscriber registration',
    );

    const deliveredEvents = [];
    const subscriber = async (cdcEvent) => {
      deliveredEvents.push(cdcEvent);
    };

    const handshake = await partition.subscribeToCDCWithHandshake(subscriber);

    t.equal(
      handshake.status,
      PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK,
      'handshake status should be ok for new subscriber',
    );
    t.equal(
      handshake.catchup.mode,
      PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL,
      'catchup mode should be backfill when buffer has events',
    );
    t.equal(
      handshake.catchup.bufferedEventsAtHandshake, NUM.THREE,
      'handshake should report 3 buffered events at start',
    );
    t.equal(
      handshake.catchup.bufferedEventsReplayed, NUM.THREE,
      'handshake should report all 3 events replayed',
    );
    t.equal(
      handshake.catchup.completed, true,
      'catchup should be marked completed when all events replayed',
    );
    t.equal(
      deliveredEvents.length, NUM.THREE,
      'subscriber should receive all 3 buffered events during catchup',
    );
    t.equal(
      deliveredEvents[NUM.ZERO].data.node_id, 'node-buf-1',
      'first delivered event should be the first buffered event',
    );
    t.equal(
      deliveredEvents[NUM.ONE].data.node_id, 'node-buf-2',
      'second delivered event should be the second buffered event',
    );
    t.equal(
      deliveredEvents[NUM.TWO].data.node_id, 'node-buf-3',
      'third delivered event should be the third buffered event',
    );
    t.equal(
      partition.cdcEventBuffer.size(), NUM.ZERO,
      'buffer should be empty after successful catchup replay',
    );
  } finally {
    await partition.shutdown();
  }
});

test('subscriber receives steady-state events after handshake catchup',
  async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    try {
      const bufferedEvent = buildNodeCdcEvent(
        'node-pre-reg', CDC_OPERATION.INSERT, NUM.ONE,
      );
      partition.cdcEventBuffer.buffer(bufferedEvent);

      const deliveredEvents = [];
      const subscriber = async (cdcEvent) => {
        deliveredEvents.push(cdcEvent);
      };

      await partition.subscribeToCDCWithHandshake(subscriber);

      t.equal(
        deliveredEvents.length, NUM.ONE,
        'subscriber should receive the buffered event during catchup',
      );

      const steadyStateEvent = buildNodeCdcEvent(
        'node-steady-1', CDC_OPERATION.UPDATE, NUM.TWO,
      );
      steadyStateEvent.sequenceNumber =
        partition.cdcDelivery.nextCDCEventSequenceNumber();

      const wrapper = partition.cdcSubscriberWrappers.get(subscriber);
      t.ok(wrapper, 'subscriber wrapper should exist after registration');

      await partition.cdcDelivery.deliverCDCEventToSubscriber(
        wrapper, steadyStateEvent,
      );

      t.equal(
        deliveredEvents.length, NUM.TWO,
        'subscriber should receive steady-state event after catchup',
      );
      t.equal(
        deliveredEvents[NUM.ONE].data.node_id, 'node-steady-1',
        'steady-state event should be the second delivered event',
      );
    } finally {
      await partition.shutdown();
    }
  });

test('subscribeToCDCWithHandshake with empty buffer skips catchup',
  async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    try {
      t.equal(
        partition.cdcEventBuffer.size(), NUM.ZERO,
        'buffer should be empty before registration',
      );

      const deliveredEvents = [];
      const subscriber = async (cdcEvent) => {
        deliveredEvents.push(cdcEvent);
      };

      const handshake = await partition.subscribeToCDCWithHandshake(
        subscriber,
      );

      t.equal(
        handshake.status,
        PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK,
        'handshake status should be ok',
      );
      t.equal(
        handshake.catchup.mode,
        PARTITION_SERVICE_CDC.CATCHUP_MODE_NONE,
        'catchup mode should be none when buffer is empty',
      );
      t.equal(
        handshake.catchup.bufferedEventsAtHandshake, NUM.ZERO,
        'no buffered events at handshake',
      );
      t.equal(
        handshake.catchup.bufferedEventsReplayed, NUM.ZERO,
        'no events replayed',
      );
      t.equal(
        deliveredEvents.length, NUM.ZERO,
        'subscriber should receive no events when buffer is empty',
      );
      t.equal(
        handshake.streamMode,
        PARTITION_SERVICE_CDC.STREAM_MODE_STEADY,
        'stream mode should be steady after handshake',
      );
    } finally {
      await partition.shutdown();
    }
  });

test('buffered events preserve order through handshake replay', async (t) => {
  const partition = createTestPartition();
  await partition.initialize();

  try {
    const eventCount = NUM.FIVE;
    for (let i = NUM.ZERO; i < eventCount; i++) {
      const event = buildNodeCdcEvent(
        `node-order-${i}`, CDC_OPERATION.INSERT, i,
      );
      partition.cdcEventBuffer.buffer(event);
    }

    const deliveredNodeIds = [];
    const subscriber = async (cdcEvent) => {
      deliveredNodeIds.push(cdcEvent.data.node_id);
    };

    await partition.subscribeToCDCWithHandshake(subscriber);

    t.equal(
      deliveredNodeIds.length, eventCount,
      'all buffered events should be delivered',
    );

    for (let i = NUM.ZERO; i < eventCount; i++) {
      t.equal(
        deliveredNodeIds[i], `node-order-${i}`,
        `event ${i} should be delivered in buffer order`,
      );
    }
  } finally {
    await partition.shutdown();
  }
});

test('CDC_CATCHUP_STARTED and CDC_CATCHUP_COMPLETED events emitted',
  async (t) => {
    const partition = createTestPartition();
    await partition.initialize();

    try {
      const event = buildNodeCdcEvent(
        'node-emit-1', CDC_OPERATION.INSERT, NUM.ONE,
      );
      partition.cdcEventBuffer.buffer(event);

      const emittedEvents = [];
      partition.on(
        PARTITION_SERVICE_EVENT.CDC_CATCHUP_STARTED,
        (data) => emittedEvents.push({type: 'started', data}),
      );
      partition.on(
        PARTITION_SERVICE_EVENT.CDC_CATCHUP_COMPLETED,
        (data) => emittedEvents.push({type: 'completed', data}),
      );

      const subscriber = async (_cdcEvent) => {};
      await partition.subscribeToCDCWithHandshake(subscriber);

      t.equal(
        emittedEvents.length, NUM.TWO,
        'should emit both catchup started and completed events',
      );
      t.equal(
        emittedEvents[NUM.ZERO].type, 'started',
        'first emitted event should be catchup started',
      );
      t.equal(
        emittedEvents[NUM.ZERO].data.partitionId, TEST_PARTITION_ID,
        'started event should include partition ID',
      );
      t.equal(
        emittedEvents[NUM.ZERO].data.bufferedEventsAtHandshake, NUM.ONE,
        'started event should report buffered event count',
      );
      t.equal(
        emittedEvents[NUM.ONE].type, 'completed',
        'second emitted event should be catchup completed',
      );
      t.equal(
        emittedEvents[NUM.ONE].data.bufferedEventsReplayed, NUM.ONE,
        'completed event should report replayed count',
      );
      t.equal(
        emittedEvents[NUM.ONE].data.bufferedEventsRemaining, NUM.ZERO,
        'completed event should report zero remaining',
      );
    } finally {
      await partition.shutdown();
    }
  });

test('cleanup CDC subscriber registration timing tests', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  t.pass('cleanup complete');
});
