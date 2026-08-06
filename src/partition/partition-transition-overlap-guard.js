/**
 * Durable split/merge overlap guard (F23).
 *
 * The workflow owners (ManagedSplitWorkflow, ManagedMergeWorkflow)
 * refuse to register a split or merge whose source/target key ranges
 * overlap an already-persisted in-flight transition's ranges. The
 * check consults the DURABLE tables transition rows (via listTableInfos
 * + parsePartitionTransition) and the authoritative partitions rows —
 * never the process-local splitReplication/mergeReplication handle
 * check that dies with a restart and cannot see a transition another
 * node owns.
 *
 * Overlap semantics come from the key-range-manager contiguity
 * authority (KeyRange.overlaps: [start, end) ranges, NULL unbounded).
 * Fail-closed: a persisted in-flight transition whose key ranges
 * cannot be resolved is treated as overlapping the full key space
 * rather than silently admitting a potentially-conflicting transition.
 */

import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  MANAGED_MERGE_LOG_MSG,
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
} from './partition-constants.js';
import {
  isRetryableManagedSplitTransition,
} from './managed-split-retry-policy.js';
import {KeyRange} from './key-range-manager.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';

/**
 * Resolve the {start, end} key range of one partition row (NULL
 * unbounded), mirroring the workflow's resolvePartitionKeyRange field
 * precedence.
 * @param {Object|null} partitionInfo - Partition row.
 * @param {Object} [fallbackRange={}] - Fallback bounds.
 * @return {{start: *, end: *}} Key range.
 */
function resolvePartitionRowKeyRange(partitionInfo, fallbackRange = {}) {
  return {
    start: partitionInfo?.partition_key_start ??
      partitionInfo?.partitionKeyStart ??
      fallbackRange.start ??
      null,
    end: partitionInfo?.partition_key_end ??
      partitionInfo?.partitionKeyEnd ??
      fallbackRange.end ??
      null,
  };
}

/**
 * Resolve the source partition ids one persisted transition covers.
 * @param {Object} metadata - Persisted transition metadata.
 * @return {string[]} Source partition ids.
 */
function resolveTransitionSourcePartitionIds(metadata) {
  const sourcePartitionId = String(
    metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID] || '',
  );
  const sourcePartitionIds =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS];
  return [
    ...(sourcePartitionId ? [sourcePartitionId] : []),
    ...(Array.isArray(sourcePartitionIds) ?
      sourcePartitionIds.map((partitionId) => String(partitionId || '')) :
      []),
  ].filter((partitionId) => partitionId.length > 0);
}

/**
 * Resolve the durable key ranges a persisted in-flight transition
 * covers: the source partition ranges (re-resolved against the
 * authoritative partitions rows, with the persisted snapshot range as
 * fallback), and — for a split whose splitKey is already persisted —
 * the planned target child ranges.
 * @param {Object} transition - Parsed {state, metadata} transition.
 * @param {Function} getPartitionInfo - Durable partition row lookup.
 * @return {Array<{start: *, end: *}>} Covered key ranges.
 */
function resolvePersistedTransitionKeyRanges(transition, getPartitionInfo) {
  const metadata = transition?.metadata &&
      typeof transition.metadata === LOCAL_STR_OBJECT ?
    transition.metadata :
    {};
  const lookupPartitionInfo = typeof getPartitionInfo ===
    LOCAL_STR_FUNCTION ?
    getPartitionInfo :
    () => null;
  const snapshotRanges =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]
      ?.sourcePartitionKeyRanges || {};
  const ranges = resolveTransitionSourcePartitionIds(metadata).map(
    (partitionId) => resolvePartitionRowKeyRange(
      lookupPartitionInfo(partitionId),
      snapshotRanges[partitionId] || {},
    ),
  );

  const splitKey =
    metadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY];
  if (splitKey !== undefined && splitKey !== null && ranges.length > 0) {
    // A split's target children partition the source range at splitKey;
    // persist them explicitly so the durable row alone proves which key
    // ranges the in-flight transition covers.
    const sourceRange = ranges[0];
    ranges.push({start: sourceRange.start, end: splitKey});
    ranges.push({start: splitKey, end: sourceRange.end});
  }
  return ranges;
}

/**
 * Resolve whether one persisted transition is ineligible as a conflict
 * witness (unparseable, retryable, or the registering workflow's own
 * row — a retry never self-conflicts).
 * @param {Object|null} transition - Parsed transition or null.
 * @param {string} registeringWorkflowId - Registering workflow id.
 * @return {boolean}
 */
