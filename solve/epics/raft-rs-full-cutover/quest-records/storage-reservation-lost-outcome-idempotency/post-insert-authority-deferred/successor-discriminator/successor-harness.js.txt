import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {RESERVATION_STATUS} from
  '../../src/rebalancer/storage-capacity-constants.js';
import {createTestCoordinator, createTestRebalancer} from './test-helpers.js';

const INSERT_RESERVATION_RE =
  /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+storage_reservations/i;

function createTimerQueue() {
  const entries = new Map();
  let nextId = 1;
  return {
    clearTimeoutFn(handle) {
      entries.delete(handle?.id);
    },
    count() {
      return entries.size;
    },
    async runNext() {
      const entry = entries.entries().next().value;
      if (!entry) {
        return false;
      }
      const [id, callback] = entry;
      entries.delete(id);
      await callback();
      await Promise.resolve();
      return true;
    },
    setTimeoutFn(callback) {
      const handle = {id: nextId++};
      entries.set(handle.id, callback);
      return handle;
    },
  };
}

function installReservationBoundary(coordinator) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const originalExecuteQuery = gateway.executeQuery.bind(gateway);
  const originalReadAuthoritativeRows =
    gateway.readAuthoritativeRows.bind(gateway);
  const originalReadRows = gateway.readRows.bind(gateway);
  const reservations = new Map();
  let insertCount = 0;
  let authorityReadCount = 0;
  let authorityMode = 'unavailable';
  let blockedAuthorityRead = null;
  let signalAuthorityReadStarted = null;
  const authorityReadStarted = new Promise((resolve) => {
    signalAuthorityReadStarted = resolve;
  });

  function rowsForReservationQuery(sql, params) {
    let rows = Array.from(reservations.values());
    if (String(sql).includes('operation_id = ?')) {
      rows = rows.filter((row) => row.operation_id === params[0]);
    }
    if (String(sql).includes('status = ?')) {
      const status = params.at(-1);
      rows = rows.filter((row) => row.status === status);
    }
    return {success: true, rows};
  }

  async function executeQuery(sql, params = [], options = {}) {
    const statement = String(sql);
    if (INSERT_RESERVATION_RE.test(statement)) {
      insertCount++;
      const [
        reservationId, operationId, entityType, entityId, partitionId,
        targetNodeId, estimatedBytes, amplificationFactor, status,
        reasonCode, createdAt, updatedAt, expiresAt,
      ] = params;
      if (reservations.has(reservationId)) {
        return {success: true, affectedRows: 0, changes: 0};
      }
      reservations.set(reservationId, {
        reservation_id: reservationId,
        operation_id: operationId,
        entity_type: entityType,
        entity_id: entityId,
        partition_id: partitionId,
        target_node_id: targetNodeId,
        estimated_bytes: estimatedBytes,
        amplification_factor: amplificationFactor,
        status,
        reason_code: reasonCode,
        created_at: createdAt,
        updated_at: updatedAt,
        expires_at: expiresAt,
        released_at: null,
      });
      return {success: true, affectedRows: 1, changes: 1};
    }
    if (statement.includes('UPDATE storage_reservations')) {
      const [status, updatedAt, releasedAt, reservationId, expectedStatus] =
        params;
      const row = reservations.get(reservationId);
      if (!row || row.status !== expectedStatus) {
        return {success: true, affectedRows: 0, changes: 0};
      }
      reservations.set(reservationId, {
        ...row, status, updated_at: updatedAt, released_at: releasedAt,
      });
      return {success: true, affectedRows: 1, changes: 1};
    }
    if (statement.includes('FROM storage_reservations')) {
      return rowsForReservationQuery(statement, params);
    }
    return originalExecuteQuery(sql, params, options);
  }

  gateway.executeQuery = executeQuery;
  gateway.readRows = async (tableName, sql, params = [], options = {}) => {
    if (tableName === SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS) {
      return executeQuery(sql, params, options);
    }
    return originalReadRows(tableName, sql, params, options);
  };
  gateway.readAuthoritativeRows = async (
    tableName,
    sql,
    params = [],
    options = {},
  ) => {
    if (tableName === SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS) {
      return executeQuery(sql, params, options);
    }
    if (
      reservations.size > 0 &&
      tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
      authorityMode !== 'available'
    ) {
      authorityReadCount++;
      signalAuthorityReadStarted?.('authority_read');
      signalAuthorityReadStarted = null;
      if (authorityMode === 'blocked') {
        return new Promise((resolve) => {
          blockedAuthorityRead = resolve;
        });
      }
      return {
        success: false,
        rows: [],
        error: 'successor owner RPC temporarily unavailable',
        source: 'owner_rpc_lane',
      };
    }
    return originalReadAuthoritativeRows(tableName, sql, params, options);
  };

  return {
    authorityReadCount: () => authorityReadCount,
    authorityReadStarted: () => authorityReadStarted,
    blockAuthority() {
      authorityMode = 'blocked';
    },
    insertCount: () => insertCount,
    releaseBlockedAuthorityAsUnavailable() {
      authorityMode = 'unavailable';
      blockedAuthorityRead?.({
        success: false,
        rows: [],
        error: 'successor old owner RPC continuation',
        source: 'owner_rpc_lane',
      });
      blockedAuthorityRead = null;
    },
    reservations,
    restoreAuthority() {
      authorityMode = 'available';
    },
  };
}

