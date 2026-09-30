/**
 * Fail-closed storage-reservation dispatch gate regression tests
 * (verified-audit findings 3+11, quest reservation-fail-closed-dispatch-gate).
 *
 * Receipts:
 * - reservation-failure-blocks-dispatch: a failed reservation insert rejects
 *   operation creation; no OPERATION_CREATED is emitted and nothing is
 *   dispatched under-reserved.
 * - dispatch-gate-repairs-via-ensure: dispatch of a storage-increasing
 *   operation with no ACTIVE reservation repairs through
 *   ensureReservationForOperation (deterministic res-${operationId}) and
 *   proceeds; when the repair insert fails, dispatch is skipped as
 *   OPERATION_NOT_DISPATCHABLE.
 * - divergence-arm-keeps-reservation: a terminal persist that reports
 *   unresolved divergence (zero-change, authority row still non-terminal)
 *   keeps the reservation ACTIVE; a terminal persist that lost to a
 *   DIFFERENT durable terminal (TERMINAL_ADOPTED) releases it.
 *
 * Every test is red-on-revert: reverting the creation-time fail-closed
 * throw, the dispatch gate, or the typed-release gating flips the matching
 * test to red.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  RESERVATION_STATUS,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';

const {OPERATION_WORKFLOW_OWNER_REASON} = OPERATION_WORKFLOW_OWNER_SHARED;
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

/**
 * In-memory SQL engine tracking operations and reservations; mirrors
 * coordinator-reservation-lifecycle.test.js createTrackingSqlEngine with an
 * injectable reservation-insert failure.
 */
