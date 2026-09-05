import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {StorageCapacityAccountingService} from
  '../../src/rebalancer/storage-capacity-accounting-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const NOW_MS = 1_000;
const NODE_A = 'node-a';
const NODE_B = 'node-b';

function createServiceFixture(options = {}) {
  const timeSource = options.timeSource ||
    new VirtualTimeSource({startMs: NOW_MS});
  const rowsByTable = new Map([
    [TABLES.NODES, options.nodes || [{
      [COLUMN.NODE_ID]: NODE_A,
      [COLUMN.STORAGE_BUDGET_BYTES]: 1_000,
    }]],
    [TABLES.PARTITIONS, options.partitions || []],
    [TABLES.SERVICES, options.services || []],
    [TABLES.STORAGE_RESERVATIONS, options.reservations || []],
    [TABLES.REPLICA_OPERATIONS, options.operations || []],
  ]);
  const service = new StorageCapacityAccountingService({
    clearTimeoutFn: options.clearTimeoutFn,
    now: options.now,
    setTimeoutFn: options.setTimeoutFn,
    systemTableCache: {
      getAll: (tableName) => rowsByTable.get(tableName) || [],
    },
    timeSource,
  });
  return {rowsByTable, service, timeSource};
}

function createFixture({liveOperation = false} = {}) {
  const timeSource = new VirtualTimeSource({startMs: NOW_MS});
  const reservation = {
    [COLUMN.AMPLIFICATION_FACTOR]: 1,
    [COLUMN.ESTIMATED_BYTES]: 100,
    [COLUMN.EXPIRES_AT]: NOW_MS + 5,
    [COLUMN.OPERATION_ID]: liveOperation ? 'operation-a' : null,
    [COLUMN.RESERVATION_ID]: 'reservation-a',
    [COLUMN.STATUS]: 'active',
    [COLUMN.TARGET_NODE_ID]: NODE_A,
  };
  const operation = {
    [COLUMN.OPERATION_ID]: 'operation-a',
    [COLUMN.STATUS]: 'pending',
    type: 'ADD',
    workflow_step: 'pending',
  };
  const fixture = createServiceFixture({
    operations: liveOperation ? [operation] : [],
    reservations: [reservation],
    timeSource,
  });
  return {operation, reservation, ...fixture};
}

test('capacity semantic owner rotates at reservation expiry without a write',
  (t) => {
    const fixture = createFixture();
    const changes = [];
    fixture.service.subscribeCapacitySemanticChanges(
      (change) => changes.push(change),
    );
    const before = fixture.service.getCapacitySemanticIdentity(
      NODE_A,
      NOW_MS,
    );

    t.equal(before.projection.capacity.reservedBytes, 100,
      'the active reservation is counted before its owned deadline');
    t.equal(before.projection.nextSemanticChangeAtMs, NOW_MS + 5,
      'the projection exposes the exact next capacity transition');
    t.equal(fixture.timeSource.pendingTimerCount(), 1,
      'one coalesced capacity timer is armed');
    t.equal(changes.length, 1,
      'the first projection is an observable owner baseline');

    fixture.timeSource.advance(4);
    t.equal(changes.length, 1, 'no early capacity transition fires');
    fixture.timeSource.advance(1);

    const after = fixture.service.getCapacitySemanticIdentity(
      NODE_A,
      NOW_MS + 5,
    );
    t.equal(after.projection.capacity.reservedBytes, 0,
      'the reservation expires from capacity without a row write');
    t.equal(after.generation, before.generation + 1,
      'time-only capacity movement advances the semantic generation');
    t.equal(changes.length, 2, 'the owner emits exactly one expiry change');
    t.equal(fixture.timeSource.pendingTimerCount(), 0,
      'no timer remains after the final known deadline');

    fixture.service.shutdownCapacitySemanticProjection();
    fixture.timeSource.advance(100);
    t.equal(changes.length, 2, 'shutdown fences late capacity updates');
    t.end();
  });

