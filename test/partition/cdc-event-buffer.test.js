/**
 * Unit Tests: CDC Event Buffer Integration
 *
 * Feature: bootstrap-lifecycle-hardening
 * Task 2.4
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CDCEventBuffer,
  buildEventIdentity,
} from '../../src/partition/cdc-event-buffer.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {
  CDC_LIFECYCLE_LOG_MSG,
} from '../../src/constants/cdc-lifecycle-constants.js';

/**
 * Mock logger that captures warn calls.
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

/**
 * Create a CDC event for the nodes table.
 * @param {string} nodeId
 * @param {string} [timestamp]
 * @return {Object} CDC event
 */
function createNodeEvent(nodeId, timestamp = '1000000000000') {
  return {
    tableName: 'nodes',
    operation: CDC_OPERATION.INSERT,
    data: {node_id: nodeId},
    timestamp,
    sourcePartition: 'partition-nodes-p1',
    sourceReplica: 'partition-nodes-p1-r1',
  };
}

test('CDCEventBuffer unit tests', async (t) => {
  t.test('empty buffer replay returns 0', async (t) => {
    const logger = createMockLogger();
    const buffer = new CDCEventBuffer({capacity: 10, logger});

    const replayed = [];
    const count = await buffer.replay((event) => {
      replayed.push(event);
    });

    t.equal(count, 0, 'replay count is 0 for empty buffer');
    t.equal(replayed.length, 0, 'no events delivered');
    t.equal(buffer.size(), 0, 'buffer size remains 0');
    t.equal(buffer.hasEvents(), false, 'hasEvents returns false');
  });

  t.test('single event buffer and replay', async (t) => {
    const logger = createMockLogger();
    const buffer = new CDCEventBuffer({capacity: 10, logger});

    const event = createNodeEvent('node-1');
    const buffered = buffer.buffer(event);

    t.equal(buffered, true, 'buffer returns true when within capacity');
    t.equal(buffer.size(), 1, 'buffer size is 1 after buffering');
    t.equal(buffer.hasEvents(), true, 'hasEvents returns true');

    const replayed = [];
    const count = await buffer.replay((e) => {
      replayed.push(e);
    });

    t.equal(count, 1, 'replay count is 1');
    t.equal(replayed.length, 1, 'one event delivered');
    t.equal(
      buildEventIdentity(replayed[0]),
      buildEventIdentity(event),
      'replayed event matches buffered event',
    );
    t.equal(buffer.size(), 0, 'buffer cleared after replay');
    t.equal(buffer.hasEvents(), false, 'hasEvents false after replay');
  });

  t.test('replay preserves undelivered tail when subscriber fails', async (t) => {
    const logger = createMockLogger();
    const buffer = new CDCEventBuffer({capacity: 10, logger});

    const event1 = createNodeEvent('node-1', '1000000000001');
    const event2 = createNodeEvent('node-2', '1000000000002');
    buffer.buffer(event1);
    buffer.buffer(event2);

    let firstAttempt = true;
    await t.rejects(
      buffer.replay(async () => {
        if (firstAttempt) {
          firstAttempt = false;
          throw new Error('transient-replay-failure');
        }
      }),
      /transient-replay-failure/,
      'replay should surface subscriber failure',
    );

    t.equal(
      buffer.size(),
      2,
      'failed replay must preserve undelivered events in the buffer',
    );

    const replayed = [];
    const count = await buffer.replay((event) => {
      replayed.push(event);
    });
    t.equal(count, 2, 'second replay should deliver all preserved events');
    t.equal(buffer.size(), 0, 'buffer should clear after successful replay');
  });

  t.test('buffer at exact capacity boundary', async (t) => {
    const capacity = 5;
    const logger = createMockLogger();
    const buffer = new CDCEventBuffer({capacity, logger});

    const events = [];
    for (let i = 0; i < capacity; i++) {
      const event = createNodeEvent(`node-${i}`, `${1000000000000 + i}`);
      events.push(event);
      const buffered = buffer.buffer(event);
      t.equal(buffered, true, `event ${i} buffered within capacity`);
    }

    t.equal(buffer.size(), capacity, 'buffer size equals capacity');
    t.equal(logger.warns.length, 0, 'no warnings at exact capacity');

    // Buffer one more — should drop the oldest
    const overflowEvent = createNodeEvent(
      'node-overflow', `${1000000000000 + capacity}`,
    );
    const overflowResult = buffer.buffer(overflowEvent);

    t.equal(overflowResult, false, 'buffer returns false on overflow');
    t.equal(buffer.size(), capacity, 'size stays at capacity');
    t.equal(logger.warns.length, 1, 'one warning emitted on overflow');
    t.equal(
      logger.warns[0].msg,
      CDC_LIFECYCLE_LOG_MSG.EVENT_DROPPED_OVERFLOW,
      'warning uses correct log message constant',
    );

    // Replay and verify oldest was dropped, overflow event is present
    const replayed = [];
    await buffer.replay((e) => {
      replayed.push(e);
    });

    t.equal(replayed.length, capacity, 'replayed count equals capacity');

    // First event (node-0) should be dropped; events 1..4 + overflow remain
    const replayedIds = replayed.map((e) => e.data.node_id);
    t.equal(
      replayedIds.includes('node-0'),
      false,
      'oldest event (node-0) was dropped',
    );
    t.equal(
      replayedIds[replayedIds.length - 1],
      'node-overflow',
      'overflow event is the last replayed event',
    );
  });
});


