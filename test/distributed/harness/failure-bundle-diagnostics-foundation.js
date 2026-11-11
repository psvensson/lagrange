import {
  RECOVERY_PROTOCOL_STATE,
} from '../../../src/control-plane/membership-lifecycle-constants.js';
import {
  buildCanonicalControlPlaneDiagnosticsFromControlPlane,
  buildCanonicalPublicationEvidenceFromControlPlane,
} from './publication-evidence-contract.js';
import {
  FIRST_FAULT_MARKER_ATTEMPT_ERRORS,
  FIRST_FAULT_MARKER_HARD_FAILURE,
  FIRST_FAULT_MARKER_QUEUE_PRESSURE,
  NODE_DIAGNOSTICS_TRACE_LIMIT,
  ROOT_CAUSE_CLASS_CACHE,
  ROOT_CAUSE_CLASS_CDC,
  ROOT_CAUSE_CLASS_DISCOVERY,
  ROOT_CAUSE_CLASS_TOPOLOGY,
  STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
  resolveRoutingDiagnostics,
} from './failure-bundle-artifact-foundation.js';
import {
  cloneJsonValue,
  mergePriorityRecoveryInvariants,
  normalizePriorityRecoveryInvariants,
} from './failure-bundle-priority-recovery-diagnostics-summary.js';
import {
  extractNodeIdsFromText,
  resolveAdminQueryTraceByNodeId,
  resolveControlSnapshot,
} from './failure-bundle-control-plane-diagnostics.js';
import {
  mergeByNodeIdMaps,
} from './failure-bundle-scenario-log-artifacts.js';
import {
  mergePriorityRecoveryDecisionSnapshots,
  normalizePriorityRecoveryDecisionSnapshots,
} from './failure-bundle-priority-recovery-decision-snapshots.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../../src/control-plane/control-plane-readiness-constants.js';
import {
  EDGE_ID,
  REASON,
} from '../../../src/diagnostics/topology-convergence-constants.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  buildTopologyConvergenceGraphFromArtifacts,
} from '../../../src/diagnostics/topology-convergence-graph.js';
import {
  buildTopologyConvergenceOwnerPresentation,
} from '../../../src/diagnostics/topology-convergence-owner-witness.js';
import {
  buildPriorityRecoveryProgressSummary,
  normalizePriorityRecoveryPartitionWitnessesForDiagnostics,
} from './priority-recovery-summary-normalization.js';
import {
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT,
  LEGACY_PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_STALE_PUBLICATION,
  classifyActiveGateClosureWitness,
} from './active-gate-closure-classification.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
} from '../../../src/control-plane/publication-owner-constants.js';
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from '../../../src/control-plane/publication-recovery-gate.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from '../../../src/control-plane/publication-recovery-gate-constants.js';
import {
  normalizePriorityRecoveryActiveGateSnapshot,
} from './active-gate-contract.js';
import {
  ZERO,
  UNKNOWN_VALUE,
  ROOT_CAUSE_CLASS_UNKNOWN,
  ROOT_CAUSE_CLASS_STARTUP,
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  FAILURE_CLASS_UNKNOWN,
  STABILITY_GATE_STATUS_OPEN,
  STABILITY_GATE_STATUS_CLOSED,
  STABILITY_GATE_STATUS_NOT_APPLICABLE,
  STABILITY_GATE_STATUS_UNKNOWN,
  STABILITY_GATE_TYPE_FAILOVER,
  STABILITY_GATE_TYPE_CONVERGENCE,
  STABILITY_GATE_TYPE_RESTART_RECOVERY,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  resolveFailureDiagnostics,
  addNormalizedReasonCount,
  isRecord,
  normalizeNonNegativeCount,
  buildTopReasonCounts,
  buildDominantReason,
  mergeReasonCounts,
  normalizeDistinctStringArray,
} from './failure-bundle-artifact-foundation.js';
import {
  buildPriorityRecoveryProgressDominantReason,
  deriveReasonCountsFromPublicationConvergence,
  normalizeActiveGateReadinessDelay,
  hasBlockingReadinessFailure,
} from './failure-bundle-publication-reason-counts.js';

import {
  deriveReasonCountsFromLoadMetrics,
  deriveReasonCountsFromReadiness,
  resolveRootCauseClass,
  normalizeAffectedNodeIds,
} from './failure-bundle-playback-classification.js';

