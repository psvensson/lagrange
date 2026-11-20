/**
 * Tests for reservation lifecycle integration with RebalanceCoordinator.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 11.4, 12.3
 */

import Database from 'better-sqlite3';
import {generateCreateTableSQL, generateCreateIndexSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {REPLICA_OPERATIONS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA, SERVICES_SCHEMA,
  PARTITIONS_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  RESERVATION_REASON,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockControlPlaneReadinessService,
  createMockControlPlaneSystemTableGateway,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_DEFERRED_RESERVATION_ID = 'res-deferred';
const TEST_DEFERRED_OPERATION_ID = 'op-deferred';
const TEST_DEFERRED_PARTITION_ID = 'p-deferred';
const TEST_DEFERRED_TARGET_NODE_ID = 'node-deferred';
const TEST_DEFERRED_CONFIRMATION_STATE = 'deferred';
const TEST_DEFERRED_OPERATION_VISIBILITY = Object.freeze({
  operation: null,
  deferredOutcome: Object.freeze({
    confirmationState: TEST_DEFERRED_CONFIRMATION_STATE,
  }),
});

function initializeConfig(overrides = {}) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
      messageGroupReplicaOverheadBytes: 2,
      serviceReplicaOverheadBytes: 1,
      storageReservationTtlMs:
        STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS,
      ...overrides,
    },
  });
}

// Real schema and SQLite own every conditional mutation and affected-row count.
// These narrow row views are only seed/inspection conveniences for the tests.
function createTrackingSqlEngine(t) {
  const database = new Database(':memory:');
  for (const schema of [REPLICA_OPERATIONS_SCHEMA, STORAGE_RESERVATIONS_SCHEMA,
    SERVICES_SCHEMA, PARTITIONS_SCHEMA]) {
    database.exec(generateCreateTableSQL(schema));
    for (const sql of generateCreateIndexSQL(schema)) database.exec(sql);
  }
  t.teardown(() => database.close());
  const planner = new ControlPlaneSystemTableGateway();
  function rows(tableName, identityColumn) {
    return {
      get size() {
        return database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
      },
      values() {
        return database.prepare(`SELECT * FROM ${tableName}`).all().values();
      },
      get(identity) {
        return database.prepare(`SELECT * FROM ${tableName} WHERE ${identityColumn} = ?`)
          .get(identity);
      },
      set(identity, row) {
        if (row[identityColumn] !== identity) throw new Error('Fixture row identity mismatch');
        const {sql, params} = planner.buildSqlMutationPlan({operation: 'insert', tableName, row});
        database.prepare(sql).run(...params);
      },
      delete(identity) {
        return database.prepare(`DELETE FROM ${tableName} WHERE ${identityColumn} = ?`)
          .run(identity).changes > 0;
      },
    };
  }
  return {
    operations: rows('replica_operations', 'operation_id'),
    reservations: rows('storage_reservations', 'reservation_id'),
    async executeQuery(sql, params = []) {
      try {
        const statement = database.prepare(sql);
        return statement.reader ?
          {success: true, rows: statement.all(...params), rowSetComplete: true} :
          {success: true, changes: statement.run(...params).changes};
      } catch (error) {
        return {success: false, error: error.message, errorCode: error.code};
      }
    },
  };
}

function createMockAdmissionService(options = {}) {
  const admittedResult = Object.freeze({
    allowed: true,
    decisionType: 'admitted',
    blockingReasons: [],
    eligibleNodeIds: [],
    ineligibleNodes: [],
  });

  return {
    async checkAdd(_context) {
      return options.checkAddResult || admittedResult;
    },
    async checkReplace(_context) {
      return options.checkReplaceResult || admittedResult;
    },
  };
}

