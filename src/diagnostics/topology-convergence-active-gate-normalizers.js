import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SOURCE_ORDER_BASE,
  OWNER,
  BOUNDARY,
} from './topology-convergence-constants.js';

import {
  asRecord,
  arrayOrEmpty,
  firstFiniteNumber,
  firstText,
  normalizeProgressContract,
} from './topology-convergence-core-normalizers.js';

const ACTIVE_GATE_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED =
  'repair_deferred';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_STATE_SATISFIED = 'satisfied';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_STATE_DEFERRED = 'deferred';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_STATE_BLOCKED = 'blocked';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_REASON_COMPLETE =
  'snapshot_coverage_complete';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_REASON_INCOMPLETE =
  'snapshot_coverage_incomplete';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_NEXT_ACTION_NONE = 'none';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_NEXT_ACTION_RETRY = 'retry';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_WAKE_SOURCE_NONE = 'none';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_WAKE_SOURCE_ACTIVE_GATE = 'active-gate';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_BLOCKING_DEPENDENCY_NONE = 'none';
const ACTIVE_GATE_SNAPSHOT_PROGRESS_DEFAULT_RETRY_AFTER_MS = 1000;
const TYPE_NUMBER = 'number';

export function normalizeActiveGateSnapshotCoverageProgress(snapshotCoverage) {
  const coverage = asRecord(snapshotCoverage);
  if (Object.keys(coverage).length === SOURCE_ORDER_BASE) {
    return {};
  }
  const selectedObservedNodeIds = arrayOrEmpty(
    coverage.selectedObservedNodeIds,
  );
  const completeCoverage =
    coverage.completeCoverage === true ||
    coverage.snapshotCoverageComplete === true;
  const rawContract =
    coverage.progressContract || asRecord(coverage.progress).progressContract;
  const selectedSnapshotError = firstText(
    coverage.selectedSnapshotError,
    coverage.selectedError,
    coverage.selectedSnapshotReachabilityError,
    coverage.selectedReachabilityError,
  );
  const progressContract = normalizeActiveGateSnapshotProgressContract({
    completeCoverage,
    coverage,
    rawContract,
    selectedSnapshotError,
  });
  const result = {
    snapshotCoverageComplete: completeCoverage,
    snapshotCoverageNodeCount: firstFiniteNumber(
      coverage.bestCoverageNodeCount,
      coverage.snapshotCoverageNodeCount,
      selectedObservedNodeIds.length,
    ),
    expectedNodeCount: firstFiniteNumber(
      coverage.expectedNodeCount,
      coverage.bestCoverageNodeCount,
      selectedObservedNodeIds.length,
    ),
    selectedSnapshotNodeId: firstText(
      coverage.selectedSnapshotNodeId,
      coverage.selectedNodeId,
    ),
    selectedSnapshotAdminReady: coverage.selectedSnapshotAdminReady,
    selectedSnapshotReachableBy: firstText(
      coverage.selectedSnapshotReachableBy,
      coverage.selectedReachableBy,
    ),
    selectedSnapshotError,
    selectedSnapshotTimeoutMs: firstFiniteNumber(
      coverage.selectedSnapshotTimeoutMs,
      coverage.selectedTimeoutMs,
    ),
    selectedSnapshotObservationMode: firstText(
      coverage.selectedSnapshotObservationMode,
    ),
    selectedSnapshotObservationState: firstText(
      coverage.selectedSnapshotObservationState,
      coverage.selectedSnapshotRevisionState,
    ),
    selectedSnapshotObservationContractState: firstText(
      coverage.selectedSnapshotObservationContractState,
    ),
    selectedSnapshotObservationRefreshState: firstText(
      coverage.selectedSnapshotObservationRefreshState,
    ),
    selectedSnapshotObservationNextAction: firstText(
      coverage.selectedSnapshotObservationNextAction,
    ),
    selectedSnapshotObservationReasonCodes: arrayOrEmpty(
      coverage.selectedSnapshotObservationReasonCodes,
    ),
    selectedSnapshotRepairDeferred:
      isActiveGateSnapshotRepairDeferred(coverage),
    selectedPublishedActiveNodeIds: arrayOrEmpty(
      coverage.selectedPublishedActiveNodeIds,
    ),
    selectedMissingPublishedNodeIds: arrayOrEmpty(
      coverage.selectedMissingPublishedNodeIds,
    ),
  };

  if (progressContract) {
    result.progressContract = progressContract;
  }
  return result;
}