import {
  resolveLoadMetrics,
  resolveRelevantNodeIds,
} from './failure-bundle-control-plane-diagnostics.js';

import {
  CONTROL_PLANE_QUIESCENCE_REASON,
  CONTROL_PLANE_QUIESCENCE_STATE,
} from '../../../src/diagnostics/control-plane-quiescence-snapshot.js';

import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';

import {
  EDGE_STATE,
} from '../../../src/diagnostics/topology-convergence-graph.js';

export {
  ZERO,
  UNKNOWN_VALUE,
  ROOT_CAUSE_CLASS_UNKNOWN,
  LOAD_WAIT_REASON_NODE_SLOT_UNAVAILABLE,
  FAILURE_CLASS_UNKNOWN,
  STABILITY_GATE_STATUS_OPEN,
  STABILITY_GATE_STATUS_CLOSED,
  STABILITY_GATE_STATUS_NOT_APPLICABLE,
  STABILITY_GATE_STATUS_UNKNOWN,
  STABILITY_GATE_TYPE_FAILOVER,
  STABILITY_GATE_TYPE_CONVERGENCE,
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
  STABILITY_GATE_BLOCKER_BLOCKED_NODES,
  STABILITY_GATE_BLOCKER_CLOSURE_RECORD,
  STABILITY_GATE_BLOCKER_STARTUP_READINESS,
  resolveFailureDiagnostics,
  addNormalizedReasonCount,
  buildPriorityRecoveryProgressDominantReason,
  deriveReasonCountsFromPublicationConvergence,
  isRecord,
  normalizeActiveGateReadinessDelay,
  hasBlockingReadinessFailure,
  normalizeNonNegativeCount,
  buildTopReasonCounts,
  buildDominantReason,
  mergeReasonCounts,
  normalizeDistinctStringArray,
  deriveReasonCountsFromLoadMetrics,
  deriveReasonCountsFromReadiness,
  resolveRootCauseClass,
  normalizeAffectedNodeIds,
  resolveLoadMetrics,
  resolveRelevantNodeIds,
};

export const PRIORITY_RECOVERY_WORKFLOW_PROGRESS_ACTUATION_STATES = Object.freeze([
  PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
  PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
]);
export const EMPTY_STRING = '';
export const ONE = 1;
export const JS_OBJECT_TYPE = 'object';
export const PRIORITY_RECOVERY_WITNESS_FRESHNESS_KEY_SEPARATOR = '|';
export const LOAD_WAIT_REASON_ATTEMPT_ERRORS = 'attemptErrors';
export const LOAD_WAIT_REASON_HARD_LOAD_FAILURES = 'hardLoadFailures';
export const READINESS_DIMENSION_REPAIR_ELIGIBLE = 'repairEligible';
export const READINESS_DIMENSION_CONTROL_PLANE_RECOVERY_ELIGIBLE =
  'controlPlaneRecoveryEligible';
export const READINESS_REASON_CONTROL_PLANE_WRITE_UNHEALTHY =
  'control_plane_write_unhealthy';
export const READINESS_REASON_CONTROL_PLANE_PUBLICATION_PENDING =
  'control_plane_publication_pending';
export const READINESS_REASON_PUBLISHED_CONVERGENCE_PENDING =
  'publishedConvergencePending';
export const READINESS_REASON_RECOVERY_ELIGIBILITY_PENDING =
  'recovery_eligibility_pending';
export const FINAL_CONSISTENCY_LEADER_MISMATCH_MESSAGE_PREFIX =
  'Leader identities disagree';
export const FINAL_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE =
  'leader_identities_disagree';
const FINAL_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG =
  'observer_snapshot_revision_lag';
const FINAL_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
const FINAL_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED =
  'partition_leader_authority_diverged';
const FINAL_CONSISTENCY_REASON_CDC_VISIBILITY_LAG =
  'cdc_visibility_lag';
const FINAL_CONSISTENCY_REASON_TRANSPORT_DELIVERY_DEFERRED =
  'transport_delivery_deferred';
export const FINAL_CONSISTENCY_REASON_UNCLASSIFIED =
  'final_consistency_unclassified';
const FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH =
  'leader_map_mismatch';
const FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG =
  'observer_revision_lag';
const FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
const FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED = 'authority_diverged';
const FINAL_CONSISTENCY_STATE_CDC_VISIBILITY_LAG =
  'cdc_visibility_lag';