function createCoordinatorWithStorage(t, options = {}) {
  const nodeId = options.nodeId || 'test-node-1';
  const sqlEngine = options.sqlQueryEngine ||
    createTrackingSqlEngine(t);
  const cache = options.systemTableCache || createMockCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  const coordinator = new RebalanceCoordinator({
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway: createMockControlPlaneSystemTableGateway(sqlEngine),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache: cache, defaultRepairEligible: true,
    }),
    enableTimeouts: false,
    storageAccountingService: accounting,
    storageAdmissionService:
      options.storageAdmissionService || createMockAdmissionService(),
  });
  coordinator.initialize();
  t.teardown(() => coordinator.shutdown());
  return {coordinator, sqlEngine, accounting};
}


// --- Reservation creation with operation (Req 4.1) ---

test('createOperation - creates reservation for ADD operation',
  async (t) => {
    initializeConfig();
    const {coordinator, sqlEngine} =
      createCoordinatorWithStorage(t);

    const move = {
      type: OperationType.ADD,
      partitionId: 'p-1',
      nodeId: 'target-node',
      entityType: SERVICE_TYPE.PARTITION,
      entityId: 'p-1',
    };

    await coordinator.createOperation(move);

    t.equal(sqlEngine.reservations.size, 1,
      'one reservation created');

    const res = Array.from(sqlEngine.reservations.values())[0];
    t.equal(res.status, RESERVATION_STATUS.ACTIVE);
    t.equal(res.target_node_id, 'target-node');
    t.equal(res.partition_id, 'p-1');
    t.equal(res.reason_code, RESERVATION_REASON.ADD_REPLICA);
    t.equal(res.amplification_factor, 1);
    t.ok(res.estimated_bytes > 0, 'estimated bytes positive');
    t.ok(res.expires_at > res.created_at, 'expires after creation');
    t.end();
  });

test('createOperation - creates reservation for REPLACE operation',
  async (t) => {
    initializeConfig();
    const {coordinator, sqlEngine} =
      createCoordinatorWithStorage(t);

    const move = {
      type: OperationType.REPLACE,
      partitionId: 'p-1',
      nodeId: 'target-node',
      entityType: SERVICE_TYPE.PARTITION,
      entityId: 'p-1',
      replicaId: 'p-1-r1',
      sourceNodeId: 'source-node',
    };

    await coordinator.createOperation(move);

    t.equal(sqlEngine.reservations.size, 1);
    const res = Array.from(sqlEngine.reservations.values())[0];
    t.equal(res.reason_code, RESERVATION_REASON.REPLACE_REPLICA);
    t.equal(res.status, RESERVATION_STATUS.ACTIVE);
    t.end();
  });

