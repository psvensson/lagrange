import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_INVARIANT_FALLBACK,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from './priority-recovery-diagnostics-constants.js';
import {
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';

const LOCAL_STR_EMPTY = '';

const LOCAL_NUM_ZERO = 0;

const LOCAL_NUM_ONE = 1;

const LOCAL_NUM_TWO = 2;

const LOCAL_EMPTY_LIST = Object.freeze([]);

const LOCAL_STR_BLOCKERREASONCODES = 'blockerReasonCodes';

const LOCAL_STR_SEMANTICSTATEIDS = 'semanticStateIds';

const PRIORITY_RECOVERY_OPERATION_ID_FIELD = Object.freeze({
  CAMEL: 'operationId',
  SNAKE: 'operation_id',
});

const PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD = Object.freeze({
  COMPLETED_AT_MS: 'completedAtMs',
  CREATED_AT_MS: 'createdAtMs',
  LAST_PROGRESS_AT_MS: 'lastProgressAtMs',
  TARGET_SERVICE_PROGRESS_AT_MS: 'targetServiceProgressAtMs',
  UPDATED_AT_MS: 'updatedAtMs',
});

const PRIORITY_RECOVERY_CURRENT_SUMMARY_SCOPE = Object.freeze({
  TRACKED_PRIORITY_PARTITIONS: 'tracked_priority_partitions',
});

const PRIORITY_RECOVERY_OBSERVATION_GATE_FIELD = Object.freeze({
  PRIORITY_SPREAD_DECISION_SOURCE: 'prioritySpreadDecisionSource',
});

const PRIORITY_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD = Object.freeze({
  EXPECTED_NODE_COUNT: 'expectedNodeCount',
  SELECTED_MISSING_PUBLISHED_NODE_IDS: 'selectedMissingPublishedNodeIds',
  SELECTED_PUBLISHED_ACTIVE_COUNT: 'selectedPublishedActiveCount',
  SELECTED_PUBLISHED_ACTIVE_NODE_IDS: 'selectedPublishedActiveNodeIds',
});

const PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE = Object.freeze({
  EXPLICIT_NODE_LIST: 'explicit_node_list',
  FULL_SELECTED_COVERAGE: 'full_selected_coverage',
  UNAVAILABLE: 'unavailable',
});

const PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE = Object.freeze({
  UNAVAILABLE: Object.freeze({
    state: PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE.UNAVAILABLE,
    nodeIds: LOCAL_EMPTY_LIST,
  }),
});

function isRecord(value) {
  return Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value);
}

function normalizeDistinctStringArray(values = []) {
  return normalizePriorityRecoveryStringList(values);
}

function resolvePriorityRecoverySnapshotOperationIds(snapshot = null) {
  return normalizeDistinctStringArray([
    snapshot?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.CAMEL],
    snapshot?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.SNAKE],
    snapshot?.coordinator?.operation?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.CAMEL],
    snapshot?.coordinator?.operation?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.SNAKE],
  ]);
}

function resolvePriorityRecoverySnapshotSortProgressTimestamp(snapshot) {
  const operation = isRecord(snapshot?.coordinator?.operation) ?
    snapshot.coordinator.operation :
    {};
  const progressTimestampCandidates = [
    operation[PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.COMPLETED_AT_MS],
    operation[PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.UPDATED_AT_MS],
    operation[
      PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.TARGET_SERVICE_PROGRESS_AT_MS
    ],
    snapshot?.progress?.[
      PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.LAST_PROGRESS_AT_MS
    ],
    operation[PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.CREATED_AT_MS],
  ]
    .map((candidate) => normalizeNonNegativeInteger(candidate))
    .filter((candidate) =>
      Number.isFinite(candidate) && candidate > 0,
    );
  return progressTimestampCandidates.length > 0 ?
    Math.max(...progressTimestampCandidates) :
    0;
}

