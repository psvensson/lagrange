/**
 * Runtime replica services-table projection (quest
 * runtime-replica-state-projection): persists ServiceRuntimeLifecycle
 * state transitions as authoritative services rows through ServicesOwner.
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
  isPartitionCleanupServiceRow,
} from '../constants/index.js';
import {RUNTIME_REPLICA_STATUS} from '../constants/runtime.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../control-plane/control-plane-system-table-gateway.js';
import {ADAPTER_ERROR_MSG} from './sql-adapter-constants.js';

const PROJECTION_WRITE_OPTIONS = Object.freeze({});
const SERVICES_OWNER_METHODS = Object.freeze([
  'insertService',
  'removeService',
  'updateService',
]);
const RUNTIME_PROJECTION_CRITICAL_WORK = 'critical';
const RUNTIME_PROJECTION_ERROR_CODE = Object.freeze({
  CLEANUP_IN_PROGRESS: 'CLEANUP_IN_PROGRESS',
  CREATE_OWNER_DEFERRED: 'CREATE_OWNER_DEFERRED',
  IDENTITY_CONFLICT: 'SERVICE_IDENTITY_CONFLICT',
});

function isValidServicesOwner(servicesOwner) {
  return Boolean(servicesOwner) && SERVICES_OWNER_METHODS.every(
    (methodName) => typeof servicesOwner?.[methodName] === 'function',
  );
}

function assertServicesOwner(servicesOwner) {
  if (!isValidServicesOwner(servicesOwner)) {
    throw new Error(
      ADAPTER_ERROR_MSG.STATE_PROJECTION_GATEWAY_REQUIRED,
    );
  }
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
  servicesOwner,
  serviceId,
  expectedIdentity,
  updateData,
) {
  const result = await servicesOwner.updateService(
    serviceId,
    expectedIdentity,
    updateData,
    PROJECTION_WRITE_OPTIONS,
  );
  return assertProjectionMutationSucceeded(result);
}

async function submitRuntimeReplicaInsert(servicesOwner, row) {
  try {
    const result = await servicesOwner.insertService(
      row,
      PROJECTION_WRITE_OPTIONS,
    );
    return {result, mutationError: null};
  } catch (mutationError) {
    return {result: null, mutationError};
  }
}

async function observeRuntimeReplicaService(servicesOwner, serviceId) {
  try {
    const observation = await servicesOwner.getService?.(serviceId, {
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      deliveryPriority: RUNTIME_PROJECTION_CRITICAL_WORK,
      workClass: RUNTIME_PROJECTION_CRITICAL_WORK,
    });
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

async function insertRuntimeReplicaServicesRow(servicesOwner, row) {
  const {result, mutationError} = await submitRuntimeReplicaInsert(
    servicesOwner,
    row,
  );
  if (classifyControlPlaneMutationResult(result).applied) return;
  const observed = await observeRuntimeReplicaService(
    servicesOwner,
    row.service_id,
  );
  if (rowsMatchRuntimeReplicaCreation(observed, row)) return;
  throw runtimeReplicaCreationError(row, observed, mutationError);
}

async function deleteRuntimeReplicaServicesRow(
  servicesOwner,
  serviceId,
  expectedIdentity,
) {
  const result = await servicesOwner.removeService(
    serviceId,
    expectedIdentity,
    PROJECTION_WRITE_OPTIONS,
  );
  assertProjectionMutationSucceeded(result);
}

async function writeRuntimeReplicaServicesRow(servicesOwner, serviceId, write) {
  const updateResult = await updateRuntimeReplicaServicesRow(
    servicesOwner,
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
  await insertRuntimeReplicaServicesRow(servicesOwner, {
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
 * @param {Object} servicesOwner - Canonical ServicesOwner instance.
 * @param {string} hostNodeId - The projecting engine's node id.
 * @param {string} serviceId - Replica service id (row primary key).
 * @param {Object} stateRow - Column values from the lifecycle
 *   (service_type, node_id, status, address, updated_at, plus
 *   optional created_at / error_message extras).
 * @return {Promise<void>}
 */
async function projectRuntimeReplicaServicesRow(
  servicesOwner, hostNodeId, serviceId, stateRow,
) {
  assertServicesOwner(servicesOwner);
  const {created_at: createdAt, ...transitionColumns} = stateRow || {};
  const expectedIdentity = {
    service_type: transitionColumns.service_type,
    node_id: transitionColumns.node_id ?? hostNodeId,
  };
  if (transitionColumns.status === RUNTIME_REPLICA_STATUS.STOPPED) {
    await deleteRuntimeReplicaServicesRow(
      servicesOwner,
      serviceId,
      expectedIdentity,
    );
    return;
  }
  await writeRuntimeReplicaServicesRow(servicesOwner, serviceId, {
    createdAt,
    expectedIdentity,
    updateData: {
      ...transitionColumns,
      node_id: stateRow?.node_id ?? hostNodeId,
    },
  });
}

export {isValidServicesOwner, projectRuntimeReplicaServicesRow};
