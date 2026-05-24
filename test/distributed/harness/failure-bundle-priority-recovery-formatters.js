import {
  PRIORITY_RECOVERY_BLOCKER_REASON_FALLBACK,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {FAILURE_BUNDLE_SEGMENT_5} from './failure-bundle-segment-5.js';

const {
  ZERO,
  UNKNOWN_VALUE,
  normalizeDistinctStringArray,
} = FAILURE_BUNDLE_SEGMENT_5;

export function formatPriorityRecoveryPartitionBlockerHistory(history) {
  const entries = Array.isArray(history) ? history : [];
  if (entries.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return entries
    .map((entry) => {
      const partitionId = String(entry?.partitionId || '').trim();
      const blockerReasons = normalizeDistinctStringArray(
        Array.isArray(entry?.blockerReasonCodes) ?
          entry.blockerReasonCodes :
          entry?.blockerReasons,
      );
      return (
        (partitionId.length > ZERO ? partitionId : UNKNOWN_VALUE) +
        '[' +
        (blockerReasons.length > ZERO ?
          blockerReasons.join('|') :
          PRIORITY_RECOVERY_BLOCKER_REASON_FALLBACK) +
        ']'
      );
    })
    .join(', ');
}

export function formatPriorityRecoveryPartitionSemanticStateHistory(history) {
  const entries = Array.isArray(history) ? history : [];
  if (entries.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return entries
    .map((entry) => {
      const partitionId = String(entry?.partitionId || '').trim();
      const semanticStates = normalizeDistinctStringArray(
        Array.isArray(entry?.semanticStateIds) ?
          entry.semanticStateIds :
          entry?.semanticStates,
      );
      return (
        (partitionId.length > ZERO ? partitionId : UNKNOWN_VALUE) +
        '[' +
        (semanticStates.length > ZERO ?
          semanticStates.join('|') :
          PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED) +
        ']'
      );
    })
    .join(', ');
}

export function formatPriorityRecoveryPartitionWitnesses(witnesses) {
  const entries = Array.isArray(witnesses) ? witnesses : [];
  if (entries.length === ZERO) {
    return UNKNOWN_VALUE;
  }
  return entries
    .map((entry) => {
      const partitionId = String(entry?.partitionId || '').trim();
      const parts = [partitionId.length > ZERO ? partitionId : UNKNOWN_VALUE];
      const semanticState = String(
        entry?.semanticState || entry?.semanticStateId || '',
      ).trim();
      if (semanticState.length > ZERO) {
        parts.push('state=' + semanticState);
      }
      if (Number.isFinite(entry?.spreadGap)) {
        parts.push('gap=' + String(entry.spreadGap));
      }
      const blockerReasons = normalizeDistinctStringArray(
        Array.isArray(entry?.blockerReasonCodes) ?
          entry.blockerReasonCodes :
          Array.isArray(entry?.progressClassIds) ?
            entry.progressClassIds :
            entry?.blockerReasons,
      );
      if (blockerReasons.length > ZERO) {
        parts.push('blockers=' + blockerReasons.join('|'));
      }
      const decisionDimension = String(entry?.decisionDimension || '').trim();
      if (decisionDimension.length > ZERO) {
        parts.push('decision=' + decisionDimension);
      }
      const eligibleNodeCount = Number.isInteger(entry?.eligibleNodeCount) ?
        entry.eligibleNodeCount :
        Array.isArray(entry?.eligibleNodeIds) ?
          entry.eligibleNodeIds.length :
          null;
      if (Number.isInteger(eligibleNodeCount)) {
        parts.push('eligible=' + String(eligibleNodeCount));
      }
      const operationIds = normalizeDistinctStringArray(entry?.operationIds);
      if (operationIds.length > ZERO) {
        parts.push('ops=' + operationIds.join('|'));
      }
      const latestTimelineStep = String(
        entry?.latestOperationTimelineStep || '',
      ).trim();
      if (latestTimelineStep.length > ZERO) {
        parts.push('step=' + latestTimelineStep);
      }
      const latestStatus = String(entry?.latestOperationStatus || '').trim();
      if (latestStatus.length > ZERO) {
        parts.push('status=' + latestStatus);
      }
      const activeLearnerNodeIds = normalizeDistinctStringArray(
        entry?.activeLearnerNodeIds,
      );
      if (activeLearnerNodeIds.length > ZERO) {
        parts.push('learners=' + activeLearnerNodeIds.join('|'));
      }
      const promotableLearnerNodeIds = normalizeDistinctStringArray(
        entry?.promotableLearnerNodeIds,
      );
      if (promotableLearnerNodeIds.length > ZERO) {
        parts.push('promotable=' + promotableLearnerNodeIds.join('|'));
      }
      const excludedNodeIds = normalizeDistinctStringArray(
        entry?.recoveryEligibleExcludedNodeIds,
      );
      if (excludedNodeIds.length > ZERO) {
        parts.push('excluded=' + excludedNodeIds.join('|'));
      }
      return parts.join('#');
    })
    .join(', ');
}
