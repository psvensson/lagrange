import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  loadDurableDeltasBehindWatermark,
  normalizeReplayCursor,
} from './partition-mirror-replay-cursor.js';
import {
  assertSplitRoutingDescriptorEpoch as assertPartitionSplitRoutingDescriptorEpoch,
} from './partition-split-routing.js';

const {
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  SPLIT_ACK_CHECKPOINT_FIELD,
  TABLES,
} = PARTITION_SERVICE_SHARED;

/**
 * Parse raw transition metadata into a plain object: accepts an already
 * parsed object or a JSON string, returning null for anything else.
 * @param {*} rawMetadata
 * @return {Object|null}
 */
function parseSplitTransitionMetadataObject(rawMetadata) {
  if (!rawMetadata) {
    return null;
  }
  if (typeof rawMetadata === 'string') {
    try {
      const parsed = JSON.parse(rawMetadata);
      return parsed && typeof parsed === PARTITION_SERVICE_LITERAL.OBJECT ?
        parsed :
        null;
    } catch {
      return null;
    }
  }
  return typeof rawMetadata === PARTITION_SERVICE_LITERAL.OBJECT ?
    rawMetadata :
    null;
}

/**
 * Validate the structural contract of parsed split transition metadata
 * against this service's partition identity.
 * @param {Object} service
 * @param {Object} metadata
 * @return {boolean}
 */
function isSplitTransitionMetadataValidForService(service, metadata) {
  const targetPartitionIds =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS];
  const sourcePartitionId =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
  return Boolean(
    metadata[PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN] &&
    sourcePartitionId &&
    sourcePartitionId === service.partitionId &&
    Array.isArray(targetPartitionIds) &&
    targetPartitionIds.length === 2 &&
    targetPartitionIds[0] &&
    targetPartitionIds[1] &&
    Number.isInteger(Number(
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
    )),
  );
}

function normalizeSplitTransitionMetadataForService(service, rawMetadata) {
  const metadata = parseSplitTransitionMetadataObject(rawMetadata);
  if (!metadata || !isSplitTransitionMetadataValidForService(service, metadata)) {
    return null;
  }
  const fenceToken =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN];
  // The cursor is read from the durable source checkpoint on raw
  // transition metadata, but normalization must also be IDEMPOTENT:
  // re-normalizing an already-normalized payload (reconstruction reads
  // the durable row through the same normalizer) keeps the cursor.
  const replayCursor = normalizeReplayCursor(
    metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT] ||
      metadata,
    SPLIT_ACK_CHECKPOINT_FIELD,
  );
  return {
    primaryKeyColumn:
      metadata[PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN],
    sourcePartitionId:
      metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID],
    splitKey: metadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY],
    targetPartitionIds: [
      ...metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS],
    ],
    targetPartitionVersion: Number(
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
    ),
    workflowId:
      metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || null,
    // The workflow fence epoch this source was started under: every
    // source acknowledgement is stamped with it so the owner rejects
    // acks from a superseded owner epoch as STALE_FENCE.
    workflowFenceToken: Number.isInteger(fenceToken) ? fenceToken : null,
    // The durable replay cursor persisted with the transition (null
    // when the pre-restart source never recorded one): a resumed worker
    // replays deltas from the Raft log behind the watermark instead of
    // the volatile pendingEntries array.
    snapshotBarrierIndex: replayCursor.snapshotBarrierIndex,
    replayWatermarkIndex: replayCursor.replayWatermarkIndex,
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
    // Epoch evidence never fails open on the mirror path: an active
    // split mirror with a cold-cache evidence gap fails closed
    // post-cutover and defers (throws defer-tagged) pre-cutover.
    evidenceGapFailsClosed:
      service.splitReplication?.phase ===
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    evidenceGapDefers: Boolean(service.splitReplication),
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
  // Seed the catch-up queue from the DURABLE Raft log behind the
  // persisted replay watermark — never from the pre-restart volatile
  // array (which died with the process). Writes that arrive after this
  // reconstruction queue live via handleSplitReplicationAfterWrite.
  const replayedDeltas = loadDurableDeltasBehindWatermark(
    service,
    metadata.replayWatermarkIndex,
  );
  service.splitReplication = {
    metadata,
    phase,
    pendingEntries: replayedDeltas,
    flushPromise: null,
    startedAt: Date.now(),
    lastError: null,
    snapshotBarrierIndex: metadata.snapshotBarrierIndex,
    replayWatermarkIndex: metadata.replayWatermarkIndex,
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
