import {assertCritical} from '../../utils/assert.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';
import {
  ReplicaStatus,
  TERMINAL_STATUSES,
  isTerminalStep,
  isValidWorkflowStep,
} from '../../rebalancer/replica-status.js';
import {
  buildReplicatedServiceBootstrapTopology,
  formatReplicatedServiceAddress,
} from '../../service/replicated-service-topology.js';
import {
  getSchemaByTableName,
} from '../system-table-schemas-constants.js';
import {getPartitionDbPath} from '../../storage/data-directory-manager.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../replication-target-authority.js';


const RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES = new Set([
  ReplicaStatus.ACTIVE,
  SERVICE_STATUS.ACTIVE,
]);

function normalizeJoinMetadataString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readJoinCacheRows(systemTableCache, tableName) {
  if (!systemTableCache) {
    return [];
  }
  if (typeof systemTableCache.getAll === 'function') {
    const rows = systemTableCache.getAll(tableName);
    return Array.isArray(rows) ? rows : [];
  }
  if (typeof systemTableCache.filter === 'function') {
    const rows = systemTableCache.filter(tableName, () => true);
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

function getJoinCacheRow(
  systemTableCache,
  tableName,
  key,
  predicate = null,
) {
  if (key !== null &&
      key !== undefined &&
      typeof systemTableCache?.get === 'function') {
    const row = systemTableCache.get(tableName, key);
    if (row) {
      return row;
    }
  }
  if (typeof predicate !== 'function') {
    return null;
  }
  return readJoinCacheRows(systemTableCache, tableName)
    .find(predicate) || null;
}

function filterRestorablePartitionServiceRows(serviceRows, partitionId) {
  return serviceRows.filter((row) => {
    return normalizeJoinMetadataString(
      row?.partition_id,
    ) === partitionId &&
      normalizeJoinMetadataString(
        row?.service_type,
      ).toLowerCase() === SERVICE_TYPE.PARTITION &&
      RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES.has(
        normalizeJoinMetadataString(
          row?.status,
        ).toLowerCase(),
      );
  });
}

function hasActiveReplicaOperationOwner(systemTableCache, partitionId) {
  return readJoinCacheRows(systemTableCache, TABLES.REPLICA_OPERATIONS)
    .some((row) => {
      const entityType = normalizeJoinMetadataString(
        row?.entity_type || row?.entityType,
      ).toLowerCase();
      if (entityType.length > 0 &&
          entityType !== SERVICE_TYPE.PARTITION) {
        return false;
      }

      const operationPartitionId = normalizeJoinMetadataString(
        row?.entity_id ||
          row?.entityId ||
          row?.partition_id ||
          row?.partitionId,
      );
      if (operationPartitionId !== partitionId) {
        return false;
      }

      const operationType = normalizeJoinMetadataString(
        row?.type,
      ).toUpperCase();
      const workflowStep = normalizeJoinMetadataString(
        row?.workflow_step || row?.workflowStep,
      ).toUpperCase();
      if (operationType.length > 0 &&
          workflowStep.length > 0 &&
          isValidWorkflowStep(operationType, workflowStep)) {
        return !isTerminalStep(operationType, workflowStep);
      }

      const status = normalizeJoinMetadataString(
        row?.status,
      ).toLowerCase();
      return status.length === 0 ||
        !TERMINAL_STATUSES.includes(status);
    });
}

function shouldRestoreDurableRejoinPartition({
  systemTableCache,
  partitionId,
  partitionRow,
  partitionServiceRows,
}) {
  // Row decode is owned by the single policy authority; an undeclared policy
  // keeps this planner's explicit conservative branch (restore).
  const desiredTarget = resolveDesiredReplicationFactor(partitionRow);
  if (desiredTarget.source === REPLICATION_TARGET_SOURCE.UNDECLARED) {
    return true;
  }
  if (partitionServiceRows.length <= desiredTarget.replicationFactor) {
    return true;
  }
  return hasActiveReplicaOperationOwner(systemTableCache, partitionId);
}

function buildDurableRejoinPartitionRestoreOptions({
  systemTableCache,
  serviceRows,
  serviceRow,
  partitionId,
  replicaId,
  nodeId,
  dataDir,
}) {
  const partitionRow = getJoinCacheRow(
    systemTableCache,
    TABLES.PARTITIONS,
    partitionId,
    (row) => normalizeJoinMetadataString(
      row?.partition_id,
    ) === partitionId,
  );
  assertCritical(
    partitionRow,
    `Missing partition metadata for durable rejoin replica ${replicaId}`,
  );

  const tableId = normalizeJoinMetadataString(
    partitionRow.table_id || partitionRow.table_name,
  );
  assertCritical(
    tableId,
    `Missing table metadata reference for durable rejoin partition ${partitionId}`,
  );

  const tableName = normalizeJoinMetadataString(
    partitionRow.table_name || tableId,
  );
  const tableRow = getJoinCacheRow(
    systemTableCache,
    TABLES.TABLES,
    tableId,
    (row) => normalizeJoinMetadataString(
      row?.table_id,
    ) === tableId ||
      normalizeJoinMetadataString(
        row?.table_name,
      ) === tableName,
  );
  let schema = null;
  if (tableRow?.schema_definition) {
    schema = typeof tableRow.schema_definition === 'string' ?
      JSON.parse(tableRow.schema_definition) :
      tableRow.schema_definition;
  } else {
    schema = getSchemaByTableName(tableName);
  }
  assertCritical(
    schema,
    `Missing schema definition for durable rejoin partition ${partitionId}`,
  );

  const partitionServiceRows = filterRestorablePartitionServiceRows(
    serviceRows,
    partitionId,
  );
  const topology = buildReplicatedServiceBootstrapTopology({
    serviceType: SERVICE_TYPE.PARTITION,
    serviceRows: partitionServiceRows,
    targetReplicaId: replicaId,
    targetNodeId: nodeId,
    targetAddress: serviceRow?.address,
  });

  const leaderNodeId = normalizeJoinMetadataString(
    partitionRow?.leader_node_id,
  );
  const leaderService = leaderNodeId.length > 0 ?
    partitionServiceRows.find((row) =>
      normalizeJoinMetadataString(
        row?.node_id,
      ) === leaderNodeId,
    ) :
    null;
  const leaderReplicaId = normalizeJoinMetadataString(
    leaderService?.replica_id ||
      leaderService?.service_id,
  );
  const leaderAddress = leaderService ?
    formatReplicatedServiceAddress(
      SERVICE_TYPE.PARTITION,
      leaderNodeId,
      leaderReplicaId,
      leaderService?.address,
    ) :
    null;

  return {
    serviceType: UNIFIED_SERVICE_TYPE.PARTITION,
    partitionId,
    tableId,
    tableName,
    schema,
    keyRange: {
      start: partitionRow.partition_key_start ?? null,
      end: partitionRow.partition_key_end ?? null,
    },
    replicaId,
    replicaIds: topology?.replicaIds || [],
    peerAddresses: topology?.peerAddresses || [],
    nodeId,
    dbPath: getPartitionDbPath(
      dataDir,
      partitionId,
      replicaId,
    ),
    leaderAddress,
    isJoiningExistingGroup: false,
    deferElection: true,
    suppressLifecycleLogs: true,
    restoringExistingReplica: true,
  };
}

const DURABLE_REJOIN_RESTORE_SKIPPED_MSG =
  'Durable rejoin restore skipped for partition with incomplete metadata';

function buildDurableRejoinPartitionRestorePlans(options = {}) {
  const systemTableCache = options.systemTableCache || null;
  const nodeId = normalizeJoinMetadataString(options.nodeId);
  const dataDir = options.dataDir || null;
  const logger = options.logger || null;
  const serviceRows = readJoinCacheRows(
    systemTableCache,
    TABLES.SERVICES,
  );
  const restorePlans = [];
  const seenReplicaIds = new Set();
  const restoreEligibilityByPartitionId = new Map();

  for (const serviceRow of serviceRows) {
    const serviceType = normalizeJoinMetadataString(
      serviceRow?.service_type,
    ).toLowerCase();
    const serviceNodeId = normalizeJoinMetadataString(
      serviceRow?.node_id,
    );
    const replicaId = normalizeJoinMetadataString(
      serviceRow?.replica_id || serviceRow?.service_id,
    );
    const partitionId = normalizeJoinMetadataString(
      serviceRow?.partition_id,
    );
    const status = normalizeJoinMetadataString(
      serviceRow?.status,
    ).toLowerCase();

    if (serviceType !== SERVICE_TYPE.PARTITION ||
        serviceNodeId !== nodeId ||
        replicaId.length === 0 ||
        partitionId.length === 0 ||
        !RESTORABLE_DURABLE_REJOIN_PARTITION_STATUSES.has(status) ||
        seenReplicaIds.has(replicaId)) {
      continue;
    }

    try {
      if (!restoreEligibilityByPartitionId.has(partitionId)) {
        const partitionRow = getJoinCacheRow(
          systemTableCache,
          TABLES.PARTITIONS,
          partitionId,
          (row) => normalizeJoinMetadataString(
            row?.partition_id,
          ) === partitionId,
        );
        assertCritical(
          partitionRow,
          `Missing partition metadata for durable rejoin replica ${replicaId}`,
        );
        restoreEligibilityByPartitionId.set(
          partitionId,
          shouldRestoreDurableRejoinPartition({
            systemTableCache,
            partitionId,
            partitionRow,
            partitionServiceRows: filterRestorablePartitionServiceRows(
              serviceRows,
              partitionId,
            ),
          }),
        );
      }
      if (restoreEligibilityByPartitionId.get(partitionId) !== true) {
        continue;
      }

      seenReplicaIds.add(replicaId);
      restorePlans.push(
        buildDurableRejoinPartitionRestoreOptions({
          systemTableCache,
          serviceRows,
          serviceRow,
          partitionId,
          replicaId,
          nodeId,
          dataDir,
        }),
      );
    } catch (error) {
      // CL-024: incomplete metadata for ONE partition (e.g. a load-created
      // table whose TABLES row lacks schema_definition in the join cache at
      // restore time) must fail closed for THAT partition only — its restore
      // is skipped and the replica is re-established by post-join repair.
      // Aborting the whole rejoin here exits the node process.
      restoreEligibilityByPartitionId.set(partitionId, false);
      logger?.warn?.(DURABLE_REJOIN_RESTORE_SKIPPED_MSG, {
        nodeId,
        partitionId,
        replicaId,
        error: error?.message || String(error),
      });
    }
  }

  return restorePlans;
}

export {
  buildDurableRejoinPartitionRestorePlans,
};
