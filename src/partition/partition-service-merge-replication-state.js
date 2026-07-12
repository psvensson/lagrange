import {TABLES} from '../constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  buildPartitionDescriptorEpochDecision,
  isPartitionDescriptorEpochAccepted,
} from './partition-descriptor-epoch-contract.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_TYPE,
} from './partition-service-constants.js';

const LOCAL_STR_OBJECT = 'object';
const MERGE_SOURCE_PARTITION_COUNT = 2;

/**
 * Merge replication state helpers for the source PartitionService,
 * mirroring partition-service-split-replication-state.js: metadata
 * normalization, descriptor-epoch evidence, and durable cutover/abort
 * observation against the local system-table cache.
 */

/**
 * Parse raw transition metadata (object or JSON string) into an object.
 * @param {Object|string|null} rawMetadata
 * @return {Object|null}
 */
function parseRawTransitionMetadata(rawMetadata) {
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
  return metadata && typeof metadata === LOCAL_STR_OBJECT ? metadata : null;
}

/**
 * Validate the merge metadata shape for one source partition service.
 * @param {Object} service - PartitionService instance.
 * @param {Object} metadata - Parsed transition metadata.
 * @return {boolean}
 */
function isValidMergeMetadataShape(service, metadata) {
  const sourcePartitionIds =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS];
  const targetPartitionIds =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS];
  const targetPartitionVersion = Number(
    metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
  );
  const primaryKeyColumn =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN];
  return Boolean(primaryKeyColumn) &&
    Array.isArray(sourcePartitionIds) &&
    sourcePartitionIds.length === MERGE_SOURCE_PARTITION_COUNT &&
    sourcePartitionIds.includes(service.partitionId) &&
    Array.isArray(targetPartitionIds) &&
    targetPartitionIds.length === 1 &&
    Boolean(targetPartitionIds[0]) &&
    Number.isInteger(targetPartitionVersion);
}

/**
 * Normalize merge transition metadata from table/control-plane payloads.
 * @param {Object} service - PartitionService instance.
 * @param {Object|string|null} rawMetadata - Metadata payload.
 * @return {Object|null} Normalized metadata.
 */
function normalizeMergeTransitionMetadataForService(service, rawMetadata) {
  const metadata = parseRawTransitionMetadata(rawMetadata);
  if (!metadata || !isValidMergeMetadataShape(service, metadata)) {
    return null;
  }
  return {
    primaryKeyColumn:
      metadata[PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN],
    sourcePartitionIds: [
      ...metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS],
    ],
    targetPartitionId: String(
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS][0],
    ),
    targetPartitionVersion: Number(
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
    ),
    workflowId:
      metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || null,
  };
}

/**
 * Build descriptor-epoch evidence for merge mirror routing when the
 * system-table cache can see the table and target partition rows.
 * @param {Object} service - PartitionService instance.
 * @param {Object} metadata - Normalized merge transition metadata.
 * @return {Object|null} Descriptor epoch evidence.
 */
function resolveMergeDescriptorEpochEvidenceForService(service, metadata) {
  const tableDescriptor = resolveLocalTableDescriptorForService(service);
  if (!tableDescriptor) {
    return null;
  }
  const targetPartitionDescriptor = service.systemTableCache.get(
    TABLES.PARTITIONS,
    metadata.targetPartitionId,
  ) || null;
  return {
    tableDescriptor,
    targetPartitionDescriptors: [targetPartitionDescriptor],
    requireTargetDescriptors: true,
  };
}

/**
 * Assert merge routing still matches the descriptor epoch visible in
 * system-table metadata. Missing evidence (no cache yet) is tolerated,
 * exactly like the split mirror path.
 * @param {Object} service - PartitionService instance.
 * @param {Object} metadata - Normalized merge transition metadata.
 * @return {Object|null} Descriptor epoch decision when evidence exists.
 */
function assertMergeRoutingDescriptorEpochForService(service, metadata) {
  const descriptorEpochEvidence =
    resolveMergeDescriptorEpochEvidenceForService(service, metadata);
  if (!descriptorEpochEvidence) {
    return null;
  }
  const decision = buildPartitionDescriptorEpochDecision({
    ...descriptorEpochEvidence,
    metadataTargetPartitionVersion: metadata.targetPartitionVersion,
    requireRouteTargetVersion: true,
  });
  if (!isPartitionDescriptorEpochAccepted(decision)) {
    throw new Error(
      PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_ROUTING_FAILED,
    );
  }
  return decision;
}

/**
 * Resolve the local system-table cache's tables row for the service's
 * table.
 * @param {Object} service - PartitionService instance.
 * @return {Object|null}
 */
function resolveLocalTableDescriptorForService(service) {
  if (
    !service.systemTableCache ||
    typeof service.systemTableCache.get !== PARTITION_SERVICE_TYPE.FUNCTION
  ) {
    return null;
  }
  return service.systemTableCache.get(TABLES.TABLES, service.tableId) ||
    service.systemTableCache.get(TABLES.TABLES, service.tableName) ||
    null;
}

/**
 * Resolve whether the durable transition observed locally is an aborted
 * (FAILED) merge — the owner's fail-safe abort on a peer source failure.
 * @param {Object} service - PartitionService instance.
 * @return {boolean}
 */
function isMergeTransitionAbortedForService(service) {
  const tableDescriptor = resolveLocalTableDescriptorForService(service);
  if (!tableDescriptor) {
    return false;
  }
  const transitionState = String(
    tableDescriptor.partition_transition_state ??
      tableDescriptor.partitionTransitionState ??
      '',
  );
  return transitionState === PARTITION_TRANSITION_STATE.FAILED;
}

/**
 * Resolve whether the durable merge cutover is visible locally: either
 * the transition state reads merge_cutover_active or the table's active
 * partition version has been promoted to the merge target version.
 * @param {Object} service - PartitionService instance.
 * @param {Object} metadata - Normalized merge transition metadata.
 * @return {boolean}
 */
function isMergeCutoverActiveForService(service, metadata) {
  const tableDescriptor = resolveLocalTableDescriptorForService(service);
  if (!tableDescriptor) {
    return false;
  }
  const transitionState = String(
    tableDescriptor.partition_transition_state ??
      tableDescriptor.partitionTransitionState ??
      '',
  );
  if (transitionState === PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE) {
    return true;
  }
  const activeVersion = Number(
    tableDescriptor.active_partition_version ??
      tableDescriptor.activePartitionVersion,
  );
  return Number.isInteger(activeVersion) &&
    activeVersion >= metadata.targetPartitionVersion;
}

export {
  assertMergeRoutingDescriptorEpochForService,
  isMergeCutoverActiveForService,
  isMergeTransitionAbortedForService,
  normalizeMergeTransitionMetadataForService,
  resolveLocalTableDescriptorForService,
  resolveMergeDescriptorEpochEvidenceForService,
};
