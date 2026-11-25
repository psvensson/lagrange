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
import {
  decodeTableMetadataRecord,
} from './table-creation-service-metadata-lookup.js';
import {
  buildInitialPartitionMetadataFromTableRecord,
} from './table-creation-service-partition-provisioning.js';

function parseExistingTableSchemaDefinition(existingTableRecord) {
  const raw = existingTableRecord?.schema_definition;
  if (typeof raw === 'string' && raw.length > 0) {
    return JSON.parse(raw);
  }
  return raw && typeof raw === 'object' ? raw : null;
}

function resolveRestoredKeyType(explicitPartition, baseMeta) {
  if (explicitPartition?.partitionKeyType) {
    return explicitPartition.partitionKeyType;
  }
  return baseMeta.partition_key_type;
}

function resolveRestoredReplicaCount(explicitPartition, baseMeta) {
  if (explicitPartition?.replicaCount) {
    return explicitPartition.replicaCount;
  }
  return baseMeta.replica_count;
}

function buildRestoredPartitionMetadata(
  service,
  tableId,
  tableName,
  existingTableRecord,
  partitionId,
  explicitPartition,
) {
  const baseMeta = buildInitialPartitionMetadataFromTableRecord(
    service,
    tableId,
    tableName,
    existingTableRecord,
  );
  if (!explicitPartition && partitionId === baseMeta.partition_id) {
    return baseMeta;
  }
  return {
    ...baseMeta,
    partition_id: partitionId,
    partition_key_start: explicitPartition?.partitionKeyStart ?? null,
    partition_key_end: explicitPartition?.partitionKeyEnd ?? null,
    partition_key_type: resolveRestoredKeyType(explicitPartition, baseMeta),
    replica_count: resolveRestoredReplicaCount(explicitPartition, baseMeta),
  };
}

function resolveFirstExplicitPartition(options) {
  return Array.isArray(options.partitions) && options.partitions.length > 0 ?
    options.partitions[0] :
    null;
}

function resolveTargetPartitionId(tableId, options, explicitPartition) {
  if (options.partitionId) return options.partitionId;
  if (explicitPartition?.partitionId) return explicitPartition.partitionId;
  return `${tableId}-p1`;
}

async function restoreMissingPartitionRow(
  service,
  {tableId, tableName, existingTableRecord, partitionId, explicitPartition, options},
) {
  const gateway = service.getControlPlaneSystemTableGateway();
  if (!gateway) {
    throw new Error(
      TABLE_CREATION_SERVICE_LITERAL.UNABLE_TO_RESTORE_MISSING_INITIAL_PARTITION_METADATA_FOR_TABLE +
        String(tableName || tableId),
    );
  }
  const partitionRow = buildRestoredPartitionMetadata(
    service,
    tableId,
    tableName,
    existingTableRecord,
    partitionId,
    explicitPartition,
  );
  await options.assertProvisioningOwnership?.();
  await gateway.submitMutation(
    {
      operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
      tableName: TABLES.PARTITIONS,
      row: partitionRow,
    },
    {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      deliveryPriority: 'critical',
    },
  );
  return partitionRow;
}

function resolveExplicitDatasetExtras(existingTableRecord, existingPartition, options) {
  const hasExplicitSpec = Boolean(options.globalIndex || options.partitions);
  if (!hasExplicitSpec) {
    return {};
  }
  const parsedSchema = parseExistingTableSchemaDefinition(existingTableRecord);
  return {
    ...(parsedSchema ? {schema: parsedSchema} : {}),
    keyRange: {
      start: existingPartition.partition_key_start ?? null,
      end: existingPartition.partition_key_end ?? null,
    },
  };
}

function buildExistingPartitionProvisioningContext({
  tableId,
  tableName,
  existingTableRecord,
  partitionId,
  existingPartition,
  desiredTarget,
  options,
}) {
  const extras = resolveExplicitDatasetExtras(
    existingTableRecord, existingPartition, options,
  );
  return {
    tableId,
    tableName,
    tableMetadata: existingTableRecord,
    partitionId,
    partitionMetadata: existingPartition,
    replicaCount: desiredTarget.replicationFactor,
    ...extras,
    timeoutBudget: options?.timeoutBudget,
    cancellationToken: options?.cancellationToken || null,
    schemaJobId: options.schemaJobId || null,
    schemaOwnerFenceToken: options.schemaOwnerFenceToken ?? null,
    assertProvisioningOwnership: options.assertProvisioningOwnership || null,
  };
}

async function loadOrRestoreExistingPartition(
  service,
  {tableId, tableName, existingTableRecord, partitionId, explicitPartition, options},
) {
  const found = await service.findExistingPartitionRecord(partitionId);
  if (found) {
    return {existingPartition: found, partitionMetadataCreated: false};
  }
  const restored = await restoreMissingPartitionRow(service, {
    tableId, tableName, existingTableRecord, partitionId, explicitPartition, options,
  });
  return {existingPartition: restored, partitionMetadataCreated: true};
}

const EXISTING_TABLE_RECONCILIATION_METHODS = Object.freeze({
  /**
   * Re-run initial partition provisioning for existing CREATE TABLE IF NOT
   * EXISTS retries when metadata was created before provisioning finished.
   * @param {string} tableName
   * @param {Object|null} [existingTable=null]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async reconcileExistingInitialPartition(
    tableName,
    existingTable = null,
    options = {},
  ) {
    const existingTableRecord = existingTable ?
      decodeTableMetadataRecord(existingTable) :
      await this.findExistingTableRecord(tableName);
    const tableId = existingTableRecord?.table_id || null;
    if (!existingTableRecord || !tableId) {
      return {partitionMetadataCreated: false};
    }
    const explicitPartition = resolveFirstExplicitPartition(options);
    const partitionId = resolveTargetPartitionId(tableId, options, explicitPartition);
    const {
      existingPartition,
      partitionMetadataCreated,
    } = await loadOrRestoreExistingPartition(this, {
      tableId, tableName, existingTableRecord, partitionId, explicitPartition, options,
    });
    const desiredTarget = resolveDesiredReplicationFactor(existingPartition);
    if (desiredTarget.source === REPLICATION_TARGET_SOURCE.UNDECLARED) {
      throw new Error(
        TABLE_CREATION_SERVICE_LITERAL.EXISTING_PARTITION_REPLICATION_POLICY_UNDECLARED +
          String(tableName || tableId),
      );
    }
    await options.assertProvisioningOwnership?.();
    const provisioningSummary = await this.provisionInitialPartition({
      ...buildExistingPartitionProvisioningContext({
        tableId,
        tableName,
        existingTableRecord,
        partitionId,
        existingPartition,
        desiredTarget,
        options,
      }),
      timeoutBudget: options?.timeoutBudget,
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

export {
  EXISTING_TABLE_RECONCILIATION_METHODS,
};