test('createOperation uses isolated SQL sessions for operation and reservation writes',
  async (t) => {
    initializeConfig();
    const observedSessions = [];
    const baseEngine = createTrackingSqlEngine(t);
    const sqlEngine = {
      async executeQuery(sql, params, options = {}) {
        if (sql.includes('INSERT INTO replica_operations') ||
            sql.includes('INTO storage_reservations')) {
          observedSessions.push(options.sessionId || null);
          if (!options.sessionId || options.sessionId === 'default') {
            return {
              success: false,
              error: 'Transaction already active for this session',
            };
          }
        }
        return baseEngine.executeQuery(sql, params, options);
      },
    };
    const {coordinator} = createCoordinatorWithStorage(t, {sqlQueryEngine: sqlEngine});

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'partition-session-test',
        nodeId: 'target-node-1',
      });

      t.ok(operation, 'operation should be created');
      t.equal(
        observedSessions.length,
        2,
        'should execute isolated sessions for operation and reservation inserts',
      );
      t.not(
        observedSessions[0],
        'default',
        'operation insert should not reuse the default session',
      );
      t.not(
        observedSessions[1],
        'default',
        'reservation insert should not reuse the default session',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('createOperation - no reservation for REMOVE operation',
  async (t) => {
    initializeConfig();
    const {coordinator, sqlEngine} =
      createCoordinatorWithStorage(t);

    const move = {
      type: OperationType.REMOVE,
      partitionId: 'p-1',
      nodeId: 'target-node',
      entityType: SERVICE_TYPE.PARTITION,
      entityId: 'p-1',
      replicaId: 'p-1-r1',
    };

    await coordinator.createOperation(move);

    t.equal(sqlEngine.reservations.size, 0,
      'no reservation for REMOVE');
    t.end();
  });

test('createOperation - fails fast when accounting service is absent',
  async (t) => {
    initializeConfig();
    const sqlEngine = createTrackingSqlEngine(t);
    const coordinator = new RebalanceCoordinator({
      nodeId: 'test-node-1',
      systemTableCache: createMockCache(),
      cdcIntegrationService: createMockCdcService(),
      tablePolicyService: createMockPolicyService(),
      messageRouter: createMockMessageRouter(),
      sqlQueryEngine: sqlEngine,
      controlPlaneSystemTableGateway: createMockControlPlaneSystemTableGateway(sqlEngine),
      transactionCoordinator: createMockTransactionCoordinator(),
      controlPlaneReadinessService: createMockControlPlaneReadinessService({
        defaultRepairEligible: true,
      }),
      storageAdmissionService: createMockAdmissionService(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    const move = {
      type: OperationType.ADD,
      partitionId: 'p-1',
      nodeId: 'target-node',
    };

    await t.rejects(
      coordinator.createOperation(move),
      /storageAccountingService/,
    );

    t.equal(sqlEngine.reservations.size, 0,
      'no reservation is created when admission dependencies are missing');
    t.end();
  });

test('createOperation - emits reservationCreated event', async (t) => {
  initializeConfig();
  const {coordinator} = createCoordinatorWithStorage(t);
  let emitted = null;

  coordinator.on(
    REBALANCE_COORDINATOR_EVENT.RESERVATION_CREATED,
    (data) => {
      emitted = data;
    },
  );

  await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: 'p-1',
    nodeId: 'target-node',
  });

  t.ok(emitted, 'event emitted');
  t.ok(emitted.reservationId, 'has reservationId');
  t.ok(emitted.operationId, 'has operationId');
  t.equal(emitted.targetNodeId, 'target-node');
  t.ok(emitted.estimatedBytes > 0);
  t.end();
});

// --- Reservation release on terminal outcomes (Req 4.3) ---

test('completeOperation - releases reservation', async (t) => {
  initializeConfig();
  const {coordinator, sqlEngine} =
    createCoordinatorWithStorage(t);

  const op = await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: 'p-1',
    nodeId: 'target-node',
  });

  t.equal(sqlEngine.reservations.size, 1);
  const resBefore = Array.from(
    sqlEngine.reservations.values(),
  )[0];
  t.equal(resBefore.status, RESERVATION_STATUS.ACTIVE);

  await coordinator.completeOperation(op);

  const resAfter = Array.from(
    sqlEngine.reservations.values(),
  )[0];
  t.equal(resAfter.status, RESERVATION_STATUS.RELEASED);
  t.ok(resAfter.released_at, 'released_at set');
  t.end();
});

test('releaseReservationForOperation - uses reservation_id keyed update',
  async (t) => {
    initializeConfig();
    const sqlEngine = createTrackingSqlEngine(t);
    const reservationUpdates = [];
    const originalExecuteQuery = sqlEngine.executeQuery;
    sqlEngine.executeQuery = async (sql, params) => {
      if (sql.includes('UPDATE storage_reservations')) {
        reservationUpdates.push({sql, params});
      }
      return originalExecuteQuery(sql, params);
    };
    const {coordinator} = createCoordinatorWithStorage(t, {
      sqlQueryEngine: sqlEngine,
    });
    const now = Date.now();
    const operationId = 'op-keyed-release';
    const reservationId = `res-${operationId}`;
    sqlEngine.reservations.set(reservationId, {
      reservation_id: reservationId,
      operation_id: operationId,
      entity_type: SERVICE_TYPE.PARTITION,
      entity_id: 'p-1',
      partition_id: 'p-1',
      target_node_id: 'target-node',
      estimated_bytes: NUM.HUNDRED,
      amplification_factor: 1,
      status: RESERVATION_STATUS.ACTIVE,
      reason_code: RESERVATION_REASON.ADD_REPLICA,
      created_at: now,
      updated_at: now,
      expires_at: now + NUM.THOUSAND,
      released_at: null,
    });

    await coordinator.releaseReservationForOperation({
      operationId,
      type: OperationType.ADD,
      partitionId: 'p-1',
      targetNodeId: 'target-node',
      entityType: SERVICE_TYPE.PARTITION,
      entityId: 'p-1',
    });

    t.ok(reservationUpdates.length > 0,
      'reservation release should issue at least one reservation update');
    for (const call of reservationUpdates) {
      t.equal(call.params[3], reservationId,
        'reservation release update must be keyed by reservation_id');
    }
    t.end();
  });

