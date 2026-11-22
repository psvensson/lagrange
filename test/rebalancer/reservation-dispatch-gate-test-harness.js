import {TABLES} from '../../src/constants/index.js';
import {workflowFixtureHistory} from './operation-outcome-fixture.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM, WORKFLOW_STEP} from
  '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  RESERVATION_STATUS,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  createCoordinatorSqlStore,
  createFixtureSystemMutationPort,
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'reservation-gate-node';
const TEST_PARTITION_ID = 'p-gate';
const TEST_TARGET_NODE_ID = 'target-node';
const TEST_OPERATION_ID = 'op-gate';
const TEST_RESERVATION_ID = `res-${TEST_OPERATION_ID}`;

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

function insertReservationRow(reservations, params, options) {
  if (options.failReservationInsert === true) {
    return {
      success: false,
      error: 'injected storage_reservations constraint violation',
    };
  }
  const [resId, opId, eType, eId, partId, tgtNode,
    estBytes, ampFactor, status, reason,
    created, updated, expires] = params;
  reservations.set(resId, {
    reservation_id: resId, operation_id: opId,
    entity_type: eType, entity_id: eId,
    partition_id: partId, target_node_id: tgtNode,
    estimated_bytes: estBytes, amplification_factor: ampFactor,
    status, reason_code: reason, created_at: created, updated_at: updated,
    expires_at: expires, released_at: null,
  });
  return {success: true, changes: 1};
}

function updateReservationRows(reservations, sql, params) {
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

function selectReservationRows(reservations, sql, params) {
  if (sql.includes('WHERE reservation_id = ?')) {
    const row = reservations.get(params[0]);
    return {success: true, rows: row ? [row] : []};
  }
  if (sql.includes('WHERE operation_id = ?')) {
    const [opId, status] = params;
    const rows = Array.from(reservations.values())
      .filter((row) => row.operation_id === opId && row.status === status);
    return {success: true, rows};
  }
  if (params.length > 0) {
    const [status] = params;
    const active = Array.from(reservations.values())
      .filter((row) => row.status === status);
    return {success: true, rows: active};
  }
  return {success: true, rows: Array.from(reservations.values())};
}

function createTrackingSqlEngine(options = {}) {
  // The faulted reservation store is independent from the committed ledger.
  // Execute operation predicates, projection and change counts in SQLite.
  const operations = createCoordinatorSqlStore(options.systemTableCache || createMockCache());
  const reservations = new Map();
  return {
    getOperationRow(operationId) {
      const result = operations.execute(
        'SELECT * FROM replica_operations WHERE operation_id = ?', [operationId],
      );
      operations.suspend();
      return result.rows[0];
    },
    insertOperationRow(row) {
      const result = operations.submitMutation({
        operation: 'insert', tableName: TABLES.REPLICA_OPERATIONS, row,
      });
      operations.suspend();
      if (result.success !== true) {
        throw new Error(`reservation fixture operation seed failed: ${result.error}`);
      }
    },
    reservations,
    executeQuery: async (sql, params) => {
      if (sql.includes('INTO storage_reservations')) {
        const result = insertReservationRow(reservations, params, options);
        if (result.success === true &&
            options.reservationInsertChangeCount !== undefined) {
          result.changes = options.reservationInsertChangeCount;
        }
        return result;
      }
      if (sql.includes('UPDATE storage_reservations')) {
        return updateReservationRows(reservations, sql, params);
      }
      if (sql.includes('SELECT * FROM storage_reservations')) {
        return selectReservationRows(reservations, sql, params);
      }
      if (sql.includes(TABLES.REPLICA_OPERATIONS)) {
        const result = operations.execute(sql, params);
        operations.suspend();
        return result;
      }
      return {success: true, rows: [], rowSetComplete: true};
    },
  };
}

function createMockAdmissionService() {
  const admittedResult = Object.freeze({
    allowed: true,
    decisionType: 'admitted',
    blockingReasons: [],
    eligibleNodeIds: [],
    ineligibleNodes: [],
  });
  return {
    async checkAdd() {
      return admittedResult;
    },
    async checkReplace() {
      return admittedResult;
    },
  };
}

function createCoordinatorWithStorage(options = {}) {
  const sqlEngine = options.sqlQueryEngine || createTrackingSqlEngine();
  const cache = options.systemTableCache || createMockCache({
    services: [
      {
        service_id: 'sys-postgres-wire-r0',
        replica_id: 'sys-postgres-wire-r0',
        partition_id: 'sys-postgres-wire',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: options.nodeId || TEST_NODE_ID,
        status: 'active',
      },
    ],
  });
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});
  const coordinator = new RebalanceCoordinator({
    nodeId: options.nodeId || TEST_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway: {
      submitMutation: createFixtureSystemMutationPort(
        (...args) => sqlEngine.executeQuery(...args),
      ),
      readAuthoritativeRows: async (_table, sql, params = [], query = {}) =>
        sqlEngine.executeQuery(sql, params, query),
      readRows: async (_table, sql, params = [], query = {}) =>
        sqlEngine.executeQuery(sql, params, query),
      executeQuery: async (sql, params = [], query = {}) =>
        sqlEngine.executeQuery(sql, params, query),
    },
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache: cache,
    }),
    authoritativeVisibilityTimeoutMs: 25,
    authoritativeVisibilityRetryDelayMs: 5,
    enableTimeouts: false,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
    storageAccountingService: accounting,
    storageAdmissionService: createMockAdmissionService(),
  });
  coordinator.initialize();
  let unavailableReads =
    options.unavailableOperationAuthorityReadsAfterReservationInsert || 0;
  const queryAuthority =
    coordinator.repository.queryAuthoritativeOperationVisibilityObservation
      .bind(coordinator.repository);
  coordinator.repository.queryAuthoritativeOperationVisibilityObservation =
    async (...args) => {
      if (sqlEngine.reservations.size > 0 && unavailableReads > 0) {
        unavailableReads--;
        return {
          operation: null,
          deferredOutcome: {
            error: 'injected owner RPC authority unavailable',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            deferRetry: true,
            retryAfterMs: NUM.FIVE,
          },
        };
      }
      return queryAuthority(...args);
    };
  coordinator.restoreOperationAuthority = () => {
    unavailableReads = 0;
  };
  return {coordinator, sqlEngine, accounting};
}