function resolvePriorityRecoverySnapshotSortTimestamp(
  snapshot,
  decisionSnapshots,
) {
  const progressTimestamp =
    resolvePriorityRecoverySnapshotSortProgressTimestamp(snapshot);
  if (progressTimestamp > 0) {
    return progressTimestamp;
  }
  return Number(
    snapshot?.observation?.provenance?.capturedAt ??
      decisionSnapshots?.capturedAt ??
      0,
  );
}

function resolvePriorityRecoverySnapshotEvidenceRank(snapshot) {
  const operationCount = normalizeNonNegativeInteger(
    snapshot?.coordinator?.operationCount,
  );
  if (
    (Number.isFinite(operationCount) && operationCount > 0) ||
    resolvePriorityRecoverySnapshotOperationIds(snapshot).length > 0
  ) {
    return LOCAL_NUM_TWO;
  }
  const workflowState = normalizePriorityRecoveryObservationStateValue(
    snapshot?.observation?.workflowState,
    LOCAL_STR_EMPTY,
  );
  const visibilityState = normalizePriorityRecoveryObservationStateValue(
    snapshot?.observation?.visibilityState,
    LOCAL_STR_EMPTY,
  );
  if (
    (workflowState.length > 0 &&
      workflowState !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE) ||
    (visibilityState.length > 0 &&
      visibilityState !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE)
  ) {
    return LOCAL_NUM_ONE;
  }
  return LOCAL_NUM_ZERO;
}

function resolvePriorityRecoverySnapshotSortEpoch(
  snapshot,
  decisionSnapshots,
) {
  return normalizeNonNegativeInteger(
    snapshot?.epoch ?? decisionSnapshots?.publicationEpoch,
  ) ?? 0;
}

function resolvePriorityRecoveryExplicitSemanticStateMatchRank(
  snapshot,
  explicitSemanticStateByPartitionId = null,
) {
  const partitionId = String(snapshot?.partitionId || LOCAL_STR_EMPTY).trim();
  if (
    partitionId.length === 0 ||
    !(explicitSemanticStateByPartitionId instanceof Map)
  ) {
    return LOCAL_NUM_ZERO;
  }
  const explicitSemanticState =
    explicitSemanticStateByPartitionId.get(partitionId) || null;
  if (typeof explicitSemanticState !== 'string') {
    return LOCAL_NUM_ZERO;
  }
  const snapshotSemanticState = resolvePriorityRecoverySnapshotSemanticState(
    snapshot,
    normalizeDistinctStringArray(snapshot?.blockerReasons),
    null,
    true,
  );
  return snapshotSemanticState === explicitSemanticState ?
    LOCAL_NUM_ONE :
    LOCAL_NUM_ZERO;
}

function resolvePriorityRecoveryProgressOwnerActionRank(snapshot) {
  const progress = isRecord(snapshot?.progress) ? snapshot.progress : {};
  const actuation = isRecord(snapshot?.actuation) ? snapshot.actuation : {};
  const nextRequiredAction = String(
    progress.nextRequiredAction || LOCAL_STR_EMPTY,
  ).trim();
  const workflowOwnedProgress =
    progress.currentOwner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
    nextRequiredAction.length > LOCAL_NUM_ZERO &&
    nextRequiredAction !== PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.NONE;
  if (workflowOwnedProgress) {
    return LOCAL_NUM_TWO;
  }
  const workflowOwnedActuation =
    actuation.owner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
    actuation.state !== PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_FAILED &&
    actuation.state !== PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_COMPLETED;
  return workflowOwnedActuation ? LOCAL_NUM_ONE : LOCAL_NUM_ZERO;
}

