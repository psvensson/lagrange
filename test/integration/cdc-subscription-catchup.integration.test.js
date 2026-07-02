/**
 * CDC subscription handshake + catch-up integration tests.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import {test} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  ConfigurationManager,
} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {
  buildEventIdentity,
} from '../../src/partition/cdc-event-buffer.js';
import {
  PARTITION_SERVICE_CDC,
} from '../../src/partition/partition-service-constants.js';

const TEST_TABLE_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'value', type: 'INTEGER'},
  ],
});

const TEST_IDS = Object.freeze({
  PARTITION_ID: 'cdc-handshake-p1',
  TABLE_ID: 'cdc_handshake_items',
  REPLICA_ID: 'cdc-handshake-p1-r1',
  NODE_ID: 'cdc-handshake-node-1',
});

const HANDSHAKE_STATUS_OK =
  PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK;
const CATCHUP_MODE_BACKFILL =
  PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL;
const CATCHUP_MODE_SLIDING_WINDOW =
  PARTITION_SERVICE_CDC.CATCHUP_MODE_SLIDING_WINDOW;
const CATCHUP_MODE_NONE =
  PARTITION_SERVICE_CDC.CATCHUP_MODE_NONE;
const STREAM_MODE_CATCHUP =
  PARTITION_SERVICE_CDC.STREAM_MODE_CATCHUP;
const STREAM_MODE_STEADY =
  PARTITION_SERVICE_CDC.STREAM_MODE_STEADY;

const SUBSCRIBER_A_ID = 'integration-subscriber-a';
const SUBSCRIBER_B_ID = 'integration-subscriber-b';
const LATE_SUBSCRIBER_ID = 'integration-late-subscriber-1';
const MIN_EXPECTED_EVENTS = 3;
const ROW_VALUE_ONE = 1;
const ROW_VALUE_TWO = 2;
const ROW_VALUE_THREE = 3;
const ROW_VALUE_FOUR = 4;

function createPartition() {
  return new PartitionService({
    partitionId: TEST_IDS.PARTITION_ID,
    tableId: TEST_IDS.TABLE_ID,
    tableName: TEST_IDS.TABLE_ID,
    replicaId: TEST_IDS.REPLICA_ID,
    replicaIds: [TEST_IDS.REPLICA_ID],
    nodeId: TEST_IDS.NODE_ID,
    schema: TEST_TABLE_SCHEMA,
    dbPath: ':memory:',
  });
}

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: TEST_IDS.NODE_ID},
  });

  const loggingService = LoggingService.getInstance();
  loggingService.initialize({level: 'error'});
}

function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test('CDC subscription handshake + catch-up integration',
  async (t) => {
    t.beforeEach(() => {
      initializeTestEnvironment();
    });

    t.afterEach(() => {
      cleanupTestEnvironment();
    });

    await t.test(
      'late subscriber receives deterministic catch-up ' +
      'and steady-state transition',
      async (t) => {
        const partition = createPartition();

        try {
          await partition.initialize();

          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'row-1', value: ROW_VALUE_ONE},
          );
          await partition.updateData(
            TEST_IDS.TABLE_ID,
            {id: 'row-1'},
            {value: ROW_VALUE_TWO},
          );
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'row-2', value: ROW_VALUE_THREE},
          );

          const delivered = [];
          const subscriber = (event) => {
            delivered.push(event);
          };

          const handshake =
            await partition.subscribeToCDCWithHandshake(
              subscriber,
              {subscriberId: LATE_SUBSCRIBER_ID},
            );

          t.equal(
            handshake.status, HANDSHAKE_STATUS_OK,
            'handshake should acknowledge subscription',
          );
          t.equal(
            handshake.catchup.mode, CATCHUP_MODE_BACKFILL,
            'late subscription should enter catch-up mode',
          );
          t.ok(
            handshake.catchup.bufferedEventsReplayed >=
              MIN_EXPECTED_EVENTS,
            'catch-up should replay buffered events',
          );
          t.equal(
            handshake.streamMode, STREAM_MODE_STEADY,
            'stream transitions to steady after catch-up',
          );

          const catchupEvents = delivered.filter(
            (e) => e.streamMode === STREAM_MODE_CATCHUP,
          );
          t.equal(
            catchupEvents.length,
            handshake.catchup.bufferedEventsReplayed,
            'subscriber observes exactly replayed events',
          );

          const catchupSeq = catchupEvents.map(
            (e) => e.sequenceNumber,
          );
          const sortedSeq =
            [...catchupSeq].sort((a, b) => a - b);
          t.same(
            catchupSeq, sortedSeq,
            'catch-up events in deterministic order',
          );

          await partition.updateData(
            TEST_IDS.TABLE_ID,
            {id: 'row-2'},
            {value: ROW_VALUE_FOUR},
          );

          const steadyEvents = delivered.filter(
            (e) => e.streamMode === STREAM_MODE_STEADY,
          );
          t.ok(
            steadyEvents.length >= 1,
            'subscriber continues in steady stream mode',
          );
          t.ok(
            steadyEvents.some(
              (e) => e.data?.id === 'row-2' &&
                e.data?.value === ROW_VALUE_FOUR,
            ),
            'steady stream includes post-catch-up update',
          );
        } finally {
          await partition.shutdown();
        }
      },
    );
  },
);

/**
 * Sliding window catchup integration tests.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 *
 * These tests verify the full handshake flow where a late
 * subscriber receives sliding window catchup after events have
 * already been delivered to an existing subscriber.
 */
