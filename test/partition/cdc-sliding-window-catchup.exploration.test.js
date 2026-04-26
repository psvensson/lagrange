/**
 * Bug Condition Exploration Test: CDC Sliding Window Catchup
 *
 * Feature: cdc-sliding-window-catchup
 * Task 1: Write bug condition exploration test
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 *
 * Property 1: Bug Condition — Late Subscriber Gets No Catchup
 * From Empty Buffer
 *
 * This test encodes the EXPECTED (correct) behavior. It MUST FAIL on
 * unfixed code, confirming the bug exists. After the fix is applied,
 * this same test validates the fix.
 *
 * Bug Condition:
 *   isBugCondition(X) = X.subscriberRegistrationTime >
 *     X.lastEventDeliveryTime
 *     AND X.preSubscriberBufferSize = 0
 *     AND X.recentlyDeliveredEventCount > 0
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {NUM} from '../../src/constants/index.js';
import {
  buildEventIdentity,
} from '../../src/partition/cdc-event-buffer.js';
import {
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const TEST_TABLE_NAME = SYSTEM_TABLE_NAME.NODES;
const TEST_PARTITION_ID = 'test-partition-sliding-window';
const TEST_TABLE_ID = 'test-table-sliding-window';
const TEST_REPLICA_ID = 'test-partition-sliding-window-r1';
const TEST_NODE_ID = 'test-node-sliding-window';
const BASE_TIMESTAMP = 1000000000000;

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

function initializeTestConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: TEST_NODE_ID}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
}

/**
 * Create a minimal PartitionService for CDC sliding window tests.
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

test('setup CDC sliding window catchup exploration tests', async (t) => {
  initializeTestConfig();
  t.pass('configuration initialized');
});

test(
  'Feature: cdc-sliding-window-catchup, ' +
  'Property 1: Late subscriber receives catchup from sliding window',
  async (t) => {
    /**
     * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
     *
     * Bug Condition: A subscriber registers after events have been
     * delivered to existing subscribers and the pre-subscriber buffer
     * is empty. The late subscriber should receive recent events from
     * the sliding window.
     *
     * On UNFIXED code this test MUST FAIL because
     * subscribeToCDCWithHandshake returns catchupMode: 'none' and
     * bufferedEventsReplayed: 0 for late subscribers when the
     * pre-subscriber buffer is empty.
     */
    t.test(
      'late subscriber gets sliding window catchup after events ' +
      'delivered to existing subscriber',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            cdcEventListArb,
            async (events) => {
              const partition = createTestPartition();
              await partition.initialize();

              try {
                // Phase 1: Register subscriber A via handshake
                const subscriberAEvents = [];
                const subscriberA = async (cdcEvent) => {
                  subscriberAEvents.push(cdcEvent);
                };
                await partition.subscribeToCDCWithHandshake(subscriberA);

                // Phase 2: Deliver events to subscriber A by
                // buffering then flushing (simulates generateCDCEvent
                // delivery path)
                const wrapperA =
                  partition.cdcSubscriberWrappers.get(subscriberA);
                for (const event of events) {
                  const sequencedEvent = {
                    ...event,
                    sequenceNumber:
                      partition.cdcDelivery
                        .nextCDCEventSequenceNumber(),
                  };
                  await partition.cdcDelivery
                    .deliverCDCEventToSubscriber(
                      wrapperA, sequencedEvent,
                    );
                }

                // Verify bug condition holds:
                // - pre-subscriber buffer is empty
                // - events were delivered to existing subscriber
                const bufferSize = partition.cdcEventBuffer.size();
                if (bufferSize !== NUM.ZERO) {
                  return true; // skip — not bug condition
                }
                if (subscriberAEvents.length === NUM.ZERO) {
                  return true; // skip — no events delivered
                }

                // Phase 3: Register late subscriber B
                const subscriberBEvents = [];
                const subscriberB = async (cdcEvent) => {
                  subscriberBEvents.push(cdcEvent);
                };
                const handshakeB =
                  await partition.subscribeToCDCWithHandshake(
                    subscriberB,
                  );

                // Assert: late subscriber B should receive catchup
                // from the sliding window
                const slidingWindowReplayed =
                  handshakeB.catchup.slidingWindowEventsReplayed;

                // The handshake must indicate sliding window replay
                if (slidingWindowReplayed === undefined ||
                    slidingWindowReplayed <= NUM.ZERO) {
                  return false;
                }

                // Subscriber B must have received events
                if (subscriberBEvents.length === NUM.ZERO) {
                  return false;
                }

                // Catchup mode should indicate sliding window replay
                if (handshakeB.catchup.mode !==
                    'sliding_window') {
                  return false;
                }

                // No duplicate events delivered to subscriber B
                // (deduplication via buildEventIdentity)
                const seenIdentities = new Set();
                for (const delivered of subscriberBEvents) {
                  const identity = buildEventIdentity(delivered);
                  if (seenIdentities.has(identity)) {
                    return false; // duplicate detected
                  }
                  seenIdentities.add(identity);
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

test('cleanup CDC sliding window catchup exploration tests', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  t.pass('cleanup complete');
});
