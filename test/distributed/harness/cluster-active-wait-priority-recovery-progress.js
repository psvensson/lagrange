import {CLUSTER_SEGMENT_1} from './cluster-segment-1.js';
import {
  TYPEOF_OBJECT,
  normalizeDistinctStringArray,
} from './cluster-active-wait-normalization.js';

const {
  ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
  UNKNOWN_STATE,
  ZERO,
} = CLUSTER_SEGMENT_1;

const PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD = Object.freeze({
  COMPLETED_AT_MS: 'completedAtMs',
  CREATED_AT_MS: 'createdAtMs',
  LAST_PROGRESS_AT_MS: 'lastProgressAtMs',
  TARGET_SERVICE_PROGRESS_AT_MS: 'targetServiceProgressAtMs',
  UPDATED_AT_MS: 'updatedAtMs',
});
const ACTIVE_WAIT_PRIORITY_RECOVERY_EMPTY_TEXT = '';
const PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN = UNKNOWN_STATE;
const PRIORITY_RECOVERY_DECISION_SNAPSHOT_UNKNOWN_EPOCH = -1;

function isPriorityRecoveryProgressEvidenceRecord(value) {
  return value && typeof value === TYPEOF_OBJECT && Array.isArray(value) !== true;
}

function normalizePriorityRecoverySemanticStateId(semanticState) {
  const normalizedSemanticState = String(
    semanticState || ACTIVE_WAIT_PRIORITY_RECOVERY_EMPTY_TEXT,
  ).trim();
  if (normalizedSemanticState.length === ZERO) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(normalizedSemanticState) ?
    normalizedSemanticState :
    PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
}

function isPriorityRecoverySemanticStateId(semanticState) {
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(semanticState);
}

function buildPriorityRecoveryExplicitSemanticStateByPartitionId(
  partitionIdsBySemanticState,
) {
  const explicitSemanticStateByPartitionId = new Map();
  if (
    !partitionIdsBySemanticState ||
    typeof partitionIdsBySemanticState !== TYPEOF_OBJECT ||
    Array.isArray(partitionIdsBySemanticState)
  ) {
    return explicitSemanticStateByPartitionId;
  }
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    const normalizedSemanticState =
      normalizePriorityRecoverySemanticStateId(semanticState);
    if (!isPriorityRecoverySemanticStateId(normalizedSemanticState)) {
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

function buildPriorityRecoveryExplicitProgressClassByPartitionId(
  partitionIdsByClass,
) {
  const explicitProgressClassByPartitionId = new Map();
  if (
    !partitionIdsByClass ||
    typeof partitionIdsByClass !== TYPEOF_OBJECT ||
    Array.isArray(partitionIdsByClass)
  ) {
    return explicitProgressClassByPartitionId;
  }
  for (const [progressClass, partitionIds] of Object.entries(
    partitionIdsByClass,
  )) {
    const normalizedProgressClass = String(
      progressClass || ACTIVE_WAIT_PRIORITY_RECOVERY_EMPTY_TEXT,
    ).trim();
    if (normalizedProgressClass.length === ZERO) {
      continue;
    }
    for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
      const progressClasses =
        explicitProgressClassByPartitionId.get(partitionId) || new Set();
      progressClasses.add(normalizedProgressClass);
      explicitProgressClassByPartitionId.set(partitionId, progressClasses);
    }
  }
  return explicitProgressClassByPartitionId;
}

function resolvePriorityRecoveryExplicitSemanticState(
  snapshot,
  explicitSemanticStateByPartitionId,
) {
  const explicitSemanticStateId =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticStateId);
  if (isPriorityRecoverySemanticStateId(explicitSemanticStateId)) {
    return explicitSemanticStateId;
  }
  const explicitSemanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState);
  if (isPriorityRecoverySemanticStateId(explicitSemanticState)) {
    return explicitSemanticState;
  }
  const partitionId = String(
    snapshot?.partitionId || ACTIVE_WAIT_PRIORITY_RECOVERY_EMPTY_TEXT,
  ).trim();
  if (
    partitionId.length === ZERO ||
    !(explicitSemanticStateByPartitionId instanceof Map)
  ) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
  }
  const partitionSemanticState =
    explicitSemanticStateByPartitionId.get(partitionId) ||
    PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
  return isPriorityRecoverySemanticStateId(partitionSemanticState) ?
    partitionSemanticState :
    PRIORITY_RECOVERY_SEMANTIC_STATE_ID_UNKNOWN;
}

