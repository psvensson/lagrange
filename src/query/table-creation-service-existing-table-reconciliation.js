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
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../bootstrap/replication-target-authority.js';
import {
  TABLE_CREATION_SERVICE_LITERAL,
  resolveTableCreationCompletion,
} from './table-creation-service-completion.js';
import {METADATA_AUTHORITY_REFRESH_OUTCOME} from
  './metadata-authority-outcome-constants.js';
import {metadataLookupUnavailableError} from
  './table-creation-service-metadata-lookup.js';


const EXISTING_TABLE_RECONCILIATION_METHODS = Object.freeze({
  /**
   * Re-run initial partition provisioning for existing CREATE TABLE IF NOT
   * EXISTS retries when metadata was created before provisioning finished.
   * @param {string} tableName
   * @param {Object} existingTableRecord The table row the caller found.
   * @param {Object} [options]
   * @return {Promise<Object>}
   * @private
   */
  async reconcileExistingInitialPartition(
    tableName,
    existingTableRecord,
    options = {},
  ) {
    const tableId =
      existingTableRecord.table_id || existingTableRecord.tableId || null;
    if (!tableId) {
      return {
        partitionMetadataCreated: false,
      };
    }
    const partitionId = `${tableId}-p1`;
    const partitionLookup = await this.lookupPartitionRecord(partitionId);
    if (partitionLookup.outcome ===
        METADATA_AUTHORITY_REFRESH_OUTCOME.UNAVAILABLE) {
      throw metadataLookupUnavailableError(`partition ${partitionId}`,
        partitionLookup);
    }
    let existingPartition = partitionLookup.row;
    let partitionMetadataCreated = false;
    if (partitionLookup.outcome === METADATA_AUTHORITY_REFRESH_OUTCOME.ABSENT) {
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
      await options.assertProvisioningOwnership?.();
      // Answers at its commit; a failed commit throws.
      await controlPlaneGateway.submitMutation(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
          tableName: TABLES.PARTITIONS,
          row: existingPartition,
        },
        {
          workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
          deliveryPriority: 'critical',
        },
      );
      partitionMetadataCreated = true;
    }
    // Desired RF for the existing partition comes from the single policy
    // authority; an undeclared policy fails the reconciliation closed instead
    // of silently provisioning with the creation default.
    const desiredTarget = resolveDesiredReplicationFactor(existingPartition);
    if (desiredTarget.source === REPLICATION_TARGET_SOURCE.UNDECLARED) {
      throw new Error(
        TABLE_CREATION_SERVICE_LITERAL.EXISTING_PARTITION_REPLICATION_POLICY_UNDECLARED +
          String(tableName || tableId),
      );
    }
    await options.assertProvisioningOwnership?.();
    const provisioningSummary = await this.provisionInitialPartition({
      tableId,
      tableName,
      tableMetadata: existingTableRecord,
      partitionId,
      partitionMetadata: existingPartition,
      replicaCount: desiredTarget.replicationFactor,
      cancellationToken: options?.cancellationToken || null,
      schemaJobId: options.schemaJobId || null,
      schemaOwnerFenceToken: options.schemaOwnerFenceToken ?? null,
      assertProvisioningOwnership:
        options.assertProvisioningOwnership || null,
    });
    const completion = resolveTableCreationCompletion({provisioningSummary});
    return {
      tableId,
      partitionId,
      partitionMetadataCreated,
      completionState: completion.completionState,
      completionReason: completion.completionReason,
      contractState: completion.contractState,
      nextAction: completion.nextAction,
      provisioningSummary,
    };
  },
});

function defineTableCreationExistingTableReconciliation(serviceClass) {
  Object.defineProperty(
    serviceClass.prototype,
    'reconcileExistingInitialPartition',
    {
      configurable: true,
      value:
        EXISTING_TABLE_RECONCILIATION_METHODS.reconcileExistingInitialPartition,
      writable: true,
    },
  );
}

export {defineTableCreationExistingTableReconciliation};