test('failOperation - releases reservation', async (t) => {
  initializeConfig();
  const {coordinator, sqlEngine} =
    createCoordinatorWithStorage(t);

  const op = await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: 'p-1',
    nodeId: 'target-node',
  });

  await coordinator.failOperation(op, 'test failure');

  const res = Array.from(sqlEngine.reservations.values())[0];
  t.equal(res.status, RESERVATION_STATUS.RELEASED);
  t.ok(res.released_at, 'released_at set');
  t.end();
});

test('completeOperation - emits reservationReleased event',
  async (t) => {
    initializeConfig();
    const {coordinator} = createCoordinatorWithStorage(t);
    let emitted = null;

    const op = await coordinator.createOperation({
      type: OperationType.ADD,
      partitionId: 'p-1',
      nodeId: 'target-node',
    });

    coordinator.on(
      REBALANCE_COORDINATOR_EVENT.RESERVATION_RELEASED,
      (data) => {
        emitted = data;
      },
    );

    await coordinator.completeOperation(op);

    t.ok(emitted, 'event emitted');
    t.equal(emitted.operationId, op.operationId);
    t.end();
  });

test('failOperation - no release for REMOVE operation', async (t) => {
  initializeConfig();
  const {coordinator, sqlEngine} =
    createCoordinatorWithStorage(t);

  const op = await coordinator.createOperation({
    type: OperationType.REMOVE,
    partitionId: 'p-1',
    nodeId: 'target-node',
    replicaId: 'p-1-r1',
  });

  // No reservation was created
  t.equal(sqlEngine.reservations.size, 0);

  // failOperation should not error even without reservation
  await coordinator.failOperation(op, 'test failure');
  t.equal(sqlEngine.reservations.size, 0);
  t.end();
});

// --- Reservation TTL configuration (Req 4.5) ---

test('reservation expires_at uses configured TTL', async (t) => {
  const customTtl = 60000;
  initializeConfig({storageReservationTtlMs: customTtl});
  const {coordinator, sqlEngine} =
    createCoordinatorWithStorage(t);

  const before = Date.now();
  await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: 'p-1',
    nodeId: 'target-node',
  });
  const after = Date.now();

  const res = Array.from(sqlEngine.reservations.values())[0];
  t.ok(res.expires_at >= before + customTtl);
  t.ok(res.expires_at <= after + customTtl);
  t.end();
});

// --- Reconciliation (Req 4.4, 12.3) ---