test('a live operation owns post-expiry capacity until it becomes terminal',
  (t) => {
    const fixture = createFixture({liveOperation: true});
    const before = fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS);
    t.equal(before.projection.capacity.reservedBytes, 100,
      'a live operation keeps its reservation counted');
    t.equal(before.projection.nextSemanticChangeAtMs, null,
      'expiry is not a semantic deadline while the operation is live');
    t.equal(fixture.timeSource.pendingTimerCount(), 0,
      'no false expiry timer is armed for live work');

    fixture.timeSource.advance(5);
    fixture.operation[COLUMN.STATUS] = 'active';
    fixture.operation.workflow_step = 'active';
    fixture.service.recordCapacitySourceChange(
      TABLES.REPLICA_OPERATIONS,
      CDC_OPERATION.UPDATE,
      fixture.operation,
      fixture.timeSource.now(),
    );

    const after = fixture.service.getCapacitySemanticIdentity(
      NODE_A,
      fixture.timeSource.now(),
    );
    t.equal(after.projection.capacity.reservedBytes, 0,
      'the terminal operation releases the already-expired reservation');
    t.equal(after.generation, before.generation + 1,
      'the authoritative operation change advances capacity semantics once');
    fixture.service.shutdownCapacitySemanticProjection();
    t.end();
  });

test('capacity source changes preserve old/new attribution and cancel stale ' +
  'deadlines', (t) => {
  const reservation = {
    [COLUMN.AMPLIFICATION_FACTOR]: 1,
    [COLUMN.ESTIMATED_BYTES]: 100,
    [COLUMN.EXPIRES_AT]: NOW_MS + 5,
    [COLUMN.RESERVATION_ID]: 'reservation-a',
    [COLUMN.STATUS]: 'active',
    [COLUMN.TARGET_NODE_ID]: NODE_A,
  };
  const fixture = createServiceFixture({
    nodes: [{
      [COLUMN.NODE_ID]: NODE_A,
      [COLUMN.STORAGE_BUDGET_BYTES]: 1_000,
    }, {
      [COLUMN.NODE_ID]: NODE_B,
      [COLUMN.STORAGE_BUDGET_BYTES]: 1_000,
    }],
    reservations: [reservation],
  });
  fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS);
  fixture.service.getCapacitySemanticIdentity(NODE_B, NOW_MS);
  let projectionBuilds = 0;
  const build = fixture.service.buildCapacitySemanticProjection;
  fixture.service.buildCapacitySemanticProjection = function(...args) {
    projectionBuilds += 1;
    return build.apply(this, args);
  };
  reservation[COLUMN.TARGET_NODE_ID] = NODE_B;
  fixture.service.recordCapacitySourceChange(
    TABLES.STORAGE_RESERVATIONS,
    CDC_OPERATION.UPDATE,
    reservation,
    NOW_MS,
  );
  t.equal(projectionBuilds, 2,
    'a reservation move reprojects exactly its old and new target nodes');
  t.equal(fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS)
    .projection.capacity.reservedBytes, 0);
  t.equal(fixture.service.getCapacitySemanticIdentity(NODE_B, NOW_MS)
    .projection.capacity.reservedBytes, 100);

  projectionBuilds = 0;
  fixture.rowsByTable.get(TABLES.STORAGE_RESERVATIONS).splice(0, 1);
  fixture.service.recordCapacitySourceChange(
    TABLES.STORAGE_RESERVATIONS,
    CDC_OPERATION.DELETE,
    reservation,
    NOW_MS,
  );
  t.equal(projectionBuilds, 1,
    'delete reprojects only the evicted reservation target');
  t.equal(fixture.timeSource.pendingTimerCount(), 0,
    'moving then deleting the reservation cancels its old timer');
  fixture.service.shutdownCapacitySemanticProjection();
  t.end();
});

