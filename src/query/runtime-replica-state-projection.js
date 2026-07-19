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

import {TABLES} from '../constants/index.js';
import {RUNTIME_REPLICA_STATUS} from '../constants/runtime.js';
import {ADAPTER_ERROR_MSG} from './sql-adapter-constants.js';

const PROJECTION_WRITE_OPTIONS = Object.freeze({skipCacheWait: true});
const SERVICES_OWNER_METHODS = Object.freeze([
  'insertService',
  'removeService',
  'updateService',
]);

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
  updateData,
) {
  const result = isServicesOwner(target) ?
    await target.updateService(
      serviceId,
      updateData,
      PROJECTION_WRITE_OPTIONS,
    ) :
    await target.updateSystemTableRow(
      TABLES.SERVICES,
      {service_id: serviceId},
      updateData,
      PROJECTION_WRITE_OPTIONS,
    );
  return assertProjectionMutationSucceeded(result);
}

async function insertRuntimeReplicaServicesRow(target, row) {
  const result = isServicesOwner(target) ?
    await target.insertService(row, PROJECTION_WRITE_OPTIONS) :
    await target.insertSystemTableRow(
      TABLES.SERVICES,
      row,
      PROJECTION_WRITE_OPTIONS,
    );
  assertProjectionMutationSucceeded(result);
}

async function deleteRuntimeReplicaServicesRow(target, serviceId) {
  const result = isServicesOwner(target) ?
    await target.removeService(serviceId, PROJECTION_WRITE_OPTIONS) :
    await target.deleteSystemTableRow(
      TABLES.SERVICES,
      {service_id: serviceId},
      PROJECTION_WRITE_OPTIONS,
    );
  assertProjectionMutationSucceeded(result);
}

async function writeRuntimeReplicaServicesRow(target, serviceId, write) {
  const updateResult = await updateRuntimeReplicaServicesRow(
    target,
    serviceId,
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
  if (transitionColumns.status === RUNTIME_REPLICA_STATUS.STOPPED) {
    await deleteRuntimeReplicaServicesRow(projectionTarget, serviceId);
    return;
  }
  await writeRuntimeReplicaServicesRow(projectionTarget, serviceId, {
    createdAt,
    updateData: {
      ...transitionColumns,
      node_id: stateRow?.node_id ?? hostNodeId,
    },
  });
}

export {projectRuntimeReplicaServicesRow};
