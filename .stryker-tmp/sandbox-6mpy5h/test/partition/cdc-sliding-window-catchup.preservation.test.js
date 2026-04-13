/**
 * Preservation Property Tests: CDC Sliding Window Catchup
 *
 * Feature: cdc-sliding-window-catchup
 * Task 2: Write preservation property tests (BEFORE implementing fix)
 * **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6**
 *
 * Property 2: Preservation — Pre-Subscriber Buffer and Steady-State
 * Delivery Unchanged
 *
 * These tests capture baseline behavior on UNFIXED code. They MUST
 * PASS on the current code and continue to pass after the fix is
 * applied, confirming no regressions.
 *
 * Observation-first methodology:
 * - buffer() returns true within capacity, false on overflow
 * - replay() delivers events in insertion order, clears buffer,
 *   returns count of replayed events
 * - subscribeToCDCWithHandshake for already-subscribed subscriber
 *   returns status: 'already_subscribed'
 * - bufferCDCEventForRetry re-buffers events independently
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  CDCEventBuffer,
  buildEventIdentity,
} from '../../src/partition/cdc-event-buffer.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {NUM} from '../../src/constants/index.js';
import {
  PARTITION_SERVICE_CDC,
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const TEST_TABLE_NAME = SYSTEM_TABLE_NAME.NODES;
const TEST_PARTITION_ID = 'test-partition-preservation';
const TEST_TABLE_ID = 'test-table-preservation';
const TEST_REPLICA_ID = 'test-partition-preservation-r1';
const TEST_NODE_ID = 'test-node-preservation';
const BASE_TIMESTAMP = 1000000000000;
const TEST_BUFFER_CAPACITY = 20;

/**
 * CDC operation types for event generation.
 */
const CDC_OPERATIONS = [
  CDC_OPERATION.INSERT,
  CDC_OPERATION.UPDATE,
  CDC_OPERATION.DELETE,
  CDC_OPERATION.UPSERT,
];

/**
 * Arbitrary: generates a valid CDC operation type.
 */
const cdcOperationArb = fc.constantFrom(...CDC_OPERATIONS);

/**
 * Arbitrary: generates a CDC event for the nodes table with a unique
 * node_id and timestamp derived from the given index.
 * @param {number} index - event index for uniqueness
 * @return {Object} fast-check arbitrary producing a CDC event
 */
function cdcEventArb(index) {
  return fc.record({
    tableName: fc.constant(TEST_TABLE_NAME),
    operation: cdcOperationArb,
    data: fc.record({
      node_id: fc.stringMatching(/^node-[a-z0-9]{1,8}$/).map(
        (id) => `${id}-${index}`,
      ),
      status: fc.constant('active'),
    }),
    timestamp: fc.constant(`${BASE_TIMESTAMP + index}`),
    sourcePartition: fc.constant(TEST_PARTITION_ID),
    sourceReplica: fc.constant(TEST_REPLICA_ID),
  });
}

/**
 * Arbitrary: generates a non-empty array of unique CDC events
 * (1 to 10 events).
 */
const cdcEventListArb = fc.integer({min: 1, max: 10}).chain(
  (count) => fc.tuple(
    ...Array.from({length: count}, (_, i) => cdcEventArb(i)),
  ),
);

/**
 * Create a mock logger that suppresses output.
 * @return {Object} mock logger
 */
function createMockLogger() {
  return {
    warns: [],
    warn(msg, data) {
      this.warns.push({msg, data});
    },
    info() {},
    debug() {},
    error() {},
  };
}

function initializeTestConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: TEST_NODE_ID}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
}