function configureCreationOwner(coordinator) {
  const planningIdentity = Object.freeze({
    globalPlanningGeneration: 1,
    nodePlanningGeneration: 1,
    saturated: false,
  });
  coordinator.controlPlaneReadinessService = {
    ...coordinator.controlPlaneReadinessService,
    readCurrentPlanningProjectionIdentity: () => planningIdentity,
  };
  coordinator.observeReplicaOperationMutationRoute = () => Object.freeze({
    allowed: true,
    reasonCode: null,
    retryAfterMs: 0,
    routingSnapshot: Object.freeze({
      canonicalLeaderNodeId: coordinator.nodeId,
      routableServiceCount: 1,
      candidateCount: 1,
    }),
  });
  coordinator.assertLocalControlPlaneMutationReady = () => {};
  coordinator.resolveProvisioningLedgerInterlockDeferral = async () => null;
  coordinator.ensureNoConflictingInFlightReplaceForRemove = async () => {};
  coordinator.ensurePriorityControlPlaneRemoveLaneAvailable = async () => {};
  coordinator.ensurePrioritySurplusRemovePlacementFenceAllowed = async () => {};
  coordinator.ensureEntityAddLikeCreateLaneAvailable = async () => {};
  coordinator.ensureCriticalPartitionCreateLaneAvailable = async () => {};
  coordinator.ensureCreateTopologyGuardAllowed = async () => {};
  coordinator.ensureProvisioningAdmissionAllowed = async () => {};
  coordinator.resolveEntitySizeBytes = () => 1;
  coordinator.getMoveSafetyError = async () => null;
}

function createSuccessorFixture(options = {}) {
  const timers = createTimerQueue();
  const coordinator = createTestCoordinator({
    nodeId: options.nodeId || 'successor-owner-node',
    autoProgressCreatedOperations: true,
    enableTimeouts: false,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  configureCreationOwner(coordinator);
  const boundary = installReservationBoundary(coordinator);
  const normalArmOperationIds = [];
  const recoveredDispatchOperationIds = [];
  coordinator.workflowOwner.armCoordinatorCreatedOperation =
    async (operation) => {
      normalArmOperationIds.push(operation.operationId);
      return true;
    };
  coordinator.workflowOwner.runOperationOwnerAction =
    async (_action, operation) => {
      recoveredDispatchOperationIds.push(operation.operationId);
      return true;
    };
  return {
    boundary,
    coordinator,
    normalArmOperationIds,
    recoveredDispatchOperationIds,
    timers,
  };
}

function createRuntimeServiceIngress(coordinator, entityId) {
  return createTestRebalancer({
    entityId,
    entityType: 'runtime_service',
    nodeId: coordinator.nodeId,
    rebalanceCoordinator: coordinator,
  });
}

function readStoredOperation(coordinator, operationId) {
  return coordinator.repository.queryOperationById(operationId);
}

function isPendingOperation(operation) {
  return operation?.workflowStep === WORKFLOW_STEP.PENDING;
}

function activeReservationFor(boundary, operationId) {
  return Array.from(boundary.reservations.values()).find((row) =>
    row.operation_id === operationId &&
    row.status === RESERVATION_STATUS.ACTIVE,
  ) || null;
}

export {
  activeReservationFor,
  createRuntimeServiceIngress,
  createSuccessorFixture,
  isPendingOperation,
  readStoredOperation,
};