/**
 * Unit Tests: CDCEventBuffer Sliding Window Methods
 *
 * Feature: cdc-sliding-window-catchup
 * Task 3.7
 * **Validates: Requirements 2.1, 3.3**
 */

/** Suite-local constants for sliding window tests. */
const SLIDING_WINDOW_CAPACITY = 4;
const BASE_TIMESTAMP = '2000000000000';
const TIMESTAMP_OFFSET_ONE = '2000000000001';
const TIMESTAMP_OFFSET_TWO = '2000000000002';
const TIMESTAMP_OFFSET_THREE = '2000000000003';
const TIMESTAMP_OFFSET_FOUR = '2000000000004';
const TIMESTAMP_OFFSET_FIVE = '2000000000005';
const PRE_SUBSCRIBER_BUFFER_CAPACITY = 10;

test('CDCEventBuffer sliding window unit tests', async (t) => {
  t.test(
    'recordDelivered() records events into the sliding window',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({
        capacity: PRE_SUBSCRIBER_BUFFER_CAPACITY,
        slidingWindowCapacity: SLIDING_WINDOW_CAPACITY,
        logger,
      });

      const event1 = createNodeEvent('sw-node-1', BASE_TIMESTAMP);
      const event2 = createNodeEvent('sw-node-2', TIMESTAMP_OFFSET_ONE);

      buffer.recordDelivered(event1);
      t.equal(
        buffer.recentEventsSize(), 1,
        'sliding window has 1 event after first record',
      );

      buffer.recordDelivered(event2);
      t.equal(
        buffer.recentEventsSize(), 2,
        'sliding window has 2 events after second record',
      );

      const recent = buffer.getRecentEvents();
      t.equal(recent.length, 2, 'getRecentEvents returns 2 events');
      t.equal(
        buildEventIdentity(recent[0]),
        buildEventIdentity(event1),
        'first recent event matches first recorded',
      );
      t.equal(
        buildEventIdentity(recent[1]),
        buildEventIdentity(event2),
        'second recent event matches second recorded',
      );
    },
  );

  t.test(
    'recordDelivered() evicts oldest when at capacity ' +
    '(circular array semantics)',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({
        capacity: PRE_SUBSCRIBER_BUFFER_CAPACITY,
        slidingWindowCapacity: SLIDING_WINDOW_CAPACITY,
        logger,
      });

      // Fill to capacity (4 events)
      const event1 = createNodeEvent('circ-1', BASE_TIMESTAMP);
      const event2 = createNodeEvent('circ-2', TIMESTAMP_OFFSET_ONE);
      const event3 = createNodeEvent('circ-3', TIMESTAMP_OFFSET_TWO);
      const event4 = createNodeEvent('circ-4', TIMESTAMP_OFFSET_THREE);
      buffer.recordDelivered(event1);
      buffer.recordDelivered(event2);
      buffer.recordDelivered(event3);
      buffer.recordDelivered(event4);

      t.equal(
        buffer.recentEventsSize(), SLIDING_WINDOW_CAPACITY,
        'sliding window at capacity',
      );

      // Record one more — should evict event1 (oldest)
      const event5 = createNodeEvent('circ-5', TIMESTAMP_OFFSET_FOUR);
      buffer.recordDelivered(event5);

      t.equal(
        buffer.recentEventsSize(), SLIDING_WINDOW_CAPACITY,
        'size stays at capacity after eviction',
      );

      const recent = buffer.getRecentEvents();
      const recentIds = recent.map((e) => e.data.node_id);
      t.equal(
        recentIds.includes('circ-1'), false,
        'oldest event (circ-1) was evicted',
      );
      t.same(
        recentIds,
        ['circ-2', 'circ-3', 'circ-4', 'circ-5'],
        'remaining events in insertion order after wrap',
      );

      // Record another — should evict event2
      const event6 = createNodeEvent('circ-6', TIMESTAMP_OFFSET_FIVE);
      buffer.recordDelivered(event6);

      const recent2 = buffer.getRecentEvents();
      const recentIds2 = recent2.map((e) => e.data.node_id);
      t.same(
        recentIds2,
        ['circ-3', 'circ-4', 'circ-5', 'circ-6'],
        'second eviction preserves insertion order',
      );
    },
  );

  t.test(
    'getRecentEvents() returns events in insertion order',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({
        capacity: PRE_SUBSCRIBER_BUFFER_CAPACITY,
        slidingWindowCapacity: SLIDING_WINDOW_CAPACITY,
        logger,
      });

      const event1 = createNodeEvent('order-a', BASE_TIMESTAMP);
      const event2 = createNodeEvent('order-b', TIMESTAMP_OFFSET_ONE);
      const event3 = createNodeEvent('order-c', TIMESTAMP_OFFSET_TWO);

      buffer.recordDelivered(event1);
      buffer.recordDelivered(event2);
      buffer.recordDelivered(event3);

      const recent = buffer.getRecentEvents();
      t.same(
        recent.map((e) => e.data.node_id),
        ['order-a', 'order-b', 'order-c'],
        'events returned in insertion order (not full)',
      );

      // Returns a copy, not a reference
      recent.push({fake: true});
      t.equal(
        buffer.recentEventsSize(), 3,
        'modifying returned array does not affect internal state',
      );
    },
  );

  t.test(
    'getRecentEvents() returns empty array when no events recorded',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({
        capacity: PRE_SUBSCRIBER_BUFFER_CAPACITY,
        slidingWindowCapacity: SLIDING_WINDOW_CAPACITY,
        logger,
      });

      const recent = buffer.getRecentEvents();
      t.same(recent, [], 'empty sliding window returns empty array');
      t.equal(recent.length, 0, 'returned array has length 0');
    },
  );

  t.test(
    'recentEventsSize() tracks count correctly',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({
        capacity: PRE_SUBSCRIBER_BUFFER_CAPACITY,
        slidingWindowCapacity: SLIDING_WINDOW_CAPACITY,
        logger,
      });

      t.equal(buffer.recentEventsSize(), 0, 'initial size is 0');

      buffer.recordDelivered(createNodeEvent('sz-1', BASE_TIMESTAMP));
      t.equal(buffer.recentEventsSize(), 1, 'size is 1 after one record');

      buffer.recordDelivered(createNodeEvent('sz-2', TIMESTAMP_OFFSET_ONE));
      t.equal(buffer.recentEventsSize(), 2, 'size is 2 after two records');

      buffer.recordDelivered(createNodeEvent('sz-3', TIMESTAMP_OFFSET_TWO));
      buffer.recordDelivered(createNodeEvent('sz-4', TIMESTAMP_OFFSET_THREE));
      t.equal(
        buffer.recentEventsSize(), SLIDING_WINDOW_CAPACITY,
        'size equals capacity when full',
      );

      // One more — size stays at capacity
      buffer.recordDelivered(createNodeEvent('sz-5', TIMESTAMP_OFFSET_FOUR));
      t.equal(
        buffer.recentEventsSize(), SLIDING_WINDOW_CAPACITY,
        'size stays at capacity after eviction',
      );
    },
  );

  t.test(
    'clear() also clears the sliding window',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({
        capacity: PRE_SUBSCRIBER_BUFFER_CAPACITY,
        slidingWindowCapacity: SLIDING_WINDOW_CAPACITY,
        logger,
      });

      // Add events to both pre-subscriber buffer and sliding window
      buffer.buffer(createNodeEvent('buf-1', BASE_TIMESTAMP));
      buffer.recordDelivered(createNodeEvent('sw-1', TIMESTAMP_OFFSET_ONE));
      buffer.recordDelivered(createNodeEvent('sw-2', TIMESTAMP_OFFSET_TWO));

      t.equal(buffer.size(), 1, 'pre-subscriber buffer has 1 event');
      t.equal(buffer.recentEventsSize(), 2, 'sliding window has 2 events');

      buffer.clear();

      t.equal(buffer.size(), 0, 'pre-subscriber buffer cleared');
      t.equal(buffer.recentEventsSize(), 0, 'sliding window cleared');
      t.same(
        buffer.getRecentEvents(), [],
        'getRecentEvents returns empty after clear',
      );
      t.equal(buffer.hasEvents(), false, 'hasEvents false after clear');
    },
  );

  t.test(
    'sliding window does not interfere with pre-subscriber buffer',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({
        capacity: PRE_SUBSCRIBER_BUFFER_CAPACITY,
        slidingWindowCapacity: SLIDING_WINDOW_CAPACITY,
        logger,
      });

      // Buffer events in pre-subscriber buffer
      const bufEvent1 = createNodeEvent('pre-1', BASE_TIMESTAMP);
      const bufEvent2 = createNodeEvent('pre-2', TIMESTAMP_OFFSET_ONE);
      buffer.buffer(bufEvent1);
      buffer.buffer(bufEvent2);

      // Record events in sliding window
      const swEvent1 = createNodeEvent('sw-a', TIMESTAMP_OFFSET_TWO);
      const swEvent2 = createNodeEvent('sw-b', TIMESTAMP_OFFSET_THREE);
      buffer.recordDelivered(swEvent1);
      buffer.recordDelivered(swEvent2);

      // Verify both operate independently
      t.equal(buffer.size(), 2, 'pre-subscriber buffer has 2 events');
      t.equal(buffer.recentEventsSize(), 2, 'sliding window has 2 events');

      // Replay pre-subscriber buffer — should not affect sliding window
      const replayed = [];
      const count = await buffer.replay((e) => replayed.push(e));
      t.equal(count, 2, 'replayed 2 events from pre-subscriber buffer');
      t.equal(buffer.size(), 0, 'pre-subscriber buffer cleared after replay');
      t.equal(
        buffer.recentEventsSize(), 2,
        'sliding window unchanged after pre-subscriber replay',
      );

      // Verify sliding window contents still correct
      const recent = buffer.getRecentEvents();
      t.same(
        recent.map((e) => e.data.node_id),
        ['sw-a', 'sw-b'],
        'sliding window events intact after buffer replay',
      );
    },
  );

  t.test(
    'recordDelivered is idempotent — same event twice does not ' +
    'corrupt state',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({
        capacity: PRE_SUBSCRIBER_BUFFER_CAPACITY,
        slidingWindowCapacity: SLIDING_WINDOW_CAPACITY,
        logger,
      });

      const event = createNodeEvent('idem-1', BASE_TIMESTAMP);

      buffer.recordDelivered(event);
      buffer.recordDelivered(event);

      t.equal(
        buffer.recentEventsSize(), 2,
        'both records stored (sliding window does not deduplicate)',
      );

      const recent = buffer.getRecentEvents();
      t.equal(
        buildEventIdentity(recent[0]),
        buildEventIdentity(recent[1]),
        'both entries have same identity',
      );

      // Verify circular eviction still works after duplicate records
      buffer.recordDelivered(createNodeEvent('idem-2', TIMESTAMP_OFFSET_ONE));
      buffer.recordDelivered(createNodeEvent('idem-3', TIMESTAMP_OFFSET_TWO));
      t.equal(
        buffer.recentEventsSize(), SLIDING_WINDOW_CAPACITY,
        'at capacity after filling remaining slots',
      );

      // One more evicts the first duplicate
      buffer.recordDelivered(
        createNodeEvent('idem-4', TIMESTAMP_OFFSET_THREE),
      );
      t.equal(
        buffer.recentEventsSize(), SLIDING_WINDOW_CAPACITY,
        'size stays at capacity',
      );

      const recentAfter = buffer.getRecentEvents();
      t.equal(
        recentAfter[0].data.node_id, 'idem-1',
        'second duplicate is now oldest',
      );
      t.equal(
        recentAfter[recentAfter.length - 1].data.node_id, 'idem-4',
        'newest event is last',
      );
    },
  );
});