function resolvePriorityRecoveryDecisionSnapshotProgressSortTimestamp(
  snapshot,
) {
  const operation = snapshot?.coordinator?.operation || {};
  const progressTimestampCandidates = [
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD.COMPLETED_AT_MS
    ],
    operation[PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD.UPDATED_AT_MS],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD
        .TARGET_SERVICE_PROGRESS_AT_MS
    ],
    snapshot?.lastProgressAtMs,
    snapshot?.snapshotCapturedAt,
    snapshot?.progress?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD.LAST_PROGRESS_AT_MS
    ],
    operation[PRIORITY_RECOVERY_DECISION_SNAPSHOT_PROGRESS_FIELD.CREATED_AT_MS],
  ]
    .map((candidate) => Number(candidate))
    .filter((candidate) => Number.isFinite(candidate) && candidate > ZERO);
  return progressTimestampCandidates.length > ZERO ?
    Math.max(...progressTimestampCandidates) :
    ZERO;
}

function resolvePriorityRecoveryDecisionSnapshotSortTimestamp(snapshot) {
  const progressTimestamp =
    resolvePriorityRecoveryDecisionSnapshotProgressSortTimestamp(snapshot);
  if (progressTimestamp > ZERO) {
    return progressTimestamp;
  }
  const updatedAtMs = Number(
    snapshot?.observation?.provenance?.capturedAt ??
      ZERO,
  );
  return Number.isFinite(updatedAtMs) ? updatedAtMs : ZERO;
}

function comparePriorityRecoveryDecisionSummarySnapshots(left, right) {
  const leftEpoch = Number.isFinite(left?.epoch) ?
    left.epoch :
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_UNKNOWN_EPOCH;
  const rightEpoch = Number.isFinite(right?.epoch) ?
    right.epoch :
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_UNKNOWN_EPOCH;
  if (leftEpoch !== rightEpoch) {
    return leftEpoch - rightEpoch;
  }
  const leftTimestamp = resolvePriorityRecoveryDecisionSnapshotSortTimestamp(
    left,
  );
  const rightTimestamp = resolvePriorityRecoveryDecisionSnapshotSortTimestamp(
    right,
  );
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  return String(
    left?.correlationKey || ACTIVE_WAIT_PRIORITY_RECOVERY_EMPTY_TEXT,
  ).localeCompare(
    String(
      right?.correlationKey ||
        ACTIVE_WAIT_PRIORITY_RECOVERY_EMPTY_TEXT,
    ),
  );
}

function selectPriorityRecoveryDecisionSummarySnapshots(snapshots) {
  const latestSnapshotByPartitionId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    if (!snapshot || typeof snapshot !== TYPEOF_OBJECT) {
      continue;
    }
    const partitionId = String(
      snapshot.partitionId ||
        ACTIVE_WAIT_PRIORITY_RECOVERY_EMPTY_TEXT,
    ).trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    const currentSnapshot = latestSnapshotByPartitionId.get(partitionId);
    if (
      !currentSnapshot ||
      comparePriorityRecoveryDecisionSummarySnapshots(
        currentSnapshot,
        snapshot,
      ) < ZERO
    ) {
      latestSnapshotByPartitionId.set(partitionId, snapshot);
    }
  }
  return [...latestSnapshotByPartitionId.values()];
}

function selectPriorityRecoveryProgressEvidenceSnapshots(
  priorityRecoveryProgressEvidence = null,
) {
  return [
    ...(Array.isArray(priorityRecoveryProgressEvidence?.snapshots) ?
      priorityRecoveryProgressEvidence.snapshots :
      []),
    ...(Array.isArray(priorityRecoveryProgressEvidence?.partitionSnapshots) ?
      priorityRecoveryProgressEvidence.partitionSnapshots :
      []),
  ];
}

function selectPriorityRecoveryExplicitProgressClassPartitions(
  priorityRecoveryProgressEvidence = null,
) {
  if (
    isPriorityRecoveryProgressEvidenceRecord(
      priorityRecoveryProgressEvidence?.blockerPartitionIdsByReason,
    )
  ) {
    return priorityRecoveryProgressEvidence.blockerPartitionIdsByReason;
  }
  if (
    isPriorityRecoveryProgressEvidenceRecord(
      priorityRecoveryProgressEvidence?.partitionIdsByClass,
    )
  ) {
    return priorityRecoveryProgressEvidence.partitionIdsByClass;
  }
  return {};
}

