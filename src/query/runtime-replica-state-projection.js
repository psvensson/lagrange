/**
 * Runtime replica services-table projection (quest
 * runtime-replica-state-projection): persists ServiceRuntimeLifecycle
 * state transitions as authoritative services rows through the
 * control-plane system-table gateway.
 *
 * Create-once-then-update discipline (TEST-0001 / ARCH-0009): the
 * first projection INSERTs the row with its identity columns; every
 * later transition UPDATEs the existing row primary-key addressed;
 * never INSERT OR REPLACE. A stopped replica's row is DELETED,
 * mirroring the partition and message-group row owners — lingering
 * 'stopped' rows would skew the planner's per-node counts forever;
 * FAILED rows stay visible (the move planner's auto-remove keys on
 * them).
 */

import {
  TABLES,
  isPartitionCleanupServiceRow,
} from '../constants/index.js';
import {RUNTIME_REPLICA_STATUS} from '../constants/runtime.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {ADAPTER_ERROR_MSG} from './sql-adapter-constants.js';

const PROJECTION_WRITE_OPTIONS = Object.freeze({skipCacheWait: true});
const SERVICES_OWNER_METHODS = Object.freeze([
  'insertService',
  'removeService',
  'updateService',
]);
const RUNTIME_PROJECTION_CRITICAL_WORK = 'critical';
const SERVICES_ROW_POINT_READ_SQL =
  'SELECT * FROM services WHERE service_id = ?';
const RUNTIME_PROJECTION_ERROR_CODE = Object.freeze({
  CLEANUP_IN_PROGRESS: 'CLEANUP_IN_PROGRESS',
  CREATE_OWNER_DEFERRED: 'CREATE_OWNER_DEFERRED',
  IDENTITY_CONFLICT: 'SERVICE_IDENTITY_CONFLICT',
});

function isServicesOwner(target) {
  return SERVICES_OWNER_METHODS.every(
    (methodName) => typeof target?.[methodName] === 'function',
  );
}

function assertProjectionMutationSucceeded(result) {
  if (result?.success !== false) {
    return result;
  }
  const error = new Error(
    result?.error || 'Runtime replica services projection failed',
  );
  Object.assign(error, result);
  throw error;
}

async function updateRuntimeReplicaServicesRow(
  target,
  serviceId,
  expectedIdentity,
  updateData,
) {
  const result = isServicesOwner(target) ?
    await target.updateService(
      serviceId,
      expectedIdentity,
      updateData,
      PROJECTION_WRITE_OPTIONS,
    ) :
    await target.updateSystemTableRow(
      TABLES.SERVICES,
      {service_id: serviceId, ...expectedIdentity},
      updateData,
      PROJECTION_WRITE_OPTIONS,
    );
  return assertProjectionMutationSucceeded(result);
}

async function submitRuntimeReplicaInsert(target, row) {
  try {
    const result = isServicesOwner(target) ?
      await target.insertService(row, PROJECTION_WRITE_OPTIONS) :
      await target.insertSystemTableRow(
        TABLES.SERVICES,
        row,
        PROJECTION_WRITE_OPTIONS,
      );
    return {result, mutationError: null};
  } catch (mutationError) {
    return {result: null, mutationError};
  }
}

async function observeRuntimeReplicaService(target, serviceId) {
  try {
    const observation = isServicesOwner(target) ?
      await target.getService(serviceId, {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        deliveryPriority: RUNTIME_PROJECTION_CRITICAL_WORK,
        workClass: RUNTIME_PROJECTION_CRITICAL_WORK,
      }) :
      await readAuthoritativeControlPlaneRows(
        target,
        TABLES.SERVICES,
        SERVICES_ROW_POINT_READ_SQL,
        [serviceId],
        {
          authoritativeReadMode:
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
          leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
          deliveryPriority: RUNTIME_PROJECTION_CRITICAL_WORK,
          workClass: RUNTIME_PROJECTION_CRITICAL_WORK,
        },
      );
    return observation?.success === true && observation.rows?.length === 1 ?
      observation.rows[0] : null;
  } catch (_error) {
    return null;
  }
}

