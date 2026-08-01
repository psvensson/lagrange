import {CLUSTER_BASE_LAYER} from './cluster-base-layer.js';
import {
  TYPEOF_STRING,
  normalizeDistinctStringArray,
  normalizeFirstNonEmptyDistinctStringArray,
} from './cluster-active-wait-normalization.js';
import {
  ACTIVE_WAIT_DIAGNOSTIC_TEXT,
  formatCountSummary,
  formatNodeDiagnostics,
  formatSnapshotCoverage,
  resolveMeaningfulProbeTimeoutMs,
  withTimeout,
} from './cluster-active-wait-diagnostics.js';
import {
  ACTIVE_GATE_OWNER_COHORT_FIELD,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD,
  evaluatePriorityRecoveryCrossServiceInvariants,
  formatPublicationConvergenceGate,
  normalizeActiveGateOwnerCohortCount,
  normalizeActiveGateOwnerCohortNodeIds,
  normalizeActiveGateOwnerCohortRecord,
  normalizeActiveGateOwnerCohortString,
  normalizeActiveWaitPublicationStatus,
  resolveActiveWaitPublicationStatusRank,
  resolveStartupPublicationLagSelectedMissingCount,
  resolveSteadyPublishedSelectedMissingCount,
  ACTIVE_WAIT_PUBLICATION_CONVERGENCE_REASONS_EMPTY,
} from './cluster-active-wait-publication-gate.js';
import {
  normalizePriorityRecoverySemanticStateId,
  summarizePriorityRecoveryProgressClasses,
} from './cluster-active-wait-priority-recovery-progress.js';

const {
  ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING,
  ACTIVE_PROBE_REASON_PUBLICATION_CONVERGENCE_MISSING,
  ACTIVE_PROBE_REASON_PUBLICATION_MISSING_ACTIVE_NODE_PREFIX,
  ACTIVE_PROBE_REASON_PUBLICATION_NOT_PUBLISHED_PREFIX,
  ACTIVE_PROBE_REASON_PUBLICATION_PENDING_ACK_PREFIX,
  ACTIVE_WAIT_BLOCKER_INACTIVE_NODES_PREFIX,
  ACTIVE_WAIT_BLOCKER_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX,
  ACTIVE_WAIT_BLOCKER_PUBLICATION_GATE_PREFIX,
  ACTIVE_WAIT_BLOCKER_READY,
  ACTIVE_WAIT_BLOCKER_SNAPSHOT_COVERAGE_PREFIX,
  ACTIVE_WAIT_BLOCKER_SNAPSHOT_ERROR,
  ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  buildPublicationRecoveryGateSnapshot,
  classifyActiveGateClosureWitness,
  classifyActiveGateReadinessDelay,
  UNKNOWN_STATE,
  ZERO,
} = CLUSTER_BASE_LAYER;

const ACTIVE_WAIT_BLOCKER_SIGNATURE_SEPARATOR = '|';
const ACTIVE_GATE_OWNER_RECOVERY_SNAPSHOT_MODE = 'repair_deferred';
const ACTIVE_GATE_OWNER_RECOVERY_SNAPSHOT_CONTRACT_STATE = 'deferred';
const ACTIVE_GATE_OWNER_RECOVERY_SNAPSHOT_NEXT_ACTION = 'retry';
const ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_STATE_PENDING = 'pending';
const ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_REASON_OWNER_RECONCILE =
  'owner_reconcile_pending';
const ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_NEXT_ACTION_WAIT =
  'wait_owner_recovery';
const ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_OUTCOME_WRITE_DEFERRED =
  'write_deferred';

/**
 * Evaluate whether load-mode startup can trust published membership convergence.
 * @param {Object|null} snapshotCoverage
 * @param {string[]} expectedNodeIds
 * @returns {Object}
 */
