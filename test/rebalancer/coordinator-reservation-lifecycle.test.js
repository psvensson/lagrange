/**
 * Tests for reservation lifecycle integration with RebalanceCoordinator.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 11.4, 12.3
 */

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

/**
 * In-memory SQL engine that tracks both operations and reservations.
 */
function createTrackingSqlEngine() {
  const operations = new Map();
  const reservations = new Map();

  return {
    operations,
    reservations,
    executeQuery: async (sql, params) => {
      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          opId, type, partId, repId, targetClaimKey, srcNode, tgtNode,
          status, step, created, updated, completed, err, history,
          entityType, entityId,
        ] = params;
        operations.set(opId, {
          operation_id: opId, type, partition_id: partId,
          replica_id: repId, target_claim_key: targetClaimKey,
          source_node_id: srcNode,
          target_node_id: tgtNode, status, workflow_step: step,
          created_at: created, updated_at: updated,
          completed_at: completed, error_message: err,
          steps_history: history,
          entity_type: entityType, entity_id: entityId,
        });
        return {success: true, changes: 1};
      }

      if (sql.includes('INSERT INTO storage_reservations')) {
        const [resId, opId, eType, eId, partId, tgtNode,
          estBytes, ampFactor, status, reason,
          created, updated, expires] = params;
        reservations.set(resId, {
          reservation_id: resId, operation_id: opId,
          entity_type: eType, entity_id: eId,
          partition_id: partId, target_node_id: tgtNode,
          estimated_bytes: estBytes,
          amplification_factor: ampFactor,
          status, reason_code: reason,
          created_at: created, updated_at: updated,
          expires_at: expires, released_at: null,
        });
        return {success: true, changes: 1};
      }

      if (sql.includes('UPDATE storage_reservations')) {
        const [newStatus, updated, released, reservationIdOrOperationId,
          activeStatus] = params;
        let changes = 0;
        for (const [key, row] of reservations) {
          const matchesOperation = row.operation_id === reservationIdOrOperationId;
          const matchesReservation =
            row.reservation_id === reservationIdOrOperationId;
          const matchesIdentity = sql.includes('reservation_id = ?') ?
            matchesReservation :
            matchesOperation;
          if (matchesIdentity && row.status === activeStatus) {
            reservations.set(key, {
              ...row,
              status: newStatus,
              updated_at: updated,
              released_at: released,
            });
            changes++;
          }
        }
        return {success: true, changes};
      }

      if (sql.includes('SELECT * FROM storage_reservations WHERE operation_id = ?')) {
        const [opId, status] = params;
        const rows = Array.from(reservations.values())
          .filter((row) => row.operation_id === opId && row.status === status);
        return {success: true, rows};
      }

      if (sql.includes('SELECT * FROM storage_reservations WHERE status = ? AND expires_at <= ?')) {
        const [status, expiryThreshold] = params;
        const rows = Array.from(reservations.values())
          .filter((row) => row.status === status && row.expires_at <= expiryThreshold);
        return {success: true, rows};
      }

      if (sql.includes('UPDATE replica_operations')) {
        const [status, step, updated, completed, err,
          history, repId, opId] = params;
        const existing = operations.get(opId);
        if (existing) {
          operations.set(opId, {
            ...existing, status, workflow_step: step,
            updated_at: updated, completed_at: completed,
            error_message: err, steps_history: history,
            replica_id: repId,
          });
        }
        return {success: true};
      }

      if (sql.includes('SELECT * FROM storage_reservations')) {
        if (params.length > 0) {
          const [status] = params;
          const active = Array.from(reservations.values())
            .filter((r) => r.status === status);
          return {success: true, rows: active};
        }
        return {success: true, rows: Array.from(reservations.values())};
      }

      if (sql.includes('replica_operations')) {
        const allOps = Array.from(operations.values());
        if (sql.includes('partition_id = ?') &&
            sql.includes('target_node_id = ?')) {
          const [partId, tgtNode] = params;
          const matching = allOps.filter((op) =>
            op.partition_id === partId &&
            op.target_node_id === tgtNode &&
            !['active', 'removed', 'failed'].includes(op.status));
          return {success: true, rows: matching};
        }
        if (sql.includes('NOT IN') || sql.includes('status <>')) {
          const incomplete = allOps.filter((op) =>
            !['active', 'removed', 'failed'].includes(op.status));
          return {success: true, rows: incomplete};
        }
        if (sql.includes('operation_id = ?')) {
          const [opId] = params;
          const op = operations.get(opId);
          return {success: true, rows: op ? [op] : []};
        }
        return {success: true, rows: allOps};
      }

      return {success: true, rows: []};
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

function createCoordinatorWithStorage(options = {}) {
  const nodeId = options.nodeId || 'test-node-1';
  const sqlEngine = options.sqlQueryEngine ||
    createTrackingSqlEngine();
  const cache = options.systemTableCache || createMockCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  const coordinator = new RebalanceCoordinator({
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async (_tableName, sql, params = [], queryOptions = {}) =>
        sqlEngine.executeQuery(sql, params, queryOptions),
      readRows: async (_tableName, sql, params = [], queryOptions = {}) =>
        sqlEngine.executeQuery(sql, params, queryOptions),
      executeQuery: async (sql, params = [], queryOptions = {}) =>
        sqlEngine.executeQuery(sql, params, queryOptions),
    },
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache: cache,
    }),
    enableTimeouts: false,
    storageAccountingService: accounting,
    storageAdmissionService:
      options.storageAdmissionService || createMockAdmissionService(),
  });
  coordinator.initialize();
  const baseCreateOperation = coordinator.createOperation.bind(coordinator);
  coordinator.createOperation = async (move = {}) => {
    const normalizedMove = Object.hasOwn(move, 'emitOperationCreated') ?
      move :
      {
        ...move,
        emitOperationCreated: false,
      };
    return baseCreateOperation(normalizedMove);
  };
  return {coordinator, sqlEngine, accounting};
}