function rowsMatchRuntimeReplicaCreation(observed, expected) {
  const fields = [
    'service_id',
    'service_type',
    'node_id',
    'status',
    'created_at',
  ];
  return fields.every((field) => observed?.[field] === expected[field]);
}

function runtimeReplicaCreationError(row, observed, cause) {
  const code = isPartitionCleanupServiceRow(observed) ?
    RUNTIME_PROJECTION_ERROR_CODE.CLEANUP_IN_PROGRESS :
    observed ? RUNTIME_PROJECTION_ERROR_CODE.IDENTITY_CONFLICT :
      RUNTIME_PROJECTION_ERROR_CODE.CREATE_OWNER_DEFERRED;
  const error = new Error(
    `Runtime replica creation ${code}: ${row.service_id}`,
  );
  error.code = code;
  error.errorCode = code;
  error.deferRetry = code !== RUNTIME_PROJECTION_ERROR_CODE.IDENTITY_CONFLICT;
  error.cause = cause;
  return error;
}

async function insertRuntimeReplicaServicesRow(target, row) {
  const {result, mutationError} = await submitRuntimeReplicaInsert(target, row);
  if (classifyControlPlaneMutationResult(result).applied) return;
  const observed = await observeRuntimeReplicaService(target, row.service_id);
  if (rowsMatchRuntimeReplicaCreation(observed, row)) return;
  throw runtimeReplicaCreationError(row, observed, mutationError);
}

async function deleteRuntimeReplicaServicesRow(
  target,
  serviceId,
  expectedIdentity,
) {
  const result = isServicesOwner(target) ?
    await target.removeService(
      serviceId,
      expectedIdentity,
      PROJECTION_WRITE_OPTIONS,
    ) :
    await target.deleteSystemTableRow(
      TABLES.SERVICES,
      {service_id: serviceId, ...expectedIdentity},
      PROJECTION_WRITE_OPTIONS,
    );
  assertProjectionMutationSucceeded(result);
}

async function writeRuntimeReplicaServicesRow(target, serviceId, write) {
  const updateResult = await updateRuntimeReplicaServicesRow(
    target,
    serviceId,
    write.expectedIdentity,
    write.updateData,
  );
  const affectedRows = Number(
    updateResult?.partitionResult?.affectedRows ??
      updateResult?.affectedRows,
  );
  if (affectedRows > 0) {
    return;
  }
  await insertRuntimeReplicaServicesRow(target, {
    service_id: serviceId,
    ...write.updateData,
    created_at: write.createdAt ??
      write.updateData.updated_at ?? Date.now(),
  });
}

/**
 * Persist one runtime replica lifecycle state into the services table.
 *
 * The projecting node IS the replica's host, so a missing node_id on
 * the state row resolves to the hosting engine's own nodeId (the
 * column is NOT NULL).
 *
 * @param {?Object} projectionTarget - ServicesOwner in production, or a
 *   control-plane system-table gateway for compatibility callers.
 * @param {string} hostNodeId - The projecting engine's node id.
 * @param {string} serviceId - Replica service id (row primary key).
 * @param {Object} stateRow - Column values from the lifecycle
 *   (service_type, node_id, status, address, updated_at, plus
 *   optional created_at / error_message extras).
 * @return {Promise<void>}
 */
async function projectRuntimeReplicaServicesRow(
  projectionTarget, hostNodeId, serviceId, stateRow,
) {
  if (!projectionTarget) {
    throw new Error(
      ADAPTER_ERROR_MSG.STATE_PROJECTION_GATEWAY_REQUIRED,
    );
  }
  const {created_at: createdAt, ...transitionColumns} = stateRow || {};
  const expectedIdentity = {
    service_type: transitionColumns.service_type,
    node_id: transitionColumns.node_id ?? hostNodeId,
  };
  if (transitionColumns.status === RUNTIME_REPLICA_STATUS.STOPPED) {
    await deleteRuntimeReplicaServicesRow(
      projectionTarget,
      serviceId,
      expectedIdentity,
    );
    return;
  }
  await writeRuntimeReplicaServicesRow(projectionTarget, serviceId, {
    createdAt,
    expectedIdentity,
    updateData: {
      ...transitionColumns,
      node_id: stateRow?.node_id ?? hostNodeId,
    },
  });
}

export {projectRuntimeReplicaServicesRow};
