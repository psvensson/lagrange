import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
} from './priority-recovery-diagnostics-constants.js';
import {normalizePriorityRecoveryStringList} from './priority-recovery-helpers.js';
import {
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD,
} from './priority-recovery-snapshot-stage-shared.js';
import {filterPriorityRecoveryTrackedPartitionIds} from './priority-recovery-snapshot-stage-1.js';

function buildTrackedPriorityRecoveryDecisionSemanticStateMap(
  partitionIdsBySemanticState = null,
) {
  if (
    !partitionIdsBySemanticState ||
    typeof partitionIdsBySemanticState !== TYPEOF.OBJECT
  ) {
    return null;
  }
  const trackedPartitionIdsBySemanticState = {};
  for (const [semanticStateId, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    trackedPartitionIdsBySemanticState[semanticStateId] =
      filterPriorityRecoveryTrackedPartitionIds(partitionIds);
  }
  return Object.freeze(trackedPartitionIdsBySemanticState);
}

function hasPriorityRecoveryDecisionSnapshotOwnField(snapshot, fieldName) {
  return (
    snapshot &&
    typeof snapshot === TYPEOF.OBJECT &&
    Object.prototype.hasOwnProperty.call(snapshot, fieldName)
  );
}

function resolvePriorityRecoverySourcePartitionStateIds(
  partitionId,
  partitionIdsByState = null,
  orderedStateIds = [],
) {
  const normalizedPartitionId = String(partitionId || LOCAL_STR_EMPTY).trim();
  if (
    normalizedPartitionId.length === NUM.ZERO ||
    !partitionIdsByState ||
    typeof partitionIdsByState !== TYPEOF.OBJECT
  ) {
    return [];
  }
  return orderedStateIds.filter((stateId) =>
    normalizePriorityRecoveryStringList(
      partitionIdsByState[stateId],
    ).includes(normalizedPartitionId),
  );
}

function isPriorityRecoverySourcePartitionStateMap(
  partitionIdsByState = null,
  orderedStateIds = [],
) {
  if (!partitionIdsByState || typeof partitionIdsByState !== TYPEOF.OBJECT) {
    return false;
  }
  return orderedStateIds.some((stateId) =>
    Object.prototype.hasOwnProperty.call(partitionIdsByState, stateId),
  );
}

function resolvePriorityRecoveryFilteredSnapshotBlockerReasons(
  snapshot,
  partitionId,
  sourceDecisionSnapshots = null,
) {
  if (
    hasPriorityRecoveryDecisionSnapshotOwnField(
      snapshot,
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.BLOCKER_REASONS,
    )
  ) {
    return normalizePriorityRecoveryStringList(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.BLOCKER_REASONS],
    );
  }
  const sourceBlockerPartitionIdsByReason =
    sourceDecisionSnapshots?.blockerPartitionIdsByReason;
  if (
    isPriorityRecoverySourcePartitionStateMap(
      sourceBlockerPartitionIdsByReason,
      PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
    ) !== true
  ) {
    return [];
  }
  return resolvePriorityRecoverySourcePartitionStateIds(
    partitionId,
    sourceBlockerPartitionIdsByReason,
    PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  );
}

export {
  buildTrackedPriorityRecoveryDecisionSemanticStateMap,
  hasPriorityRecoveryDecisionSnapshotOwnField,
  isPriorityRecoverySourcePartitionStateMap,
  resolvePriorityRecoveryFilteredSnapshotBlockerReasons,
  resolvePriorityRecoverySourcePartitionStateIds,
};