function normalizeActiveGateSnapshotProgressContract({
  completeCoverage,
  coverage,
  rawContract,
  selectedSnapshotError,
}) {
  if (!rawContract) {
    return undefined;
  }
  return normalizeProgressContract(rawContract, {
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
    state: selectActiveGateSnapshotFallbackState(
      completeCoverage,
      coverage,
      selectedSnapshotError,
    ),
    reason: selectActiveGateSnapshotFallbackReason(
      completeCoverage,
      selectedSnapshotError,
    ),
    nextAction: completeCoverage ?
      ACTIVE_GATE_SNAPSHOT_PROGRESS_NEXT_ACTION_NONE :
      firstText(
        coverage.selectedSnapshotObservationNextAction,
        ACTIVE_GATE_SNAPSHOT_PROGRESS_NEXT_ACTION_RETRY,
      ),
    wakeSource: completeCoverage ?
      ACTIVE_GATE_SNAPSHOT_PROGRESS_WAKE_SOURCE_NONE :
      ACTIVE_GATE_SNAPSHOT_PROGRESS_WAKE_SOURCE_ACTIVE_GATE,
    retryAfterMs: completeCoverage ?
      SOURCE_ORDER_BASE :
      selectActiveGateSnapshotRetryAfterMs(coverage),
    terminalState: ACTIVE_GATE_SNAPSHOT_PROGRESS_STATE_SATISFIED,
    evidencePath: ABSENT_VALUE,
    blockingDependency:
      ACTIVE_GATE_SNAPSHOT_PROGRESS_BLOCKING_DEPENDENCY_NONE,
  });
}

function isActiveGateSnapshotRepairDeferred(coverage) {
  return coverage.selectedSnapshotRepairDeferred === true ||
    coverage.selectedSnapshotObservationMode ===
      ACTIVE_GATE_SNAPSHOT_OBSERVATION_MODE_REPAIR_DEFERRED;
}

function selectActiveGateSnapshotFallbackState(
  completeCoverage,
  coverage,
  selectedSnapshotError,
) {
  if (completeCoverage) {
    return ACTIVE_GATE_SNAPSHOT_PROGRESS_STATE_SATISFIED;
  }
  if (isActiveGateSnapshotRepairDeferred(coverage)) {
    return ACTIVE_GATE_SNAPSHOT_PROGRESS_STATE_DEFERRED;
  }
  return selectedSnapshotError !== UNKNOWN_VALUE ?
    ACTIVE_GATE_SNAPSHOT_PROGRESS_STATE_BLOCKED :
    ACTIVE_GATE_SNAPSHOT_PROGRESS_STATE_DEFERRED;
}

function selectActiveGateSnapshotFallbackReason(
  completeCoverage,
  selectedSnapshotError,
) {
  if (completeCoverage) {
    return ACTIVE_GATE_SNAPSHOT_PROGRESS_REASON_COMPLETE;
  }
  return selectedSnapshotError !== UNKNOWN_VALUE ?
    `${ACTIVE_GATE_SNAPSHOT_PROGRESS_REASON_INCOMPLETE}: ${selectedSnapshotError}` :
    ACTIVE_GATE_SNAPSHOT_PROGRESS_REASON_INCOMPLETE;
}

function selectActiveGateSnapshotRetryAfterMs(coverage) {
  return typeof coverage.selectedSnapshotObservationRetryAfterMs ===
    TYPE_NUMBER ?
    coverage.selectedSnapshotObservationRetryAfterMs :
    ACTIVE_GATE_SNAPSHOT_PROGRESS_DEFAULT_RETRY_AFTER_MS;
}