function evaluateLoadPublishedConvergence(
  snapshotCoverage,
  expectedNodeIds = [],
) {
  const expectedPublishedNodeIds =
    normalizeDistinctStringArray(expectedNodeIds);
  const selectedPriorityRecoveryDecisionSnapshots =
    snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots &&
    typeof snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots ===
      'object' ?
      snapshotCoverage.selectedPriorityRecoveryDecisionSnapshots :
      null;
  const selectedPublicationConvergenceGate =
    snapshotCoverage?.selectedPublicationConvergenceGate &&
    typeof snapshotCoverage.selectedPublicationConvergenceGate === 'object' ?
      snapshotCoverage.selectedPublicationConvergenceGate :
      null;
  const publicationConvergence =
    snapshotCoverage?.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === 'object' ?
      snapshotCoverage.selectedPublicationConvergence :
      null;
  const publicationActiveGateHandoff = normalizeActiveGateOwnerCohortRecord(
    snapshotCoverage?.selectedPublicationActiveGateHandoff,
  );
  const publicationActiveGateHandoffPublishedActiveNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      publicationActiveGateHandoff,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    );
  const publicationActiveGateHandoffMissingPublishedNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      publicationActiveGateHandoff,
      ACTIVE_GATE_OWNER_COHORT_FIELD.MISSING_PUBLISHED_NODE_IDS,
    );
  const publicationRecoveryGate = selectedPublicationConvergenceGate ?
    buildPublicationRecoveryGateSnapshot({
      ...selectedPublicationConvergenceGate,
      publicationStatus:
        selectedPublicationConvergenceGate.publicationStatus ??
        publicationConvergence?.publicationStatus ??
        publicationConvergence?.status,
      recoveryProtocolState:
        selectedPublicationConvergenceGate.recoveryProtocolState,
      priorityRecoveryReasonCodes:
        selectedPublicationConvergenceGate.priorityRecoveryReasonCodes ??
        selectedPublicationConvergenceGate.reasonCodes,
      priorityPartitionSummary:
        selectedPublicationConvergenceGate.priorityPartitionSummary,
      priorityRecoveryDecisionSnapshots:
        selectedPriorityRecoveryDecisionSnapshots,
      priorityRecoveryClosureWitness:
        selectedPriorityRecoveryDecisionSnapshots?.closureWitness || null,
      pendingAckNodeIds:
        selectedPublicationConvergenceGate.pendingAckNodeIds,
      missingPublishedNodeIds:
        selectedPublicationConvergenceGate.missingPublishedNodeIds,
    }) :
    buildPublicationRecoveryGateSnapshot({
      publicationStatus:
        publicationConvergence?.publicationStatus ??
        publicationConvergence?.status,
      recoveryProtocolState: publicationConvergence?.recoveryProtocolState,
      priorityRecoveryReasonCodes:
        publicationConvergence?.priorityRecoveryReasonCodes,
      priorityPartitionSummary:
        publicationConvergence?.priorityPartitionSummary,
      priorityRecoveryDecisionSnapshots:
        selectedPriorityRecoveryDecisionSnapshots,
      priorityRecoveryClosureWitness:
        selectedPriorityRecoveryDecisionSnapshots?.closureWitness || null,
      pendingAckNodeIds: publicationConvergence?.pendingAckNodeIds,
    });
  const publicationStatus =
    typeof publicationRecoveryGate?.publicationStatusNormalized === 'string' &&
    publicationRecoveryGate.publicationStatusNormalized.length > ZERO ?
      publicationRecoveryGate.publicationStatusNormalized :
      typeof publicationConvergence?.publicationStatus === 'string' ?
        publicationConvergence.publicationStatus.toUpperCase() :
        null;
  const publishedActiveNodeIds = normalizeFirstNonEmptyDistinctStringArray(
    publicationConvergence?.publishedActiveNodeIds,
    publicationActiveGateHandoffPublishedActiveNodeIds,
  );
  const recoveryActiveNodeIds = normalizeFirstNonEmptyDistinctStringArray(
    publicationConvergence?.recoveryActiveNodeIds,
    publicationConvergence?.membershipLifecycleSummary?.recoveryActiveNodeIds,
    publicationConvergence?.membershipLifecycleSummary?.locallyEligibleNodeIds,
    publicationConvergence?.membershipLifecycleSummary?.projectedServingNodeIds,
    publicationConvergence?.publishedActiveNodeIds,
    publicationActiveGateHandoffPublishedActiveNodeIds,
  );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    publicationRecoveryGate?.pendingAckNodeIds ??
      publicationConvergence?.pendingAckNodeIds,
  );
  const recoveryProtocolState =
    typeof publicationRecoveryGate?.recoveryProtocolState === 'string' &&
    publicationRecoveryGate.recoveryProtocolState.length > ZERO ?
      publicationRecoveryGate.recoveryProtocolState :
      typeof publicationConvergence?.recoveryProtocolState === 'string' &&
          publicationConvergence.recoveryProtocolState.length > ZERO ?
        publicationConvergence.recoveryProtocolState :
        null;
  const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
    publicationRecoveryGate?.reasonCodes ??
      publicationConvergence?.priorityRecoveryReasonCodes,
  );
  const priorityPartitionSummary =
    publicationRecoveryGate?.priorityPartitionSummary &&
    typeof publicationRecoveryGate.priorityPartitionSummary === 'object' ?
      publicationRecoveryGate.priorityPartitionSummary :
      publicationConvergence?.priorityPartitionSummary &&
          typeof publicationConvergence.priorityPartitionSummary === 'object' ?
        publicationConvergence.priorityPartitionSummary :
        null;
  const requiredPublishedNodeIds = normalizeDistinctStringArray([
    ...normalizeDistinctStringArray(publicationRecoveryGate?.requiredAckNodeIds),
    ...normalizeDistinctStringArray(
      publicationRecoveryGate?.acknowledgedNodeIds,
    ),
    ...normalizeDistinctStringArray(publicationRecoveryGate?.pendingAckNodeIds),
    ...normalizeDistinctStringArray(
      publicationRecoveryGate?.missingPublishedNodeIds,
    ),
    ...normalizeDistinctStringArray(publicationConvergence?.requiredAckNodeIds),
    ...normalizeDistinctStringArray(
      publicationConvergence?.acknowledgedNodeIds,
    ),
    ...normalizeDistinctStringArray(publicationConvergence?.pendingAckNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.missingPublishedNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.publishedActiveNodeIds),
    ...normalizeDistinctStringArray(publicationConvergence?.recoveryActiveNodeIds),
    ...normalizeDistinctStringArray(
      publicationConvergence?.membershipLifecycleSummary?.recoveryActiveNodeIds,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergence?.membershipLifecycleSummary?.locallyEligibleNodeIds,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergence?.membershipLifecycleSummary?.projectedServingNodeIds,
    ),
    ...publicationActiveGateHandoffPublishedActiveNodeIds,
    ...publicationActiveGateHandoffMissingPublishedNodeIds,
  ]);
  const effectivePublishedNodeIds =
    requiredPublishedNodeIds.length > ZERO ?
      requiredPublishedNodeIds :
      expectedPublishedNodeIds;
  const missingPublishedNodeIds = effectivePublishedNodeIds.filter((nodeId) => {
    return !publishedActiveNodeIds.includes(nodeId);
  });
  const publicationRecoveryGateMissingPublishedNodeIds =
    normalizeDistinctStringArray(publicationRecoveryGate?.missingPublishedNodeIds);
  const effectiveMissingPublishedNodeIds = normalizeDistinctStringArray([
    ...missingPublishedNodeIds,
    ...publicationRecoveryGateMissingPublishedNodeIds,
  ]);
  const publicationActiveGateHandoffMissingPublishedCount =
    normalizeActiveGateOwnerCohortCount(
      publicationActiveGateHandoff,
      ACTIVE_GATE_OWNER_COHORT_FIELD.MISSING_PUBLISHED_COUNT,
      publicationActiveGateHandoffMissingPublishedNodeIds,
    );
  const publicationActiveGateHandoffCoversExpectedNodes =
    publicationActiveGateHandoff !== null &&
    expectedPublishedNodeIds.length > ZERO &&
    publicationActiveGateHandoffPublishedActiveNodeIds.length >=
      expectedPublishedNodeIds.length &&
    publicationActiveGateHandoffMissingPublishedCount === ZERO &&
    pendingAckNodeIds.length === ZERO;
  const reasons = Array.from(ACTIVE_WAIT_PUBLICATION_CONVERGENCE_REASONS_EMPTY);

  if (
    !publicationConvergence &&
    !selectedPublicationConvergenceGate &&
    publicationActiveGateHandoffCoversExpectedNodes !== true
  ) {
    reasons.push(ACTIVE_PROBE_REASON_PUBLICATION_CONVERGENCE_MISSING);
  }
  if (
    publicationStatus !== ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED &&
    publicationActiveGateHandoffCoversExpectedNodes !== true
  ) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_NOT_PUBLISHED_PREFIX +
        String(publicationStatus || UNKNOWN_STATE),
    );
  }
  if (pendingAckNodeIds.length > ZERO) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_PENDING_ACK_PREFIX +
        String(pendingAckNodeIds.length),
    );
  }
  const missingRecoveryActiveNodeIds = effectivePublishedNodeIds.filter(
    (nodeId) => !recoveryActiveNodeIds.includes(nodeId),
  );
  for (const nodeId of missingRecoveryActiveNodeIds) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_MISSING_ACTIVE_NODE_PREFIX + nodeId,
    );
  }
  for (const nodeId of effectiveMissingPublishedNodeIds) {
    reasons.push(
      ACTIVE_PROBE_REASON_PUBLICATION_MISSING_ACTIVE_NODE_PREFIX + nodeId,
    );
  }
  if (publicationRecoveryGate.prioritySpreadPending === true) {
    reasons.push(ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING);
  }

  return {
    ready: reasons.length === ZERO,
    reasons: Object.freeze(reasons),
    publicationStatus,
    closureRecordId: publicationRecoveryGate?.closureRecordId || null,
    closureWitnessClass: publicationRecoveryGate?.closureWitnessClass || null,
    publicationRecoveryGate,
    recoveryProtocolState,
    priorityRecoveryReasonCodes,
    priorityRecoveryDecisionSnapshots: selectedPriorityRecoveryDecisionSnapshots,
    recoveryActiveNodeIds,
    recoveryActiveNodeSource:
      typeof publicationConvergence?.recoveryActiveNodeSource ===
        TYPEOF_STRING &&
      publicationConvergence.recoveryActiveNodeSource.length > ZERO ?
        publicationConvergence.recoveryActiveNodeSource :
        null,
    pendingAckNodeIds,
    missingPublishedNodeIds: effectiveMissingPublishedNodeIds,
    missingRecoveryActiveNodeIds,
    priorityPartitionSummary,
  };
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= ZERO ?
    Math.floor(value) :
    ZERO;
}