const FINAL_CONSISTENCY_STATE_TRANSPORT_DELIVERY_DEFERRED =
  'transport_delivery_deferred';
export const FINAL_CONSISTENCY_CACHE_REASON_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG,
  FINAL_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG,
]));
export const FINAL_CONSISTENCY_CACHE_STATE_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG,
  FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
]));
export const FINAL_CONSISTENCY_CDC_REASON_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_REASON_CDC_VISIBILITY_LAG,
  FINAL_CONSISTENCY_REASON_TRANSPORT_DELIVERY_DEFERRED,
]));
export const FINAL_CONSISTENCY_CDC_STATE_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_STATE_CDC_VISIBILITY_LAG,
  FINAL_CONSISTENCY_STATE_TRANSPORT_DELIVERY_DEFERRED,
]));
export const FINAL_CONSISTENCY_TOPOLOGY_REASON_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE,
  FINAL_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED,
]));
export const FINAL_CONSISTENCY_TOPOLOGY_STATE_SET = Object.freeze(new Set([
  FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH,
  FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED,
]));
export const FAILURE_ARTIFACT_ACTIVE_GATE_READY_BLOCKER = 'ready';
export const FAILURE_ARTIFACT_PUBLICATION_GATE_BLOCKER_PREFIX = 'publication_gate=';
export const FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX =
  STABILITY_GATE_BLOCKER_PUBLICATION_MISSING_ACTIVE_NODE + '=';
export const FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_BLOCKER_PREFIX =
  'snapshot_coverage=';
export const FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_SEPARATOR = '/';
export const PUBLICATION_MISSING_PUBLISHED_ACTIVE_GATE_SELECTION_STATE =
  Object.freeze({
    ABSENT: 'absent',
    CURRENT: 'current',
  });
export const PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE = Object.freeze({
  SUPPRESSED_DURING_PRIORITY_ACTUATION:
    'suppressed_during_priority_actuation',
  SUPPRESSED_STALE_CLOSURE_DURING_COVERAGE_LAG:
    'suppressed_stale_closure_during_coverage_lag',
  CANONICAL_DURING_COVERAGE_LAG: 'canonical_during_coverage_lag',
  CURRENT_ACTIVE_GATE_SELECTED: 'current_active_gate_selected',
  MERGED_CURRENT_EVIDENCE: 'merged_current_evidence',
});
export const PUBLICATION_MISSING_PUBLISHED_EVIDENCE_RULES = Object.freeze([
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
        .SUPPRESSED_DURING_PRIORITY_ACTUATION,
    matches: (evidence) =>
      evidence.activeGateSnapshotCoveragePending === true &&
      evidence.activeGatePriorityRecoveryActuationEvidenceOpen === true &&
      evidence.hasExplicitPriorityRecoveryObservation === true &&
      evidence.hasCoverageCanonicalMissingActiveNodeGateDebt !== true &&
      evidence.hasCanonicalMissingPublishedPublicationDebt !== true,
    select: () => Object.freeze({
      nodeIds: [],
      count: ZERO,
    }),
  }),
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
        .SUPPRESSED_STALE_CLOSURE_DURING_COVERAGE_LAG,
    matches: (evidence) =>
      evidence.activeGateSnapshotCoveragePending === true &&
      evidence.stalePublicationClosureEvidence === true &&
      evidence.rawCoverageCanonicalEvidenceAvailable === true &&
      evidence.hasCoverageCanonicalMissingActiveNodeGateDebt !== true,
    select: () => Object.freeze({
      nodeIds: [],
      count: ZERO,
    }),
  }),
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
        .CANONICAL_DURING_COVERAGE_LAG,
    matches: (evidence) =>
      evidence.activeGateSnapshotCoveragePending === true,
    select: (evidence) => Object.freeze({
      nodeIds: evidence.coverageCanonicalNodeIds,
      count: evidence.coverageCanonicalCount,
    }),
  }),
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE
        .CURRENT_ACTIVE_GATE_SELECTED,
    matches: (evidence) =>
      evidence.activeGateSelectedEvidence.state ===
        PUBLICATION_MISSING_PUBLISHED_ACTIVE_GATE_SELECTION_STATE.CURRENT,
    select: (evidence) => Object.freeze({
      nodeIds: evidence.activeGateSelectedEvidence.nodeIds,
      count: evidence.activeGateSelectedEvidence.nodeIds.length,
    }),
  }),
  Object.freeze({
    state:
      PUBLICATION_MISSING_PUBLISHED_EVIDENCE_STATE.MERGED_CURRENT_EVIDENCE,
    matches: () => true,
    select: (evidence) => Object.freeze({
      nodeIds: evidence.mergedNodeIds,
      count: evidence.mergedCount,
    }),
  }),
]);
export const FAILURE_ARTIFACT_OWNER_CONTRACT_ACTIONABLE_STATES = Object.freeze(
  new Set([
    EDGE_STATE.BLOCKED,
    EDGE_STATE.DEFERRED,
    EDGE_STATE.RETRYABLE,
    EDGE_STATE.TERMINAL_FAILED,
  ]),
);
export const FAILURE_ARTIFACT_OWNER_CONTRACT_EMPTY_SUMMARY = Object.freeze({});
export const FAILURE_ARTIFACT_STALE_PUBLICATION_REASON_SET = Object.freeze(new Set([
  'control_plane_publication_pending',
  'publishedConvergencePending',
  'recovery_eligibility_pending',
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  'publication_epoch_pending',
  'publication_pending_ack',
  'priority_partitions_not_spread',
  'closure_witness_publication_converged_priority_spread_pending',
  'priority_recovery_progress_class',
  STABILITY_GATE_BLOCKER_PUBLICATION_PENDING,
  STABILITY_GATE_BLOCKER_PRIORITY_SPREAD_PENDING,
  STABILITY_GATE_BLOCKER_PENDING_ACKS_PRESENT,
]));
export const FAILURE_BARRIER_PHASE_CONVERGENCE = 'convergence';
export const FAILURE_BARRIER_PHASE_RESTART_RECOVERY =
  STABILITY_GATE_TYPE_RESTART_RECOVERY;
