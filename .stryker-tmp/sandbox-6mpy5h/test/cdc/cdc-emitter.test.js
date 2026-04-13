/**
 * Unit tests for CDCEmitter.
 * Validates CDC event generation, subscriber management, and
 * error handling.
 * Requirements: 5.4, 5.5
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {CDCEmitter} from '../../src/cdc/cdc-emitter.js';
import {
  CDC_EMITTER_ERROR_MSG,
  CDC_EMITTER_FIELD,
  CDC_EMITTER_OPERATION,
} from '../../src/cdc/cdc-emitter-constants.js';

/**
 * Create a silent logger for tests.
 * @return {Object} Logger with no-op methods.
 */
function createSilentLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * Create a mock HLC clock that returns a fixed timestamp.
 * @param {string} [timestamp] - Fixed timestamp to return.
 * @return {Object} Mock HLC clock.
 */
function createMockHlcClock(timestamp = 'hlc-test-1234') {
  return {now: () => timestamp};
}

/**
 * Default options for constructing a CDCEmitter in tests.
 */
const DEFAULT_OPTIONS = Object.freeze({
  partitionId: 'partition-1',
  replicaId: 'replica-1',
  tableName: 'test_table',
});

/**
 * Create a CDCEmitter with default test options.
 * @param {Object} [overrides] - Option overrides.
 * @return {CDCEmitter} A configured CDCEmitter.
 */
function createEmitter(overrides = {}) {
  return new CDCEmitter({
    ...DEFAULT_OPTIONS,
    hlcClock: createMockHlcClock(),
    logger: createSilentLogger(),
    ...overrides,
  });
}

// ============================================================
// Constructor Validation Tests
// ============================================================

test('constructor throws when partitionId is missing', async (t) => {
  t.throws(
    () => new CDCEmitter({
      replicaId: 'r1',
      tableName: 't1',
      hlcClock: createMockHlcClock(),
    }),
    {message: CDC_EMITTER_ERROR_MSG.MISSING_PARTITION_ID},
    'should throw MISSING_PARTITION_ID',
  );
});

test('constructor throws when replicaId is missing', async (t) => {
  t.throws(
    () => new CDCEmitter({
      partitionId: 'p1',
      tableName: 't1',
      hlcClock: createMockHlcClock(),
    }),
    {message: CDC_EMITTER_ERROR_MSG.MISSING_REPLICA_ID},
    'should throw MISSING_REPLICA_ID',
  );
});

test('constructor throws when tableName is missing', async (t) => {
  t.throws(
    () => new CDCEmitter({
      partitionId: 'p1',
      replicaId: 'r1',
      hlcClock: createMockHlcClock(),
    }),
    {message: CDC_EMITTER_ERROR_MSG.MISSING_TABLE_NAME},
    'should throw MISSING_TABLE_NAME',
  );
});

test('constructor throws when hlcClock is missing', async (t) => {
  t.throws(
    () => new CDCEmitter({
      partitionId: 'p1',
      replicaId: 'r1',
      tableName: 't1',
    }),
    {message: CDC_EMITTER_ERROR_MSG.MISSING_HLC_CLOCK},
    'should throw MISSING_HLC_CLOCK',
  );
});

// ============================================================
// emit Tests (Requirement 5.5)
// ============================================================

test('emit delivers to all subscribers', async (t) => {
  const emitter = createEmitter();
  const received1 = [];
  const received2 = [];

  emitter.subscribe((event) => received1.push(event));
  emitter.subscribe((event) => received2.push(event));

  await emitter.emit(
    CDC_EMITTER_OPERATION.INSERT,
    {id: 1, name: 'test'},
  );

  t.equal(received1.length, 1, 'subscriber 1 should receive event');
  t.equal(received2.length, 1, 'subscriber 2 should receive event');

  t.equal(
    received1[0][CDC_EMITTER_FIELD.OPERATION],
    CDC_EMITTER_OPERATION.INSERT,
    'subscriber 1 should get correct operation',
  );
  t.equal(
    received2[0][CDC_EMITTER_FIELD.OPERATION],
    CDC_EMITTER_OPERATION.INSERT,
    'subscriber 2 should get correct operation',
  );

  emitter.shutdown();
});

test('emit with missing operation throws', async (t) => {
  const emitter = createEmitter();

  await t.rejects(
    () => emitter.emit(null, {id: 1}),
    {message: CDC_EMITTER_ERROR_MSG.MISSING_OPERATION},
    'should throw MISSING_OPERATION for null',
  );

  await t.rejects(
    () => emitter.emit(undefined, {id: 1}),
    {message: CDC_EMITTER_ERROR_MSG.MISSING_OPERATION},
    'should throw MISSING_OPERATION for undefined',
  );

  await t.rejects(
    () => emitter.emit('', {id: 1}),
    {message: CDC_EMITTER_ERROR_MSG.MISSING_OPERATION},
    'should throw MISSING_OPERATION for empty string',
  );

  emitter.shutdown();
});

test('emit with missing data throws', async (t) => {
  const emitter = createEmitter();

  await t.rejects(
    () => emitter.emit(CDC_EMITTER_OPERATION.INSERT, null),
    {message: CDC_EMITTER_ERROR_MSG.MISSING_DATA},
    'should throw MISSING_DATA for null',
  );

  await t.rejects(
    () => emitter.emit(CDC_EMITTER_OPERATION.INSERT, undefined),
    {message: CDC_EMITTER_ERROR_MSG.MISSING_DATA},
    'should throw MISSING_DATA for undefined',
  );

  emitter.shutdown();
});