function hasOwnerRecoverySnapshotCoverageMode({
  readinessMode,
  expectedNodeCount,
  snapshotCoverageNodeCount,
} = {}) {
  if (readinessMode === CLUSTER_READINESS_MODE_LOAD) {
    return snapshotCoverageNodeCount >= expectedNodeCount;
  }
  return readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
    snapshotCoverageNodeCount > ZERO;
}

function hasBoundedOwnerRecoverySnapshotCoverage({
  readinessMode,
  expectedNodeCount,
  snapshotCoverageNodeCount,
  selectedSnapshotRepairDeferred,
  selectedSnapshotObservationMode,
  selectedSnapshotObservationContractState,
  selectedSnapshotObservationRefreshState,
  selectedSnapshotObservationNextAction,
  selectedPublishedActiveNodeIds,
  activeGateOwnerCohortState,
  activeGateOwnerCohortReasonCode,
  activeGateOwnerCohortMissingPublishedCount,
  activeGateOwnerCohortPendingRecoveryNodeIds,
  activeGateOwnerCohortPendingRecoveryCount,
  activeGateOwnerCohortPendingReconcileCount,
  publicationActiveGateHandoffNextAction,
  publicationActiveGateHandoffRuntimePromotionAllowed,
  membershipPublicationHandoffOutcomeState,
  membershipPublicationHandoffOutcomeReasonCode,
  membershipPublicationHandoffOutcomeEnqueued,
  membershipPublicationHandoffOutcomeRetryAfterMs,
  selectedControlPlaneOwnerQueueDepth,
} = {}) {
  if (
    expectedNodeCount <= ZERO ||
    selectedPublishedActiveNodeIds.length < expectedNodeCount ||
    hasOwnerRecoverySnapshotCoverageMode({
      readinessMode,
      expectedNodeCount,
      snapshotCoverageNodeCount,
    }) !== true
  ) {
    return false;
  }
  const pendingWrites = normalizeNonNegativeInteger(
    selectedControlPlaneOwnerQueueDepth?.pendingWrites,
  );
  const pendingWriteGrowthCount = normalizeNonNegativeInteger(
    selectedControlPlaneOwnerQueueDepth?.pendingWriteGrowthCount,
  );
  const selectedPublishedActiveNodeIdSet =
    new Set(selectedPublishedActiveNodeIds);
  const pendingRecoveryCoveredByPublishedActive =
    activeGateOwnerCohortPendingRecoveryNodeIds.every((nodeId) =>
      selectedPublishedActiveNodeIdSet.has(nodeId),
    );
  const pendingRecoveryCount = normalizeNonNegativeInteger(
    activeGateOwnerCohortPendingRecoveryCount,
  );
  const pendingRecoveryDebtPresent =
    activeGateOwnerCohortPendingRecoveryNodeIds.length > ZERO &&
    pendingRecoveryCount >= activeGateOwnerCohortPendingRecoveryNodeIds.length;
  return (
    selectedSnapshotRepairDeferred === true &&
    selectedSnapshotObservationMode === ACTIVE_GATE_OWNER_RECOVERY_SNAPSHOT_MODE &&
    selectedSnapshotObservationContractState ===
      ACTIVE_GATE_OWNER_RECOVERY_SNAPSHOT_CONTRACT_STATE &&
    selectedSnapshotObservationRefreshState ===
      ACTIVE_GATE_OWNER_RECOVERY_SNAPSHOT_CONTRACT_STATE &&
    selectedSnapshotObservationNextAction ===
      ACTIVE_GATE_OWNER_RECOVERY_SNAPSHOT_NEXT_ACTION &&
    activeGateOwnerCohortState ===
      ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_STATE_PENDING &&
    activeGateOwnerCohortReasonCode ===
      ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_REASON_OWNER_RECONCILE &&
    activeGateOwnerCohortMissingPublishedCount === ZERO &&
    pendingRecoveryDebtPresent === true &&
    pendingRecoveryCoveredByPublishedActive === true &&
    activeGateOwnerCohortPendingReconcileCount === ZERO &&
    publicationActiveGateHandoffNextAction ===
      ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_NEXT_ACTION_WAIT &&
    publicationActiveGateHandoffRuntimePromotionAllowed !== true &&
    membershipPublicationHandoffOutcomeState ===
      ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_OUTCOME_WRITE_DEFERRED &&
    membershipPublicationHandoffOutcomeReasonCode ===
      ACTIVE_GATE_OWNER_RECOVERY_HANDOFF_REASON_OWNER_RECONCILE &&
    membershipPublicationHandoffOutcomeEnqueued === true &&
    normalizeNonNegativeInteger(membershipPublicationHandoffOutcomeRetryAfterMs) >
      ZERO &&
    pendingWrites >= Math.max(
      pendingRecoveryCount,
      activeGateOwnerCohortPendingRecoveryNodeIds.length,
    ) &&
    pendingWriteGrowthCount === ZERO
  );
}