export const FAILURE_BARRIER_REASON_CONVERGENCE_TIMEOUT = 'convergence_timeout';
export const FAILURE_BARRIER_REASON_RESTART_RECOVERY_TIMEOUT =
  'restart_recovery_timeout';
export const FAILURE_BARRIER_ERROR_PREFIX_CONVERGENCE_TIMEOUT =
  'Convergence timeout after ';
export const FAILURE_BARRIER_ERROR_PREFIX_RESTART_RECOVERY_TIMEOUT =
  'Restarted node did not become recovery-ready within ';
export const FAILURE_BARRIER_REASON_COUNT = 1;
export const FAILURE_BARRIER_SUPERSEDED_ROOT_CAUSE_CLASS_SET =
  Object.freeze(new Set([
    ROOT_CAUSE_CLASS_STARTUP,
    ROOT_CAUSE_CLASS_UNKNOWN,
  ]));
export const FAILURE_BARRIER_SUPERSEDED_REASON_FRAGMENT_SET = Object.freeze([
  'readiness',
  'snapshot_reachability',
]);
export const PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
  'priority_partitions_not_spread';

export function orderPublicationConvergenceReasons(reasons) {
  const prioritySpreadReasons = [];
  const missingActiveNodeReasons = [];
  const snapshotCoverageReasons = [];
  const otherReasons = [];
  for (const reason of normalizeDistinctStringArray(reasons)) {
    if (reason === PRIORITY_RECOVERY_REASON_PRIORITY_PARTITIONS_NOT_SPREAD) {
      prioritySpreadReasons.push(reason);
    } else if (
      reason.startsWith(
        FAILURE_ARTIFACT_PUBLICATION_MISSING_ACTIVE_NODE_REASON_PREFIX,
      )
    ) {
      missingActiveNodeReasons.push(reason);
    } else if (
      reason.startsWith(FAILURE_ARTIFACT_SNAPSHOT_COVERAGE_BLOCKER_PREFIX)
    ) {
      snapshotCoverageReasons.push(reason);
    } else {
      otherReasons.push(reason);
    }
  }
  return [
    ...prioritySpreadReasons,
    ...missingActiveNodeReasons,
    ...snapshotCoverageReasons,
    ...otherReasons,
  ];
}

