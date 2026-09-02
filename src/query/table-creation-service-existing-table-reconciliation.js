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
  resolveTableCreationMutationContractOutcome,
  resolveTableCreationVisibilityContractOutcome,
} from './table-creation-service-completion.js';


const EXISTING_TABLE_RECONCILIATION_METHODS = Object.freeze({
  /**
   * Re-run initial partition provisioning for existing CREATE TABLE IF NOT
   * EXISTS retries when metadata was created before provisioning finished.
   * @param {string} tableName
   * @return {Promise<void>}
   * @private
   */
  async reconcileExistingInitialPartition(
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
    let existingPartition =
      await this.findExistingPartitionRecord(partitionId);
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
      await options.assertProvisioningOwnership?.();
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
      timeoutBudget: options?.timeoutBudget,
      cancellationToken: options?.cancellationToken || null,
      schemaJobId: options.schemaJobId || null,
      schemaOwnerFenceToken: options.schemaOwnerFenceToken ?? null,
      assertProvisioningOwnership:
        options.assertProvisioningOwnership || null,
    });
    const completion = resolveTableCreationCompletion({
      visibilityState,
      provisioningSummary,
      metadataContractOutcome,
    });
    return {
      tableId,
      partitionId,
      partitionMetadataCreated,
      visibilityState,
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
