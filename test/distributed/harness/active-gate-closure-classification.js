import {
  hasStartupAdminClosureWitness,
  isTimeoutShapedProbeError,
} from './startup-readiness-evidence.js';
import {
  buildPublicationRecoveryGateSnapshot,
} from '../../../src/control-plane/publication-recovery-gate.js';

const ZERO = 0;
const ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const ACTIVE_GATE_READINESS_MODE_STARTUP = 'startup';

export const ACTIVE_GATE_CLOSURE_RECORD_ID_PRIORITY_SPREAD = 'CL-003';
export const ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD =
  'publication_converged_priority_spread_pending';
export const ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_SNAPSHOT_TIMEOUT = 'CL-004';
export const ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT =
  'startup_active_snapshot_timeout';
export const ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_SNAPSHOT_ERROR = 'CL-005';
export const ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_ERROR =
  'startup_active_snapshot_error';
export const ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG = 'CL-006';
export const ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG =
  'startup_active_publication_lag';
export const ACTIVE_GATE_CLOSURE_RECORD_ID_SOFT_SUCCESS_IDS = Object.freeze([
  ACTIVE_GATE_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
  ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_SNAPSHOT_TIMEOUT,
  ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG,
]);
export const ACTIVE_GATE_SOFT_SUCCESS_MODE_LOAD = 'load';

export function buildActiveGateWaitPolicy({readinessMode = null, closureRecordId = null} = {}) {
  const allowLoadSoftSuccess =
    readinessMode === ACTIVE_GATE_SOFT_SUCCESS_MODE_LOAD &&
    ACTIVE_GATE_CLOSURE_RECORD_ID_SOFT_SUCCESS_IDS.includes(closureRecordId);
  return {
    readinessMode,
    closureRecordId,
    allowSoftSuccess: allowLoadSoftSuccess,
    hardFailure: !allowLoadSoftSuccess && closureRecordId !== null,
  };
}

function normalizePublicationStatus(status) {
  if (typeof status !== 'string') {
    return null;
  }
  const normalizedStatus = status.trim().toUpperCase();
  return normalizedStatus.length > ZERO ? normalizedStatus : null;
}

function normalizeDistinctStringArray(values) {
  const normalizedValues = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalizedValue = String(value || '').trim();
    if (normalizedValue.length === ZERO || seen.has(normalizedValue)) {
      continue;
    }
    seen.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  }
  return normalizedValues;
}

function hasSnapshotError(progressSnapshot = null) {
  return (
    typeof progressSnapshot?.selectedSnapshotError === 'string' &&
    progressSnapshot.selectedSnapshotError.trim().length > ZERO
  );
}

function isStartupZeroCoverageSnapshotFailure({
  progressSnapshot = null,
  readinessMode = null,
  gateReasons = [],
} = {}) {
  return (
    readinessMode === ACTIVE_GATE_READINESS_MODE_STARTUP &&
    progressSnapshot?.snapshotCoverageComplete !== true &&
    normalizePublicationStatus(progressSnapshot?.publicationStatus) ===
      ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED &&
    Number.isInteger(progressSnapshot?.snapshotCoverageNodeCount) &&
    progressSnapshot.snapshotCoverageNodeCount === ZERO &&
    gateReasons.length === ZERO &&
    hasSnapshotError(progressSnapshot)
  );
}

function buildStartupSnapshotFailureClosure(progressSnapshot = null) {
  if (isTimeoutShapedProbeError(progressSnapshot?.selectedSnapshotError)) {
    return {
      closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_SNAPSHOT_TIMEOUT,
      closureWitnessClass:
        ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT,
    };
  }
  return {
    closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_SNAPSHOT_ERROR,
    closureWitnessClass:
      ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_ERROR,
  };
}

function isClosedStartupPublicationProgress(progressSnapshot = null) {
  return (
    progressSnapshot?.snapshotCoverageComplete === true &&
    normalizePublicationStatus(progressSnapshot?.publicationStatus) ===
      ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED &&
    Number.isInteger(progressSnapshot?.pendingAckCount) &&
    progressSnapshot.pendingAckCount === ZERO &&
    Number.isInteger(progressSnapshot?.missingPublishedCount) &&
    progressSnapshot.missingPublishedCount === ZERO &&
    progressSnapshot?.prioritySpreadSatisfied === true
  );
}