export function normalizePriorityPartitionSummary(summary) {
  if (!isRecord(summary)) {
    return null;
  }
  const blockedPartitions = Array.isArray(summary.blockedPartitions) ?
    summary.blockedPartitions :
    [];
  const spreadGaps = blockedPartitions
    .map((partition) => normalizeNonNegativeCount(partition?.spreadGap))
    .filter((spreadGap) => spreadGap > ZERO);
  const blockedPartitionCount =
    Number.isFinite(Number(summary.blockedPartitionCount)) ?
      normalizeNonNegativeCount(summary.blockedPartitionCount) :
      blockedPartitions.length;
  return {
    ...summary,
    blockedPartitionCount,
    largestSpreadGap:
      Number.isFinite(Number(summary.largestSpreadGap)) ?
        normalizeNonNegativeCount(summary.largestSpreadGap) :
        Math.max(ZERO, ...spreadGaps),
    totalSpreadGap:
      Number.isFinite(Number(summary.totalSpreadGap)) ?
        normalizeNonNegativeCount(summary.totalSpreadGap) :
        spreadGaps.reduce((total, spreadGap) => total + spreadGap, ZERO),
  };
}

export const RESTART_RECOVERY_READINESS_FIELD_SEPARATOR = ', ';
export const RESTART_RECOVERY_READINESS_FIELD_VALUE_SEPARATOR = '=';
export const RESTART_RECOVERY_READINESS_NODE_MARKER = ' for node ';
export const RESTART_RECOVERY_READINESS_OBSERVATION_START_MARKER = ' (';
export const RESTART_RECOVERY_READINESS_OBSERVATION_END_MARKER = ')';
export const RESTART_RECOVERY_READINESS_BOOLEAN_TRUE = 'true';
export const RESTART_RECOVERY_READINESS_BOOLEAN_FALSE = 'false';
export const RESTART_RECOVERY_READINESS_NO_VALUE = 'none';
export const RESTART_RECOVERY_READINESS_UNKNOWN_VALUE = 'unknown';
export const RESTART_RECOVERY_READINESS_ADMIN_REFUSED_FRAGMENT = 'econnrefused';
export const RESTART_RECOVERY_READINESS_REACHABLE_BY_BOOTSTRAP_HEALTH =
  'bootstrap_health';
const RESTART_RECOVERY_READINESS_FIELD_STARTUP_PHASE = 'startupPhase';
const RESTART_RECOVERY_READINESS_FIELD_SEED_CONTACT_OUTCOME =
  'seedContactOutcome';
const RESTART_RECOVERY_READINESS_FIELD_SEED_CONTACT_ATTEMPT =
  'seedContactAttempt';
const RESTART_RECOVERY_READINESS_FIELD_SEED_CONTACT_REMAINING_BUDGET_MS =
  'seedContactRemainingBudgetMs';
const RESTART_RECOVERY_READINESS_FIELD_SEED_CONTACT_AUTHORITY_SOURCE =
  'seedContactAuthoritySource';
