import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  assertSplitRoutingDescriptorEpoch as assertPartitionSplitRoutingDescriptorEpoch,
} from './partition-split-routing.js';

const {
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  TABLES,
} = PARTITION_SERVICE_SHARED;

function normalizeSplitTransitionMetadataForService(service, rawMetadata) {
  if (!rawMetadata) {
    return null;
  }
  let metadata = rawMetadata;
  if (typeof rawMetadata === 'string') {
    try {
      metadata = JSON.parse(rawMetadata);
    } catch {
      return null;
    }
  }
  if (!metadata || typeof metadata !== PARTITION_SERVICE_LITERAL.OBJECT) {
    return null;
  }
  const targetPartitionIds =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS];
  const targetPartitionVersion = Number(
    metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
  );
  const primaryKeyColumn =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN];
  const sourcePartitionId =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
  if (
    !primaryKeyColumn ||
    !sourcePartitionId ||
    sourcePartitionId !== service.partitionId ||
    !Array.isArray(targetPartitionIds) ||
    targetPartitionIds.length !== 2 ||
    !targetPartitionIds[0] ||
    !targetPartitionIds[1] ||
    !Number.isInteger(targetPartitionVersion)
  ) {
    return null;
  }
  return {
    primaryKeyColumn,
    sourcePartitionId,
    splitKey: metadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY],
    targetPartitionIds: [...targetPartitionIds],
    targetPartitionVersion,
    workflowId:
      metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || null,
  };
}

function resolveSplitDescriptorEpochEvidenceForService(service, metadata) {
  if (
    !service.systemTableCache ||
    typeof service.systemTableCache.get !== PARTITION_SERVICE_TYPE.FUNCTION
  ) {
    return null;
  }
  const tableDescriptor =
    service.systemTableCache.get(TABLES.TABLES, service.tableId) ||
    service.systemTableCache.get(TABLES.TABLES, service.tableName) ||
    null;
  if (!tableDescriptor) {
    return null;
  }
  const targetPartitionIds = Array.isArray(metadata?.targetPartitionIds) ?
    metadata.targetPartitionIds :
    [];
  const targetPartitionDescriptors = targetPartitionIds.map((partitionId) =>
    service.systemTableCache.get(TABLES.PARTITIONS, partitionId) || null,
  );
  return {
    tableDescriptor,
    targetPartitionDescriptors,
    requireTargetDescriptors: targetPartitionIds.length > 0,
  };
}

function assertSplitRoutingDescriptorEpochForService(service, metadata) {
  return assertPartitionSplitRoutingDescriptorEpoch(metadata, {
    descriptorEpochEvidence:
      service.resolveSplitDescriptorEpochEvidence(metadata),
  });
}

function isSameSplitReplicationMetadata(left, right) {
  if (!left || !right) {
    return false;
  }
  return (
    left.primaryKeyColumn === right.primaryKeyColumn &&
    left.sourcePartitionId === right.sourcePartitionId &&
    left.splitKey === right.splitKey &&
    left.targetPartitionVersion === right.targetPartitionVersion &&
    Array.isArray(left.targetPartitionIds) &&
    Array.isArray(right.targetPartitionIds) &&
    left.targetPartitionIds.length === right.targetPartitionIds.length &&
    left.targetPartitionIds.every(
      (partitionId, index) => partitionId === right.targetPartitionIds[index],
    )
  );
}

function reconstructSplitExecutionStateForService(service, durableState) {
  if (!durableState || !durableState.phase || !durableState.metadata) {
    return null;
  }
  const phase = durableState.phase;
  const activeSplitPhases = /* @__PURE__ */ new Set([
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  ]);
  if (!activeSplitPhases.has(phase)) {
    return null;
  }
  const metadata = service.normalizeSplitTransitionMetadata(
    durableState.metadata,
  );
  if (!metadata) {
    return null;
  }
  service.splitReplication = {
    metadata,
    phase,
    pendingEntries: [],
    flushPromise: null,
    startedAt: Date.now(),
    lastError: null,
  };
  service.logger.info(
    PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_RECONSTRUCTED,
    {
      partitionId: service.partitionId,
      phase,
      workflowId: metadata.workflowId,
    },
  );
  return service.splitReplication;
}

export {
  assertSplitRoutingDescriptorEpochForService,
  isSameSplitReplicationMetadata,
  normalizeSplitTransitionMetadataForService,
  reconstructSplitExecutionStateForService,
  resolveSplitDescriptorEpochEvidenceForService,
};