function isIneligibleConflictTransition(transition, registeringWorkflowId) {
  if (!transition ||
      isRetryableManagedSplitTransition(transition)) {
    return true;
  }
  const transitionWorkflowId = String(
    transition.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID
    ] || '',
  );
  return transitionWorkflowId.length > 0 &&
    transitionWorkflowId === registeringWorkflowId;
}

/**
 * Resolve the persisted key ranges one transition covers, failing
 * closed to the full key space when no range can be resolved.
 * @param {Object} transition - Parsed transition.
 * @param {Function} getPartitionInfo - Durable partition row lookup.
 * @return {Array<{start: *, end: *}>} Covered key ranges.
 */
function resolveConflictWitnessRanges(transition, getPartitionInfo) {
  const persistedRanges = resolvePersistedTransitionKeyRanges(
    transition,
    getPartitionInfo,
  );
  if (persistedRanges.length === 0) {
    // Fail closed: a persisted in-flight transition whose key ranges
    // cannot be resolved is treated as covering the full key space.
    return [{start: null, end: null}];
  }
  return persistedRanges;
}

/**
 * Check one persisted table row's transition against the candidate
 * ranges. Returns the conflict descriptor or null.
 * @param {Object} tableInfo - Durable tables row.
 * @param {Object} options - Guard options (see
 *   findPersistedTransitionOverlap).
 * @param {Array<KeyRange>} candidateRanges - Candidate key ranges.
 * @return {Object|null} Conflict descriptor or null.
 */
function checkTableInfoTransitionOverlap(
  tableInfo,
  options,
  candidateRanges,
) {
  const transition = options.parsePartitionTransition(tableInfo);
  if (isIneligibleConflictTransition(
    transition,
    String(options.workflowId || ''),
  )) {
    return null;
  }
  const persistedRanges = resolveConflictWitnessRanges(
    transition,
    options.getPartitionInfo,
  );
  const overlapsPersisted = persistedRanges.some((persistedRange) => {
    const persistedKeyRange = KeyRange.fromObject(persistedRange);
    return candidateRanges.some((candidateRange) =>
      candidateRange.overlaps(persistedKeyRange));
  });
  if (!overlapsPersisted) {
    return null;
  }
  return {
    conflictingTableId: String(
      tableInfo?.table_id ?? tableInfo?.tableId ?? '',
    ),
    conflictingWorkflowId: String(
      transition.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID
      ] || '',
    ),
    conflictingState: String(transition.state || ''),
  };
}

/**
 * Check one candidate range list against the durable in-flight
 * transition rows. Returns the first overlapping persisted transition
 * conflict, or null when every candidate range is clear.
 * @param {Object} options
 * @param {Array<{start: *, end: *}>} options.candidateRanges - Ranges
 *   the new transition would cover.
 * @param {string} options.tableId - Registering table.
 * @param {string} options.workflowId - Registering workflow id (a
 *   retry of the same persisted transition is not a self-conflict).
 * @param {Function} options.listTableInfos - Durable tables row list.
 * @param {Function} options.parsePartitionTransition - Transition row
 *   parser.
 * @param {Function} options.getPartitionInfo - Durable partition row
 *   lookup.
 * @return {Object|null} {conflictingTableId, conflictingWorkflowId,
 *   conflictingState} or null.
 */
function findPersistedTransitionOverlap(options) {
  if (typeof options.listTableInfos !== LOCAL_STR_FUNCTION ||
      typeof options.parsePartitionTransition !== LOCAL_STR_FUNCTION) {
    return null;
  }
  const candidateRanges = (Array.isArray(options.candidateRanges) ?
    options.candidateRanges :
    []
  ).map((range) => KeyRange.fromObject(range));

  for (const tableInfo of options.listTableInfos() || []) {
    const conflict = checkTableInfoTransitionOverlap(
      tableInfo,
      options,
      candidateRanges,
    );
    if (conflict) {
      return conflict;
    }
  }
  return null;
}

/**
 * Run the durable overlap guard for one candidate source range and
 * throw the qualified refusal on a conflict. When the registering
 * workflow id is null (same-table admission), a clear guard keeps the
 * plain already-in-progress refusal.
 * @param {Object} owner - Workflow owner (durable-row lookups, logger).
 * @param {Object} partitionInfo - Source partition row.
 * @param {Object} options - {partitionId?, tableId, workflowId}.
 * @return {void}
 */