function selectLatestPriorityRecoveryPartitionSnapshot(
  partitionSnapshots = [],
  decisionSnapshots = null,
  explicitSemanticStateByPartitionId = null,
) {
  return partitionSnapshots
    .filter((snapshot) => isRecord(snapshot))
    .sort((left, right) => {
      const leftEpoch = resolvePriorityRecoverySnapshotSortEpoch(
        left,
        decisionSnapshots,
      );
      const rightEpoch = resolvePriorityRecoverySnapshotSortEpoch(
        right,
        decisionSnapshots,
      );
      if (leftEpoch !== rightEpoch) {
        return rightEpoch - leftEpoch;
      }
      const leftExplicitMatchRank =
        resolvePriorityRecoveryExplicitSemanticStateMatchRank(
          left,
          explicitSemanticStateByPartitionId,
        );
      const rightExplicitMatchRank =
        resolvePriorityRecoveryExplicitSemanticStateMatchRank(
          right,
          explicitSemanticStateByPartitionId,
        );
      if (leftExplicitMatchRank !== rightExplicitMatchRank) {
        return rightExplicitMatchRank - leftExplicitMatchRank;
      }
      const leftProgressOwnerActionRank =
        resolvePriorityRecoveryProgressOwnerActionRank(left);
      const rightProgressOwnerActionRank =
        resolvePriorityRecoveryProgressOwnerActionRank(right);
      if (leftProgressOwnerActionRank !== rightProgressOwnerActionRank) {
        return rightProgressOwnerActionRank - leftProgressOwnerActionRank;
      }
      const leftEvidenceRank =
        resolvePriorityRecoverySnapshotEvidenceRank(left);
      const rightEvidenceRank =
        resolvePriorityRecoverySnapshotEvidenceRank(right);
      if (leftEvidenceRank !== rightEvidenceRank) {
        return rightEvidenceRank - leftEvidenceRank;
      }
      const leftUpdatedAtMs = resolvePriorityRecoverySnapshotSortTimestamp(
        left,
        decisionSnapshots,
      );
      const rightUpdatedAtMs = resolvePriorityRecoverySnapshotSortTimestamp(
        right,
        decisionSnapshots,
      );
      if (leftUpdatedAtMs !== rightUpdatedAtMs) {
        return rightUpdatedAtMs - leftUpdatedAtMs;
      }
      return String(right?.correlationKey || LOCAL_STR_EMPTY).localeCompare(
        String(left?.correlationKey || LOCAL_STR_EMPTY),
      );
    })[LOCAL_NUM_ZERO] || null;
}

function resolvePendingRequiredAckNodeIds(
  requiredAckNodeIds = LOCAL_EMPTY_LIST,
  acknowledgedNodeIds = LOCAL_EMPTY_LIST,
) {
  const acknowledgedNodeIdSet = new Set(
    normalizeDistinctStringArray(acknowledgedNodeIds),
  );
  return Object.freeze(
    normalizeDistinctStringArray(requiredAckNodeIds)
      .filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId)),
  );
}

function normalizeNonNegativeInteger(value) {
  if (value === null || value === undefined || value === LOCAL_STR_EMPTY) {
    return null;
  }
  const normalizedValue = normalizePriorityRecoveryInteger(value);
  if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
    return null;
  }
  return normalizedValue;
}

function normalizePriorityRecoverySemanticStateId(semanticState) {
  const normalizedSemanticState = String(semanticState || '').trim();
  if (normalizedSemanticState.length === 0) {
    return null;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(normalizedSemanticState) ?
    normalizedSemanticState :
    null;
}

function normalizePriorityRecoveryObservationStateValue(
  value,
  fallback = PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.UNAVAILABLE,
) {
  const normalizedValue = String(value || LOCAL_STR_EMPTY).trim();
  return normalizedValue || fallback;
}

function buildPriorityRecoveryExplicitSemanticStateByPartitionId(
  partitionIdsBySemanticState = null,
) {
  const explicitSemanticStateByPartitionId = new Map();
  if (!isRecord(partitionIdsBySemanticState)) {
    return explicitSemanticStateByPartitionId;
  }
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    const normalizedSemanticState =
      normalizePriorityRecoverySemanticStateId(semanticState);
    if (!normalizedSemanticState) {
      continue;
    }
    for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
      if (!explicitSemanticStateByPartitionId.has(partitionId)) {
        explicitSemanticStateByPartitionId.set(
          partitionId,
          normalizedSemanticState,
        );
      }
    }
  }
  return explicitSemanticStateByPartitionId;
}

