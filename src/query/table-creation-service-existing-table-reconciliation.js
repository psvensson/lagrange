/**
 * Table Creation Service - Existing-table reconciliation.
 * Owns the CREATE TABLE IF NOT EXISTS retry path: re-runs initial partition
 * provisioning and restores missing initial partition metadata when the table
 * row was created before provisioning finished.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {TABLES} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  TABLE_CREATION_SERVICE_LITERAL,
  resolveTableCreationCompletion,
  resolveTableCreationMutationContractOutcome,
  resolveTableCreationVisibilityContractOutcome,
} from './table-creation-service-completion.js';


/**
 * Re-run initial partition provisioning for existing CREATE TABLE IF NOT EXISTS
 * retries when metadata was created before provisioning finished.
 * @param {string} tableName
 * @return {Promise<void>}
 * @private
 */
async function reconcileExistingInitialPartition(
  tableName,
  existingTable = null,
  options = {},
) {
  const existingTableRecord =
    existingTable || (await this.findExistingTableRecord(tableName));
  if (!existingTableRecord) {
    return {
      partitionMetadataCreated: false,
    };
  }
  const tableId =
    existingTableRecord.table_id || existingTableRecord.tableId || null;
  if (!tableId) {
    return {
      partitionMetadataCreated: false,
    };
  }
  const partitionId = `${tableId}-p1`;
  let existingPartition = await this.findExistingPartitionRecord(partitionId);
  let partitionMetadataCreated = false;
  let visibilityState = TABLE_CREATION_SERVICE_LITERAL.VISIBLE;
  let metadataContractOutcome =
    resolveTableCreationVisibilityContractOutcome(visibilityState);
  if (!existingPartition) {
    const controlPlaneGateway = this.getControlPlaneSystemTableGateway();
    if (
      !controlPlaneGateway ||
      typeof controlPlaneGateway.submitMutation !==
        TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      throw new Error(
        TABLE_CREATION_SERVICE_LITERAL.UNABLE_TO_RESTORE_MISSING_INITIAL_PARTITION_METADATA_FOR_TABLE +
          String(tableName || tableId),
      );
    }
    existingPartition = this.buildInitialPartitionMetadataFromTableRecord(
      tableId,
      tableName,
      existingTableRecord,
    );
    const partitionMutation = await controlPlaneGateway.submitMutation(
      {
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: TABLES.PARTITIONS,
        row: existingPartition,
      },
      {
        allowPendingVisibility: true,
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: 'critical',
      },
    );
    partitionMetadataCreated = true;
    visibilityState = String(
      partitionMutation?.visibilityState ||
        TABLE_CREATION_SERVICE_LITERAL.VISIBLE,
    );
    metadataContractOutcome = resolveTableCreationMutationContractOutcome(
      [partitionMutation],
      visibilityState,
    );
  }
  const replicaCount = Number(
    existingPartition.replica_count ?? existingPartition.replicaCount,
  );
  const provisioningSummary = await this.provisionInitialPartition({
    tableId,
    tableName,
    tableMetadata: existingTableRecord,
    partitionId,
    partitionMetadata: existingPartition,
    replicaCount:
      Number.isInteger(replicaCount) && replicaCount > 0 ?
        replicaCount :
        this.defaultReplicaCount,
    timeoutBudget: options?.timeoutBudget,
  });
  const completion = resolveTableCreationCompletion({
    visibilityState,
    provisioningSummary,
    metadataContractOutcome,
  });
  return {
    partitionMetadataCreated,
    visibilityState,
    completionState: completion.completionState,
    completionReason: completion.completionReason,
    contractState: completion.contractState,
    nextAction: completion.nextAction,
    provisioningSummary,
  };
}

function defineTableCreationExistingTableReconciliation(serviceClass) {
  Object.defineProperty(
    serviceClass.prototype,
    'reconcileExistingInitialPartition',
    {
      configurable: true,
      value: reconcileExistingInitialPartition,
      writable: true,
    },
  );
}

export {defineTableCreationExistingTableReconciliation};