function assertSplitOverlapRefusal(owner, partitionInfo, options) {
  const persistedOverlap = findPersistedTransitionOverlap({
    candidateRanges: [resolvePartitionRowKeyRange(partitionInfo)],
    tableId: options.tableId,
    workflowId: options.workflowId,
    listTableInfos: owner.listTableInfos,
    parsePartitionTransition: owner.parsePartitionTransition,
    getPartitionInfo: owner.getPartitionInfo,
  });
  if (options.workflowId === null && !persistedOverlap) {
    throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_ALREADY_IN_PROGRESS);
  }
  if (!persistedOverlap) {
    return;
  }
  if (options.workflowId !== null) {
    owner.logger.info(MANAGED_SPLIT_LOG_MSG.OVERLAP_REFUSED, {
      partitionId: options.partitionId,
      tableId: options.tableId,
      workflowId: options.workflowId,
      conflictingWorkflowId: persistedOverlap.conflictingWorkflowId,
      conflictingState: persistedOverlap.conflictingState,
    });
  }
  throw new Error(
    QUERY_ERROR_MSG.TABLE_SPLIT_ALREADY_IN_PROGRESS +
    QUERY_ERROR_MSG.TABLE_SPLIT_OVERLAPPING_TRANSITION_SUFFIX,
  );
}

/**
 * Assert no non-retryable in-flight transition blocks this split.
 * F23 overlap qualification: when the candidate split's source key
 * range overlaps a persisted in-flight transition's ranges, the
 * refusal carries the overlap suffix; a non-overlapping in-flight
 * transition keeps the plain refusal.
 * @param {Object} owner - Workflow owner (durable-row lookups).
 * @param {Object} options - {partitionInfo, tableId, existingTransition}.
 * @return {void}
 */
function assertSplitTransitionAdmissionClear(owner, options) {
  if (!options.existingTransition ||
      owner.isRetryableAdmissionState(options.existingTransition)) {
    return;
  }
  assertSplitOverlapRefusal(owner, options.partitionInfo, {
    tableId: options.tableId,
    workflowId: null,
  });
}

/**
 * Durable overlap guard (F23) at split registration: refuse when the
 * source key range overlaps an already-persisted in-flight
 * transition's ranges.
 * @param {Object} owner - Workflow owner (durable-row lookups, logger).
 * @param {Object} options - {partitionInfo, partitionId, tableId,
 *   workflowId}.
 * @return {void}
 */
function assertSplitRegistrationOverlapGuardClear(owner, options) {
  assertSplitOverlapRefusal(owner, options.partitionInfo, options);
}

/**
 * Durable overlap guard (F23) at merge registration: refuse when
 * either source key range overlaps an already-persisted in-flight
 * transition's ranges.
 * @param {Object} owner - Workflow owner (durable-row lookups, logger).
 * @param {Object} options - {sourcePartitionIds, tableId, workflowId,
 *   leftRange, rightRange}.
 * @return {void}
 */
function assertMergeRegistrationOverlapGuardClear(owner, options) {
  const persistedOverlap = findPersistedTransitionOverlap({
    candidateRanges: [options.leftRange, options.rightRange],
    tableId: options.tableId,
    workflowId: options.workflowId,
    listTableInfos: owner.listTableInfos,
    parsePartitionTransition: owner.parsePartitionTransition,
    getPartitionInfo: owner.getPartitionInfo,
  });
  if (!persistedOverlap) {
    return;
  }
  owner.logger.info(MANAGED_MERGE_LOG_MSG.OVERLAP_REFUSED, {
    sourcePartitionIds: options.sourcePartitionIds,
    tableId: options.tableId,
    workflowId: options.workflowId,
    conflictingWorkflowId: persistedOverlap.conflictingWorkflowId,
    conflictingState: persistedOverlap.conflictingState,
  });
  throw new Error(
    MANAGED_MERGE_ERROR_MSG.ALREADY_IN_PROGRESS +
    MANAGED_MERGE_ERROR_MSG.OVERLAPPING_TRANSITION_SUFFIX,
  );
}

export {
  assertMergeRegistrationOverlapGuardClear,
  assertSplitRegistrationOverlapGuardClear,
  assertSplitTransitionAdmissionClear,
  findPersistedTransitionOverlap,
  resolvePartitionRowKeyRange,
};