function resolvePriorityRecoveryExplicitSemanticState(
  snapshot,
  explicitSemanticStateByPartitionId = null,
) {
  const explicitSemanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticStateId) ||
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState);
  if (explicitSemanticState) {
    return explicitSemanticState;
  }
  const partitionId = String(snapshot?.partitionId || '').trim();
  if (
    partitionId.length === 0 ||
    !(explicitSemanticStateByPartitionId instanceof Map)
  ) {
    return null;
  }
  return explicitSemanticStateByPartitionId.get(partitionId) || null;
}

function normalizePriorityRecoveryBlockedPartitions(blockedPartitions = []) {
  const normalizedBlockedPartitions = [];
  for (const blockedPartition of Array.isArray(blockedPartitions) ?
    blockedPartitions :
    []) {
    if (!isRecord(blockedPartition)) {
      continue;
    }
    const partitionId = String(
      blockedPartition.partitionId ||
      blockedPartition.partition_id ||
      '',
    ).trim();
    if (partitionId.length === 0) {
      continue;
    }
    const spreadGap = normalizeNonNegativeInteger(
      blockedPartition.spreadGap ?? blockedPartition.spread_gap,
    );
    const requiredDistinctNodeCount = normalizeNonNegativeInteger(
      blockedPartition.requiredDistinctNodeCount ??
        blockedPartition.required_distinct_node_count,
    );
    const readyDistinctNodeCount = normalizeNonNegativeInteger(
      blockedPartition.readyDistinctNodeCount ??
        blockedPartition.ready_distinct_node_count,
    );
    const readyReplicaCount = normalizeNonNegativeInteger(
      blockedPartition.readyReplicaCount ??
        blockedPartition.ready_replica_count,
    );
    // CL-021 witness pass-through (see
    // resolvePrioritySpreadReplicaExclusionReason): per-row exclusion
    // attribution must survive summary normalization.
    const exclusionReasonCounts = isRecord(
      blockedPartition.exclusionReasonCounts ??
        blockedPartition.exclusion_reason_counts,
    ) ?
      Object.freeze({
        ...(blockedPartition.exclusionReasonCounts ??
          blockedPartition.exclusion_reason_counts),
      }) :
      null;
    normalizedBlockedPartitions.push(Object.freeze({
      partitionId,
      ...(spreadGap !== null ? {spreadGap} : {}),
      ...(requiredDistinctNodeCount !== null ? {requiredDistinctNodeCount} : {}),
      ...(readyDistinctNodeCount !== null ? {readyDistinctNodeCount} : {}),
      ...(readyReplicaCount !== null ? {readyReplicaCount} : {}),
      ...(exclusionReasonCounts ? {exclusionReasonCounts} : {}),
      blockerReasonCodes: Object.freeze(
        normalizeDistinctStringArray(
          blockedPartition.blockerReasonCodes ||
            blockedPartition.reasonCodes ||
            blockedPartition.reasons,
        ),
      ),
    }));
  }
  return Object.freeze(normalizedBlockedPartitions);
}