function insertOperationRow(operations, params) {
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

function insertReservationRow(reservations, params, options) {
  if (options.failReservationInsert === true) {
    // NON-retryable failure signature: a retryable control-plane error
    // would (correctly) re-drive the insert through the mutation retry
    // lane; the fail-closed contract governs the terminal failure.
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
    estimated_bytes: estBytes,
    amplification_factor: ampFactor,
    status, reason_code: reason,
    created_at: created, updated_at: updated,
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

function updateOperationRow(operations, params) {
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

function selectReservationRows(reservations, sql, params) {
  if (sql.includes('WHERE operation_id = ?')) {
    const [opId, status] = params;
    const rows = Array.from(reservations.values())
      .filter((row) => row.operation_id === opId && row.status === status);
    return {success: true, rows};
  }
  if (params.length > 0) {
    const [status] = params;
    const active = Array.from(reservations.values())
      .filter((r) => r.status === status);
    return {success: true, rows: active};
  }
  return {success: true, rows: Array.from(reservations.values())};
}

function selectOperationRows(operations, sql, params) {
  const allOps = Array.from(operations.values());
  if (sql.includes('operation_id = ?')) {
    const [opId] = params;
    const op = operations.get(opId);
    return {success: true, rows: op ? [op] : []};
  }
  return {success: true, rows: allOps};
}

function createTrackingSqlEngine(options = {}) {
  const operations = new Map();
  const reservations = new Map();

  return {
    operations,
    reservations,
    executeQuery: async (sql, params) => {
      if (sql.includes('INSERT INTO replica_operations')) {
        return insertOperationRow(operations, params);
      }
      if (sql.includes('INSERT INTO storage_reservations')) {
        return insertReservationRow(reservations, params, options);
      }
      if (sql.includes('UPDATE storage_reservations')) {
        return updateReservationRows(reservations, sql, params);
      }
      if (sql.includes('UPDATE replica_operations')) {
        return updateOperationRow(operations, params);
      }
      if (sql.includes('SELECT * FROM storage_reservations')) {
        return selectReservationRows(reservations, sql, params);
      }
      if (sql.includes('replica_operations')) {
        return selectOperationRows(operations, sql, params);
      }
      return {success: true, rows: []};
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
  const cache = options.systemTableCache || createMockCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  const coordinator = new RebalanceCoordinator({
    nodeId: options.nodeId || TEST_NODE_ID,
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
    // Keep the authoritative-visibility confirmation loop fast: the in-memory
    // engine never publishes CDC witnesses, so the default 5s timeout would
    // fire on every persisted claim transition.
    authoritativeVisibilityTimeoutMs: 25,
    authoritativeVisibilityRetryDelayMs: 5,
    enableTimeouts: false,
    storageAccountingService: accounting,
    storageAdmissionService: createMockAdmissionService(),
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
  return {
    operationId: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: TEST_PARTITION_ID,
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    stepsHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    ...overrides,
  };
}

// --- reservation-failure-blocks-dispatch ---

test('reservation-failure-blocks-dispatch: reservation insert failure ' +
  'rejects creation with no OPERATION_CREATED and no dispatch',
async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine({failReservationInsert: true});
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  let operationCreatedEmitted = false;
  coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, () => {
    operationCreatedEmitted = true;
  });
  const dispatchCalls = [];
  coordinator.workflowOwner.executeOperationInternal = async (operation) => {
    dispatchCalls.push(operation.operationId);
    return {success: true, operationId: operation.operationId};
  };

  try {
    await t.rejects(
      coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: TEST_PARTITION_ID,
        nodeId: TEST_TARGET_NODE_ID,
        entityType: SERVICE_TYPE.PARTITION,
        entityId: TEST_PARTITION_ID,
        emitOperationCreated: true,
      }),
      /Storage reservation creation failed/,
      'creation must fail closed when the reservation insert fails',
    );

    t.equal(
      operationCreatedEmitted,
      false,
      'OPERATION_CREATED must not be emitted after a reservation failure',
    );
    t.equal(
      dispatchCalls.length,
      0,
      'no dispatch may run for an under-reserved operation',
    );
    t.equal(
      sqlEngine.reservations.size,
      0,
      'no reservation row exists after the failed insert',
    );
  } finally {
    await coordinator.shutdown();
  }
});

// --- dispatch-gate-repairs-via-ensure ---

test('dispatch-gate-repairs-via-ensure: dispatch of an ADD operation with ' +
  'no ACTIVE reservation repairs through ensureReservationForOperation',
async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine();
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  const operation = buildStorageIncreasingOperation();
  const owner = coordinator.workflowOwner;
  owner.repository.isOperationLocallyOwned = () => true;
  owner.executeOperationInternal = async (dispatchedOperation) => ({
    success: true,
    operationId: dispatchedOperation.operationId,
  });

  try {
    const result = await owner.dispatchOperationInternal(operation);

    t.equal(result?.success, true, 'dispatch proceeded after repair');
    const reservation = sqlEngine.reservations.get(TEST_RESERVATION_ID);
    t.ok(
      reservation,
      'the deterministic res-${operationId} reservation was created',
    );
    t.equal(
      reservation?.status,
      RESERVATION_STATUS.ACTIVE,
      'the repaired reservation is ACTIVE',
    );
    t.equal(
      reservation?.operation_id,
      TEST_OPERATION_ID,
      'the reservation is bound to the dispatching operation',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('dispatch-gate-repairs-via-ensure: a failing reservation repair ' +
  'skips dispatch as OPERATION_NOT_DISPATCHABLE',
async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine({failReservationInsert: true});
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  const operation = buildStorageIncreasingOperation();
  const owner = coordinator.workflowOwner;
  owner.repository.isOperationLocallyOwned = () => true;
  const dispatchCalls = [];
  owner.executeOperationInternal = async (dispatchedOperation) => {
    dispatchCalls.push(dispatchedOperation.operationId);
    return {
      success: true,
      operationId: dispatchedOperation.operationId,
    };
  };

  try {
    const result = await owner.dispatchOperationInternal(operation);

    t.equal(result?.success, false, 'dispatch did not proceed');
    t.equal(result?.skipped, true, 'dispatch is reported as skipped');
    t.equal(
      result?.reason,
      OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
      'skip reason is OPERATION_NOT_DISPATCHABLE',
    );
    t.equal(
      result?.operationId,
      TEST_OPERATION_ID,
      'skip result carries the operation id',
    );
    t.equal(
      dispatchCalls.length,
      0,
      'executeOperationInternal never ran under-reserved',
    );
    t.equal(
      sqlEngine.reservations.size,
      0,
      'no reservation row after the failed repair insert',
    );
  } finally {
    await coordinator.shutdown();
  }
});

// --- divergence-arm-keeps-reservation ---

test('divergence-arm-keeps-reservation: unresolved terminal divergence ' +
  'keeps the reservation ACTIVE', async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine();
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  seedActiveReservation(sqlEngine, TEST_OPERATION_ID);
  const owner = coordinator.workflowOwner;
  // Unresolved divergence: the terminal persist wins zero rows and the
  // authority row is still NON-terminal — the operation is live and
  // re-driveable, so its reservation must survive.
  owner.repository.persistOperationUpdate = async (operation, options) => {
    if (options?.returnDisposition === true) {
      return Object.freeze({
        persisted: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
        operation: null,
      });
    }
    return false;
  };

  try {
    await owner.completeOperation(buildStorageIncreasingOperation());

    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.ACTIVE,
      'completeOperation keeps the reservation ACTIVE on divergence',
    );

    await owner.failOperation(
      buildStorageIncreasingOperation(),
      'divergence failure probe',
    );

    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.ACTIVE,
      'failOperation keeps the reservation ACTIVE on divergence',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('divergence-arm-keeps-reservation: losing to a DIFFERENT durable ' +
  'terminal releases the reservation', async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine();
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  seedActiveReservation(sqlEngine, TEST_OPERATION_ID);
  const owner = coordinator.workflowOwner;
  // Lost-to-other-terminal: a DIFFERENT durable terminal already won; the
  // winning terminal owns the operation, so the reservation is released.
  owner.repository.persistOperationUpdate = async (operation, options) => {
    const winningTerminal = {
      ...operation,
      status: ReplicaStatus.FAILED,
      workflowStep: WORKFLOW_STEP.FAILED,
      completedAt: Date.now(),
      errorMessage: 'winning terminal',
    };
    if (options?.returnDisposition === true) {
      return Object.freeze({
        persisted: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
        operation: winningTerminal,
      });
    }
    return false;
  };

  try {
    await owner.completeOperation(buildStorageIncreasingOperation());

    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.RELEASED,
      'completeOperation releases the reservation on TERMINAL_ADOPTED',
    );
  } finally {
    await coordinator.shutdown();
  }
});