export const RESTART_RECOVERY_READINESS_FIELD = Object.freeze({
  REACHABLE: 'reachable',
  READY: 'ready',
  ADMIN_READY: 'adminReady',
  CONTROL_PLANE_RECOVERY_READY: 'controlPlaneRecoveryReady',
  PUBLISHED_CONTROL_PLANE_EPOCH: 'publishedControlPlaneEpoch',
  EXPECTED_PUBLICATION_EPOCH: 'expectedPublicationEpoch',
  READINESS_PHASE: 'readinessPhase',
  READINESS_STAGE: 'readinessStage',
  READINESS_STAGE_RANK: 'readinessStageRank',
  READINESS_REASONS: 'readinessReasons',
  RECOVERY_STAGE: 'recoveryStage',
  BOOTSTRAP_JOIN_PROJECTION_BLOCKER: 'bootstrapJoinProjectionBlocker',
  BOOTSTRAP_JOIN_PROJECTION_RULE: 'bootstrapJoinProjectionRule',
  STARTUP_PHASE: RESTART_RECOVERY_READINESS_FIELD_STARTUP_PHASE,
  SEED_CONTACT_OUTCOME:
    RESTART_RECOVERY_READINESS_FIELD_SEED_CONTACT_OUTCOME,
  SEED_CONTACT_ATTEMPT:
    RESTART_RECOVERY_READINESS_FIELD_SEED_CONTACT_ATTEMPT,
  SEED_CONTACT_REMAINING_BUDGET_MS:
    RESTART_RECOVERY_READINESS_FIELD_SEED_CONTACT_REMAINING_BUDGET_MS,
  SEED_CONTACT_AUTHORITY_SOURCE:
    RESTART_RECOVERY_READINESS_FIELD_SEED_CONTACT_AUTHORITY_SOURCE,
  STARTUP_BRANCH: 'startupBranch',
  INFRASTRUCTURE_JOIN_COMPLETE: 'infrastructureJoinComplete',
  JOIN_PHASE: 'joinPhase',
  JOIN_LIFECYCLE_STATE: 'joinLifecycleState',
  JOIN_CHECKPOINT_TARGET: 'joinCheckpointTarget',
  JOIN_READY_SIGNAL_GATE: 'joinReadySignalGate',
  JOIN_READY_SIGNAL_ATTEMPT: 'joinReadySignalAttempt',
  JOIN_READY_SIGNAL_LAST_FAILURE_CODE: 'joinReadySignalLastFailureCode',
  CANONICAL_AUTHORITY_CONSUMED: 'canonicalAuthorityConsumed',
  CANONICAL_AUTHORITY_STATE: 'canonicalAuthorityState',
  CANONICAL_AUTHORITY_SOURCE: 'canonicalAuthoritySource',
  TRANSACTION_RECOVERY_STATE: 'transactionRecoveryState',
  TRANSACTION_RECOVERY_READY: 'transactionRecoveryReady',
  TRANSACTION_RECOVERY_OUTCOME_KIND: 'transactionRecoveryOutcomeKind',
  TRANSACTION_RECOVERY_OUTCOME_ERROR_CODE:
    'transactionRecoveryOutcomeErrorCode',
  TRANSACTION_RECOVERY_OUTCOME_DECISION_DIMENSION:
    'transactionRecoveryOutcomeDecisionDimension',
  TRANSACTION_RECOVERY_OUTCOME_ROUTE_SOURCE:
    'transactionRecoveryOutcomeRouteSource',
  REACHABLE_BY: 'reachableBy',
  LAST_ERROR: 'lastError',
});
export const CONTROL_PLANE_QUIESCENCE_DISCOVERY_REASON_SET = Object.freeze(new Set([
  CONTROL_PLANE_QUIESCENCE_REASON.CONTROL_PLANE_PRESSURE,
  CONTROL_PLANE_QUIESCENCE_REASON.SNAPSHOT_QUERY_ERROR,
  CONTROL_PLANE_QUIESCENCE_REASON.DISCOVERY_REPAIR_TIMEOUT,
  CONTROL_PLANE_QUIESCENCE_REASON.NODE_STATE_PUBLICATION_PRESSURE,
  CONTROL_PLANE_QUIESCENCE_STATE.OBSERVATION_UNAVAILABLE,
  CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
]));
export const CONTROL_PLANE_QUIESCENCE_TOPOLOGY_REASON_SET = Object.freeze(new Set([
  CONTROL_PLANE_QUIESCENCE_REASON.OPERATION_DRAIN_STALLED,
  CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
  CONTROL_PLANE_QUIESCENCE_REASON.LEADERSHIP_UNSTABLE,
  CONTROL_PLANE_QUIESCENCE_REASON.CRITICAL_SYSTEM_SPREAD_OPEN,
  CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING,
  CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_STALLED,
  CONTROL_PLANE_QUIESCENCE_STATE.LEADERSHIP_CHURN,
  CONTROL_PLANE_QUIESCENCE_STATE.CRITICAL_SPREAD_OPEN,
  CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
]));

export function resolvePendingRequiredAckNodeIds(pendingAckSource = null) {
  if (Array.isArray(pendingAckSource?.pendingRequiredAckNodeIds)) {
    return normalizeDistinctStringArray(
      pendingAckSource.pendingRequiredAckNodeIds,
    );
  }
  if (
    Array.isArray(pendingAckSource?.requiredAckNodeIds) &&
    Array.isArray(pendingAckSource?.acknowledgedNodeIds)
  ) {
    const acknowledgedNodeIdSet = new Set(
      normalizeDistinctStringArray(pendingAckSource.acknowledgedNodeIds),
    );
    const requiredAckNodeIds = normalizeDistinctStringArray(
      pendingAckSource.requiredAckNodeIds,
    );
    return requiredAckNodeIds.filter((nodeId) => !acknowledgedNodeIdSet.has(nodeId));
  }
  return null;
}