test('reconcileReservations - expires stale reservations',
  async (t) => {
    initializeConfig();
    const sqlEngine = createTrackingSqlEngine(t);

    // Manually insert an expired reservation
    const pastTime = Date.now() - NUM.THOUSAND;
    sqlEngine.reservations.set('res-stale', {
      reservation_id: 'res-stale',
      operation_id: 'op-stale',
      entity_type: SERVICE_TYPE.PARTITION,
      entity_id: 'p-1',
      partition_id: 'p-1',
      target_node_id: 'node-1',
      estimated_bytes: NUM.HUNDRED,
      amplification_factor: 1,
      status: RESERVATION_STATUS.ACTIVE,
      reason_code: RESERVATION_REASON.ADD_REPLICA,
      created_at: pastTime - NUM.THOUSAND,
      updated_at: pastTime - NUM.THOUSAND,
      expires_at: pastTime,
      released_at: null,
    });

    const {coordinator} = createCoordinatorWithStorage(t, {
      sqlQueryEngine: sqlEngine,
    });

    const result = await coordinator.reconcileReservations();

    t.equal(result.expired, 1);
    const res = sqlEngine.reservations.get('res-stale');
    t.equal(res.status, RESERVATION_STATUS.EXPIRED);
    t.end();
  });

test('reconcileReservations - releases orphan reservations',
  async (t) => {
    initializeConfig();
    const sqlEngine = createTrackingSqlEngine(t);

    // Insert an active reservation whose operation is terminal
    sqlEngine.reservations.set('res-orphan', {
      reservation_id: 'res-orphan',
      operation_id: 'op-done',
      entity_type: SERVICE_TYPE.PARTITION,
      entity_id: 'p-1',
      partition_id: 'p-1',
      target_node_id: 'node-1',
      estimated_bytes: NUM.HUNDRED,
      amplification_factor: 1,
      status: RESERVATION_STATUS.ACTIVE,
      reason_code: RESERVATION_REASON.ADD_REPLICA,
      created_at: Date.now(),
      updated_at: Date.now(),
      expires_at: Date.now() + NUM.THIRTY_THOUSAND,
      released_at: null,
    });

    // Insert a terminal operation
    sqlEngine.operations.set('op-done', {
      operation_id: 'op-done',
      type: OperationType.ADD,
      source_node_id: 'test-node-1',
      target_node_id: 'node-1',
      created_at: 1,
      updated_at: 2,
      completed_at: 2,
      steps_history: '[]',
      partition_id: 'p-1',
      entity_type: 'partition',
      entity_id: 'p-1',
      status: 'active',
      workflow_step: WORKFLOW_STEP.ACTIVE,
    });

    const {coordinator} = createCoordinatorWithStorage(t, {
      sqlQueryEngine: sqlEngine,
    });

    const result = await coordinator.reconcileReservations();

    t.equal(result.orphansReleased, 1);
    const res = sqlEngine.reservations.get('res-orphan');
    t.equal(res.status, RESERVATION_STATUS.RELEASED);
    t.end();
  });

test('reconcileReservations - skips non-terminal active reservations',
  async (t) => {
    initializeConfig();
    const sqlEngine = createTrackingSqlEngine(t);

    // Insert an active reservation with in-flight operation
    sqlEngine.reservations.set('res-inflight', {
      reservation_id: 'res-inflight',
      operation_id: 'op-inflight',
      entity_type: SERVICE_TYPE.PARTITION,
      entity_id: 'p-1',
      partition_id: 'p-1',
      target_node_id: 'node-1',
      estimated_bytes: NUM.HUNDRED,
      amplification_factor: 1,
      status: RESERVATION_STATUS.ACTIVE,
      reason_code: RESERVATION_REASON.ADD_REPLICA,
      created_at: Date.now(),
      updated_at: Date.now(),
      expires_at: Date.now() + NUM.THIRTY_THOUSAND,
      released_at: null,
    });

    // Insert a non-terminal operation
    sqlEngine.operations.set('op-inflight', {
      operation_id: 'op-inflight',
      type: OperationType.ADD,
      source_node_id: 'test-node-1',
      target_node_id: 'node-1',
      created_at: 1,
      updated_at: 2,
      completed_at: null,
      steps_history: '[]',
      partition_id: 'p-1',
      entity_type: 'partition',
      entity_id: 'p-1',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
    });

    const {coordinator} = createCoordinatorWithStorage(t, {
      sqlQueryEngine: sqlEngine,
    });

    const result = await coordinator.reconcileReservations();

    t.equal(result.orphansReleased, 0);
    const res = sqlEngine.reservations.get('res-inflight');
    t.equal(res.status, RESERVATION_STATUS.ACTIVE,
      'reservation stays active');
    t.end();
  });