function addPriorityRecoveryProgressClassPartition(
  partitionIdsByClass,
  progressClass,
  partitionId,
) {
  const normalizedProgressClass = String(
    progressClass || ACTIVE_WAIT_PRIORITY_RECOVERY_EMPTY_TEXT,
  ).trim();
  if (
    normalizedProgressClass.length === ZERO ||
    partitionId.length === ZERO
  ) {
    return;
  }
  if (!Object.hasOwn(partitionIdsByClass, normalizedProgressClass)) {
    partitionIdsByClass[normalizedProgressClass] = new Set();
  }
  partitionIdsByClass[normalizedProgressClass].add(partitionId);
}

function normalizePriorityRecoverySnapshotProgressClassIds(snapshot) {
  return normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(snapshot?.blockerReasons),
    ...normalizeDistinctStringArray(snapshot?.blockerReasonCodes),
    ...normalizeDistinctStringArray(snapshot?.progressClassIds),
  ]);
}

function summarizePriorityRecoveryProgressClasses(
  priorityRecoveryProgressEvidence = null,
) {
  const snapshots = selectPriorityRecoveryProgressEvidenceSnapshots(
    priorityRecoveryProgressEvidence,
  );
  const summarySnapshots =
    selectPriorityRecoveryDecisionSummarySnapshots(snapshots);
  const partitionIdsByClass = {
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.ELIGIBLE_NO_OPERATION]:
      new Set(),
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.OPERATION_NO_TRANSITIONS]:
      new Set(),
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.LEARNER_NEVER_PROMOTABLE]:
      new Set(),
    [ACTIVE_WAIT_PRIORITY_RECOVERY_PROGRESS_CLASS.RECOVERY_ELIGIBLE_EXCLUDED]:
      new Set(),
  };
  const partitionIdsBySemanticState = {};
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  const explicitSemanticStateByPartitionId =
    buildPriorityRecoveryExplicitSemanticStateByPartitionId(
      priorityRecoveryProgressEvidence?.partitionIdsBySemanticState,
    );
  const explicitProgressClassByPartitionId =
    buildPriorityRecoveryExplicitProgressClassByPartitionId(
      selectPriorityRecoveryExplicitProgressClassPartitions(
        priorityRecoveryProgressEvidence,
      ),
    );
  for (const snapshot of summarySnapshots) {
    const partitionId = String(snapshot?.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    for (const progressClass of normalizePriorityRecoverySnapshotProgressClassIds(
      snapshot,
    )) {
      addPriorityRecoveryProgressClassPartition(
        partitionIdsByClass,
        progressClass,
        partitionId,
      );
    }
    const explicitProgressClasses =
      explicitProgressClassByPartitionId.get(partitionId) || new Set();
    for (const progressClass of explicitProgressClasses) {
      addPriorityRecoveryProgressClassPartition(
        partitionIdsByClass,
        progressClass,
        partitionId,
      );
    }
    const semanticState =
      resolvePriorityRecoveryExplicitSemanticState(
        snapshot,
        explicitSemanticStateByPartitionId,
      );
    if (partitionIdsBySemanticState[semanticState] instanceof Set) {
      partitionIdsBySemanticState[semanticState].add(partitionId);
    }
  }

  const normalizedPartitionIdsByClass = {};
  for (const [progressClass, partitionIds] of Object.entries(
    partitionIdsByClass,
  )) {
    normalizedPartitionIdsByClass[progressClass] = [...partitionIds].sort();
  }
  const unresolvedClassIds = Object.entries(normalizedPartitionIdsByClass)
    .filter(([, partitionIds]) => partitionIds.length > ZERO)
    .map(([progressClass]) => progressClass)
    .sort();
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = [
      ...partitionIds,
    ].sort();
  }
  const unresolvedSemanticStateIds =
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter(
      (semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState].length > ZERO,
    );
  const semanticBlockedPartitionIds = normalizeDistinctStringArray(
    unresolvedSemanticStateIds.flatMap(
      (semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState] || [],
    ),
  );

  return {
    partitionIdsByClass: normalizedPartitionIdsByClass,
    unresolvedClassIds,
    unresolvedClassCount: unresolvedClassIds.length,
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    unresolvedSemanticStateIds,
    unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
    blockedPartitionIds: semanticBlockedPartitionIds,
    blockedPartitionCount: semanticBlockedPartitionIds.length,
  };
}

export {
  normalizePriorityRecoverySemanticStateId,
  summarizePriorityRecoveryProgressClasses,
};