function normalizePriorityPartitionSummary(summary = null) {
  if (!isRecord(summary)) {
    return null;
  }
  const blockedPartitions = normalizePriorityRecoveryBlockedPartitions(
    summary.blockedPartitions ?? summary.blocked_partitions,
  );
  const missingPartitionIds = normalizeDistinctStringArray(
    summary.missingPartitionIds ?? summary.missing_partition_ids,
  );
  const blockedPartitionCount = normalizeNonNegativeInteger(
    summary.blockedPartitionCount ?? summary.blocked_partition_count,
  );
  const totalSpreadGap = normalizeNonNegativeInteger(
    summary.totalSpreadGap ?? summary.total_spread_gap,
  );
  const largestSpreadGap = normalizeNonNegativeInteger(
    summary.largestSpreadGap ?? summary.largest_spread_gap,
  );
  const computedTotalSpreadGap = blockedPartitions.reduce((sum, partition) => {
    return sum + (partition?.spreadGap || 0);
  }, 0);
  const computedLargestSpreadGap = blockedPartitions.reduce((largest, partition) => {
    return Math.max(largest, partition?.spreadGap || 0);
  }, 0);
  const normalizedSummary = {
    ...(summary.satisfied === true ? {satisfied: true} : {}),
    ...(summary.satisfied === false ? {satisfied: false} : {}),
    ...(normalizeNonNegativeInteger(summary.requiredDistinctNodeCount) !== null ?
      {
        requiredDistinctNodeCount:
          normalizeNonNegativeInteger(summary.requiredDistinctNodeCount),
      } :
      {}),
    ...(normalizeNonNegativeInteger(summary.readyEligibleNodeCount) !== null ?
      {
        readyEligibleNodeCount:
          normalizeNonNegativeInteger(summary.readyEligibleNodeCount),
      } :
      {}),
    ...(normalizeNonNegativeInteger(summary.totalPriorityPartitionCount) !== null ?
      {
        totalPriorityPartitionCount:
          normalizeNonNegativeInteger(summary.totalPriorityPartitionCount),
      } :
      {}),
    ...(missingPartitionIds.length > 0 ? {
      missingPartitionIds: Object.freeze([...missingPartitionIds]),
    } : {}),
    ...(blockedPartitions.length > 0 ? {blockedPartitions} : {}),
    ...(blockedPartitionCount !== null ? {blockedPartitionCount} :
      blockedPartitions.length > 0 ?
        {blockedPartitionCount: blockedPartitions.length} :
        {}),
    ...(largestSpreadGap !== null ? {largestSpreadGap} :
      blockedPartitions.length > 0 ?
        {largestSpreadGap: computedLargestSpreadGap} :
        {}),
    ...(totalSpreadGap !== null ? {totalSpreadGap} :
      blockedPartitions.length > 0 ?
        {totalSpreadGap: computedTotalSpreadGap} :
        {}),
  };
  return Object.freeze(normalizedSummary);
}

function normalizePriorityRecoveryInvariantSummary(value) {
  if (!isRecord(value)) {
    return null;
  }
  const invariants = [];
  const failingInvariantIds = [];
  for (const invariant of Array.isArray(value.invariants) ? value.invariants : []) {
    if (!isRecord(invariant)) {
      continue;
    }
    const invariantId = String(
      invariant.invariantId || invariant.id || '',
    ).trim();
    if (invariantId.length === 0) {
      continue;
    }
    const reasonCode = String(
      invariant.reasonCode || invariant.code || PRIORITY_RECOVERY_INVARIANT_FALLBACK,
    ).trim();
    const normalizedInvariant = Object.freeze({
      id: invariantId,
      invariantId,
      reasonCode: reasonCode.length > 0 ?
        reasonCode :
        PRIORITY_RECOVERY_INVARIANT_FALLBACK,
      severity:
        typeof invariant.severity === 'string' ?
          invariant.severity :
          null,
      scope:
        typeof invariant.scope === 'string' ?
          invariant.scope :
          null,
      owningSubsystem:
        typeof invariant.owningSubsystem === 'string' ?
          invariant.owningSubsystem :
          null,
      passed: invariant.passed === true,
      details: isRecord(invariant.details) ? Object.freeze({...invariant.details}) : null,
    });
    invariants.push(normalizedInvariant);
    if (normalizedInvariant.passed !== true) {
      failingInvariantIds.push(normalizedInvariant.id);
    }
  }
  for (const invariantId of normalizeDistinctStringArray(value.failingInvariantIds)) {
    failingInvariantIds.push(invariantId);
  }
  const normalizedFailingInvariantIds =
    normalizeDistinctStringArray(failingInvariantIds);
  return Object.freeze({
    invariants: Object.freeze(
      invariants.sort((left, right) => left.id.localeCompare(right.id)),
    ),
    failingInvariantIds: Object.freeze(normalizedFailingInvariantIds),
    passed: normalizedFailingInvariantIds.length === 0,
  });
}