test('reconcileReservations - skips orphan release while operation visibility ' +
  'is deferred', async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine(t);

  sqlEngine.reservations.set(TEST_DEFERRED_RESERVATION_ID, {
    reservation_id: TEST_DEFERRED_RESERVATION_ID,
    operation_id: TEST_DEFERRED_OPERATION_ID,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_DEFERRED_PARTITION_ID,
    partition_id: TEST_DEFERRED_PARTITION_ID,
    target_node_id: TEST_DEFERRED_TARGET_NODE_ID,
    estimated_bytes: NUM.HUNDRED,
    amplification_factor: 1,
    status: RESERVATION_STATUS.ACTIVE,
    reason_code: RESERVATION_REASON.ADD_REPLICA,
    created_at: Date.now(),
    updated_at: Date.now(),
    expires_at: Date.now() + NUM.THIRTY_THOUSAND,
    released_at: null,
  });

  const {coordinator} = createCoordinatorWithStorage(t, {
    sqlQueryEngine: sqlEngine,
  });
  coordinator.repository.queryOperationById = async () => null;
  coordinator.repository.getOperationByIdVisibilityObservation = async () =>
    TEST_DEFERRED_OPERATION_VISIBILITY;

  const result = await coordinator.reconcileReservations();

  t.equal(result.orphansReleased, 0);
  const reservation = sqlEngine.reservations.get(TEST_DEFERRED_RESERVATION_ID);
  t.equal(
    reservation.status,
    RESERVATION_STATUS.ACTIVE,
    'reservation stays active while owner visibility is deferred',
  );
  t.end();
});