export function hasCurrentActiveGatePendingAckClosure(progress = null) {
  if (!isRecord(progress)) {
    return false;
  }
  const pendingAckNodeIds = Array.isArray(progress.pendingAckNodeIds) ?
    normalizeDistinctStringArray(progress.pendingAckNodeIds) :
    null;
  const pendingRequiredAckNodeIds = resolvePendingRequiredAckNodeIds(progress);
  const closureEvidence = Object.freeze({
    countClosed: normalizeNonNegativeCount(progress.pendingAckCount) === ZERO,
    nodeListClosed:
      pendingAckNodeIds !== null && pendingAckNodeIds.length === ZERO,
    requiredAckListClosed:
      pendingRequiredAckNodeIds !== null &&
      pendingRequiredAckNodeIds.length === ZERO,
    countOnlyClosed:
      pendingAckNodeIds === null && pendingRequiredAckNodeIds === null,
  });
  return (
    closureEvidence.countClosed === true &&
    (
      closureEvidence.nodeListClosed === true ||
      closureEvidence.requiredAckListClosed === true ||
      closureEvidence.countOnlyClosed === true
    )
  );
}

export function hasNewerBestProgressPendingAckClosure({
  activeGateProgress = null,
  bestProgressSnapshot = null,
} = {}) {
  if (
    !isRecord(activeGateProgress) ||
    !isRecord(bestProgressSnapshot) ||
    hasCurrentActiveGatePendingAckClosure(bestProgressSnapshot) !== true
  ) {
    return false;
  }
  return normalizeNonNegativeCount(bestProgressSnapshot.publicationEpoch) >
    normalizeNonNegativeCount(activeGateProgress.publicationEpoch);
}

export function selectActiveGateForPublicationConvergence({
  canonicalActiveGate = null,
  rawActiveGate = null,
} = {}) {
  const activeGateProgress =
    canonicalActiveGate?.progress ||
    rawActiveGate?.progress ||
    null;
  if (
    hasNewerBestProgressPendingAckClosure({
      activeGateProgress,
      bestProgressSnapshot: rawActiveGate?.bestProgress || null,
    }) === true
  ) {
    return rawActiveGate;
  }
  return canonicalActiveGate || rawActiveGate || null;
}

export {
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_PUBLICATION_LAG,
  ACTIVE_GATE_CLOSURE_WITNESS_CLASS_STARTUP_SNAPSHOT_TIMEOUT,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_STATUS,
  EDGE_ID,
  FIRST_FAULT_MARKER_ATTEMPT_ERRORS,
  FIRST_FAULT_MARKER_HARD_FAILURE,
  FIRST_FAULT_MARKER_QUEUE_PRESSURE,
  LEGACY_PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_STALE_PUBLICATION,
  NODE_DIAGNOSTICS_TRACE_LIMIT,
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PUBLICATION_OWNER_ACK_STATE,
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_STREAM_OUTCOME,
  PUBLICATION_OWNER_TEXT,
  PUBLICATION_RECOVERY_GATE_STATE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  REASON,
  RECOVERY_PROTOCOL_STATE,
  ROOT_CAUSE_CLASS_CACHE,
  ROOT_CAUSE_CLASS_CDC,
  ROOT_CAUSE_CLASS_DISCOVERY,
  ROOT_CAUSE_CLASS_STARTUP,
  ROOT_CAUSE_CLASS_TOPOLOGY,
  STABILITY_GATE_BLOCKER_ADMIN_REACHABILITY_REFUSED,
  buildCanonicalControlPlaneDiagnosticsFromControlPlane,
  buildCanonicalPublicationEvidenceFromControlPlane,
  buildPriorityRecoveryProgressSummary,
  buildPublicationRecoveryGateSnapshot,
  buildTopologyConvergenceGraphFromArtifacts,
  buildTopologyConvergenceOwnerPresentation,
  classifyActiveGateClosureWitness,
  cloneJsonValue,
  extractNodeIdsFromText,
  mergeByNodeIdMaps,
  mergePriorityRecoveryDecisionSnapshots,
  mergePriorityRecoveryInvariants,
  normalizePriorityRecoveryActiveGateSnapshot,
  normalizePriorityRecoveryDecisionSnapshots,
  normalizePriorityRecoveryInvariants,
  normalizePriorityRecoveryPartitionWitnessesForDiagnostics,
  resolveAdminQueryTraceByNodeId,
  resolveControlSnapshot,
  resolveRoutingDiagnostics,
};