function createRuntimeServiceDeferralFixture(options = {}) {
  const timers = createDeterministicTimerQueue();
  const sqlEngine = createTrackingSqlEngine(options.sqlEngineOptions);
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
    unavailableOperationAuthorityReadsAfterReservationInsert:
      options.unavailableOperationAuthorityReadsAfterReservationInsert || 1,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const dispatchCalls = [];
  coordinator.workflowOwner.executeOperationInternal = async (operation) => {
    dispatchCalls.push(operation.operationId);
    return {success: true, operationId: operation.operationId};
  };
  return {
    coordinator,
    dispatchCalls,
    move: {
      type: OperationType.ADD,
      operationIntentId: TEST_OPERATION_ID,
      replicaIntentId: 'sys-postgres-wire-r1',
      partitionId: 'sys-postgres-wire',
      nodeId: TEST_TARGET_NODE_ID,
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
      entityId: 'sys-postgres-wire',
    },
    sqlEngine,
    timers,
  };
}

function createDeterministicTimerQueue() {
  const scheduled = [];
  return {
    scheduled,
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs, cleared: false};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (handle) handle.cleared = true;
    },
    async runNext() {
      const handle = scheduled.find((entry) => entry.cleared !== true);
      if (!handle) return false;
      handle.cleared = true;
      await handle.callback();
      return true;
    },
  };
}

function seedActiveReservation(sqlEngine, operationId) {
  const now = Date.now();
  sqlEngine.reservations.set(`res-${operationId}`, {
    reservation_id: `res-${operationId}`,
    operation_id: operationId,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
    partition_id: TEST_PARTITION_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    estimated_bytes: NUM.HUNDRED,
    amplification_factor: 1,
    status: RESERVATION_STATUS.ACTIVE,
    reason_code: 'add_replica',
    created_at: now,
    updated_at: now,
    expires_at: now + NUM.THOUSAND,
    released_at: null,
  });
}

function buildStorageIncreasingOperation(overrides = {}) {
  const now = Date.now();
  return {
    operationId: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_PARTITION_ID + '-r1',
    sourceNodeId: TEST_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: TEST_PARTITION_ID,
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    stepsHistory: workflowFixtureHistory(WORKFLOW_STEP.PENDING, now),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    ...overrides,
  };
}

function seedAuthoritativeOperation(sqlEngine, operation) {
  sqlEngine.insertOperationRow({
    operation_id: operation.operationId,
    type: operation.type,
    partition_id: operation.partitionId,
    replica_id: operation.replicaId || null,
    target_claim_key: operation.targetClaimKey || null,
    source_node_id: operation.sourceNodeId || null,
    target_node_id: operation.targetNodeId,
    status: operation.status,
    workflow_step: operation.workflowStep,
    created_at: operation.createdAt,
    updated_at: operation.updatedAt,
    completed_at: operation.completedAt,
    error_message: operation.errorMessage || null,
    steps_history: JSON.stringify(operation.stepsHistory || []),
    entity_type: operation.entityType,
    entity_id: operation.entityId,
    membership_publication_epoch: operation.membershipPublicationEpoch ?? null,
  });
}

export {
  TEST_OPERATION_ID,
  TEST_PARTITION_ID,
  TEST_RESERVATION_ID,
  TEST_TARGET_NODE_ID,
  buildStorageIncreasingOperation,
  createCoordinatorWithStorage,
  createRuntimeServiceDeferralFixture,
  createDeterministicTimerQueue,
  createTrackingSqlEngine,
  initializeConfig,
  seedActiveReservation,
  seedAuthoritativeOperation,
};