test('a live operation cancels expiry without rotating unchanged capacity',
  (t) => {
    const fixture = createFixture();
    const before = fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS);
    const operation = {
      [COLUMN.OPERATION_ID]: 'operation-a',
      [COLUMN.STATUS]: 'pending',
      type: 'ADD',
      workflow_step: 'pending',
    };
    fixture.reservation[COLUMN.OPERATION_ID] = 'operation-a';
    fixture.service.recordCapacitySourceChange(
      TABLES.STORAGE_RESERVATIONS,
      CDC_OPERATION.UPDATE,
      fixture.reservation,
      NOW_MS,
    );
    fixture.rowsByTable.get(TABLES.REPLICA_OPERATIONS).push(operation);
    fixture.service.recordCapacitySourceChange(
      TABLES.REPLICA_OPERATIONS,
      CDC_OPERATION.INSERT,
      operation,
      NOW_MS,
    );
    const guarded = fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS);
    t.equal(guarded.generation, before.generation,
      'adding a live operation does not rotate unchanged byte semantics');
    t.equal(guarded.projection.nextSemanticChangeAtMs, null,
      'but it removes the no-longer-real expiry deadline');
    t.equal(fixture.timeSource.pendingTimerCount(), 0,
      'the coalesced expiry timer is cancelled');
    fixture.timeSource.advance(5);
    t.equal(fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS + 5)
      .projection.capacity.reservedBytes, 100,
    'the live operation keeps capacity reserved past the former deadline');
    fixture.service.shutdownCapacitySemanticProjection();
    t.end();
  });

test('partition and service changes reproject only their joined old/new nodes',
  (t) => {
    const partitions = [{
      [COLUMN.PARTITION_ID]: 'partition-a',
      [COLUMN.SIZE_BYTES]: 100_000_000,
    }, {
      [COLUMN.PARTITION_ID]: 'partition-b',
      [COLUMN.SIZE_BYTES]: 200_000_000,
    }];
    const services = [{
      [COLUMN.NODE_ID]: NODE_A,
      [COLUMN.PARTITION_ID]: 'partition-a',
      [COLUMN.SERVICE_ID]: 'service-a',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    }, {
      [COLUMN.NODE_ID]: NODE_B,
      [COLUMN.PARTITION_ID]: 'partition-b',
      [COLUMN.SERVICE_ID]: 'service-b',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    }];
    const fixture = createServiceFixture({
      nodes: [NODE_A, NODE_B].map((nodeId) => ({
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.STORAGE_BUDGET_BYTES]: 1_000_000_000,
      })),
      partitions,
      services,
    });
    const beforeA = fixture.service.getCapacitySemanticIdentity(NODE_A);
    const beforeB = fixture.service.getCapacitySemanticIdentity(NODE_B);
    let projectionBuilds = 0;
    const build = fixture.service.buildCapacitySemanticProjection;
    fixture.service.buildCapacitySemanticProjection = function(...args) {
      projectionBuilds++;
      return build.apply(this, args);
    };

    partitions[0][COLUMN.SIZE_BYTES] = 400_000_000;
    fixture.service.recordCapacitySourceChange(
      TABLES.PARTITIONS,
      CDC_OPERATION.UPDATE,
      partitions[0],
      NOW_MS,
    );
    t.equal(projectionBuilds, 1,
      'a partition-size change reprojects only its hosting node');
    t.equal(fixture.service.getCapacitySemanticIdentity(NODE_A).generation,
      beforeA.generation + 1,
      'the hosting node capacity identity advances');
    t.equal(fixture.service.getCapacitySemanticIdentity(NODE_B).generation,
      beforeB.generation,
      'an unrelated partition host keeps its identity');

    projectionBuilds = 0;
    services[0][COLUMN.NODE_ID] = NODE_B;
    fixture.service.recordCapacitySourceChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPDATE,
      services[0],
      NOW_MS,
    );
    t.equal(projectionBuilds, 2,
      'a service move reprojects exactly its old and new nodes');
    fixture.service.shutdownCapacitySemanticProjection();
    t.end();
  });