function initializePriorityRecoveryPartitionIndexes() {
  const partitionIdsByReason = {};
  const partitionIdsBySemanticState = {};
  for (const progressClassId of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    partitionIdsByReason[progressClassId] = new Set();
  }
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  return {
    partitionIdsByReason,
    partitionIdsBySemanticState,
    blockerReasonHistoryByPartitionId: {},
    semanticStateHistoryByPartitionId: {},
    decisionDimensions: new Set(),
  };
}

function collectPriorityRecoveryPartitionIndexes(
  snapshots = [],
  partitionIdsBySemanticState = null,
) {
  const indexes = initializePriorityRecoveryPartitionIndexes();
  const explicitSemanticStateByPartitionId =
    buildPriorityRecoveryExplicitSemanticStateByPartitionId(
      partitionIdsBySemanticState,
    );
  const snapshotsByPartitionId = new Map();
  for (const snapshot of snapshots) {
    if (!isRecord(snapshot)) {
      continue;
    }
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === 0) {
      continue;
    }
    if (!Array.isArray(snapshotsByPartitionId.get(partitionId))) {
      snapshotsByPartitionId.set(partitionId, []);
    }
    snapshotsByPartitionId.get(partitionId).push(snapshot);
    const blockerReasons = normalizeDistinctStringArray(snapshot.blockerReasons);
    if (!Array.isArray(indexes.blockerReasonHistoryByPartitionId[partitionId])) {
      indexes.blockerReasonHistoryByPartitionId[partitionId] = [];
    }
    for (const blockerReason of blockerReasons) {
      indexes.blockerReasonHistoryByPartitionId[partitionId].push(
        blockerReason,
      );
    }
    if (!Array.isArray(indexes.semanticStateHistoryByPartitionId[partitionId])) {
      indexes.semanticStateHistoryByPartitionId[partitionId] = [];
    }
    indexes.semanticStateHistoryByPartitionId[partitionId].push(
      resolvePriorityRecoverySnapshotSemanticState(
        snapshot,
        blockerReasons,
        explicitSemanticStateByPartitionId,
      ),
    );
  }
  for (const [partitionId, partitionSnapshots] of snapshotsByPartitionId.entries()) {
    const latestSnapshot = selectLatestPriorityRecoveryPartitionSnapshot(
      partitionSnapshots,
      null,
      explicitSemanticStateByPartitionId,
    );
    if (!isRecord(latestSnapshot)) {
      continue;
    }
    const blockerReasons = normalizeDistinctStringArray(
      latestSnapshot.blockerReasons,
    );
    for (const blockerReason of blockerReasons) {
      if (!(indexes.partitionIdsByReason[blockerReason] instanceof Set)) {
        indexes.partitionIdsByReason[blockerReason] = new Set();
      }
      indexes.partitionIdsByReason[blockerReason].add(partitionId);
    }
    const semanticState = resolvePriorityRecoverySnapshotSemanticState(
      latestSnapshot,
      blockerReasons,
      explicitSemanticStateByPartitionId,
    );
    if (!(indexes.partitionIdsBySemanticState[semanticState] instanceof Set)) {
      indexes.partitionIdsBySemanticState[semanticState] = new Set();
    }
    indexes.partitionIdsBySemanticState[semanticState].add(partitionId);
    collectPriorityRecoveryDecisionDimension(
      indexes.decisionDimensions,
      latestSnapshot,
    );
  }
  return indexes;
}

function resolvePriorityRecoverySnapshotSemanticState(
  snapshot,
  _blockerReasons = [],
  explicitSemanticStateByPartitionId = null,
) {
  const explicitSemanticState = resolvePriorityRecoveryExplicitSemanticState(
    snapshot,
    explicitSemanticStateByPartitionId,
  );
  if (explicitSemanticState) {
    return explicitSemanticState;
  }
  return null;
}

function collectPriorityRecoveryDecisionDimension(
  decisionDimensions,
  snapshot,
) {
  const decisionDimension = String(
    snapshot?.admission?.decisionDimension || '',
  ).trim();
  if (decisionDimension.length > 0) {
    decisionDimensions.add(decisionDimension);
  }
}