test('emit generates event with all required fields', async (t) => {
  const timestamp = 'hlc-unique-ts';
  const emitter = createEmitter({
    hlcClock: createMockHlcClock(timestamp),
  });

  let capturedEvent = null;
  emitter.subscribe((event) => {
    capturedEvent = event;
  });

  const data = {id: 42, name: 'record'};
  await emitter.emit(CDC_EMITTER_OPERATION.UPDATE, data);

  t.equal(
    capturedEvent[CDC_EMITTER_FIELD.TABLE_NAME],
    DEFAULT_OPTIONS.tableName,
    'tableName should match constructor option',
  );
  t.equal(
    capturedEvent[CDC_EMITTER_FIELD.OPERATION],
    CDC_EMITTER_OPERATION.UPDATE,
    'operation should match emitted operation',
  );
  t.same(
    capturedEvent[CDC_EMITTER_FIELD.DATA],
    data,
    'data should match emitted data',
  );
  t.equal(
    capturedEvent[CDC_EMITTER_FIELD.TIMESTAMP],
    timestamp,
    'timestamp should come from hlcClock',
  );
  t.equal(
    capturedEvent[CDC_EMITTER_FIELD.SOURCE_PARTITION],
    DEFAULT_OPTIONS.partitionId,
    'sourcePartition should match constructor option',
  );
  t.equal(
    capturedEvent[CDC_EMITTER_FIELD.SOURCE_REPLICA],
    DEFAULT_OPTIONS.replicaId,
    'sourceReplica should match constructor option',
  );

  emitter.shutdown();
});

// ============================================================
// Subscriber Failure Isolation Tests
// ============================================================

test('subscriber failure does not block other subscribers',
  async (t) => {
    const emitter = createEmitter();
    const received = [];

    emitter.subscribe(() => {
      throw new Error('subscriber 1 failure');
    });
    emitter.subscribe((event) => received.push(event));

    await emitter.emit(
      CDC_EMITTER_OPERATION.DELETE,
      {id: 1},
    );

    t.equal(
      received.length, 1,
      'second subscriber should still receive event',
    );
    t.equal(
      received[0][CDC_EMITTER_FIELD.OPERATION],
      CDC_EMITTER_OPERATION.DELETE,
      'second subscriber should get correct operation',
    );

    emitter.shutdown();
  });

// ============================================================
// unsubscribe Tests
// ============================================================

test('unsubscribe removes subscriber', async (t) => {
  const emitter = createEmitter();
  const received = [];

  const subscriber = (event) => received.push(event);
  emitter.subscribe(subscriber);

  await emitter.emit(CDC_EMITTER_OPERATION.INSERT, {id: 1});
  t.equal(received.length, 1, 'should receive first event');

  emitter.unsubscribe(subscriber);

  await emitter.emit(CDC_EMITTER_OPERATION.INSERT, {id: 2});
  t.equal(
    received.length, 1,
    'should not receive event after unsubscribe',
  );

  emitter.shutdown();
});

test('unsubscribe of non-existent subscriber is safe', async (t) => {
  const emitter = createEmitter();
  const unknownSubscriber = () => {};

  emitter.unsubscribe(unknownSubscriber);

  t.pass('unsubscribing unknown subscriber should not throw');

  emitter.shutdown();
});

// ============================================================
// shutdown Tests
// ============================================================

test('shutdown clears all subscribers', async (t) => {
  const emitter = createEmitter();
  const received = [];

  emitter.subscribe((event) => received.push(event));
  emitter.subscribe((event) => received.push(event));

  emitter.shutdown();

  await emitter.emit(CDC_EMITTER_OPERATION.INSERT, {id: 1});
  t.equal(
    received.length, 0,
    'no subscribers should receive events after shutdown',
  );
});

// ============================================================
// emitFromSQL Tests
// ============================================================

test('emitFromSQL with INSERT SQL emits INSERT event', async (t) => {
  const emitter = createEmitter();
  let capturedEvent = null;

  emitter.subscribe((event) => {
    capturedEvent = event;
  });

  await emitter.emitFromSQL(
    'INSERT INTO test_table (id, name) VALUES (?, ?)',
    [1, 'test'],
    {lastInsertRowid: 1},
  );

  t.ok(capturedEvent, 'should emit an event');
  t.equal(
    capturedEvent[CDC_EMITTER_FIELD.OPERATION],
    CDC_EMITTER_OPERATION.INSERT,
    'operation should be INSERT',
  );

  emitter.shutdown();
});

test('emitFromSQL with SELECT SQL does not emit', async (t) => {
  const emitter = createEmitter();
  let eventCount = 0;

  emitter.subscribe(() => {
    eventCount++;
  });

  await emitter.emitFromSQL(
    'SELECT * FROM test_table WHERE id = ?',
    [1],
    {},
  );

  t.equal(eventCount, 0, 'should not emit for SELECT');

  emitter.shutdown();
});

// ============================================================
// Multiple Subscribers Tests
// ============================================================

test('multiple subscribers all receive the event', async (t) => {
  const emitter = createEmitter();
  const subscriberCount = 5;
  const receivedEvents = [];

  for (let i = 0; i < subscriberCount; i++) {
    emitter.subscribe((event) => receivedEvents.push(event));
  }

  await emitter.emit(
    CDC_EMITTER_OPERATION.INSERT,
    {id: 1, name: 'multi'},
  );

  t.equal(
    receivedEvents.length,
    subscriberCount,
    `all ${subscriberCount} subscribers should receive the event`,
  );

  for (const event of receivedEvents) {
    t.equal(
      event[CDC_EMITTER_FIELD.OPERATION],
      CDC_EMITTER_OPERATION.INSERT,
      'each subscriber should get correct operation',
    );
  }

  emitter.shutdown();
});