test('co-due expiry delivery is reentrant-safe and progresses before observer ' +
  'failure escapes', (t) => {
  const reservations = [NODE_A, NODE_B].map((nodeId) => ({
    [COLUMN.AMPLIFICATION_FACTOR]: 1,
    [COLUMN.ESTIMATED_BYTES]: 100,
    [COLUMN.EXPIRES_AT]: NOW_MS + 5,
    [COLUMN.RESERVATION_ID]: `reservation-${nodeId}`,
    [COLUMN.STATUS]: 'active',
    [COLUMN.TARGET_NODE_ID]: nodeId,
  }));
  const fixture = createServiceFixture({
    nodes: [NODE_A, NODE_B].map((nodeId) => ({
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STORAGE_BUDGET_BYTES]: 1_000,
    })),
    reservations,
  });
  const delivered = [];
  fixture.service.subscribeCapacitySemanticChanges((change) => {
    if (change.previousProjection && change.nodeId === NODE_A) {
      fixture.service.getCapacitySemanticIdentity(NODE_B, NOW_MS + 5);
      throw new Error('observer failed');
    }
  });
  fixture.service.subscribeCapacitySemanticChanges((change) => {
    if (change.previousProjection) delivered.push(change.nodeId);
  });
  const beforeA = fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS);
  const beforeB = fixture.service.getCapacitySemanticIdentity(NODE_B, NOW_MS);
  t.equal(fixture.timeSource.pendingTimerCount(), 1,
    'co-due nodes share one timer');
  t.throws(() => fixture.timeSource.advance(5), /observer failed/,
    'observer failure is reported after owner progress');
  t.same(delivered, [NODE_A, NODE_B],
    'reentrant change delivery remains ordered and reaches every listener');
  t.equal(fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS + 5)
    .generation, beforeA.generation + 1);
  t.equal(fixture.service.getCapacitySemanticIdentity(NODE_B, NOW_MS + 5)
    .generation, beforeB.generation + 1);
  t.equal(fixture.timeSource.pendingTimerCount(), 0,
    'timer rearming completes despite the observer failure');
  fixture.service.shutdownCapacitySemanticProjection();
  t.end();
});

test('stale and synchronously-fired timer callbacks cannot double-transition',
  (t) => {
    const clock = {value: NOW_MS};
    const callbacks = [];
    const cleared = [];
    let unrefCalls = 0;
    const reservation = {
      [COLUMN.AMPLIFICATION_FACTOR]: 1,
      [COLUMN.ESTIMATED_BYTES]: 100,
      [COLUMN.EXPIRES_AT]: NOW_MS + 5,
      [COLUMN.RESERVATION_ID]: 'reservation-a',
      [COLUMN.STATUS]: 'active',
      [COLUMN.TARGET_NODE_ID]: NODE_A,
    };
    const fixture = createServiceFixture({
      clearTimeoutFn: (handle) => cleared.push(handle.id),
      now: () => clock.value,
      reservations: [reservation],
      setTimeoutFn: (callback) => {
        callbacks.push(callback);
        callback();
        return {
          id: callbacks.length,
          unref: () => {
            unrefCalls += 1;
            throw new Error('unref unavailable');
          },
        };
      },
    });
    const before = fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS);
    t.equal(before.projection.capacity.reservedBytes, 100);
    t.equal(callbacks.length, 1,
      'a premature synchronous callback is fenced without recursive rearm');
    t.equal(unrefCalls, 1, 'optional unref is attempted once and contained');

    reservation[COLUMN.EXPIRES_AT] = NOW_MS + 10;
    fixture.service.recordCapacitySourceChange(
      TABLES.STORAGE_RESERVATIONS,
      CDC_OPERATION.UPDATE,
      reservation,
      NOW_MS,
    );
    t.equal(callbacks.length, 2, 'moving the deadline installs one new timer');
    callbacks[0]();
    t.equal(fixture.service.getCapacitySemanticIdentity(NODE_A, NOW_MS)
      .generation, before.generation,
    'the stale first callback cannot rotate capacity semantics');
    clock.value = NOW_MS + 10;
    callbacks[1]();
    const after = fixture.service.getCapacitySemanticIdentity(
      NODE_A,
      clock.value,
    );
    t.equal(after.generation, before.generation + 1,
      'the current callback transitions exactly once at the new deadline');
    callbacks[1]();
    t.equal(fixture.service.getCapacitySemanticIdentity(NODE_A, clock.value)
      .generation, after.generation,
    'a duplicate callback is fenced by timer revision');
    t.ok(cleared.length >= 1, 'the superseded timer handle is cleared');
    fixture.service.shutdownCapacitySemanticProjection();
    t.end();
  });