function isPriorityRecoveryProgressEvidenceRecord(value) {
  return value && typeof value === 'object' && Array.isArray(value) !== true;
}

function hasPriorityRecoveryProgressEvidence(value) {
  return (
    isPriorityRecoveryProgressEvidenceRecord(value) &&
    (
      Array.isArray(value.snapshots) ||
      Array.isArray(value.partitionSnapshots) ||
      isPriorityRecoveryProgressEvidenceRecord(
        value.partitionIdsBySemanticState,
      ) ||
      isPriorityRecoveryProgressEvidenceRecord(
        value.blockerPartitionIdsByReason,
      ) ||
      isPriorityRecoveryProgressEvidenceRecord(value.partitionIdsByClass)
    )
  );
}

function mergePriorityRecoveryProgressEvidenceMap(target, source) {
  if (!isPriorityRecoveryProgressEvidenceRecord(source)) {
    return;
  }
  for (const [key, partitionIds] of Object.entries(source)) {
    const normalizedKey = String(key || '').trim();
    if (normalizedKey.length === ZERO) {
      continue;
    }
    target[normalizedKey] = normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(target[normalizedKey]),
      ...normalizeDistinctStringArray(partitionIds),
    ]);
  }
}

function mergePriorityRecoveryProgressEvidence(candidates = []) {
  const evidenceRecords = candidates.filter(hasPriorityRecoveryProgressEvidence);
  if (evidenceRecords.length === ZERO) {
    return null;
  }
  const snapshots = [];
  const partitionIdsBySemanticState = {};
  const blockerPartitionIdsByReason = {};
  let closureWitness = null;
  for (const evidence of evidenceRecords) {
    if (Array.isArray(evidence.snapshots)) {
      snapshots.push(...evidence.snapshots);
    }
    if (Array.isArray(evidence.partitionSnapshots)) {
      snapshots.push(...evidence.partitionSnapshots);
    }
    mergePriorityRecoveryProgressEvidenceMap(
      partitionIdsBySemanticState,
      evidence.partitionIdsBySemanticState,
    );
    mergePriorityRecoveryProgressEvidenceMap(
      blockerPartitionIdsByReason,
      evidence.blockerPartitionIdsByReason,
    );
    mergePriorityRecoveryProgressEvidenceMap(
      blockerPartitionIdsByReason,
      evidence.partitionIdsByClass,
    );
    if (!closureWitness && isPriorityRecoveryProgressEvidenceRecord(
      evidence.closureWitness,
    )) {
      closureWitness = evidence.closureWitness;
    }
  }
  return {
    snapshots,
    partitionIdsBySemanticState,
    blockerPartitionIdsByReason,
    ...(closureWitness ? {closureWitness} : {}),
  };
}

function selectPriorityRecoveryProgressEvidence({
  snapshotCoverage = null,
  publicationConvergence = null,
  publicationConvergenceGate = null,
} = {}) {
  const candidates = [
    snapshotCoverage?.selectedPriorityRecoveryDecisionSnapshots,
    snapshotCoverage?.priorityRecoveryDecisionSnapshots,
    publicationConvergenceGate?.priorityRecoveryDecisionSnapshots,
    publicationConvergence?.priorityRecoveryDecisionSnapshots,
    snapshotCoverage?.selectedPublicationConvergenceGate
      ?.priorityRecoveryDecisionSnapshots,
    snapshotCoverage?.selectedPublicationConvergence
      ?.priorityRecoveryDecisionSnapshots,
    snapshotCoverage?.selectedPriorityRecoveryObservation
      ?.priorityRecoveryCurrentSummary,
    snapshotCoverage?.priorityRecoveryObservation
      ?.priorityRecoveryCurrentSummary,
    publicationConvergenceGate?.priorityRecoveryCurrentSummary,
    publicationConvergence?.priorityRecoveryCurrentSummary,
    snapshotCoverage?.selectedPublicationConvergenceGate
      ?.priorityRecoveryCurrentSummary,
    snapshotCoverage?.selectedPublicationConvergence
      ?.priorityRecoveryCurrentSummary,
  ];
  return mergePriorityRecoveryProgressEvidence(candidates);
}


