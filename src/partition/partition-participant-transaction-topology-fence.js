// TX1 v10 8.1: BEGIN/new PREPARE consult the split/merge owners' handles and
// transition metadata. This R10 admission hint does not settle a PREPARED
// transaction and is not the Leg B topology/commit barrier. Unreadable owner
// data cannot prove that no transition names this partition.
import {TABLES} from '../constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD as FIELD,
  PARTITION_TRANSITION_STATE as STATE,
} from './partition-constants.js';
import {normalizeSplitTransitionMetadataForService} from
  './partition-service-split-replication-state.js';
import {normalizeMergeTransitionMetadataForService} from
  './partition-service-merge-replication-state.js';

const SPLIT_STATES = new Set([STATE.SPLIT_BACKFILLING, STATE.SPLIT_CATCHUP,
  STATE.SPLIT_CUTOVER_ACTIVE]);
const MERGE_STATES = new Set([STATE.MERGE_BACKFILLING, STATE.MERGE_CATCHUP,
  STATE.MERGE_CUTOVER_ACTIVE]);
const TOPOLOGY_TRANSITION_KIND = Object.freeze({
  SPLIT_HANDLE: 'split_replication_handle',
  MERGE_HANDLE: 'merge_replication_handle',
  DURABLE_ROW: 'durable_transition_row',
  UNAVAILABLE: 'topology_owner_unavailable',
});
const TOPOLOGY_UNAVAILABLE_REASON = Object.freeze({
  READ: 'transition_read_unavailable',
  METADATA: 'active_transition_metadata_unreadable',
});
const PARTITION_TRANSITION_ROLE = Object.freeze({
  SOURCE: 'source',
  TARGET: 'target',
});

function unavailable(reason, state = null) {
  return {kind: TOPOLOGY_TRANSITION_KIND.UNAVAILABLE, state, reason};
}

function parsedMetadataOf(raw) {
  try {
    const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ?
      metadata : null;
  } catch {
    return null;
  }
}

// Each source owner's own normalizer validates its full metadata. For a
// target, validate against the source named in the row before inspecting
// its target list; source-normalizer rejection alone is never absence.
function transitionPartitions(state, raw) {
  const metadata = parsedMetadataOf(raw);
  if (metadata === null) return null;
  if (SPLIT_STATES.has(state)) {
    const source = metadata[FIELD.SOURCE_PARTITION_ID];
    const normalized = normalizeSplitTransitionMetadataForService(
      {partitionId: source}, metadata);
    return normalized === null ? null :
      {sources: [normalized.sourcePartitionId], targets: normalized.targetPartitionIds};
  }
  const sources = metadata[FIELD.SOURCE_PARTITION_IDS];
  const normalized = normalizeMergeTransitionMetadataForService(
    {partitionId: Array.isArray(sources) ? sources[0] : null}, metadata);
  return normalized === null ? null :
    {sources: normalized.sourcePartitionIds, targets: [normalized.targetPartitionId]};
}

function handleTransitionOf(service) {
  if (service.splitReplication) {
    return {kind: TOPOLOGY_TRANSITION_KIND.SPLIT_HANDLE,
      state: service.splitReplication.phase ?? null};
  } else if (service.mergeReplication) {
    return {kind: TOPOLOGY_TRANSITION_KIND.MERGE_HANDLE,
      state: service.mergeReplication.phase ?? null};
  }
  return null;
}

/**
 * The active transition naming this partition, an unavailable owner read,
 * or null after a readable census found none. No transition state is written.
 * @param {Object} service PartitionService.
 * @return {Object|null} {kind, state, namesThisPartitionAs?, reason?}.
 */
function topologyTransitionOf(service) {
  const handleTransition = handleTransitionOf(service);
  if (handleTransition !== null) return handleTransition;
  try {
    const rows = service.systemTableCache?.getAll(TABLES.TABLES);
    if (!Array.isArray(rows)) return unavailable(TOPOLOGY_UNAVAILABLE_REASON.READ);
    for (const row of rows) {
      const state = row?.partition_transition_state;
      if (!SPLIT_STATES.has(state) && !MERGE_STATES.has(state)) continue;
      const partitions = transitionPartitions(state, row.partition_transition_metadata);
      if (partitions === null) {
        return unavailable(TOPOLOGY_UNAVAILABLE_REASON.METADATA, state);
      }
      const source = partitions.sources.includes(service.partitionId);
      if (source || partitions.targets.includes(service.partitionId)) {
        return {kind: TOPOLOGY_TRANSITION_KIND.DURABLE_ROW, state,
          namesThisPartitionAs: source ?
            PARTITION_TRANSITION_ROLE.SOURCE :
            PARTITION_TRANSITION_ROLE.TARGET};
      }
    }
    return null;
  } catch {
    return unavailable(TOPOLOGY_UNAVAILABLE_REASON.READ);
  }
}

export {TOPOLOGY_TRANSITION_KIND, topologyTransitionOf};
