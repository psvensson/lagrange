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

async function writeRuntimeReplicaServicesRow(gateway, serviceId, write) {
  const updateResult = await gateway.updateSystemTableRow(
    TABLES.SERVICES,
    {service_id: serviceId},
    write.updateData,
    PROJECTION_WRITE_OPTIONS,
  );
  const affectedRows = Number(
    updateResult?.partitionResult?.affectedRows ??
      updateResult?.affectedRows,
  );
  if (affectedRows > 0) {
    return;
  }
  await gateway.insertSystemTableRow(
    TABLES.SERVICES,
    {
      service_id: serviceId,
      ...write.updateData,
      created_at: write.createdAt ??
        write.updateData.updated_at ?? Date.now(),
    },
    PROJECTION_WRITE_OPTIONS,
  );
}

/**
 * Persist one runtime replica lifecycle state into the services table.
 *
 * The projecting node IS the replica's host, so a missing node_id on
 * the state row resolves to the hosting engine's own nodeId (the
 * column is NOT NULL).
 *
 * @param {?Object} gateway - Control-plane system-table gateway.
 * @param {string} hostNodeId - The projecting engine's node id.
 * @param {string} serviceId - Replica service id (row primary key).
 * @param {Object} stateRow - Column values from the lifecycle
 *   (service_type, node_id, status, address, updated_at, plus
 *   optional created_at / error_message extras).
 * @return {Promise<void>}
 */
async function projectRuntimeReplicaServicesRow(
  gateway, hostNodeId, serviceId, stateRow,
) {
  if (!gateway) {
    throw new Error(
      ADAPTER_ERROR_MSG.STATE_PROJECTION_GATEWAY_REQUIRED,
    );
  }
  const {created_at: createdAt, ...transitionColumns} = stateRow || {};
  if (transitionColumns.status === RUNTIME_REPLICA_STATUS.STOPPED) {
    await gateway.deleteSystemTableRow(
      TABLES.SERVICES,
      {service_id: serviceId},
      PROJECTION_WRITE_OPTIONS,
    );
    return;
  }
  await writeRuntimeReplicaServicesRow(gateway, serviceId, {
    createdAt,
    updateData: {
      ...transitionColumns,
      node_id: stateRow?.node_id ?? hostNodeId,
    },
  });
}

export {projectRuntimeReplicaServicesRow};