test('CDC sliding window handshake catchup integration',
  async (t) => {
    t.beforeEach(() => {
      initializeTestEnvironment();
    });

    t.afterEach(() => {
      cleanupTestEnvironment();
    });

    await t.test(
      'subscriber B receives sliding window catchup ' +
      'after events delivered to subscriber A',
      async (t) => {
        const partition = createPartition();

        try {
          await partition.initialize();

          // Register subscriber A
          const subscriberAEvents = [];
          const subscriberA = (event) => {
            subscriberAEvents.push(event);
          };
          const handshakeA =
            await partition.subscribeToCDCWithHandshake(
              subscriberA,
              {subscriberId: SUBSCRIBER_A_ID},
            );
          t.equal(
            handshakeA.status, HANDSHAKE_STATUS_OK,
            'subscriber A handshake acknowledged',
          );

          // Generate events delivered to subscriber A via
          // the real write path (generateCDCEvent)
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'sw-row-1', value: ROW_VALUE_ONE},
          );
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'sw-row-2', value: ROW_VALUE_TWO},
          );
          await partition.updateData(
            TEST_IDS.TABLE_ID,
            {id: 'sw-row-1'},
            {value: ROW_VALUE_THREE},
          );

          // Verify subscriber A received events
          t.ok(
            subscriberAEvents.length >= MIN_EXPECTED_EVENTS,
            'subscriber A received delivered events',
          );

          // Pre-subscriber buffer should be empty
          t.equal(
            partition.cdcEventBuffer.size(), 0,
            'pre-subscriber buffer empty after delivery',
          );

          // Sliding window should have recorded events
          t.ok(
            partition.cdcEventBuffer.recentEventsSize() >
              0,
            'sliding window has recorded events',
          );

          // Register late subscriber B
          const subscriberBEvents = [];
          const subscriberB = (event) => {
            subscriberBEvents.push(event);
          };
          const handshakeB =
            await partition.subscribeToCDCWithHandshake(
              subscriberB,
              {subscriberId: SUBSCRIBER_B_ID},
            );

          // Handshake should indicate sliding window catchup
          t.equal(
            handshakeB.status, HANDSHAKE_STATUS_OK,
            'subscriber B handshake acknowledged',
          );
          t.equal(
            handshakeB.catchup.mode,
            CATCHUP_MODE_SLIDING_WINDOW,
            'catchup mode is sliding_window',
          );
          t.ok(
            handshakeB.catchup
              .slidingWindowEventsReplayed > 0,
            'sliding window events replayed to B',
          );
          t.equal(
            handshakeB.catchup.bufferedEventsReplayed,
            0,
            'no buffered events replayed',
          );

          // Subscriber B received sliding window events
          t.ok(
            subscriberBEvents.length > 0,
            'subscriber B received catchup events',
          );
          t.ok(
            subscriberBEvents.length >=
              handshakeB.catchup
                .slidingWindowEventsReplayed,
            'B event count >= replayed count',
          );

          // Stream mode should be steady after catchup
          t.equal(
            handshakeB.streamMode, STREAM_MODE_STEADY,
            'subscriber B transitions to steady',
          );
        } finally {
          await partition.shutdown();
        }
      },
    );

    await t.test(
      'handshake deduplicates buffer and sliding window ' +
      'events via buildEventIdentity',
      async (t) => {
        const partition = createPartition();

        try {
          await partition.initialize();

          // Generate events with no subscribers — buffered
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'dedup-row-1', value: ROW_VALUE_ONE},
          );
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'dedup-row-2', value: ROW_VALUE_TWO},
          );

          const bufferedCount =
            partition.cdcEventBuffer.size();
          t.ok(
            bufferedCount > 0,
            'events buffered before subscriber registers',
          );

          // Register subscriber A — triggers buffer replay
          // which also records into sliding window
          const subscriberAEvents = [];
          const subscriberA = (event) => {
            subscriberAEvents.push(event);
          };
          const handshakeA =
            await partition.subscribeToCDCWithHandshake(
              subscriberA,
              {subscriberId: SUBSCRIBER_A_ID},
            );
          t.equal(
            handshakeA.catchup.mode,
            CATCHUP_MODE_BACKFILL,
            'subscriber A gets backfill catchup',
          );
          t.ok(
            handshakeA.catchup.bufferedEventsReplayed >
              0,
            'subscriber A received buffered events',
          );

          // Generate more events delivered to subscriber A
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'dedup-row-3', value: ROW_VALUE_THREE},
          );

          // Register subscriber B — sliding window catchup
          // with deduplication
          const subscriberBEvents = [];
          const subscriberB = (event) => {
            subscriberBEvents.push(event);
          };
          const handshakeB =
            await partition.subscribeToCDCWithHandshake(
              subscriberB,
              {subscriberId: SUBSCRIBER_B_ID},
            );

          t.equal(
            handshakeB.status, HANDSHAKE_STATUS_OK,
            'subscriber B handshake acknowledged',
          );

          // Verify no duplicate events delivered to B
          const seenIdentities = new Set();
          let hasDuplicates = false;
          for (const event of subscriberBEvents) {
            const identity = buildEventIdentity(event);
            if (seenIdentities.has(identity)) {
              hasDuplicates = true;
              break;
            }
            seenIdentities.add(identity);
          }
          t.notOk(
            hasDuplicates,
            'no duplicate events delivered to B',
          );
        } finally {
          await partition.shutdown();
        }
      },
    );

    await t.test(
      'handshake with empty sliding window returns ' +
      'catchupMode none',
      async (t) => {
        const partition = createPartition();

        try {
          await partition.initialize();

          // Register subscriber with no prior events
          const subscriberEvents = [];
          const subscriber = (event) => {
            subscriberEvents.push(event);
          };
          const handshake =
            await partition.subscribeToCDCWithHandshake(
              subscriber,
              {subscriberId: SUBSCRIBER_A_ID},
            );

          t.equal(
            handshake.status, HANDSHAKE_STATUS_OK,
            'handshake acknowledged',
          );
          t.equal(
            handshake.catchup.mode, CATCHUP_MODE_NONE,
            'catchup mode is none with no events',
          );
          t.equal(
            handshake.catchup.bufferedEventsReplayed,
            0,
            'no buffered events replayed',
          );
          t.equal(
            handshake.catchup
              .slidingWindowEventsReplayed,
            0,
            'no sliding window events replayed',
          );
          t.equal(
            subscriberEvents.length, 0,
            'subscriber received no catchup events',
          );
          t.equal(
            handshake.streamMode, STREAM_MODE_STEADY,
            'stream mode is steady',
          );
        } finally {
          await partition.shutdown();
        }
      },
    );

    await t.test(
      'generateCDCEvent records to sliding window ' +
      'after successful delivery',
      async (t) => {
        const partition = createPartition();

        try {
          await partition.initialize();

          // Register subscriber so events are delivered
          const events = [];
          const subscriber = (event) => {
            events.push(event);
          };
          await partition.subscribeToCDCWithHandshake(
            subscriber,
            {subscriberId: SUBSCRIBER_A_ID},
          );

          // Sliding window empty before writes
          t.equal(
            partition.cdcEventBuffer.recentEventsSize(),
            0,
            'sliding window empty before writes',
          );

          // Generate events via the real write path
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'rec-row-1', value: ROW_VALUE_ONE},
          );
          await partition.insertData(
            TEST_IDS.TABLE_ID,
            {id: 'rec-row-2', value: ROW_VALUE_TWO},
          );

          // Verify events were delivered
          t.ok(
            events.length > 0,
            'events delivered to subscriber',
          );

          // Verify sliding window recorded events
          const recentEvents =
            partition.cdcEventBuffer.getRecentEvents();
          t.ok(
            recentEvents.length > 0,
            'sliding window has recorded events',
          );
          t.ok(
            recentEvents.length <= events.length,
            'sliding window size <= delivered count',
          );

          // Verify identity match
          for (
            let i = 0;
            i < recentEvents.length;
            i++
          ) {
            const recentId =
              buildEventIdentity(recentEvents[i]);
            const deliveredId =
              buildEventIdentity(events[i]);
            t.equal(
              recentId, deliveredId,
              `sliding window event ${i} matches`,
            );
          }
        } finally {
          await partition.shutdown();
        }
      },
    );

    await t.test(
      'flushBufferedCDCEvents records to sliding ' +
      'window during buffer replay',
      async (t) => {
        const partition = createPartition();

        try {
          await partition.initialize();

          // Register subscriber A first
          const subscriberAEvents = [];
          const subscriberA = (event) => {
            subscriberAEvents.push(event);
          };
          await partition.subscribeToCDCWithHandshake(
            subscriberA,
            {subscriberId: SUBSCRIBER_A_ID},
          );

          // Buffer events via retry path (simulates
          // delivery failure re-buffering)
          const event1 = {
            tableName: TEST_IDS.TABLE_ID,
            operation: CDC_OPERATION.INSERT,
            data: {id: 'flush-row-1', value: ROW_VALUE_ONE},
            timestamp: String(Date.now()),
            sourcePartition: TEST_IDS.PARTITION_ID,
            sourceReplica: TEST_IDS.REPLICA_ID,
            sequenceNumber: 1,
          };
          const event2 = {
            tableName: TEST_IDS.TABLE_ID,
            operation: CDC_OPERATION.INSERT,
            data: {id: 'flush-row-2', value: ROW_VALUE_TWO},
            timestamp: String(Date.now()),
            sourcePartition: TEST_IDS.PARTITION_ID,
            sourceReplica: TEST_IDS.REPLICA_ID,
            sequenceNumber: 2,
          };
          partition.cdcEventBuffer.buffer(event1);
          partition.cdcEventBuffer.buffer(event2);

          t.ok(
            partition.cdcEventBuffer.size() > 0,
            'events buffered for retry',
          );

          // Sliding window empty before flush
          t.equal(
            partition.cdcEventBuffer.recentEventsSize(),
            0,
            'sliding window empty before flush',
          );

          // Flush buffered events — this path calls
          // recordDelivered for each replayed event
          await partition.cdcDelivery
            .flushBufferedCDCEvents('test_flush');

          // Sliding window should now contain events
          const recentEvents =
            partition.cdcEventBuffer.getRecentEvents();
          t.ok(
            recentEvents.length > 0,
            'sliding window populated after flush',
          );

          // Register subscriber B — should get sliding
          // window catchup
          const subscriberBEvents = [];
          const subscriberB = (event) => {
            subscriberBEvents.push(event);
          };
          const handshakeB =
            await partition.subscribeToCDCWithHandshake(
              subscriberB,
              {subscriberId: SUBSCRIBER_B_ID},
            );

          t.ok(
            handshakeB.catchup
              .slidingWindowEventsReplayed > 0,
            'B received sliding window catchup ' +
            'from flushed events',
          );
        } finally {
          await partition.shutdown();
        }
      },
    );
  },
);
