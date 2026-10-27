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

/**
 * Create a CDC event for a non-system table.
 * @param {string} id
 * @param {string} [timestamp]
 * @return {Object} CDC event
 */
function createUserTableEvent(id, timestamp = '1000000000000') {
  return {
    tableName: 'user_events',
    operation: CDC_OPERATION.INSERT,
    data: {id},
    timestamp,
    sourcePartition: 'partition-user-events-p1',
    sourceReplica: 'partition-user-events-p1-r1',
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

  t.test(
    'internal cache propagation tables keep only the latest buffered event ' +
    'per primary key',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({capacity: 10, logger});

      const staleNodeEvent = createNodeEvent('node-1', '1000000000001');
      const otherNodeEvent = createNodeEvent('node-2', '1000000000002');
      const latestNodeEvent = {
        ...createNodeEvent('node-1', '1000000000003'),
        operation: CDC_OPERATION.UPDATE,
        data: {node_id: 'node-1', status: 'ready'},
      };

      buffer.buffer(staleNodeEvent);
      buffer.buffer(otherNodeEvent);
      buffer.buffer(latestNodeEvent);

      t.equal(
        buffer.size(),
        2,
        'older buffered event for the same node is coalesced away',
      );

      const replayed = [];
      const count = await buffer.replay((event) => {
        replayed.push(event);
      });

      t.equal(count, 2, 'only the latest distinct rows are replayed');
      t.same(
        replayed.map((event) => event.data.node_id),
        ['node-2', 'node-1'],
        'latest event keeps its most recent position in the replay order',
      );
      t.equal(
        replayed[1].timestamp,
        latestNodeEvent.timestamp,
        'the newest event version wins for the coalesced row',
      );
      t.equal(
        replayed[1].operation,
        CDC_OPERATION.UPDATE,
        'the newest event operation is preserved',
      );
    },
  );

  t.test(
    'non-internal CDC tables do not coalesce repeated primary-key events',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({capacity: 10, logger});

      const firstEvent = createUserTableEvent('event-1', '1000000000001');
      const secondEvent = {
        ...createUserTableEvent('event-1', '1000000000002'),
        operation: CDC_OPERATION.UPDATE,
      };

      buffer.buffer(firstEvent);
      buffer.buffer(secondEvent);

      t.equal(
        buffer.size(),
        2,
        'user-table CDC retains every buffered event',
      );

      const replayed = [];
      await buffer.replay((event) => {
        replayed.push(event);
      });

      t.same(
        replayed.map((event) => event.timestamp),
        ['1000000000001', '1000000000002'],
        'user-table replay preserves both versions',
      );
    },
  );

  t.test(
    'failed replay preserves the coalesced latest tail for internal tables',
    async (t) => {
      const logger = createMockLogger();
      const buffer = new CDCEventBuffer({capacity: 10, logger});

      const otherNodeEvent = createNodeEvent('node-2', '1000000000001');
      const staleNodeEvent = createNodeEvent('node-1', '1000000000002');
      const latestNodeEvent = {
        ...createNodeEvent('node-1', '1000000000003'),
        operation: CDC_OPERATION.UPDATE,
      };

      buffer.buffer(otherNodeEvent);
      buffer.buffer(staleNodeEvent);
      buffer.buffer(latestNodeEvent);

      await t.rejects(
        buffer.replay(async () => {
          throw new Error('transient-replay-failure');
        }),
        /transient-replay-failure/,
        'replay should still surface subscriber failure',
      );

      t.equal(
        buffer.size(),
        2,
        'failed replay keeps only the latest coalesced tail in the buffer',
      );

      const replayed = [];
      await buffer.replay((event) => {
        replayed.push(event);
      });

      t.same(
        replayed.map((event) => event.timestamp),
        ['1000000000001', '1000000000003'],
        'replayed tail preserves the newest coalesced event',
      );
    },
  );

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

// The sliding-window ring tests were deleted with the ring (CDC decision D4, 2026-10-26).