test('reconcileReservations - works without accounting service',
  async (t) => {
    initializeConfig();
    const coordinator = new RebalanceCoordinator({
      nodeId: 'test-node-1',
      systemTableCache: createMockCache(),
      cdcIntegrationService: createMockCdcService(),
      tablePolicyService: createMockPolicyService(),
      messageRouter: createMockMessageRouter(),
      sqlQueryEngine: createTrackingSqlEngine(t),
      transactionCoordinator: createMockTransactionCoordinator(),
      controlPlaneReadinessService: createMockControlPlaneReadinessService({
        defaultRepairEligible: true,
      }),
      storageAdmissionService: createMockAdmissionService(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    const result = await coordinator.reconcileReservations();
    t.equal(result.expired, 0);
    t.equal(result.orphansReleased, 0);
    t.end();
  });

test('reconcileReservations - emits reconciled event', async (t) => {
  initializeConfig();
  const {coordinator} = createCoordinatorWithStorage(t);
  let emitted = null;

  coordinator.on(
    REBALANCE_COORDINATOR_EVENT.RESERVATION_RECONCILED,
    (data) => {
      emitted = data;
    },
  );

  await coordinator.reconcileReservations();

  t.ok(emitted, 'event emitted');
  t.equal(typeof emitted.expired, 'number');
  t.equal(typeof emitted.orphansReleased, 'number');
  t.end();
});

// --- Recovery integration (Req 4.4, 12.3) ---

test('handleRecovery - reconciles reservations after operations',
  async (t) => {
    initializeConfig();
    const sqlEngine = createTrackingSqlEngine(t);

    // Insert orphan reservation with terminal operation
    sqlEngine.reservations.set('res-recovery', {
      reservation_id: 'res-recovery',
      operation_id: 'op-failed',
      entity_type: SERVICE_TYPE.PARTITION,
      entity_id: 'p-1',
      partition_id: 'p-1',
      target_node_id: 'node-1',
      estimated_bytes: NUM.HUNDRED,
      amplification_factor: 1,
      status: RESERVATION_STATUS.ACTIVE,
      reason_code: RESERVATION_REASON.ADD_REPLICA,
      created_at: Date.now(),
      updated_at: Date.now(),
      expires_at: Date.now() + NUM.THIRTY_THOUSAND,
      released_at: null,
    });

    // Terminal operation
    sqlEngine.operations.set('op-failed', {
      operation_id: 'op-failed',
      type: OperationType.ADD,
      source_node_id: 'test-node-1',
      target_node_id: 'node-1',
      created_at: 1,
      updated_at: 2,
      completed_at: 2,
      steps_history: '[]',
      partition_id: 'p-1',
      entity_type: 'partition',
      entity_id: 'p-1',
      status: 'failed',
      workflow_step: WORKFLOW_STEP.FAILED,
    });

    const {coordinator} = createCoordinatorWithStorage(t, {
      sqlQueryEngine: sqlEngine,
    });

    const result = await coordinator.handleRecovery();

    t.equal(result.reservationsOrphansReleased, 1);
    const res = sqlEngine.reservations.get('res-recovery');
    t.equal(res.status, RESERVATION_STATUS.RELEASED);
    t.end();
  });

// --- Stats tracking ---

test('stats track reservation lifecycle counts', async (t) => {
  initializeConfig();
  const {coordinator} = createCoordinatorWithStorage(t);

  const op = await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: 'p-1',
    nodeId: 'target-node',
  });

  t.equal(coordinator.stats.reservationsCreated, 1);
  t.equal(coordinator.stats.reservationsReleased, 0);

  await coordinator.completeOperation(op);

  t.equal(coordinator.stats.reservationsReleased, 1);
  t.end();
});

// --- Reservation ID format ---

test('reservation ID is derived from operation ID', async (t) => {
  initializeConfig();
  const {coordinator, sqlEngine} =
    createCoordinatorWithStorage(t);

  const op = await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: 'p-1',
    nodeId: 'target-node',
  });

  const res = Array.from(sqlEngine.reservations.values())[0];
  t.equal(res.reservation_id, `res-${op.operationId}`);
  t.equal(res.operation_id, op.operationId);
  t.end();
});

// --- Real size_bytes admission witness (audit findings 2+16) ---

function createSizedPartitionCoordinator(t, options = {}) {
  const admissionCalls = [];
  const sizedPartitionId = 'p-sized';
  const storageAdmissionService = options.storageAdmissionService || {
    async checkAdd(context) {
      admissionCalls.push(context);
      return {allowed: true, decisionType: 'admitted'};
    },
    async checkReplace(context) {
      admissionCalls.push(context);
      return {allowed: true, decisionType: 'admitted'};
    },
  };
  const {coordinator, sqlEngine} = createCoordinatorWithStorage(t, {
    systemTableCache: createMockCache({
      partitions: [
        {
          partition_id: sizedPartitionId,
          size_bytes: options.partitionSizeBytes,
        },
      ],
    }),
    storageAdmissionService,
  });
  return {coordinator, sqlEngine, admissionCalls, sizedPartitionId};
}

function createSizedPartitionAdd(coordinator, partitionId) {
  return coordinator.createOperation({
    type: OperationType.ADD,
    partitionId,
    nodeId: 'target-node',
    entityType: SERVICE_TYPE.PARTITION,
    entityId: partitionId,
  });
}

test('createOperation - reservation witness carries the real partition ' +
  'size_bytes estimate', async (t) => {
  initializeConfig();
  const partitionSizeBytes = NUM.BYTES_PER_MIB * 50;
  const {coordinator, sqlEngine, sizedPartitionId} =
    createSizedPartitionCoordinator(t, {partitionSizeBytes});

  await createSizedPartitionAdd(coordinator, sizedPartitionId);

  t.equal(sqlEngine.reservations.size, 1);
  const res = Array.from(sqlEngine.reservations.values())[0];
  const expectedEstimate = Math.ceil(
    Math.max(partitionSizeBytes, NUM.TEN) + NUM.FIVE,
  );
  t.equal(
    res.estimated_bytes,
    expectedEstimate,
    'estimated_bytes must reflect the real size_bytes, not the zero ' +
      'placeholder floor',
  );
  t.end();
});