export function classifyActiveGateClosureWitness({
  progressSnapshot = null,
  bestProgressSnapshot = null,
  publicationConvergence = null,
  publicationConvergenceGate = null,
  readinessMode = null,
} = {}) {
  const gateReasons = normalizeDistinctStringArray(
    progressSnapshot?.gateReasons || publicationConvergenceGate?.reasons,
  );
  const hasStrongAdminWitness = hasStartupAdminClosureWitness({
    ...progressSnapshot,
    selectedReachabilityError: progressSnapshot?.selectedReachabilityError,
    selectedError: progressSnapshot?.selectedError,
  });
  const closedStartupPublicationBestProgress =
    isClosedStartupPublicationProgress(bestProgressSnapshot);
  const startupSnapshotTimeoutWitness =
    closedStartupPublicationBestProgress !== true &&
    readinessMode === ACTIVE_GATE_READINESS_MODE_STARTUP &&
    Number.isInteger(progressSnapshot?.inactiveNodeCount) &&
    progressSnapshot.inactiveNodeCount === ZERO &&
    progressSnapshot?.snapshotCoverageComplete !== true &&
    Number.isInteger(progressSnapshot?.snapshotCoverageNodeCount) &&
      progressSnapshot.snapshotCoverageNodeCount === ZERO &&
      gateReasons.length === ZERO &&
    isTimeoutShapedProbeError(progressSnapshot?.selectedSnapshotError) &&
    hasStrongAdminWitness;

  if (startupSnapshotTimeoutWitness) {
    return {
      closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_SNAPSHOT_TIMEOUT,
      closureWitnessClass:
        ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT,
    };
  }

  if (
    closedStartupPublicationBestProgress !== true &&
    isStartupZeroCoverageSnapshotFailure({
      progressSnapshot,
      readinessMode,
      gateReasons,
    })
  ) {
    return buildStartupSnapshotFailureClosure(progressSnapshot);
  }

  const publicationStatus = normalizePublicationStatus(
    progressSnapshot?.publicationStatus ||
      publicationConvergenceGate?.publicationStatus ||
      publicationConvergence?.publicationStatus,
  );
  const publicationRecoveryGate =
    progressSnapshot?.publicationRecoveryGate &&
      typeof progressSnapshot.publicationRecoveryGate === 'object' ?
      progressSnapshot.publicationRecoveryGate :
      buildPublicationRecoveryGateSnapshot({
        publicationStatus,
        recoveryProtocolState:
          progressSnapshot?.recoveryProtocolState ||
          publicationConvergenceGate?.recoveryProtocolState ||
          publicationConvergence?.recoveryProtocolState,
        priorityRecoveryReasonCodes:
          progressSnapshot?.priorityRecoveryReasonCodes ||
          publicationConvergenceGate?.priorityRecoveryReasonCodes ||
          publicationConvergence?.priorityRecoveryReasonCodes,
        priorityPartitionSummary:
          progressSnapshot?.priorityPartitionSummary ||
          publicationConvergenceGate?.priorityPartitionSummary ||
          publicationConvergence?.priorityPartitionSummary,
        priorityRecoveryDecisionSnapshots:
          progressSnapshot?.priorityRecoveryDecisionSnapshots ||
          publicationConvergenceGate?.priorityRecoveryDecisionSnapshots ||
          publicationConvergence?.priorityRecoveryDecisionSnapshots,
        priorityRecoveryClosureWitness:
          progressSnapshot?.priorityRecoveryClosureWitness ||
          publicationConvergenceGate?.priorityRecoveryClosureWitness ||
          publicationConvergence?.priorityRecoveryClosureWitness ||
          progressSnapshot?.priorityRecoveryDecisionSnapshots?.closureWitness ||
          publicationConvergenceGate?.priorityRecoveryDecisionSnapshots
            ?.closureWitness ||
          publicationConvergence?.priorityRecoveryDecisionSnapshots
            ?.closureWitness,
        pendingAckNodeIds:
          publicationConvergence?.pendingAckNodeIds ||
          publicationConvergenceGate?.pendingAckNodeIds,
        missingPublishedNodeIds:
          publicationConvergenceGate?.missingPublishedNodeIds,
      });

  const startupPublicationLagWitness =
    closedStartupPublicationBestProgress !== true &&
    readinessMode === ACTIVE_GATE_READINESS_MODE_STARTUP &&
    Number.isInteger(progressSnapshot?.expectedNodeCount) &&
    progressSnapshot.expectedNodeCount > ZERO &&
    Number.isInteger(progressSnapshot?.activeNodeCount) &&
    progressSnapshot.activeNodeCount === progressSnapshot.expectedNodeCount &&
    Number.isInteger(progressSnapshot?.inactiveNodeCount) &&
    progressSnapshot.inactiveNodeCount === ZERO &&
    progressSnapshot?.snapshotCoverageComplete !== true &&
    Number.isInteger(progressSnapshot?.snapshotCoverageNodeCount) &&
    progressSnapshot.snapshotCoverageNodeCount > ZERO &&
    gateReasons.length === ZERO &&
    publicationStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED &&
    publicationRecoveryGate.pendingAckCount === ZERO &&
    Number.isInteger(progressSnapshot?.missingPublishedCount) &&
    progressSnapshot.missingPublishedCount > ZERO &&
    !isTimeoutShapedProbeError(progressSnapshot?.selectedSnapshotError) &&
    hasStrongAdminWitness;

  if (startupPublicationLagWitness) {
    return {
      closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_STARTUP_PUBLICATION_LAG,
      closureWitnessClass:
        ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
    };
  }

  const onlyPrioritySpreadPending =
    gateReasons.length === 1 &&
    gateReasons[0] === 'priority_control_plane_spread_pending';
  if (!onlyPrioritySpreadPending) {
    return null;
  }
  if (publicationStatus !== ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED) {
    return null;
  }

  const snapshotCoverageComplete = progressSnapshot?.snapshotCoverageComplete === true;
  if (!snapshotCoverageComplete) {
    return null;
  }

  const pendingAckCount = Number.isInteger(progressSnapshot?.pendingAckCount) ?
    progressSnapshot.pendingAckCount :
    publicationRecoveryGate.pendingAckCount;
  if (pendingAckCount > ZERO) {
    return null;
  }

  const missingPublishedCount = Number.isInteger(progressSnapshot?.missingPublishedCount) ?
    progressSnapshot.missingPublishedCount :
    publicationRecoveryGate.missingPublishedCount;
  if (missingPublishedCount > ZERO) {
    return null;
  }

  const prioritySpreadSatisfied = progressSnapshot?.prioritySpreadSatisfied;
  if (prioritySpreadSatisfied === true) {
    return null;
  }

  return {
    closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
    closureWitnessClass: ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
  };
}