function buildActiveWaitProgressSnapshot(
  probeResult = {},
  expectedNodeCount = ZERO,
  options = {},
) {
  const readinessMode =
    options?.readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      CLUSTER_READINESS_MODE_LOAD :
      CLUSTER_READINESS_MODE_STARTUP;
  const nodeDiagnostics = Array.isArray(probeResult?.nodeDiagnostics) ?
    probeResult.nodeDiagnostics :
    [];
  const activeNodeCount = nodeDiagnostics.filter(
    (diagnostic) => diagnostic?.active === true,
  ).length;
  const inactiveNodeCount = Math.max(
    ZERO,
    nodeDiagnostics.length - activeNodeCount,
  );

  const snapshotCoverage =
    probeResult?.snapshotCoverage &&
    typeof probeResult.snapshotCoverage === 'object' ?
      probeResult.snapshotCoverage :
      null;
  const normalizedExpectedNodeCount =
    Number.isInteger(snapshotCoverage?.expectedNodeCount) &&
    snapshotCoverage.expectedNodeCount > ZERO ?
      snapshotCoverage.expectedNodeCount :
      Math.max(ZERO, expectedNodeCount);
  const snapshotCoverageNodeCount =
    Number.isInteger(snapshotCoverage?.bestCoverageNodeCount) &&
    snapshotCoverage.bestCoverageNodeCount > ZERO ?
      snapshotCoverage.bestCoverageNodeCount :
      ZERO;
  const canonicalSnapshotCoverageComplete =
    snapshotCoverage?.completeCoverage === true;

  const publicationConvergence =
    snapshotCoverage?.selectedPublicationConvergence &&
    typeof snapshotCoverage.selectedPublicationConvergence === 'object' ?
      snapshotCoverage.selectedPublicationConvergence :
      null;
  const publicationConvergenceGate =
    probeResult?.publicationConvergenceGate &&
    typeof probeResult.publicationConvergenceGate === 'object' ?
      probeResult.publicationConvergenceGate :
      null;
  const publicationStatus = normalizeActiveWaitPublicationStatus(
    publicationConvergenceGate?.publicationStatus ||
      publicationConvergence?.publicationStatus,
  );
  const recoveryProtocolState =
    typeof publicationConvergenceGate?.recoveryProtocolState === 'string' &&
    publicationConvergenceGate.recoveryProtocolState.length > ZERO ?
      publicationConvergenceGate.recoveryProtocolState :
      typeof publicationConvergence?.recoveryProtocolState === 'string' &&
          publicationConvergence.recoveryProtocolState.length > ZERO ?
        publicationConvergence.recoveryProtocolState :
        null;
  const publicationEpoch = Number.isFinite(
    publicationConvergence?.publicationEpoch,
  ) ?
    Math.floor(publicationConvergence.publicationEpoch) :
    null;
  const selectedSnapshotNodeId =
    typeof snapshotCoverage?.selectedNodeId === 'string' &&
    snapshotCoverage.selectedNodeId.length > ZERO ?
      snapshotCoverage.selectedNodeId :
      null;
  const selectedSnapshotTimeoutMs = Number.isFinite(
    snapshotCoverage?.selectedSnapshotTimeoutMs,
  ) ?
    Math.max(ZERO, Math.floor(snapshotCoverage.selectedSnapshotTimeoutMs)) :
    null;
  const selectedSnapshotAdminReady =
    snapshotCoverage?.selectedAdminReady === true ?
      true :
      snapshotCoverage?.selectedAdminReady === false ?
        false :
        null;
  const selectedSnapshotReachableBy =
    typeof snapshotCoverage?.selectedReachableBy === 'string' &&
    snapshotCoverage.selectedReachableBy.length > ZERO ?
      snapshotCoverage.selectedReachableBy :
      null;
  const selectedSnapshotError =
    typeof snapshotCoverage?.selectedError === 'string' &&
    snapshotCoverage.selectedError.length > ZERO ?
      snapshotCoverage.selectedError :
      null;
  const selectedSnapshotReachabilityError =
    typeof snapshotCoverage?.selectedReachabilityError === 'string' &&
    snapshotCoverage.selectedReachabilityError.length > ZERO ?
      snapshotCoverage.selectedReachabilityError :
      null;
  const selectedSnapshotObservationMode =
    typeof snapshotCoverage?.selectedSnapshotObservationMode === 'string' &&
    snapshotCoverage.selectedSnapshotObservationMode.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationMode :
      null;
  const selectedSnapshotObservationState =
    typeof snapshotCoverage?.selectedSnapshotObservationState === 'string' &&
    snapshotCoverage.selectedSnapshotObservationState.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationState :
      null;
  const selectedSnapshotObservationContractState =
    typeof snapshotCoverage?.selectedSnapshotObservationContractState ===
      'string' &&
    snapshotCoverage.selectedSnapshotObservationContractState.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationContractState :
      null;
  const selectedSnapshotObservationRefreshState =
    typeof snapshotCoverage?.selectedSnapshotObservationRefreshState ===
      'string' &&
    snapshotCoverage.selectedSnapshotObservationRefreshState.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationRefreshState :
      null;
  const selectedSnapshotObservationNextAction =
    typeof snapshotCoverage?.selectedSnapshotObservationNextAction ===
      'string' &&
    snapshotCoverage.selectedSnapshotObservationNextAction.length > ZERO ?
      snapshotCoverage.selectedSnapshotObservationNextAction :
      null;
  const selectedSnapshotObservationReasonCodes = normalizeDistinctStringArray(
    snapshotCoverage?.selectedSnapshotObservationReasonCodes,
  );
  const selectedSnapshotObservationRetryAfterMs = Number.isFinite(
    snapshotCoverage?.selectedSnapshotObservationRetryAfterMs,
  ) ?
    Math.max(
      ZERO,
      Math.floor(snapshotCoverage.selectedSnapshotObservationRetryAfterMs),
    ) :
    null;
  const selectedSnapshotRepairDeferred =
    snapshotCoverage?.selectedSnapshotRepairDeferred === true;
  const selectedControlPlaneOwnerQueueDepth =
    snapshotCoverage?.selectedControlPlaneOwnerQueueDepth &&
    typeof snapshotCoverage.selectedControlPlaneOwnerQueueDepth === 'object' ?
      snapshotCoverage.selectedControlPlaneOwnerQueueDepth :
      null;
  const selectedObservedControlPlaneOwnerQueueDepth =
    snapshotCoverage?.selectedObservedControlPlaneOwnerQueueDepth &&
    typeof snapshotCoverage.selectedObservedControlPlaneOwnerQueueDepth ===
      'object' ?
      snapshotCoverage.selectedObservedControlPlaneOwnerQueueDepth :
      selectedControlPlaneOwnerQueueDepth;
  const selectedLoggingRetentionQueueDepth =
    snapshotCoverage?.selectedLoggingRetentionQueueDepth &&
    typeof snapshotCoverage.selectedLoggingRetentionQueueDepth === 'object' ?
      snapshotCoverage.selectedLoggingRetentionQueueDepth :
      null;
  const selectedQueueDiagnosticsSourceState =
    typeof snapshotCoverage?.selectedQueueDiagnosticsSourceState ===
      TYPEOF_STRING ?
      snapshotCoverage.selectedQueueDiagnosticsSourceState :
      null;
  const selectedCdcReplayLag =
    snapshotCoverage?.selectedCdcReplayLag &&
    typeof snapshotCoverage.selectedCdcReplayLag === 'object' ?
      snapshotCoverage.selectedCdcReplayLag :
      null;
  const publicationActiveGateHandoff = normalizeActiveGateOwnerCohortRecord(
    snapshotCoverage?.selectedPublicationActiveGateHandoff,
  );
  const activeGateOwnerCohort = normalizeActiveGateOwnerCohortRecord(
    publicationActiveGateHandoff ||
      snapshotCoverage?.selectedActiveGateOwnerCohort,
  );
  const publicationActiveGateHandoffNextAction =
    normalizeActiveGateOwnerCohortString(
      publicationActiveGateHandoff?.[
        ACTIVE_GATE_OWNER_COHORT_FIELD.NEXT_ACTION
      ],
    );
  const publicationActiveGateHandoffRuntimePromotionAllowed =
    publicationActiveGateHandoff?.[
      ACTIVE_GATE_OWNER_COHORT_FIELD.RUNTIME_PROMOTION_ALLOWED
    ] === true;
  const activeGateOwnerCohortState = normalizeActiveGateOwnerCohortString(
    activeGateOwnerCohort?.[ACTIVE_GATE_OWNER_COHORT_FIELD.STATE],
  );
  const activeGateOwnerCohortReasonCode =
    normalizeActiveGateOwnerCohortString(
      activeGateOwnerCohort?.[ACTIVE_GATE_OWNER_COHORT_FIELD.REASON_CODE],
    );
  const activeGateOwnerCohortMissingPublishedNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.MISSING_PUBLISHED_NODE_IDS,
    );
  const activeGateOwnerCohortMissingPublishedCount =
    normalizeActiveGateOwnerCohortCount(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.MISSING_PUBLISHED_COUNT,
      activeGateOwnerCohortMissingPublishedNodeIds,
    );
  const activeGateOwnerCohortPendingRecoveryNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PENDING_RECOVERY_NODE_IDS,
    );
  const activeGateOwnerCohortPendingRecoveryCount =
    normalizeActiveGateOwnerCohortCount(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PENDING_RECOVERY_COUNT,
      activeGateOwnerCohortPendingRecoveryNodeIds,
    );
  const activeGateOwnerCohortPendingReconcileNodeIds =
    normalizeActiveGateOwnerCohortNodeIds(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PENDING_RECONCILE_NODE_IDS,
    );
  const activeGateOwnerCohortPendingReconcileCount =
    normalizeActiveGateOwnerCohortCount(
      activeGateOwnerCohort,
      ACTIVE_GATE_OWNER_COHORT_FIELD.PENDING_RECONCILE_COUNT,
      activeGateOwnerCohortPendingReconcileNodeIds,
    );
  const membershipPublicationHandoffOutcome =
    normalizeActiveGateOwnerCohortRecord(
      snapshotCoverage?.selectedMembershipPublicationHandoffOutcome ||
        publicationActiveGateHandoff?.[
          ACTIVE_GATE_OWNER_COHORT_FIELD
            .MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME
        ] ||
        activeGateOwnerCohort?.[
          ACTIVE_GATE_OWNER_COHORT_FIELD
            .MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME
        ],
    );
  const membershipPublicationHandoffOutcomeState =
    normalizeActiveGateOwnerCohortString(
      membershipPublicationHandoffOutcome?.[
        MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.STATE
      ],
    );
  const membershipPublicationHandoffOutcomeReasonCode =
    normalizeActiveGateOwnerCohortString(
      membershipPublicationHandoffOutcome?.[
        MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.REASON_CODE
      ],
    );
  const membershipPublicationHandoffOutcomeEnqueued =
    membershipPublicationHandoffOutcome?.[
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.ENQUEUED
    ] === true;
  const membershipPublicationHandoffOutcomeRetryAfterMs = Number.isFinite(
    membershipPublicationHandoffOutcome?.[
      MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.RETRY_AFTER_MS
    ],
  ) ?
    Math.max(
      ZERO,
      Math.floor(
        membershipPublicationHandoffOutcome[
          MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD.RETRY_AFTER_MS
        ],
      ),
    ) :
    null;
  const perNodePublicationDisagreementSet =
    snapshotCoverage?.publicationDisagreementByNodeId &&
    typeof snapshotCoverage.publicationDisagreementByNodeId === 'object' ?
      Object.fromEntries(
        Object.entries(snapshotCoverage.publicationDisagreementByNodeId)
          .map(([nodeId, missingNodeIds]) => {
            const normalizedNodeId = String(nodeId || '').trim();
            return [
              normalizedNodeId,
              normalizeDistinctStringArray(missingNodeIds),
            ];
          })
          .filter(([nodeId]) => nodeId.length > ZERO),
      ) :
      {};
  const publicationActiveGateHandoffPublishedActiveNodeIds =
    normalizeDistinctStringArray(
      publicationActiveGateHandoff?.publishedActiveNodeIds,
    );
  const selectedPublishedActiveNodeIds =
    normalizeFirstNonEmptyDistinctStringArray(
      snapshotCoverage?.selectedPublishedActiveNodeIds,
      publicationActiveGateHandoffPublishedActiveNodeIds,
      publicationConvergence?.publishedActiveNodeIds,
    );
  const selectedMissingPublishedNodeIds =
    Array.isArray(snapshotCoverage?.selectedMissingPublishedNodeIds) ?
      normalizeDistinctStringArray(snapshotCoverage.selectedMissingPublishedNodeIds) :
      Array.isArray(publicationActiveGateHandoff?.missingPublishedNodeIds) ?
        normalizeDistinctStringArray(
          publicationActiveGateHandoff.missingPublishedNodeIds,
        ) :
        normalizeDistinctStringArray(
          publicationConvergenceGate?.missingPublishedNodeIds,
        );
  const pendingAckNodeIds = normalizeDistinctStringArray(
    snapshotCoverage?.selectedPendingAckNodeIds ||
      publicationConvergenceGate?.pendingAckNodeIds ||
      publicationConvergence?.pendingAckNodeIds,
  );
  const missingPublishedNodeIds = normalizeDistinctStringArray(
    publicationConvergenceGate?.missingPublishedNodeIds,
  );
  const publicationActiveGateHandoffCoversExpectedNodes =
    publicationActiveGateHandoff !== null &&
    normalizedExpectedNodeCount > ZERO &&
    publicationActiveGateHandoffPublishedActiveNodeIds.length >=
      normalizedExpectedNodeCount &&
    activeGateOwnerCohortMissingPublishedCount === ZERO;
  const missingPublishedCount =
    publicationActiveGateHandoffCoversExpectedNodes === true ?
      ZERO :
      Math.max(
        missingPublishedNodeIds.length,
        Number.isInteger(publicationConvergenceGate?.missingPublishedCount) &&
          publicationConvergenceGate.missingPublishedCount >= ZERO ?
          publicationConvergenceGate.missingPublishedCount :
          ZERO,
      );
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate?.reasons,
  ).sort();
  const priorityPartitionSummary =
    publicationConvergenceGate?.priorityPartitionSummary &&
    typeof publicationConvergenceGate.priorityPartitionSummary === 'object' ?
      publicationConvergenceGate.priorityPartitionSummary :
      publicationConvergence?.priorityPartitionSummary &&
          typeof publicationConvergence.priorityPartitionSummary === 'object' ?
        publicationConvergence.priorityPartitionSummary :
        null;
  const prioritySpreadSatisfied =
    priorityPartitionSummary?.satisfied === true ?
      true :
      priorityPartitionSummary?.satisfied === false ?
        false :
        null;
  const prioritySpreadGap =
    Number.isInteger(priorityPartitionSummary?.totalSpreadGap) &&
    priorityPartitionSummary.totalSpreadGap >= ZERO ?
      priorityPartitionSummary.totalSpreadGap :
      null;
  const priorityBlockedPartitionCount =
    Number.isInteger(priorityPartitionSummary?.blockedPartitionCount) &&
    priorityPartitionSummary.blockedPartitionCount >= ZERO ?
      priorityPartitionSummary.blockedPartitionCount :
      null;
  const steadyPublishedSelectedMissingCount =
    resolveSteadyPublishedSelectedMissingCount({
      expectedNodeCount: normalizedExpectedNodeCount,
      publicationStatus,
      recoveryProtocolState,
      priorityPartitionSummary,
      pendingAckNodeIds,
      selectedPublishedActiveNodeIds,
      selectedMissingPublishedNodeIds,
    });
  const startupPublicationLagSelectedMissingCount =
    resolveStartupPublicationLagSelectedMissingCount({
      readinessMode,
      expectedNodeCount: normalizedExpectedNodeCount,
      publicationStatus,
      pendingAckNodeIds,
      selectedPublishedActiveNodeIds,
      selectedMissingPublishedNodeIds,
    });
  const normalizedMissingPublishedCount = Math.max(
    missingPublishedCount,
    steadyPublishedSelectedMissingCount,
    startupPublicationLagSelectedMissingCount,
  );
  const priorityRecoveryDecisionSnapshots = selectPriorityRecoveryProgressEvidence({
    snapshotCoverage,
    publicationConvergence,
    publicationConvergenceGate,
  });
  const priorityRecoveryProgressClasses =
    summarizePriorityRecoveryProgressClasses(priorityRecoveryDecisionSnapshots);
  const priorityRecoveryUnresolvedClassCount =
    priorityRecoveryProgressClasses.unresolvedClassCount;
  const priorityRecoveryUnresolvedSemanticStateCount =
    priorityRecoveryProgressClasses.unresolvedSemanticStateCount;
  const priorityRecoveryBlockedPartitionCount =
    priorityRecoveryProgressClasses.blockedPartitionCount;
  const ownerRecoverySnapshotCoverageComplete =
    canonicalSnapshotCoverageComplete !== true &&
    hasBoundedOwnerRecoverySnapshotCoverage({
      readinessMode,
      expectedNodeCount: normalizedExpectedNodeCount,
      snapshotCoverageNodeCount,
      selectedSnapshotRepairDeferred,
      selectedSnapshotObservationMode,
      selectedSnapshotObservationContractState,
      selectedSnapshotObservationRefreshState,
      selectedSnapshotObservationNextAction,
      selectedPublishedActiveNodeIds,
      activeGateOwnerCohortState,
      activeGateOwnerCohortReasonCode,
      activeGateOwnerCohortMissingPublishedCount,
      activeGateOwnerCohortPendingRecoveryNodeIds,
      activeGateOwnerCohortPendingRecoveryCount,
      activeGateOwnerCohortPendingReconcileCount,
      publicationActiveGateHandoffNextAction,
      publicationActiveGateHandoffRuntimePromotionAllowed,
      membershipPublicationHandoffOutcomeState,
      membershipPublicationHandoffOutcomeReasonCode,
      membershipPublicationHandoffOutcomeEnqueued,
      membershipPublicationHandoffOutcomeRetryAfterMs,
      selectedControlPlaneOwnerQueueDepth,
    });
  const snapshotCoverageComplete =
    canonicalSnapshotCoverageComplete === true ||
    ownerRecoverySnapshotCoverageComplete === true;

  const blockers = [];
  if (inactiveNodeCount > ZERO) {
    blockers.push(
      ACTIVE_WAIT_BLOCKER_INACTIVE_NODES_PREFIX + String(inactiveNodeCount),
    );
  }
  if (!snapshotCoverageComplete) {
    blockers.push(
      ACTIVE_WAIT_BLOCKER_SNAPSHOT_COVERAGE_PREFIX +
        String(snapshotCoverageNodeCount) +
        ACTIVE_WAIT_DIAGNOSTIC_TEXT.COUNT_SEPARATOR +
        String(normalizedExpectedNodeCount),
    );
  }
  if (
    typeof snapshotCoverage?.selectedError === TYPEOF_STRING &&
    snapshotCoverage.selectedError.length > ZERO
  ) {
    blockers.push(ACTIVE_WAIT_BLOCKER_SNAPSHOT_ERROR);
  }
  for (const reason of gateReasons) {
    blockers.push(ACTIVE_WAIT_BLOCKER_PUBLICATION_GATE_PREFIX + reason);
  }
  for (const progressClass of priorityRecoveryProgressClasses.unresolvedClassIds) {
    blockers.push(
      ACTIVE_WAIT_BLOCKER_PRIORITY_RECOVERY_PROGRESS_CLASS_PREFIX +
        progressClass,
    );
  }
  if (blockers.length === ZERO && probeResult?.allActive === true) {
    blockers.push(ACTIVE_WAIT_BLOCKER_READY);
  }
  const progressPublicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
    ...publicationConvergenceGate,
    publicationStatus,
    recoveryProtocolState,
    priorityRecoveryReasonCodes:
      publicationConvergenceGate?.priorityRecoveryReasonCodes,
    priorityPartitionSummary,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness:
      priorityRecoveryDecisionSnapshots?.closureWitness || null,
    pendingAckNodeIds,
    missingPublishedNodeIds: selectedMissingPublishedNodeIds,
    missingPublishedCount: normalizedMissingPublishedCount,
  });

  const closureWitness = classifyActiveGateClosureWitness({
    progressSnapshot: {
      expectedNodeCount: normalizedExpectedNodeCount,
      activeNodeCount,
      inactiveNodeCount,
      snapshotCoverageNodeCount,
      snapshotCoverageComplete,
      publicationStatus,
      recoveryProtocolState,
      pendingAckCount: pendingAckNodeIds.length,
      missingPublishedCount: normalizedMissingPublishedCount,
      gateReasons,
      prioritySpreadSatisfied,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryClosureWitness:
        priorityRecoveryDecisionSnapshots?.closureWitness || null,
      publicationRecoveryGate: progressPublicationRecoveryGate,
      selectedSnapshotAdminReady,
      selectedSnapshotReachableBy,
      selectedSnapshotError,
      selectedSnapshotReachabilityError,
      selectedSnapshotObservationMode,
      selectedSnapshotObservationState,
      selectedSnapshotObservationContractState,
      selectedSnapshotObservationRefreshState,
      selectedSnapshotObservationNextAction,
      selectedSnapshotObservationReasonCodes,
      selectedSnapshotObservationRetryAfterMs,
      selectedSnapshotRepairDeferred,
      publicationActiveGateHandoffState: activeGateOwnerCohortState,
      publicationActiveGateHandoffReasonCode:
        activeGateOwnerCohortReasonCode,
      publicationActiveGateHandoffNextAction,
      publicationActiveGateHandoffRuntimePromotionAllowed,
      publicationActiveGateHandoffPendingReconcileNodeIds:
        activeGateOwnerCohortPendingReconcileNodeIds,
      publicationActiveGateHandoffPendingReconcileCount:
        activeGateOwnerCohortPendingReconcileCount,
      activeGateOwnerCohortState,
      activeGateOwnerCohortReasonCode,
      activeGateOwnerCohortMissingPublishedNodeIds,
      activeGateOwnerCohortMissingPublishedCount,
      activeGateOwnerCohortPendingRecoveryNodeIds,
      activeGateOwnerCohortPendingRecoveryCount,
      activeGateOwnerCohortPendingReconcileNodeIds,
      activeGateOwnerCohortPendingReconcileCount,
      membershipPublicationHandoffOutcomeState,
      membershipPublicationHandoffOutcomeReasonCode,
      membershipPublicationHandoffOutcomeEnqueued,
      membershipPublicationHandoffOutcomeRetryAfterMs,
    },
    publicationConvergence,
    publicationConvergenceGate,
    readinessMode,
  });
  const closureRecordId =
    (typeof publicationConvergenceGate?.closureRecordId === 'string' &&
    publicationConvergenceGate.closureRecordId.length > ZERO ?
      publicationConvergenceGate.closureRecordId :
      null) ||
    (typeof publicationConvergence?.closureRecordId === 'string' &&
    publicationConvergence.closureRecordId.length > ZERO ?
      publicationConvergence.closureRecordId :
      null) ||
    closureWitness?.closureRecordId ||
    null;
  const closureWitnessClass =
    (typeof publicationConvergenceGate?.closureWitnessClass === 'string' &&
    publicationConvergenceGate.closureWitnessClass.length > ZERO ?
      publicationConvergenceGate.closureWitnessClass :
      null) ||
    (typeof publicationConvergence?.closureWitnessClass === 'string' &&
    publicationConvergence.closureWitnessClass.length > ZERO ?
      publicationConvergence.closureWitnessClass :
      null) ||
    closureWitness?.closureWitnessClass ||
    null;

  return {
    expectedNodeCount: normalizedExpectedNodeCount,
    activeNodeCount,
    inactiveNodeCount,
    snapshotCoverageNodeCount,
    snapshotCoverageComplete,
    publicationStatus,
    publicationStatusRank:
      resolveActiveWaitPublicationStatusRank(publicationStatus),
    publicationEpoch,
    recoveryProtocolState,
    selectedSnapshotNodeId,
    selectedSnapshotTimeoutMs,
    selectedSnapshotAdminReady,
    selectedSnapshotReachableBy,
    selectedSnapshotError,
    selectedSnapshotReachabilityError,
    selectedSnapshotObservationMode,
    selectedSnapshotObservationState,
    selectedSnapshotObservationContractState,
    selectedSnapshotObservationRefreshState,
    selectedSnapshotObservationNextAction,
    selectedSnapshotObservationReasonCodes,
    selectedSnapshotObservationRetryAfterMs,
    selectedSnapshotRepairDeferred,
    selectedControlPlaneOwnerQueueDepth,
    selectedObservedControlPlaneOwnerQueueDepth,
    selectedLoggingRetentionQueueDepth,
    selectedQueueDiagnosticsSourceState,
    selectedCdcReplayLag,
    publicationActiveGateHandoffState: activeGateOwnerCohortState,
    publicationActiveGateHandoffReasonCode: activeGateOwnerCohortReasonCode,
    publicationActiveGateHandoffNextAction,
    publicationActiveGateHandoffRuntimePromotionAllowed,
    publicationActiveGateHandoffPendingReconcileNodeIds:
      activeGateOwnerCohortPendingReconcileNodeIds,
    publicationActiveGateHandoffPendingReconcileCount:
      activeGateOwnerCohortPendingReconcileCount,
    activeGateOwnerCohortState,
    activeGateOwnerCohortReasonCode,
    activeGateOwnerCohortMissingPublishedNodeIds,
    activeGateOwnerCohortMissingPublishedCount,
    activeGateOwnerCohortPendingRecoveryNodeIds,
    activeGateOwnerCohortPendingRecoveryCount,
    activeGateOwnerCohortPendingReconcileNodeIds,
    activeGateOwnerCohortPendingReconcileCount,
    membershipPublicationHandoffOutcomeState,
    membershipPublicationHandoffOutcomeReasonCode,
    membershipPublicationHandoffOutcomeEnqueued,
    membershipPublicationHandoffOutcomeRetryAfterMs,
    perNodePublicationDisagreementSet,
    selectedPublishedActiveNodeIds,
    selectedPublishedActiveCount: selectedPublishedActiveNodeIds.length,
    selectedMissingPublishedNodeIds,
    pendingAckCount: pendingAckNodeIds.length,
    missingPublishedCount: normalizedMissingPublishedCount,
    gateReasonCount: gateReasons.length,
    gateReasons,
    prioritySpreadSatisfied,
    prioritySpreadGap,
    priorityBlockedPartitionCount,
    priorityRecoveryProgressClasses,
    priorityRecoveryUnresolvedClassCount,
    priorityRecoveryUnresolvedSemanticStateCount,
    priorityRecoveryBlockedPartitionCount,
    closureRecordId,
    closureWitnessClass,
    readinessDelay: classifyActiveGateReadinessDelay({
      readinessMode,
      selectedSnapshotError,
      selectedSnapshotReachabilityError,
    }),
    blockers,
    blockerSignature: blockers.join(ACTIVE_WAIT_BLOCKER_SIGNATURE_SEPARATOR),
  };
}

export const CLUSTER_ACTIVE_WAIT_PROGRESS_LAYER = {
  ...CLUSTER_BASE_LAYER,
  resolveMeaningfulProbeTimeoutMs,
  withTimeout,
  formatCountSummary,
  formatNodeDiagnostics,
  formatSnapshotCoverage,
  evaluateLoadPublishedConvergence,
  evaluatePriorityRecoveryCrossServiceInvariants,
  formatPublicationConvergenceGate,
  normalizeActiveWaitPublicationStatus,
  resolveActiveWaitPublicationStatusRank,
  buildActiveWaitProgressSnapshot,
  normalizePriorityRecoverySemanticStateId,
  summarizePriorityRecoveryProgressClasses,
};