test('createOperation - reservation estimate equals the admission-time ' +
  'estimate', async (t) => {
  initializeConfig();
  const {coordinator, sqlEngine, admissionCalls, sizedPartitionId} =
    createSizedPartitionCoordinator(t, {
      partitionSizeBytes: NUM.BYTES_PER_MIB * 25,
    });

  await createSizedPartitionAdd(coordinator, sizedPartitionId);

  t.equal(admissionCalls.length, 1, 'admission evaluated at creation');
  const res = Array.from(sqlEngine.reservations.values())[0];
  t.equal(
    res.estimated_bytes,
    admissionCalls[0].estimatedBytes,
    'the durable reservation witness equals the admission-time estimate',
  );
  t.end();
});

test('reconcileReservations logs no-op sweeps at debug and mutations at info, ' +
  'while checkTimeouts throttles via resolveTimeoutCheckNowMs', async (t) => {
  initializeConfig();
  const {coordinator, sqlEngine} = createCoordinatorWithStorage(t);
  const captured = [];
  const origQuery = sqlEngine.executeQuery;
  let reservationReconciles = 0;
  sqlEngine.executeQuery = async (sql, params) => {
    if (sql.includes('FROM storage_reservations') &&
        sql.includes('expires_at <= ?')) {
      reservationReconciles += 1;
    }
    return origQuery(sql, params);
  };
  coordinator.logger = {
    info: (msg, meta) => captured.push({level: 'info', msg, meta}),
    debug: (msg, meta) => captured.push({level: 'debug', msg, meta}),
    warn: (msg, meta) => captured.push({level: 'warn', msg, meta}),
    error: (msg, meta) => captured.push({level: 'error', msg, meta}),
  };

  const noopResult = await coordinator.reconcileReservations();
  t.same(noopResult, {expired: 0, orphansReleased: 0});
  t.equal(
    captured.filter((entry) => entry.level === 'info').length,
    0,
    'no-op reconciliation emits zero info logs',
  );
  t.equal(
    captured.filter((entry) => entry.level === 'debug').length,
    2,
    'no-op start and completed logs downgrade to debug',
  );

  captured.length = 0;
  const op = await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: 'p-log-test',
    nodeId: 'target-node',
  });
  sqlEngine.operations.delete(op.operationId);
  captured.length = 0;
  const orphanResult = await coordinator.reconcileReservations();
  t.equal(orphanResult.orphansReleased, 1);
  t.equal(
    captured.some(
      (entry) => entry.level === 'debug' &&
        entry.msg === 'Starting storage reservation reconciliation',
    ),
    true,
    'reconcile start stays at debug even when work occurs',
  );
  t.equal(
    captured.some(
      (entry) => entry.level === 'info' &&
        entry.msg === 'Storage reservation reconciliation completed',
    ),
    true,
    'completed log upgrades to info when orphansReleased > 0',
  );

  await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: 'p-throttle',
    nodeId: 'target-node',
  });
  let fakeNowMs = 100_000;
  coordinator.workflowOwner.timeSource = {now: () => fakeNowMs};
  coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
  reservationReconciles = 0;
  await coordinator.checkTimeouts();
  t.equal(reservationReconciles, 1, 'first checkTimeouts invokes reconcile');

  fakeNowMs += 1000;
  await coordinator.checkTimeouts();
  fakeNowMs += 28_999;
  await coordinator.checkTimeouts();
  t.equal(
    reservationReconciles,
    1,
    'subsequent ticks < 30s throttle reconcile',
  );

  fakeNowMs += 1;
  await coordinator.checkTimeouts();
  t.equal(reservationReconciles, 2, 'checkTimeouts fires reconcile again at 30s');
  t.end();
});