/**
 * Create a minimal PartitionService for CDC preservation tests.
 * Uses the nodes system table so CDC events are eligible for
 * buffering.
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

test('setup CDC sliding window catchup preservation tests', async (t) => {
  initializeTestConfig();
  t.pass('configuration initialized');
});

test(
  'Feature: cdc-sliding-window-catchup, ' +
  'Property 2: Preservation — buffer() captures events and ' +
  'replay() delivers in order then clears',
  async (t) => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.5**
     *
     * Preservation: For all random CDC event sequences where no
     * subscribers exist, buffer() captures events and replay()
     * delivers them in insertion order and clears the buffer.
     *
     * Observed on unfixed code:
     * - buffer() returns true within capacity
     * - replay() delivers events in order, returns count, clears
     *   buffer
     * - After replay, buffer.size() === 0 and hasEvents() === false
     */
    t.test(
      'buffer captures events and replay delivers in order ' +
      'then clears buffer',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            cdcEventListArb,
            async (events) => {
              const logger = createMockLogger();
              const buffer = new CDCEventBuffer({
                capacity: TEST_BUFFER_CAPACITY,
                logger,
              });

              // Buffer all events (no subscribers exist)
              for (const event of events) {
                const result = buffer.buffer(event);
                if (!result) return false;
              }

              // Buffer size must match event count
              if (buffer.size() !== events.length) return false;
              if (!buffer.hasEvents()) return false;

              // Replay and collect delivered events
              const replayed = [];
              const count = await buffer.replay((cdcEvent) => {
                replayed.push(cdcEvent);
              });

              // Replay count must match event count
              if (count !== events.length) return false;
              if (replayed.length !== events.length) return false;

              // Events must be delivered in insertion order
              for (let i = NUM.ZERO; i < events.length; i++) {
                const expectedId = buildEventIdentity(events[i]);
                const actualId = buildEventIdentity(replayed[i]);
                if (expectedId !== actualId) return false;
              }

              // Buffer must be cleared after replay
              if (buffer.size() !== NUM.ZERO) return false;
              if (buffer.hasEvents()) return false;

              return true;
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);

test(
  'Feature: cdc-sliding-window-catchup, ' +
  'Property 2: Preservation — bufferCDCEventForRetry re-buffers ' +
  'events on delivery failure independently',
  async (t) => {
    /**
     * **Validates: Requirements 3.4**
     *
     * Preservation: For all random CDC events where delivery fails,
     * bufferCDCEventForRetry re-buffers the event into the
     * CDCEventBuffer without interference.
     *
     * Observed on unfixed code:
     * - bufferCDCEventForRetry calls buffer() on the CDCEventBuffer
     * - The event appears in the buffer and can be replayed
     * - Buffer size increases by one per retry-buffered event
     */
    t.test(
      'bufferCDCEventForRetry re-buffers events independently',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            cdcEventListArb,
            async (events) => {
              const partition = createTestPartition();
              await partition.initialize();

              try {
                // Buffer events via retry path (simulates delivery
                // failure re-buffering)
                for (const event of events) {
                  partition.cdcDelivery.bufferCDCEventForRetry(
                    event, 'test_delivery_failure',
                  );
                }

                // Buffer size must match event count
                const bufferSize = partition.cdcEventBuffer.size();
                if (bufferSize !== events.length) return false;

                // Replay and verify events are delivered in order
                const replayed = [];
                const count = await partition.cdcEventBuffer.replay(
                  (cdcEvent) => {
                    replayed.push(cdcEvent);
                  },
                );

                if (count !== events.length) return false;
                if (replayed.length !== events.length) return false;

                // Events must be in insertion order
                for (let i = NUM.ZERO; i < events.length; i++) {
                  const expectedId = buildEventIdentity(events[i]);
                  const actualId = buildEventIdentity(replayed[i]);
                  if (expectedId !== actualId) return false;
                }

                // Buffer must be cleared after replay
                if (partition.cdcEventBuffer.size() !== NUM.ZERO) {
                  return false;
                }

                return true;
              } finally {
                await partition.shutdown();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);

test(
  'Feature: cdc-sliding-window-catchup, ' +
  'Property 2: Preservation — subscribeToCDCWithHandshake returns ' +
  'already_subscribed for duplicate subscribers',
  async (t) => {
    /**
     * **Validates: Requirements 3.6**
     *
     * Preservation: For all already-subscribed subscribers,
     * subscribeToCDCWithHandshake returns the existing wrapper with
     * status 'already_subscribed' unchanged.
     *
     * Observed on unfixed code:
     * - First call returns status: 'ok'
     * - Second call returns status: 'already_subscribed'
     * - catchup.mode is 'none' when buffer is empty on second call
     * - streamMode remains 'steady'
     */
    t.test(
      'already-subscribed subscriber returns already_subscribed ' +
      'status unchanged',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            cdcEventListArb,
            async (events) => {
              const partition = createTestPartition();
              await partition.initialize();

              try {
                // Buffer some events before first subscription
                for (const event of events) {
                  partition.cdcEventBuffer.buffer(event);
                }

                const deliveredEvents = [];
                const subscriber = async (cdcEvent) => {
                  deliveredEvents.push(cdcEvent);
                };

                // First subscription — should be 'ok' with backfill
                const firstHandshake =
                  await partition.subscribeToCDCWithHandshake(
                    subscriber,
                  );

                if (firstHandshake.status !==
                    PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK) {
                  return false;
                }
                if (firstHandshake.catchup.mode !==
                    PARTITION_SERVICE_CDC.CATCHUP_MODE_BACKFILL) {
                  return false;
                }
                if (firstHandshake.catchup.bufferedEventsReplayed !==
                    events.length) {
                  return false;
                }

                // Second subscription — same subscriber, should be
                // 'already_subscribed'
                const secondHandshake =
                  await partition.subscribeToCDCWithHandshake(
                    subscriber,
                  );

                if (secondHandshake.status !==
                    PARTITION_SERVICE_CDC
                      .HANDSHAKE_STATUS_ALREADY_SUBSCRIBED) {
                  return false;
                }

                // Buffer is empty after first replay, so catchup
                // mode should be 'none'
                if (secondHandshake.catchup.mode !==
                    PARTITION_SERVICE_CDC.CATCHUP_MODE_NONE) {
                  return false;
                }
                if (secondHandshake.catchup
                  .bufferedEventsAtHandshake !== NUM.ZERO) {
                  return false;
                }
                if (secondHandshake.catchup
                  .bufferedEventsReplayed !== NUM.ZERO) {
                  return false;
                }

                // Stream mode should be steady
                if (secondHandshake.streamMode !==
                    PARTITION_SERVICE_CDC.STREAM_MODE_STEADY) {
                  return false;
                }

                return true;
              } finally {
                await partition.shutdown();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);

test('cleanup CDC sliding window catchup preservation tests', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  t.pass('cleanup complete');
});