function normalizePriorityRecoveryBlockedClassIds(partitionIdsByReason) {
  const blockerPartitionIdsByReason = {};
  const unresolvedClassIds = [];
  const blockedPartitionIds = new Set();
  for (const [blockerReason, partitionIds] of Object.entries(partitionIdsByReason)) {
    blockerPartitionIdsByReason[blockerReason] = Object.freeze(
      [...partitionIds].sort(),
    );
    if (partitionIds.size === 0) {
      continue;
    }
    unresolvedClassIds.push(blockerReason);
    for (const partitionId of partitionIds) {
      blockedPartitionIds.add(partitionId);
    }
  }
  return {
    blockerPartitionIdsByReason: Object.freeze(blockerPartitionIdsByReason),
    unresolvedClassIds: Object.freeze(unresolvedClassIds),
    blockedPartitionIds: Object.freeze([...blockedPartitionIds].sort()),
  };
}

function normalizePriorityRecoverySemanticStatePartitions(
  partitionIdsBySemanticState,
) {
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = Object.freeze(
      [...partitionIds].sort(),
    );
  }
  const unresolvedSemanticStateIds = Object.freeze(
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter((semanticState) => {
      return normalizedPartitionIdsBySemanticState[semanticState]?.length >
        0;
    }),
  );
  const blockedPartitionIds = new Set();
  for (const semanticState of unresolvedSemanticStateIds) {
    for (const partitionId of
      normalizedPartitionIdsBySemanticState[semanticState] || []) {
      blockedPartitionIds.add(partitionId);
    }
  }
  return {
    partitionIdsBySemanticState: Object.freeze(
      normalizedPartitionIdsBySemanticState,
    ),
    unresolvedSemanticStateIds,
    blockedPartitionIds: Object.freeze([...blockedPartitionIds].sort()),
  };
}

export {
  LOCAL_EMPTY_LIST,
  LOCAL_NUM_ONE,
  LOCAL_NUM_TWO,
  LOCAL_NUM_ZERO,
  LOCAL_STR_BLOCKERREASONCODES,
  LOCAL_STR_EMPTY,
  LOCAL_STR_SEMANTICSTATEIDS,
  PRIORITY_RECOVERY_ACTIVE_GATE_PROGRESS_FIELD,
  PRIORITY_RECOVERY_CURRENT_SUMMARY_SCOPE,
  PRIORITY_RECOVERY_OBSERVATION_GATE_FIELD,
  PRIORITY_RECOVERY_OPERATION_ID_FIELD,
  PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE,
  PRIORITY_RECOVERY_SELECTED_MISSING_EVIDENCE_STATE,
  PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD,
  buildPriorityRecoveryExplicitSemanticStateByPartitionId,
  collectPriorityRecoveryDecisionDimension,
  collectPriorityRecoveryPartitionIndexes,
  initializePriorityRecoveryPartitionIndexes,
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizePriorityPartitionSummary,
  normalizePriorityRecoveryBlockedClassIds,
  normalizePriorityRecoveryBlockedPartitions,
  normalizePriorityRecoveryInvariantSummary,
  normalizePriorityRecoveryObservationStateValue,
  normalizePriorityRecoverySemanticStateId,
  normalizePriorityRecoverySemanticStatePartitions,
  resolvePriorityRecoveryProgressOwnerActionRank,
  resolvePriorityRecoverySnapshotEvidenceRank,
  resolvePriorityRecoverySnapshotOperationIds,
  resolvePriorityRecoverySnapshotSortEpoch,
  resolvePriorityRecoverySnapshotSortProgressTimestamp,
  resolvePriorityRecoverySnapshotSortTimestamp,
  resolvePendingRequiredAckNodeIds,
  resolvePriorityRecoveryExplicitSemanticState,
  resolvePriorityRecoverySnapshotSemanticState,
  selectLatestPriorityRecoveryPartitionSnapshot,
};