// --- Reservation creation with operation (Req 4.1) ---

test('createOperation - creates reservation for ADD operation',
  async (t) => {
    initializeConfig();
    const {coordinator, sqlEngine} =
      createCoordinatorWithStorage();

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
      createCoordinatorWithStorage();

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
    const baseEngine = createTrackingSqlEngine();
    const sqlEngine = {
      async executeQuery(sql, params, options = {}) {
        if (sql.includes('INSERT INTO replica_operations') ||
            sql.includes('INSERT INTO storage_reservations')) {
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
    const {coordinator} = createCoordinatorWithStorage({sqlQueryEngine: sqlEngine});

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
      createCoordinatorWithStorage();

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
    const sqlEngine = createTrackingSqlEngine();
    const coordinator = new RebalanceCoordinator({
      nodeId: 'test-node-1',
      systemTableCache: createMockCache(),
      cdcIntegrationService: createMockCdcService(),
      tablePolicyService: createMockPolicyService(),
      messageRouter: createMockMessageRouter(),
      sqlQueryEngine: sqlEngine,
      transactionCoordinator: createMockTransactionCoordinator(),
      controlPlaneReadinessService: createMockControlPlaneReadinessService(),
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
  const {coordinator} = createCoordinatorWithStorage();
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
    createCoordinatorWithStorage();

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
    const sqlEngine = createTrackingSqlEngine();
    const reservationUpdates = [];
    const originalExecuteQuery = sqlEngine.executeQuery;
    sqlEngine.executeQuery = async (sql, params) => {
      if (sql.includes('UPDATE storage_reservations')) {
        reservationUpdates.push({sql, params});
      }
      return originalExecuteQuery(sql, params);
    };
    const {coordinator} = createCoordinatorWithStorage({
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
    createCoordinatorWithStorage();

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
    const {coordinator} = createCoordinatorWithStorage();
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
    createCoordinatorWithStorage();

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
    createCoordinatorWithStorage();

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
    const sqlEngine = createTrackingSqlEngine();

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

    const {coordinator} = createCoordinatorWithStorage({
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
    const sqlEngine = createTrackingSqlEngine();

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
      partition_id: 'p-1',
      status: 'active',
      workflow_step: WORKFLOW_STEP.ACTIVE,
    });

    const {coordinator} = createCoordinatorWithStorage({
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
    const sqlEngine = createTrackingSqlEngine();

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
      partition_id: 'p-1',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
    });

    const {coordinator} = createCoordinatorWithStorage({
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
  const sqlEngine = createTrackingSqlEngine();

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

  const {coordinator} = createCoordinatorWithStorage({
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
      sqlQueryEngine: createTrackingSqlEngine(),
      transactionCoordinator: createMockTransactionCoordinator(),
      controlPlaneReadinessService: createMockControlPlaneReadinessService(),
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
  const {coordinator} = createCoordinatorWithStorage();
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
    const sqlEngine = createTrackingSqlEngine();

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
      partition_id: 'p-1',
      status: 'failed',
      workflow_step: WORKFLOW_STEP.FAILED,
    });

    const {coordinator} = createCoordinatorWithStorage({
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
  const {coordinator} = createCoordinatorWithStorage();

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
    createCoordinatorWithStorage();

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
