import {buildPublicationRecoveryGateSnapshot} from '../../../src/control-plane/publication-recovery-gate.js';
import {
  CONTROL_PLANE_SNAPSHOT_REVISION_STATE,
} from '../../../src/control-plane/control-plane-snapshot-revision.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../../src/control-plane/control-plane-readiness-constants.js';
import {
  RECOVERY_PROTOCOL_STATE,
} from '../../../src/control-plane/membership-lifecycle-constants.js';
import {
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
} from '../../../src/admin/admin-constants.js';
import {ASSERTIONS_SEGMENT_2} from './assertions-segment-2.js';
const {
  TIMEOUTS,
  SERVICES_QUERY,
  NODES_QUERY,
  PARTITIONS_QUERY,
  CONTROL_SNAPSHOT_REQUIRED_ERROR_PREFIX,
  CONVERGENCE_REACHABILITY_TIMEOUT_MS,
  CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS,
  ADMIN_SOCKET_LANE_DEFAULT,
  ADMIN_SOCKET_LANE_SNAPSHOT,
  RAFT_ROLE_LEARNER,
  REACHABILITY_SUMMARY_SEPARATOR,
  REACHABILITY_SUMMARY_SOURCE_UNKNOWN,
  REACHABILITY_SUMMARY_ERROR_NONE,
  STATUS_LEADER,
  STATUS_UNKNOWN,
  VALUE_UNKNOWN,
  VALUE_NONE,
  VALUE_UNAVAILABLE,
  REPLICA_MEMBERSHIP_SEPARATOR,
  REPLICA_MEMBER_SEPARATOR,
  MEMBER_SNIPPET_PREFIX,
  MEMBER_SNIPPET_SUFFIX,
  MEMBER_REPLICA_PREFIX,
  MEMBER_LEADER_PREFIX,
  MEMBER_VOTER_PREFIX,
  MEMBER_VOTER_SEPARATOR,
  SNIPPET_EXTRA_PREFIX,
  SNIPPET_EXTRA_SUFFIX,
  PARTITION_MEMBERSHIP_SNIPPET_LIMIT,
  PARTITION_REPLICA_SNIPPET_LIMIT,
  OPERATION_HISTORY_LIMIT,
  OPERATION_HISTORY_SNIPPET_LIMIT,
  OPERATION_HISTORY_SEPARATOR,
  OPERATION_HISTORY_AT_PREFIX,
  OPERATION_FIELD_CANDIDATE_IDS,
  OPERATION_FIELD_CANDIDATE_PARTITION_IDS,
  OPERATION_FIELD_CANDIDATE_TYPES,
  OPERATION_FIELD_CANDIDATE_STATUSES,
  OPERATION_FIELD_CANDIDATE_FROM_NODE_IDS,
  OPERATION_FIELD_CANDIDATE_TO_NODE_IDS,
  OPERATION_FIELD_CANDIDATE_TIMESTAMPS,
  CONTROL_SNAPSHOT_FIELD_NODES,
  CONTROL_SNAPSHOT_FIELD_PUBLISHED_NODES,
  CONTROL_SNAPSHOT_FIELD_PROJECTED_NODES,
  CONTROL_SNAPSHOT_FIELD_PARTITIONS,
  CONTROL_SNAPSHOT_FIELD_LEADERS,
  CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY,
  CONTROL_SNAPSHOT_FIELD_VOTER_COUNTS,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_STATE,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_EXPECTED_MINIMUM_REVISION,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_GAP,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_RESUME_TOKEN,
  CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS,
  CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT,
  CONTROL_SNAPSHOT_FIELD_STATUS_HISTOGRAM,
  CONTROL_SNAPSHOT_FIELD_ROWS,
  CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP,
  CONTROL_SNAPSHOT_FIELD_REPLICA_ROLE_DIAGNOSTICS,
  CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS,
  REPLICA_ROLE_DIAGNOSTICS_LEADER_NODE_IDS,
  CONTROL_SNAPSHOT_FIELD_REPLICA_ROLES,
  REPLICA_ROLE_LEADER,
  LEADER_ADDRESS_PATH_SEPARATOR,
  UUID_PREFIX_PATTERN,
  normalizeLeaderAddress,
  normalizeLeaders,
  hasConflictingLeaders,
  isTolerableActiveNodeSkew,
  isTolerablePartitionSkew,
  probeNodeReachability,
  summarizeReachabilityReports,
  isVoterReady,
  countVotersPerPartition,
  extractLeaders,
  supplementPartitionIdsFromServiceTopology,
  updateOverTargetState,
  finalizeOverTargetState,
  normalizeStatusCountMap,
  normalizeVoterCountMap,
  extractControlSnapshotPayload,
  extractControlSnapshotNodeIds,
  extractControlSnapshotPublishedNodeIds,
  extractControlSnapshotProjectedNodeIds,
  extractControlSnapshotPartitionIds,
  extractControlSnapshotLeaders,
  extractControlSnapshotPartitionLeaderAuthority,
  extractControlSnapshotVoterCounts,
  extractControlSnapshotInFlightSummary,
  extractControlSnapshotOperationRows,
  extractControlSnapshotPartitionMembership,
  extractControlSnapshotPublicationConvergence,
  extractControlSnapshotControlPlaneDiagnostics,
  extractControlSnapshotRevisionMetadata,
  queryControlSnapshot,
  queryNodeConsistencyStateViaSql,
  queryConvergenceSnapshotViaSql,
  queryNodeConsistencyState,
  isControlSnapshotObservation,
  resolveSnapshotExpectedPartitionIds,
  buildConvergenceSnapshotDebt,
  compareConvergenceSnapshotDebt,
  isConvergedSnapshot,
  queryReachableClusterSnapshot,
  waitForConvergence,
  buildPartitionMembership,
  compareReplicaMembershipEntries,
  formatPartitionMembershipSnippet,
  formatSinglePartitionMembershipSnippet,
  formatReplicaMembershipEntry,
  summarizeReplicaOperations,
  normalizeReplicaOperationRow,
  pickFirstFieldValue,
  parseTimestampMs,
  formatOperationHistorySnippet,
  formatOperationHistoryEntry,
  cloneDiagnostics,
  buildPublicationConvergenceFromState,
} = ASSERTIONS_SEGMENT_2;
const OBSERVATION_SOURCE_CONTROL_SNAPSHOT = 'control_snapshot';
const OBSERVATION_MODE_UNKNOWN = VALUE_UNKNOWN;
const CONSISTENCY_REASON_CODE_ACTIVE_NODES_DISAGREE =
  'active_nodes_disagree';
const CONSISTENCY_REASON_CODE_PARTITION_ASSIGNMENTS_DISAGREE =
  'partition_assignments_disagree';
const CONSISTENCY_REASON_CODE_PUBLISHED_ACTIVE_NODES_DISAGREE =
  'published_active_nodes_disagree';
const CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE =
  'leader_identities_disagree';
const CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REVISION_LAG =
  'observer_snapshot_revision_lag';
const CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED =
  'observer_snapshot_repair_deferred';
const CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE =
  'mixed_observation_mode';
const CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
const CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED =
  'partition_leader_authority_diverged';
const CONSISTENCY_REASON_CODE_PUBLICATION_EPOCHS_DISAGREE =
  'publication_epochs_disagree';
const CONSISTENCY_REASON_CODE_PUBLICATION_RECOVERY_GATE_NOT_READY =
  'publication_recovery_gate_not_ready';
const CONSISTENCY_REASON_CODE_FINAL_CONSISTENCY_MISMATCH =
  'final_consistency_mismatch';
const PUBLICATION_RECOVERY_GATE_STATE_PUBLICATION_PENDING =
  'publication_pending';
const PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING =
  'priority_spread_pending';
const PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE =
  'priority_spread_evidence_unavailable';
const PUBLICATION_RECOVERY_GATE_STATE_READY = 'ready';
const PUBLICATION_RECOVERY_GATE_REASON_SEPARATOR = '|';
const CONSISTENCY_GATE_SUMMARY_PREFIX = '[';
const CONSISTENCY_GATE_SUMMARY_SUFFIX = ']';
const CONSISTENCY_GATE_SUMMARY_SEPARATOR = '; ';
const BOOLEAN_TRUE = 'true';
const BOOLEAN_FALSE = 'false';
const EMPTY_LIST_LENGTH = 0;
const NO_RECOVERY_BLOCKER_COUNT = 0;
const CONSISTENCY_SINGLE_REASON_COUNT = 1;
const CONSISTENCY_FINAL_STATE_LEADER_MAP_MISMATCH = 'leader_map_mismatch';
const CONSISTENCY_FINAL_STATE_OBSERVER_REVISION_LAG = 'observer_revision_lag';
const CONSISTENCY_FINAL_STATE_OBSERVER_REPAIR_DEFERRED =
  'observer_repair_deferred';
const CONSISTENCY_FINAL_STATE_OBSERVATION_MODE_MISMATCH =
  'observation_mode_mismatch';
const CONSISTENCY_FINAL_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
const CONSISTENCY_FINAL_STATE_AUTHORITY_DIVERGED = 'authority_diverged';
const CONSISTENCY_FINAL_STATE_MISMATCH = 'consistency_mismatch';
const CONSISTENCY_FINAL_BOUNDARY = 'final_leader_map_consistency';
const CONSISTENCY_ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
const CONSISTENCY_ROOT_CAUSE_CLASS_CACHE = 'cache';
const CONSISTENCY_REVISION_BARRIER_STATE_READY = 'ready';
const CONSISTENCY_REVISION_BARRIER_STATE_LAGGING = 'lagging';
const CONSISTENCY_REVISION_BARRIER_STATE_UNAVAILABLE = 'unavailable';
const CONSISTENCY_OBSERVATION_COHORT_STATE_CONTROL_SNAPSHOT =
  'control_snapshot';
const CONSISTENCY_OBSERVATION_COHORT_STATE_SQL_FALLBACK = 'sql_fallback';
const CONSISTENCY_OBSERVATION_COHORT_STATE_MIXED_UNAVAILABLE =
  'mixed_unavailable';
const CONSISTENCY_OBSERVATION_COHORT_STATE_INSUFFICIENT =
  'insufficient';
const CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT = 2;
const PARTITION_LEADER_AUTHORITY_FIELD_TOPOLOGY_EPOCH = 'topologyEpoch';
const PARTITION_LEADER_AUTHORITY_FIELD_MEMBERSHIP_EPOCH = 'membershipEpoch';
const PARTITION_LEADER_AUTHORITY_FIELD_SNAPSHOT_REVISION = 'snapshotRevision';
const PRIORITY_RECOVERY_CLOSURE_WITNESS_NOT_PENDING = Object.freeze({
  prioritySpreadPending: false,
});

function isConsistencyRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeConsistencyStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0)
    .sort();
}

function normalizeConsistencyInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function normalizePartitionLeaderAuthority(authority) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    return {};
  }
  const normalized = {};
  for (const [fallbackPartitionId, certificate] of Object.entries(authority)) {
    if (
      !certificate ||
      typeof certificate !== 'object' ||
      Array.isArray(certificate)
    ) {
      continue;
    }
    const partitionId = String(
      certificate.partitionId || fallbackPartitionId || '',
    ).trim();
    const leaderNodeId = normalizeLeaderAddress(
      String(certificate.leaderNodeId || '').trim(),
    );
    if (partitionId.length === 0 || leaderNodeId.length === 0) {
      continue;
    }
    normalized[partitionId] = {
      partitionId,
      leaderNodeId,
      leaderSource:
        typeof certificate.leaderSource === 'string' &&
        certificate.leaderSource.length > 0 ?
          certificate.leaderSource :
          VALUE_UNKNOWN,
      replicaRoleConsistent: certificate.replicaRoleConsistent === true,
      replicaLeaderNodeIds: normalizeConsistencyStringList(
        Array.isArray(certificate.replicaLeaderNodeIds) ?
          certificate.replicaLeaderNodeIds.map(normalizeLeaderAddress) :
          [],
      ),
      ...(Number.isInteger(certificate.schemaVersion) ?
        {schemaVersion: certificate.schemaVersion} :
        {}),
      ...(Number.isInteger(certificate.topologyEpoch) ?
        {topologyEpoch: certificate.topologyEpoch} :
        {}),
      ...(Number.isInteger(certificate.membershipEpoch) ?
        {membershipEpoch: certificate.membershipEpoch} :
        {}),
      ...(Number.isInteger(certificate.snapshotRevision) ?
        {snapshotRevision: certificate.snapshotRevision} :
        {}),
    };
  }
  return sortObjectKeys(normalized);
}

function normalizeConsistencyNodeIdList(values) {
  if (!Array.isArray(values)) {
    return null;
  }
  return normalizeConsistencyStringList(values);
}

function hasCanonicalPublicationRecoveryGateEvidence(publicationConvergence) {
  if (!isConsistencyRecord(publicationConvergence)) {
    return false;
  }
  return (
    (typeof publicationConvergence.publicationStatus === 'string' &&
      publicationConvergence.publicationStatus.length > 0) ||
    (typeof publicationConvergence.recoveryProtocolState === 'string' &&
      publicationConvergence.recoveryProtocolState.length > 0) ||
    isConsistencyRecord(publicationConvergence.priorityPartitionSummary) ||
    isConsistencyRecord(publicationConvergence.priorityRecoveryClosureWitness) ||
    isConsistencyRecord(publicationConvergence.publicationRecoveryGate) ||
    Array.isArray(publicationConvergence.priorityRecoveryReasonCodes) ||
    Array.isArray(publicationConvergence.pendingAckNodeIds) ||
    Array.isArray(publicationConvergence.requiredAckNodeIds) ||
    Array.isArray(publicationConvergence.acknowledgedNodeIds) ||
    Array.isArray(publicationConvergence.missingPublishedNodeIds) ||
    Array.isArray(publicationConvergence.missingPublishedRecoveryActiveNodeIds)
  );
}

function hasPriorityPartitionSummarySpreadPending(priorityPartitionSummary) {
  if (!isConsistencyRecord(priorityPartitionSummary)) {
    return false;
  }
  return (
    priorityPartitionSummary.satisfied === false ||
    hasPositiveRecoveryBlockerCount(
      priorityPartitionSummary.blockedPartitionCount,
    ) ||
    hasPositiveRecoveryBlockerCount(priorityPartitionSummary.largestSpreadGap) ||
    hasPositiveRecoveryBlockerCount(priorityPartitionSummary.totalSpreadGap) ||
    hasRecoveryBlockerIdList(priorityPartitionSummary.blockedPartitionIds) ||
    hasRecoveryBlockerReasonMap(
      priorityPartitionSummary.blockerPartitionIdsByReason,
    )
  );
}

function resolvePrioritySpreadPendingFromObservation(
  priorityRecoveryObservation,
  priorityPartitionSummary,
) {
  if (
    typeof priorityRecoveryObservation.prioritySpreadPending === 'boolean'
  ) {
    return priorityRecoveryObservation.prioritySpreadPending === true;
  }
  if (isConsistencyRecord(priorityPartitionSummary)) {
    return hasPriorityPartitionSummarySpreadPending(priorityPartitionSummary);
  }
  if (
    priorityRecoveryObservation.recoveryProtocolState ===
      RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED &&
    !hasConcretePriorityRecoveryBlocker(priorityRecoveryObservation)
  ) {
    return PRIORITY_RECOVERY_CLOSURE_WITNESS_NOT_PENDING.prioritySpreadPending;
  }
  return null;
}

function buildPriorityRecoveryClosureWitnessFromObservation(
  priorityRecoveryObservation,
) {
  if (!isConsistencyRecord(priorityRecoveryObservation)) {
    return null;
  }
  const priorityPartitionSummary = isConsistencyRecord(
    priorityRecoveryObservation.priorityPartitionSummary,
  ) ?
    priorityRecoveryObservation.priorityPartitionSummary :
    null;
  const prioritySpreadPending = resolvePrioritySpreadPendingFromObservation(
    priorityRecoveryObservation,
    priorityPartitionSummary,
  );
  const hasPrioritySpreadPending = typeof prioritySpreadPending === 'boolean';
  const closureState =
    typeof priorityRecoveryObservation.priorityRecoveryClosureState ===
      'string' &&
    priorityRecoveryObservation.priorityRecoveryClosureState.length > 0 ?
      priorityRecoveryObservation.priorityRecoveryClosureState :
      null;
  const closureRecordId =
    typeof priorityRecoveryObservation.closureRecordId === 'string' &&
    priorityRecoveryObservation.closureRecordId.length > 0 ?
      priorityRecoveryObservation.closureRecordId :
      null;
  const closureWitnessClass =
    typeof priorityRecoveryObservation.closureWitnessClass === 'string' &&
    priorityRecoveryObservation.closureWitnessClass.length > 0 ?
      priorityRecoveryObservation.closureWitnessClass :
      null;
  if (
    !priorityPartitionSummary &&
    !hasPrioritySpreadPending &&
    closureState === null &&
    closureRecordId === null &&
    closureWitnessClass === null
  ) {
    return null;
  }
  return {
    ...(closureState ? {state: closureState} : {}),
    ...(hasPrioritySpreadPending ?
      {
        prioritySpreadPending,
      } :
      {}),
    ...(priorityPartitionSummary ?
      {refreshedPriorityPartitionSummary: priorityPartitionSummary} :
      {}),
    ...(closureRecordId ? {closureRecordId} : {}),
    ...(closureWitnessClass ? {closureWitnessClass} : {}),
  };
}

function buildCanonicalPublicationRecoveryGateFromObservation(
  controlPlaneDiagnostics,
) {
  const diagnostics = isConsistencyRecord(controlPlaneDiagnostics) ?
    controlPlaneDiagnostics :
    null;
  if (!diagnostics) {
    return null;
  }
  const priorityRecoveryObservation = isConsistencyRecord(
    diagnostics.priorityRecoveryObservation,
  ) ?
    diagnostics.priorityRecoveryObservation :
    null;
  if (!priorityRecoveryObservation) {
    return null;
  }
  const hasObservationEvidence =
    (typeof priorityRecoveryObservation.publicationStatus === 'string' &&
      priorityRecoveryObservation.publicationStatus.length > 0) ||
    (typeof priorityRecoveryObservation.recoveryProtocolState === 'string' &&
      priorityRecoveryObservation.recoveryProtocolState.length > 0) ||
    isConsistencyRecord(priorityRecoveryObservation.priorityPartitionSummary) ||
    Array.isArray(priorityRecoveryObservation.priorityRecoveryReasonCodes) ||
    Array.isArray(priorityRecoveryObservation.pendingAckNodeIds) ||
    typeof priorityRecoveryObservation.prioritySpreadPending === 'boolean' ||
    typeof priorityRecoveryObservation.closureRecordId === 'string' ||
    typeof priorityRecoveryObservation.closureWitnessClass === 'string';
  if (!hasObservationEvidence) {
    return null;
  }
  return buildPublicationRecoveryGateSnapshot({
    publicationEpoch: Number.isInteger(priorityRecoveryObservation.publicationEpoch) ?
      priorityRecoveryObservation.publicationEpoch :
      null,
    publicationStatus:
      typeof priorityRecoveryObservation.publicationStatus === 'string' &&
      priorityRecoveryObservation.publicationStatus.length > 0 ?
        priorityRecoveryObservation.publicationStatus :
        null,
    recoveryProtocolState:
      typeof priorityRecoveryObservation.recoveryProtocolState === 'string' &&
      priorityRecoveryObservation.recoveryProtocolState.length > 0 ?
        priorityRecoveryObservation.recoveryProtocolState :
        null,
    priorityRecoveryReasonCodes: Array.isArray(
      priorityRecoveryObservation.priorityRecoveryReasonCodes,
    ) ?
      priorityRecoveryObservation.priorityRecoveryReasonCodes :
      [],
    priorityPartitionSummary: isConsistencyRecord(
      priorityRecoveryObservation.priorityPartitionSummary,
    ) ?
      priorityRecoveryObservation.priorityPartitionSummary :
      null,
    priorityRecoveryClosureWitness:
      buildPriorityRecoveryClosureWitnessFromObservation(
        priorityRecoveryObservation,
      ),
    pendingAckNodeIds: Array.isArray(priorityRecoveryObservation.pendingAckNodeIds) ?
      priorityRecoveryObservation.pendingAckNodeIds :
      [],
  });
}

function normalizePublicationRecoveryGateEpoch(value) {
  return Number.isInteger(value) ? value : null;
}

function hasPositiveRecoveryBlockerCount(value) {
  return Number.isFinite(value) && value > NO_RECOVERY_BLOCKER_COUNT;
}

function hasRecoveryBlockerIdList(value) {
  return normalizeConsistencyStringList(value).length > EMPTY_LIST_LENGTH;
}

function hasRecoveryBlockerReasonMap(value) {
  if (!isConsistencyRecord(value)) {
    return false;
  }
  return Object.values(value).some((entry) => hasRecoveryBlockerIdList(entry));
}

function hasConcretePriorityRecoveryBlocker(priorityRecoveryObservation) {
  if (!isConsistencyRecord(priorityRecoveryObservation)) {
    return false;
  }
  const priorityPartitionSummary = isConsistencyRecord(
    priorityRecoveryObservation.priorityPartitionSummary,
  ) ?
    priorityRecoveryObservation.priorityPartitionSummary :
    null;
  const currentSummary = isConsistencyRecord(
    priorityRecoveryObservation.priorityRecoveryCurrentSummary,
  ) ?
    priorityRecoveryObservation.priorityRecoveryCurrentSummary :
    null;
  const partitionSummarySatisfied =
    priorityPartitionSummary?.satisfied === true &&
    !hasPositiveRecoveryBlockerCount(
      priorityPartitionSummary.blockedPartitionCount,
    ) &&
    !hasPositiveRecoveryBlockerCount(priorityPartitionSummary.largestSpreadGap) &&
    !hasPositiveRecoveryBlockerCount(priorityPartitionSummary.totalSpreadGap);
  if (partitionSummarySatisfied) {
    return false;
  }
  if (
    priorityPartitionSummary?.satisfied === false ||
    hasPositiveRecoveryBlockerCount(
      priorityRecoveryObservation.priorityRecoveryBlockedPartitionCount,
    ) ||
    hasPositiveRecoveryBlockerCount(
      priorityRecoveryObservation.priorityRecoveryUnresolvedPartitionCount,
    ) ||
    hasPositiveRecoveryBlockerCount(currentSummary?.blockedPartitionCount) ||
    hasPositiveRecoveryBlockerCount(currentSummary?.unresolvedClassCount) ||
    hasPositiveRecoveryBlockerCount(
      currentSummary?.unresolvedSemanticStateCount,
    ) ||
    hasPositiveRecoveryBlockerCount(
      priorityPartitionSummary?.blockedPartitionCount,
    ) ||
    hasPositiveRecoveryBlockerCount(priorityPartitionSummary?.largestSpreadGap) ||
    hasPositiveRecoveryBlockerCount(priorityPartitionSummary?.totalSpreadGap) ||
    hasRecoveryBlockerIdList(
      priorityRecoveryObservation.priorityRecoveryBlockedPartitionIds,
    ) ||
    hasRecoveryBlockerIdList(
      priorityRecoveryObservation.priorityRecoveryUnresolvedPartitionIds,
    ) ||
    hasRecoveryBlockerIdList(currentSummary?.blockedPartitionIds) ||
    hasRecoveryBlockerReasonMap(
      priorityRecoveryObservation.priorityRecoveryBlockerPartitionIdsByReason,
    ) ||
    hasRecoveryBlockerReasonMap(currentSummary?.blockerPartitionIdsByReason)
  ) {
    return true;
  }
  const reasonCodes = normalizeConsistencyStringList(
    priorityRecoveryObservation.priorityRecoveryReasonCodes,
  );
  return (
    priorityRecoveryObservation.prioritySpreadPending === true &&
    reasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    )
  );
}

function selectPublicationConvergenceGate(
  canonicalPublicationRecoveryGate,
  explicitPublicationRecoveryGate,
) {
  if (!canonicalPublicationRecoveryGate) {
    return explicitPublicationRecoveryGate;
  }
  if (!explicitPublicationRecoveryGate) {
    return canonicalPublicationRecoveryGate;
  }
  const canonicalEpoch = normalizePublicationRecoveryGateEpoch(
    canonicalPublicationRecoveryGate.publicationEpoch,
  );
  const explicitEpoch = normalizePublicationRecoveryGateEpoch(
    explicitPublicationRecoveryGate.publicationEpoch,
  );
  if (
    canonicalEpoch !== null &&
    explicitEpoch !== null &&
    explicitEpoch > canonicalEpoch
  ) {
    return explicitPublicationRecoveryGate;
  }
  return canonicalPublicationRecoveryGate;
}

function isPublicationGateAtLeastAsRecent(candidate, reference) {
  const candidateEpoch = normalizePublicationRecoveryGateEpoch(
    candidate?.publicationEpoch,
  );
  const referenceEpoch = normalizePublicationRecoveryGateEpoch(
    reference?.publicationEpoch,
  );
  return (
    candidateEpoch === null ||
    referenceEpoch === null ||
    candidateEpoch >= referenceEpoch
  );
}

function selectCanonicalPublicationRecoveryGate({
  canonicalObservationGate,
  publicationGate,
  priorityRecoveryObservation,
}) {
  if (!canonicalObservationGate) {
    return publicationGate;
  }
  if (!publicationGate) {
    return canonicalObservationGate;
  }
  if (
    publicationGate.ready === true &&
    isPublicationGateAtLeastAsRecent(
      publicationGate,
      canonicalObservationGate,
    ) &&
    !hasConcretePriorityRecoveryBlocker(priorityRecoveryObservation)
  ) {
    return publicationGate;
  }
  return canonicalObservationGate;
}

function buildCanonicalPublicationRecoveryGate(controlPlaneDiagnostics) {
  const diagnostics = isConsistencyRecord(controlPlaneDiagnostics) ?
    controlPlaneDiagnostics :
    null;
  if (!diagnostics) {
    return null;
  }
  const priorityRecoveryObservation = isConsistencyRecord(
    diagnostics.priorityRecoveryObservation,
  ) ?
    diagnostics.priorityRecoveryObservation :
    null;
  const canonicalObservationGate =
    buildCanonicalPublicationRecoveryGateFromObservation(diagnostics);
  const publicationConvergence = isConsistencyRecord(
    diagnostics.publicationConvergence,
  ) ?
    diagnostics.publicationConvergence :
    null;
  const explicitPublicationRecoveryGate = isConsistencyRecord(
    diagnostics.publicationConvergenceGate,
  ) ?
    diagnostics.publicationConvergenceGate :
    isConsistencyRecord(publicationConvergence?.publicationRecoveryGate) ?
      publicationConvergence.publicationRecoveryGate :
      null;
  if (!hasCanonicalPublicationRecoveryGateEvidence(publicationConvergence)) {
    return selectCanonicalPublicationRecoveryGate({
      canonicalObservationGate,
      publicationGate: explicitPublicationRecoveryGate,
      priorityRecoveryObservation,
    });
  }
  const canonicalPublicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
    publicationEpoch:
      publicationConvergence?.publicationEpoch ??
      explicitPublicationRecoveryGate?.publicationEpoch,
    publicationStatus:
      publicationConvergence?.publicationStatus ??
      explicitPublicationRecoveryGate?.publicationStatus,
    publicationObservationState:
      publicationConvergence?.publicationObservationState ??
      explicitPublicationRecoveryGate?.publicationObservationState,
    recoveryProtocolState:
      publicationConvergence?.recoveryProtocolState ??
      publicationConvergence?.membershipLifecycleSummary?.recoveryProtocolState ??
      explicitPublicationRecoveryGate?.recoveryProtocolState,
    priorityRecoveryReasonCodes:
      publicationConvergence?.priorityRecoveryReasonCodes ??
      publicationConvergence?.membershipLifecycleSummary
        ?.priorityRecoveryReasonCodes ??
      explicitPublicationRecoveryGate?.reasonCodes ??
      explicitPublicationRecoveryGate?.reasons,
    priorityPartitionSummary:
      publicationConvergence?.priorityPartitionSummary ??
      explicitPublicationRecoveryGate?.priorityPartitionSummary,
    priorityRecoveryClosureWitness:
      publicationConvergence?.priorityRecoveryClosureWitness ??
      explicitPublicationRecoveryGate?.priorityRecoveryClosureWitness,
    priorityRecoveryDecisionSnapshots:
      diagnostics.priorityRecoveryDecisionSnapshots ??
      publicationConvergence?.priorityRecoveryDecisionSnapshots ??
      explicitPublicationRecoveryGate?.priorityRecoveryDecisionSnapshots,
    requiredAckNodeIds:
      publicationConvergence?.requiredAckNodeIds ??
      explicitPublicationRecoveryGate?.requiredAckNodeIds,
    acknowledgedNodeIds:
      publicationConvergence?.acknowledgedNodeIds ??
      explicitPublicationRecoveryGate?.acknowledgedNodeIds,
    pendingAckNodeIds:
      publicationConvergence?.pendingAckNodeIds ??
      explicitPublicationRecoveryGate?.pendingAckNodeIds,
    missingPublishedNodeIds:
      publicationConvergence?.missingPublishedNodeIds ??
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds ??
      explicitPublicationRecoveryGate?.missingPublishedNodeIds,
  });
  return selectCanonicalPublicationRecoveryGate({
    canonicalObservationGate,
    publicationGate: selectPublicationConvergenceGate(
      canonicalPublicationRecoveryGate,
      explicitPublicationRecoveryGate,
    ),
    priorityRecoveryObservation,
  });
}

function extractPublicationRecoveryGateContract(controlPlaneDiagnostics) {
  const gate = buildCanonicalPublicationRecoveryGate(controlPlaneDiagnostics);
  if (!gate) {
    return {
      contractPresent: false,
      ready: null,
      state: null,
      publicationEpoch: null,
      publicationStatus: null,
      reasonCodes: [],
    };
  }
  const normalizedReasonCodes = normalizeConsistencyStringList(
    Array.isArray(gate?.reasonCodes) ? gate.reasonCodes : gate?.reasons,
  );
  const state =
    typeof gate?.state === 'string' && gate.state.length > 0 ?
      gate.state :
      typeof gate?.recoveryProtocolState === 'string' &&
            gate.recoveryProtocolState.length > 0 ?
        gate.recoveryProtocolState :
        gate?.ready === true ?
          PUBLICATION_RECOVERY_GATE_STATE_READY :
          gate?.publicationPending === true ?
            PUBLICATION_RECOVERY_GATE_STATE_PUBLICATION_PENDING :
            gate?.prioritySpreadEvidenceUnavailable === true ?
              PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE :
              gate?.prioritySpreadPending === true ?
                PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING :
                VALUE_UNKNOWN;
  return {
    contractPresent: true,
    ready: gate?.ready === true,
    state,
    publicationEpoch: Number.isInteger(gate?.publicationEpoch) ?
      gate.publicationEpoch :
      null,
    publicationStatus:
      typeof gate?.publicationStatus === 'string' &&
      gate.publicationStatus.length > 0 ?
        gate.publicationStatus :
        typeof gate?.publicationStatusNormalized === 'string' &&
            gate.publicationStatusNormalized.length > 0 ?
          gate.publicationStatusNormalized :
          null,
    reasonCodes: normalizedReasonCodes,
  };
}

function formatPublicationRecoveryGateContract(contract) {
  const normalizedContract =
    contract && typeof contract === 'object' ?
      contract :
      extractPublicationRecoveryGateContract(null);
  const reasonCodes =
    normalizedContract.reasonCodes.length > 0 ?
      normalizedContract.reasonCodes.join(
        PUBLICATION_RECOVERY_GATE_REASON_SEPARATOR,
      ) :
      VALUE_NONE;
  return (
    CONSISTENCY_GATE_SUMMARY_PREFIX +
    'ready=' +
    (normalizedContract.ready === true ? BOOLEAN_TRUE : BOOLEAN_FALSE) +
    ',state=' +
    String(normalizedContract.state || VALUE_UNKNOWN) +
    ',epoch=' +
    String(
      Number.isInteger(normalizedContract.publicationEpoch) ?
        normalizedContract.publicationEpoch :
        VALUE_UNKNOWN,
    ) +
    ',status=' +
    String(normalizedContract.publicationStatus || VALUE_UNKNOWN) +
    ',reasons=' +
    reasonCodes +
    CONSISTENCY_GATE_SUMMARY_SUFFIX
  );
}

function buildConsistencyComparisonRecordFromState(state) {
  const controlPlaneDiagnostics = cloneDiagnostics(state?.controlPlaneDiagnostics);
  return {
    nodeId: String(state?.nodeId || VALUE_UNKNOWN),
    activeNodes: normalizeConsistencyNodeIdList(state?.activeNodes) || [],
    authoritativeActiveNodes: normalizeConsistencyNodeIdList(
      state?.authoritativeActiveNodes,
    ),
    partitions: normalizeConsistencyStringList(state?.partitions),
    leaders: sortObjectKeys(normalizeLeaders(state?.leaders || {})),
    partitionLeaderAuthority: normalizePartitionLeaderAuthority(
      state?.partitionLeaderAuthority,
    ),
    publicationEpoch: Number.isInteger(state?.publicationEpoch) ?
      state.publicationEpoch :
      null,
    sourceSnapshotVersion: normalizeConsistencyInteger(
      state?.sourceSnapshotVersion,
    ),
    snapshotRevision: normalizeConsistencyInteger(state?.snapshotRevision),
    snapshotRevisionState:
      typeof state?.snapshotRevisionState === 'string' &&
      state.snapshotRevisionState.length > 0 ?
        state.snapshotRevisionState :
        null,
    snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
      state?.snapshotExpectedMinimumRevision,
    ),
    snapshotRevisionGap: normalizeConsistencyInteger(
      state?.snapshotRevisionGap,
    ),
    snapshotResumeToken:
      typeof state?.snapshotResumeToken === 'string' &&
      state.snapshotResumeToken.length > 0 ?
        state.snapshotResumeToken :
        null,
    publishedActiveNodeIds:
      normalizeConsistencyNodeIdList(state?.publishedActiveNodeIds),
    observationSource: String(state?.observationSource || VALUE_UNKNOWN),
    observationMode: String(state?.observationMode || OBSERVATION_MODE_UNKNOWN),
    controlPlaneDiagnostics,
    publicationRecoveryGate: extractPublicationRecoveryGateContract(
      controlPlaneDiagnostics,
    ),
  };
}

function buildConsistencyComparisonRecordFromSnapshot(snapshot) {
  const publishedActiveNodeIdsSet = extractControlSnapshotPublishedNodeIds(
    snapshot,
  );
  const controlPlaneDiagnostics = cloneDiagnostics(
    snapshot?.controlPlaneDiagnostics,
  );
  return {
    nodeId: String(snapshot?.nodeId || VALUE_UNKNOWN),
    activeNodes: normalizeConsistencyNodeIdList(snapshot?.nodes) || [],
    authoritativeActiveNodes:
      publishedActiveNodeIdsSet instanceof Set ?
        normalizeConsistencyNodeIdList(Array.from(publishedActiveNodeIdsSet)) :
        null,
    partitions: normalizeConsistencyStringList(snapshot?.partitions),
    leaders: sortObjectKeys(normalizeLeaders(snapshot?.leaders || {})),
    partitionLeaderAuthority: normalizePartitionLeaderAuthority(
      snapshot?.partitionLeaderAuthority,
    ),
    publicationEpoch: Number.isInteger(
      snapshot?.controlPlaneDiagnostics?.publicationConvergence
        ?.publicationEpoch,
    ) ?
      snapshot.controlPlaneDiagnostics.publicationConvergence.publicationEpoch :
      Number.isInteger(snapshot?.publicationEpoch) ?
        snapshot.publicationEpoch :
        null,
    sourceSnapshotVersion: normalizeConsistencyInteger(
      snapshot?.sourceSnapshotVersion,
    ),
    snapshotRevision: normalizeConsistencyInteger(snapshot?.snapshotRevision),
    snapshotRevisionState:
      typeof snapshot?.snapshotRevisionState === 'string' &&
      snapshot.snapshotRevisionState.length > 0 ?
        snapshot.snapshotRevisionState :
        null,
    snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
      snapshot?.snapshotExpectedMinimumRevision,
    ),
    snapshotRevisionGap: normalizeConsistencyInteger(
      snapshot?.snapshotRevisionGap,
    ),
    snapshotResumeToken:
      typeof snapshot?.snapshotResumeToken === 'string' &&
      snapshot.snapshotResumeToken.length > 0 ?
        snapshot.snapshotResumeToken :
        null,
    publishedActiveNodeIds: normalizeConsistencyNodeIdList(
      Array.isArray(
        snapshot?.controlPlaneDiagnostics?.publicationConvergence
          ?.publishedActiveNodeIds,
      ) ?
        snapshot.controlPlaneDiagnostics.publicationConvergence
          .publishedActiveNodeIds :
        Array.isArray(snapshot?.publishedActiveNodeIds) ?
          snapshot.publishedActiveNodeIds :
          Array.isArray(snapshot?.publishedNodes) ?
            snapshot.publishedNodes :
            null,
    ),
    observationSource: OBSERVATION_SOURCE_CONTROL_SNAPSHOT,
    observationMode: String(
      snapshot?.observationMode || OBSERVATION_MODE_UNKNOWN,
    ),
    controlPlaneDiagnostics,
    publicationRecoveryGate: extractPublicationRecoveryGateContract(
      controlPlaneDiagnostics,
    ),
  };
}

function resolvePublicationScopedLeaderComparison(records) {
  const contractRecords = records.filter(
    (record) => record?.publicationRecoveryGate?.contractPresent === true,
  );
  if (contractRecords.length === 0) {
    return {
      hasContract: false,
      ready: true,
      blockedRecords: [],
    };
  }
  const readyPublicationGateEpochs = contractRecords
    .filter((record) => record.publicationRecoveryGate.ready === true)
    .map((record) => record.publicationRecoveryGate.publicationEpoch)
    .filter((epoch) => Number.isInteger(epoch));
  const readyPublicationGateEpochSet = new Set(readyPublicationGateEpochs);
  const blockedRecords = contractRecords.filter(
    (record) => record.publicationRecoveryGate.ready !== true,
  );
  const authoritativeBlockedRecords = blockedRecords.filter(
    (record) =>
      isAuthoritativePublicationRecoveryGateBlocker(
        record,
        readyPublicationGateEpochSet,
      ),
  );
  return {
    hasContract: true,
    ready: authoritativeBlockedRecords.length === 0,
    blockedRecords: authoritativeBlockedRecords,
  };
}

function isAuthoritativePublicationRecoveryGateBlocker(
  record,
  readyPublicationGateEpochSet,
) {
  if (
    isStalePublicationRecoveryGateLagRecord(
      record,
      readyPublicationGateEpochSet,
    )
  ) {
    return false;
  }
  return true;
}

function isStalePublicationRecoveryGateLagRecord(
  record,
  readyPublicationGateEpochSet,
) {
  const gate = record?.publicationRecoveryGate;
  if (
    !(readyPublicationGateEpochSet instanceof Set) ||
    readyPublicationGateEpochSet.size === EMPTY_LIST_LENGTH ||
    !Number.isInteger(gate?.publicationEpoch) ||
    !readyPublicationGateEpochSet.has(gate.publicationEpoch)
  ) {
    return false;
  }
  const staleGateEvidence = normalizeStalePublicationGateEvidence(record);
  return STALE_PUBLICATION_GATE_LAG_DECISION_TABLE.some((decision) =>
    decision(staleGateEvidence),
  );
}

function normalizeStalePublicationGateEvidence(record) {
  const gate = record?.publicationRecoveryGate;
  const reasonCodes = normalizeConsistencyStringList(gate?.reasonCodes);
  return {
    observationMode: record?.observationMode,
    snapshotRevisionState: record?.snapshotRevisionState,
    gateState: gate?.state,
    gateReady: gate?.ready === true,
    reasonCodes,
    prioritySpreadOnly:
      reasonCodes.length === CONSISTENCY_SINGLE_REASON_COUNT &&
      reasonCodes[EMPTY_LIST_LENGTH] ===
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    prioritySpreadEvidenceUnavailableOnly:
      reasonCodes.length === CONSISTENCY_SINGLE_REASON_COUNT &&
      reasonCodes[EMPTY_LIST_LENGTH] ===
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON
          .PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
  };
}

const STALE_PUBLICATION_GATE_LAG_DECISION_TABLE = Object.freeze([
  (evidence) =>
    evidence.gateReady !== true &&
    evidence.observationMode ===
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED &&
    evidence.snapshotRevisionState ===
      CONTROL_PLANE_SNAPSHOT_REVISION_STATE.STALE_USABLE &&
    (
      (
        evidence.gateState ===
          PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING &&
        evidence.prioritySpreadOnly === true
      ) ||
      (
        evidence.gateState ===
          PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE &&
        evidence.prioritySpreadEvidenceUnavailableOnly === true
      )
    ),
]);

function buildPublicationRecoveryGateNotReadyMessage(records) {
  const summaries = records.map(
    (record) =>
      String(record?.nodeId || VALUE_UNKNOWN) +
      '=' +
      formatPublicationRecoveryGateContract(record?.publicationRecoveryGate),
  );
  return (
    'Publication-scoped consistency not ready. Node gates: ' +
    summaries.join(CONSISTENCY_GATE_SUMMARY_SEPARATOR)
  );
}

function hasSnapshotRevisionEvidence(record) {
  return (
    Number.isInteger(record?.snapshotRevision) ||
    Number.isInteger(record?.snapshotExpectedMinimumRevision) ||
    Number.isInteger(record?.snapshotRevisionGap) ||
    (typeof record?.snapshotRevisionState === 'string' &&
      record.snapshotRevisionState.length > 0) ||
    (typeof record?.snapshotResumeToken === 'string' &&
      record.snapshotResumeToken.length > 0)
  );
}

function buildSnapshotRevisionObservation(record) {
  return {
    nodeId: String(record?.nodeId || VALUE_UNKNOWN),
    observationSource: String(record?.observationSource || VALUE_UNKNOWN),
    sourceSnapshotVersion: normalizeConsistencyInteger(
      record?.sourceSnapshotVersion,
    ),
    snapshotRevision: normalizeConsistencyInteger(record?.snapshotRevision),
    snapshotRevisionState:
      typeof record?.snapshotRevisionState === 'string' &&
      record.snapshotRevisionState.length > 0 ?
        record.snapshotRevisionState :
        null,
    snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
      record?.snapshotExpectedMinimumRevision,
    ),
    snapshotRevisionGap: normalizeConsistencyInteger(
      record?.snapshotRevisionGap,
    ),
    snapshotResumeToken:
      typeof record?.snapshotResumeToken === 'string' &&
      record.snapshotResumeToken.length > 0 ?
        record.snapshotResumeToken :
        null,
  };
}

function isSnapshotRevisionObservationLagging(
  observation,
) {
  const hasPositiveRevisionGap =
    Number.isInteger(observation?.snapshotRevisionGap) &&
    observation.snapshotRevisionGap > NO_RECOVERY_BLOCKER_COUNT;
  const isBehindExpectedMinimum =
    Number.isInteger(observation?.snapshotRevision) &&
    Number.isInteger(observation?.snapshotExpectedMinimumRevision) &&
    observation.snapshotRevision < observation.snapshotExpectedMinimumRevision;
  return (
    hasPositiveRevisionGap ||
    isBehindExpectedMinimum
  );
}

function buildSnapshotRevisionBarrier(records) {
  const observations = (Array.isArray(records) ? records : [])
    .filter(hasSnapshotRevisionEvidence)
    .map(buildSnapshotRevisionObservation);
  if (observations.length === EMPTY_LIST_LENGTH) {
    return {
      state: CONSISTENCY_REVISION_BARRIER_STATE_UNAVAILABLE,
      ready: null,
      maxSnapshotRevision: null,
      laggingNodeIds: [],
      observationsByNodeId: {},
    };
  }
  const knownRevisions = observations
    .map((observation) => observation.snapshotRevision)
    .filter(Number.isInteger);
  const maxSnapshotRevision =
    knownRevisions.length > EMPTY_LIST_LENGTH ?
      Math.max(...knownRevisions) :
      null;
  const laggingObservations = observations.filter((observation) =>
    isSnapshotRevisionObservationLagging(observation),
  );
  return {
    state:
      laggingObservations.length > EMPTY_LIST_LENGTH ?
        CONSISTENCY_REVISION_BARRIER_STATE_LAGGING :
        CONSISTENCY_REVISION_BARRIER_STATE_READY,
    ready: laggingObservations.length === EMPTY_LIST_LENGTH,
    maxSnapshotRevision,
    laggingNodeIds: laggingObservations
      .map((observation) => observation.nodeId)
      .sort(),
    observationsByNodeId: Object.fromEntries(
      observations
        .map((observation) => [observation.nodeId, observation])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function buildSnapshotRevisionLagMessage(revisionBarrier) {
  const laggingNodeIds = Array.isArray(revisionBarrier?.laggingNodeIds) ?
    revisionBarrier.laggingNodeIds :
    [];
  return (
    'Observer snapshot revisions lag for final consistency. Lagging nodes: ' +
    JSON.stringify(laggingNodeIds) +
    '. Max snapshot revision: ' +
    String(revisionBarrier?.maxSnapshotRevision ?? VALUE_UNKNOWN)
  );
}

function buildSnapshotRevisionLagMismatch(records, leaderMismatch) {
  const revisionBarrier = buildSnapshotRevisionBarrier(records);
  if (revisionBarrier.ready !== false) {
    return null;
  }
  const referenceNodeId =
    leaderMismatch?.referenceNodeId ||
    revisionBarrier.laggingNodeIds[0] ||
    VALUE_UNKNOWN;
  const otherNodeId =
    leaderMismatch?.otherNodeId ||
    revisionBarrier.laggingNodeIds.find((nodeId) => nodeId !== referenceNodeId);
  return buildConsistencyMismatch(
    buildSnapshotRevisionLagMessage(revisionBarrier),
    CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REVISION_LAG,
    referenceNodeId,
    otherNodeId || VALUE_UNKNOWN,
    {
      state: CONSISTENCY_FINAL_STATE_OBSERVER_REVISION_LAG,
      observedMismatchReasonCode: leaderMismatch?.reasonCode || null,
      revisionBarrier,
    },
  );
}

function isRepairDeferredStaleObservation(record) {
  return (
    record?.observationMode ===
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED &&
    record?.snapshotRevisionState ===
      CONTROL_PLANE_SNAPSHOT_REVISION_STATE.STALE_USABLE
  );
}

function buildRepairDeferredObservationSummary(records) {
  const summaryByNodeId = {};
  for (const record of Array.isArray(records) ? records : []) {
    const nodeId = String(record?.nodeId || VALUE_UNKNOWN);
    summaryByNodeId[nodeId] = {
      observationMode: String(
        record?.observationMode || OBSERVATION_MODE_UNKNOWN,
      ),
      snapshotRevisionState:
        typeof record?.snapshotRevisionState === 'string' &&
        record.snapshotRevisionState.length > EMPTY_LIST_LENGTH ?
          record.snapshotRevisionState :
          null,
      snapshotRevision: normalizeConsistencyInteger(record?.snapshotRevision),
      snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
        record?.snapshotExpectedMinimumRevision,
      ),
      snapshotRevisionGap: normalizeConsistencyInteger(
        record?.snapshotRevisionGap,
      ),
      controlSnapshotError:
        typeof record?.controlSnapshotError === 'string' &&
        record.controlSnapshotError.length > EMPTY_LIST_LENGTH ?
          record.controlSnapshotError :
          null,
    };
  }
  return sortObjectKeys(summaryByNodeId);
}

function buildRepairDeferredMismatch(records) {
  const deferredRecords = (Array.isArray(records) ? records : []).filter(
    isRepairDeferredStaleObservation,
  );
  const referenceNodeId =
    deferredRecords[EMPTY_LIST_LENGTH]?.nodeId ||
    records?.[EMPTY_LIST_LENGTH]?.nodeId ||
    VALUE_UNKNOWN;
  const otherNodeId =
    deferredRecords[CONSISTENCY_SINGLE_REASON_COUNT]?.nodeId ||
    referenceNodeId;
  return buildConsistencyMismatch(
    'Observer snapshot repair is deferred for final consistency. ' +
      'Deferred nodes: ' +
      JSON.stringify(
        deferredRecords.map((record) => record.nodeId).sort(),
      ),
    CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED,
    referenceNodeId,
    otherNodeId,
    {
      state: CONSISTENCY_FINAL_STATE_OBSERVER_REPAIR_DEFERRED,
      repairDeferredObservationsByNodeId:
        buildRepairDeferredObservationSummary(records),
    },
  );
}

function resolveFinalLeaderComparisonRecords(records) {
  const allRecords = Array.isArray(records) ? records : [];
  const comparableRecords = allRecords.filter(
    (record) => !isRepairDeferredStaleObservation(record),
  );
  const deferredRecords = allRecords.filter(isRepairDeferredStaleObservation);
  if (
    comparableRecords.length === EMPTY_LIST_LENGTH &&
    deferredRecords.length > EMPTY_LIST_LENGTH
  ) {
    return {
      records: comparableRecords,
      mismatch: buildRepairDeferredMismatch(allRecords),
    };
  }
  if (
    comparableRecords.length > EMPTY_LIST_LENGTH &&
    deferredRecords.length > EMPTY_LIST_LENGTH
  ) {
    return {
      records: comparableRecords,
      mismatch: null,
    };
  }
  return {
    records: allRecords,
    mismatch: null,
  };
}

function getRecordAuthorityCertificate(record, partitionId) {
  const authority = normalizePartitionLeaderAuthority(
    record?.partitionLeaderAuthority,
  );
  return authority[partitionId] || null;
}

function buildAuthorityEvidenceByPartitionId(records, partitionIds) {
  const evidenceByPartitionId = {};
  for (const partitionId of Array.isArray(partitionIds) ? partitionIds : []) {
    const evidenceByNodeId = {};
    for (const record of Array.isArray(records) ? records : []) {
      const nodeId = String(record?.nodeId || VALUE_UNKNOWN);
      const certificate = getRecordAuthorityCertificate(record, partitionId);
      if (!certificate) {
        continue;
      }
      evidenceByNodeId[nodeId] = certificate;
    }
    if (Object.keys(evidenceByNodeId).length > EMPTY_LIST_LENGTH) {
      evidenceByPartitionId[partitionId] = sortObjectKeys(evidenceByNodeId);
    }
  }
  return evidenceByPartitionId;
}

function collectAuthorityEpochValues(certificates, fieldName) {
  return [
    ...new Set(
      certificates
        .map((certificate) => certificate?.[fieldName])
        .filter(Number.isInteger),
    ),
  ];
}

function hasDivergentAuthorityEpoch(certificates) {
  const topologyEpochValues = collectAuthorityEpochValues(
    certificates,
    PARTITION_LEADER_AUTHORITY_FIELD_TOPOLOGY_EPOCH,
  );
  const membershipEpochValues = collectAuthorityEpochValues(
    certificates,
    PARTITION_LEADER_AUTHORITY_FIELD_MEMBERSHIP_EPOCH,
  );
  const snapshotRevisionValues = collectAuthorityEpochValues(
    certificates,
    PARTITION_LEADER_AUTHORITY_FIELD_SNAPSHOT_REVISION,
  );
  return (
    topologyEpochValues.length > CONSISTENCY_SINGLE_REASON_COUNT ||
    membershipEpochValues.length > CONSISTENCY_SINGLE_REASON_COUNT ||
    snapshotRevisionValues.length > CONSISTENCY_SINGLE_REASON_COUNT
  );
}

function buildAuthorityMismatchMessage({
  reasonCode,
  partitionId,
  authorityEvidenceByPartitionId,
}) {
  return (
    'Partition leader authority mismatch for ' +
    partitionId +
    ' (' +
    reasonCode +
    '): ' +
    JSON.stringify(authorityEvidenceByPartitionId?.[partitionId] || {})
  );
}

function buildAuthorityBackedLeaderMismatch(records, leaderMismatch) {
  const referenceRecord = (Array.isArray(records) ? records : []).find(
    (record) => record?.nodeId === leaderMismatch?.referenceNodeId,
  );
  const otherRecord = (Array.isArray(records) ? records : []).find(
    (record) => record?.nodeId === leaderMismatch?.otherNodeId,
  );
  const differingPartitionIds = buildDifferingLeaderPartitionIds(
    referenceRecord,
    otherRecord,
  );
  const authorityEvidenceByPartitionId = buildAuthorityEvidenceByPartitionId(
    records,
    differingPartitionIds,
  );
  for (const partitionId of differingPartitionIds) {
    const evidenceEntries = Object.entries(
      authorityEvidenceByPartitionId[partitionId] || {},
    );
    if (evidenceEntries.length < CONSISTENCY_SINGLE_REASON_COUNT + 1) {
      continue;
    }
    const certificates = evidenceEntries.map(([, certificate]) => certificate);
    const authorityLeaderIds = [
      ...new Set(certificates.map((certificate) => certificate.leaderNodeId)),
    ];
    const reasonCode =
      authorityLeaderIds.length > CONSISTENCY_SINGLE_REASON_COUNT &&
      !hasDivergentAuthorityEpoch(certificates) ?
        CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED :
        CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG;
    const authorityDetails =
      authorityLeaderIds.length === CONSISTENCY_SINGLE_REASON_COUNT ?
        {authoritativeLeaderId: authorityLeaderIds[0]} :
        {};
    if (
      reasonCode === CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG ||
      authorityLeaderIds.length > CONSISTENCY_SINGLE_REASON_COUNT
    ) {
      const [referenceNodeId, otherNodeId] = evidenceEntries.map(
        ([nodeId]) => nodeId,
      );
      return buildConsistencyMismatch(
        buildAuthorityMismatchMessage({
          reasonCode,
          partitionId,
          authorityEvidenceByPartitionId,
        }),
        reasonCode,
        referenceNodeId,
        otherNodeId,
        {
          state:
            reasonCode ===
            CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED ?
              CONSISTENCY_FINAL_STATE_AUTHORITY_DIVERGED :
              CONSISTENCY_FINAL_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
          observedMismatchReasonCode: leaderMismatch?.reasonCode || null,
          differingPartitionIds: [partitionId],
          authorityEvidenceByPartitionId,
          ...authorityDetails,
        },
      );
    }
  }
  return null;
}

function buildConsistencyMismatch(
  message,
  reasonCode,
  referenceNodeId,
  otherNodeId,
  details = {},
) {
  return {
    message,
    reasonCode,
    referenceNodeId,
    otherNodeId,
    ...details,
  };
}

function findConsistencyMismatch(records, options = {}) {
  if (!Array.isArray(records) || records.length < 2) {
    return null;
  }
  const tolerateEmptyLeaders = options.tolerateEmptyLeaders === true;
  const tolerateActiveNodeSkew = options.tolerateActiveNodeSkew === true;
  const maxActiveNodeSkew = Number.isFinite(options.maxActiveNodeSkew) ?
    Math.max(0, Math.floor(options.maxActiveNodeSkew)) :
    1;
  const toleratePartitionSkew = options.toleratePartitionSkew === true;
  const maxPartitionSkew = Number.isFinite(options.maxPartitionSkew) ?
    Math.max(0, Math.floor(options.maxPartitionSkew)) :
    2;
  const publicationScopedLeaderComparison =
    resolvePublicationScopedLeaderComparison(records);
  const reference = records[0];
  const refActiveStr = JSON.stringify(reference.activeNodes);
  const refHasAuthoritativeActiveNodes = Array.isArray(
    reference.authoritativeActiveNodes,
  );
  const refAuthoritativeActiveStr = refHasAuthoritativeActiveNodes ?
    JSON.stringify(reference.authoritativeActiveNodes) :
    null;
  const refPartStr = JSON.stringify(reference.partitions);

  for (let i = 1; i < records.length; i++) {
    const other = records[i];
    const otherActiveStr = JSON.stringify(other.activeNodes);
    const otherHasAuthoritativeActiveNodes = Array.isArray(
      other.authoritativeActiveNodes,
    );
    const canCompareAuthoritativeActiveNodes =
      refHasAuthoritativeActiveNodes && otherHasAuthoritativeActiveNodes;

    if (canCompareAuthoritativeActiveNodes) {
      const otherAuthoritativeActiveStr = JSON.stringify(
        other.authoritativeActiveNodes,
      );
      if (otherAuthoritativeActiveStr !== refAuthoritativeActiveStr) {
        return buildConsistencyMismatch(
          'Published active-node sets disagree between ' +
            reference.nodeId +
            ' and ' +
            other.nodeId +
            '. ' +
            reference.nodeId +
            ': ' +
            refAuthoritativeActiveStr +
            '. ' +
            other.nodeId +
            ': ' +
            otherAuthoritativeActiveStr,
          CONSISTENCY_REASON_CODE_PUBLISHED_ACTIVE_NODES_DISAGREE,
          reference.nodeId,
          other.nodeId,
        );
      }
    } else if (otherActiveStr !== refActiveStr) {
      if (
        tolerateActiveNodeSkew &&
        isTolerableActiveNodeSkew(
          reference.activeNodes,
          other.activeNodes,
          maxActiveNodeSkew,
        )
      ) {
        continue;
      }
      return buildConsistencyMismatch(
        'Active nodes disagree between ' +
          reference.nodeId +
          ' and ' +
          other.nodeId +
          '. ' +
          reference.nodeId +
          ': ' +
          refActiveStr +
          '. ' +
          other.nodeId +
          ': ' +
          otherActiveStr,
        CONSISTENCY_REASON_CODE_ACTIVE_NODES_DISAGREE,
        reference.nodeId,
        other.nodeId,
      );
    }

    const otherPartStr = JSON.stringify(other.partitions);
    if (otherPartStr !== refPartStr) {
      if (
        toleratePartitionSkew &&
        isTolerablePartitionSkew(
          reference.partitions,
          other.partitions,
          maxPartitionSkew,
        )
      ) {
        continue;
      }
      return buildConsistencyMismatch(
        'Partition assignments disagree between ' +
          reference.nodeId +
          ' and ' +
          other.nodeId +
          '. ' +
          reference.nodeId +
          ': ' +
          refPartStr +
          '. ' +
          other.nodeId +
          ': ' +
          otherPartStr,
        CONSISTENCY_REASON_CODE_PARTITION_ASSIGNMENTS_DISAGREE,
        reference.nodeId,
        other.nodeId,
      );
    }
  }

  if (publicationScopedLeaderComparison.ready !== true) {
    const blockedRecords = publicationScopedLeaderComparison.blockedRecords;
    const otherNodeId =
      blockedRecords.length > 0 ?
        blockedRecords[0].nodeId :
        records.length > 1 ?
          records[1].nodeId :
          reference.nodeId;
    return buildConsistencyMismatch(
      buildPublicationRecoveryGateNotReadyMessage(
        records,
      ),
      CONSISTENCY_REASON_CODE_PUBLICATION_RECOVERY_GATE_NOT_READY,
      reference.nodeId,
      otherNodeId,
    );
  }

  const finalLeaderComparison =
    resolveFinalLeaderComparisonRecords(records);
  if (finalLeaderComparison.mismatch) {
    return finalLeaderComparison.mismatch;
  }
  const leaderComparisonRecords = finalLeaderComparison.records;
  if (
    leaderComparisonRecords.length <
    CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT
  ) {
    return null;
  }
  const leaderReference = leaderComparisonRecords[EMPTY_LIST_LENGTH];
  const leaderRefHasAuthoritativeActiveNodes = Array.isArray(
    leaderReference.authoritativeActiveNodes,
  );
  const refLeaders = leaderReference.leaders;
  const refLeaderStr = JSON.stringify(refLeaders);
  const refPublicationEpoch = Number.isInteger(leaderReference.publicationEpoch) ?
    leaderReference.publicationEpoch :
    null;
  const refPublishedActiveStr = JSON.stringify(
    Array.isArray(leaderReference.publishedActiveNodeIds) ?
      leaderReference.publishedActiveNodeIds :
      [],
  );

  for (
    let i = CONSISTENCY_SINGLE_REASON_COUNT;
    i < leaderComparisonRecords.length;
    i++
  ) {
    const other = leaderComparisonRecords[i];
    const otherHasAuthoritativeActiveNodes = Array.isArray(
      other.authoritativeActiveNodes,
    );
    const canCompareAuthoritativeActiveNodes =
      leaderRefHasAuthoritativeActiveNodes && otherHasAuthoritativeActiveNodes;

    if (canCompareAuthoritativeActiveNodes) {
      const otherPublicationEpoch = Number.isInteger(other.publicationEpoch) ?
        other.publicationEpoch :
        null;
      if (otherPublicationEpoch !== refPublicationEpoch) {
        return buildConsistencyMismatch(
          'Publication epochs disagree between ' +
            leaderReference.nodeId +
            ' and ' +
            other.nodeId +
            '. ' +
            leaderReference.nodeId +
            ': ' +
            String(refPublicationEpoch) +
            '. ' +
            other.nodeId +
            ': ' +
            String(otherPublicationEpoch),
          CONSISTENCY_REASON_CODE_PUBLICATION_EPOCHS_DISAGREE,
          leaderReference.nodeId,
          other.nodeId,
        );
      }

      const otherPublishedActiveStr = JSON.stringify(
        Array.isArray(other.publishedActiveNodeIds) ?
          other.publishedActiveNodeIds :
          [],
      );
      if (otherPublishedActiveStr !== refPublishedActiveStr) {
        return buildConsistencyMismatch(
          'Published active-node sets disagree between ' +
            leaderReference.nodeId +
            ' and ' +
            other.nodeId +
            '. ' +
            leaderReference.nodeId +
            ': ' +
            refPublishedActiveStr +
            '. ' +
            other.nodeId +
            ': ' +
            otherPublishedActiveStr,
          CONSISTENCY_REASON_CODE_PUBLISHED_ACTIVE_NODES_DISAGREE,
          leaderReference.nodeId,
          other.nodeId,
        );
      }
    }

    const otherLeaders = other.leaders;
    const otherLeaderStr = JSON.stringify(otherLeaders);
    if (otherLeaderStr !== refLeaderStr) {
      if (
        tolerateEmptyLeaders &&
        !hasConflictingLeaders(refLeaders, otherLeaders)
      ) {
        continue;
      }
      const leaderMismatch = buildConsistencyMismatch(
        'Leader identities disagree between ' +
          leaderReference.nodeId +
          ' and ' +
          other.nodeId +
          '. ' +
          leaderReference.nodeId +
          ': ' +
          refLeaderStr +
          '. ' +
          other.nodeId +
          ': ' +
          otherLeaderStr,
        CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE,
        leaderReference.nodeId,
        other.nodeId,
      );
      return (
        buildSnapshotRevisionLagMismatch(
          leaderComparisonRecords,
          leaderMismatch,
        ) ||
        buildAuthorityBackedLeaderMismatch(
          leaderComparisonRecords,
          leaderMismatch,
        ) ||
        leaderMismatch
      );
    }
  }

  return null;
}

function buildConsistencyStateByNodeId(nodeStates) {
  const stateByNodeId = {};
  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    stateByNodeId[nodeId] = {
      activeNodes: Array.isArray(state?.activeNodes) ?
        [...state.activeNodes].sort() :
        [],
      authoritativeActiveNodes: Array.isArray(state?.authoritativeActiveNodes) ?
        [...state.authoritativeActiveNodes].sort() :
        null,
      partitions: Array.isArray(state?.partitions) ?
        [...state.partitions].sort() :
        [],
      publicationEpoch: Number.isInteger(state?.publicationEpoch) ?
        state.publicationEpoch :
        null,
      sourceSnapshotVersion: Number.isInteger(state?.sourceSnapshotVersion) ?
        state.sourceSnapshotVersion :
        null,
      snapshotRevision: Number.isInteger(state?.snapshotRevision) ?
        state.snapshotRevision :
        null,
      snapshotRevisionState:
        typeof state?.snapshotRevisionState === 'string' &&
        state.snapshotRevisionState.length > 0 ?
          state.snapshotRevisionState :
          null,
      snapshotExpectedMinimumRevision: Number.isInteger(
        state?.snapshotExpectedMinimumRevision,
      ) ?
        state.snapshotExpectedMinimumRevision :
        null,
      snapshotRevisionGap: Number.isInteger(state?.snapshotRevisionGap) ?
        state.snapshotRevisionGap :
        null,
      snapshotResumeToken:
        typeof state?.snapshotResumeToken === 'string' &&
        state.snapshotResumeToken.length > 0 ?
          state.snapshotResumeToken :
          null,
      publishedActiveNodeIds: Array.isArray(state?.publishedActiveNodeIds) ?
        [...state.publishedActiveNodeIds].sort() :
        [],
      leaders:
        state?.leaders && typeof state.leaders === 'object' ?
          sortObjectKeys(state.leaders) :
          {},
      partitionLeaderAuthority: normalizePartitionLeaderAuthority(
        state?.partitionLeaderAuthority,
      ),
      observationSource: String(state?.observationSource || VALUE_UNKNOWN),
      observationMode: String(
        state?.observationMode || OBSERVATION_MODE_UNKNOWN,
      ),
      controlSnapshotError:
        typeof state?.controlSnapshotError === 'string' &&
        state.controlSnapshotError.length > 0 ?
          state.controlSnapshotError :
          null,
      publicationRecoveryGate: extractPublicationRecoveryGateContract(
        state?.controlPlaneDiagnostics,
      ),
    };
  }
  return stateByNodeId;
}

function findConsistencyStateByNodeId(nodeStates, nodeId) {
  const normalizedNodeId = String(nodeId || '');
  return (Array.isArray(nodeStates) ? nodeStates : []).find(
    (state) => String(state?.nodeId || '') === normalizedNodeId,
  ) || null;
}

function buildDifferingLeaderPartitionIds(referenceState, otherState) {
  const referenceLeaders =
    referenceState?.leaders && typeof referenceState.leaders === 'object' ?
      referenceState.leaders :
      {};
  const otherLeaders =
    otherState?.leaders && typeof otherState.leaders === 'object' ?
      otherState.leaders :
      {};
  return Array.from(
    new Set([...Object.keys(referenceLeaders), ...Object.keys(otherLeaders)]),
  )
    .filter((partitionId) => {
      const referenceLeader = String(referenceLeaders[partitionId] || '');
      const otherLeader = String(otherLeaders[partitionId] || '');
      return referenceLeader !== otherLeader;
    })
    .sort();
}

function buildLeaderEvidenceByPartitionId({
  differingPartitionIds,
  nodeStates,
}) {
  const evidenceByPartitionId = {};
  for (const partitionId of differingPartitionIds) {
    const observerEvidenceByNodeId = {};
    for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
      const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
      const leaders =
        state?.leaders && typeof state.leaders === 'object' ?
          normalizeLeaders(state.leaders) :
          {};
      observerEvidenceByNodeId[nodeId] = {
        leaderNodeId: String(leaders[partitionId] || VALUE_UNKNOWN),
        observationSource: String(state?.observationSource || VALUE_UNKNOWN),
        observationMode: String(
          state?.observationMode || OBSERVATION_MODE_UNKNOWN,
        ),
        publicationEpoch: normalizeConsistencyInteger(state?.publicationEpoch),
        sourceSnapshotVersion: normalizeConsistencyInteger(
          state?.sourceSnapshotVersion,
        ),
        snapshotRevision: normalizeConsistencyInteger(state?.snapshotRevision),
        snapshotRevisionState:
          typeof state?.snapshotRevisionState === 'string' &&
          state.snapshotRevisionState.length > 0 ?
            state.snapshotRevisionState :
            null,
        snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
          state?.snapshotExpectedMinimumRevision,
        ),
        snapshotRevisionGap: normalizeConsistencyInteger(
          state?.snapshotRevisionGap,
        ),
        snapshotResumeToken:
          typeof state?.snapshotResumeToken === 'string' &&
          state.snapshotResumeToken.length > 0 ?
            state.snapshotResumeToken :
            null,
      };
    }
    evidenceByPartitionId[partitionId] = sortObjectKeys(
      observerEvidenceByNodeId,
    );
  }
  return evidenceByPartitionId;
}

function buildObservationModesByNodeId(nodeStates) {
  const observationModesByNodeId = {};
  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    observationModesByNodeId[nodeId] = String(
      state?.observationMode || OBSERVATION_MODE_UNKNOWN,
    );
  }
  return sortObjectKeys(observationModesByNodeId);
}

function resolveFinalConsistencyState(mismatch) {
  if (typeof mismatch?.state === 'string' && mismatch.state.length > 0) {
    return mismatch.state;
  }
  if (
    mismatch?.reasonCode ===
    CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED
  ) {
    return CONSISTENCY_FINAL_STATE_AUTHORITY_DIVERGED;
  }
  if (
    mismatch?.reasonCode ===
    CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG
  ) {
    return CONSISTENCY_FINAL_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG;
  }
  if (
    mismatch?.reasonCode ===
    CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED
  ) {
    return CONSISTENCY_FINAL_STATE_OBSERVER_REPAIR_DEFERRED;
  }
  if (mismatch?.reasonCode === CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE) {
    return CONSISTENCY_FINAL_STATE_OBSERVATION_MODE_MISMATCH;
  }
  if (mismatch?.reasonCode === CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE) {
    return CONSISTENCY_FINAL_STATE_LEADER_MAP_MISMATCH;
  }
  return CONSISTENCY_FINAL_STATE_MISMATCH;
}

function isLeaderEvidenceMismatch(mismatch) {
  return (
    mismatch?.reasonCode === CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE ||
    mismatch?.observedMismatchReasonCode ===
      CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE
  );
}

function buildFinalConsistencyDiagnostics(nodeStates, mismatch) {
  if (!mismatch || typeof mismatch !== 'object') {
    return null;
  }
  const referenceState = findConsistencyStateByNodeId(
    nodeStates,
    mismatch.referenceNodeId,
  );
  const otherState = findConsistencyStateByNodeId(
    nodeStates,
    mismatch.otherNodeId,
  );
  const differingPartitionIds =
    Array.isArray(mismatch.differingPartitionIds) ?
      mismatch.differingPartitionIds :
      isLeaderEvidenceMismatch(mismatch) ?
        buildDifferingLeaderPartitionIds(referenceState, otherState) :
        [];
  return {
    boundary: CONSISTENCY_FINAL_BOUNDARY,
    state: resolveFinalConsistencyState(mismatch),
    reasonCode:
      typeof mismatch.reasonCode === 'string' && mismatch.reasonCode.length > 0 ?
        mismatch.reasonCode :
        CONSISTENCY_REASON_CODE_FINAL_CONSISTENCY_MISMATCH,
    observedMismatchReasonCode:
      typeof mismatch.observedMismatchReasonCode === 'string' &&
      mismatch.observedMismatchReasonCode.length > 0 ?
        mismatch.observedMismatchReasonCode :
        null,
    referenceNodeId: String(mismatch.referenceNodeId || VALUE_UNKNOWN),
    otherNodeId: String(mismatch.otherNodeId || VALUE_UNKNOWN),
    differingPartitionIds,
    leaderEvidenceByPartitionId: buildLeaderEvidenceByPartitionId({
      differingPartitionIds,
      nodeStates,
    }),
    observationModesByNodeId: buildObservationModesByNodeId(nodeStates),
    authorityEvidenceByPartitionId:
      mismatch.authorityEvidenceByPartitionId ||
      buildAuthorityEvidenceByPartitionId(nodeStates, differingPartitionIds),
    revisionBarrier:
      mismatch.revisionBarrier || buildSnapshotRevisionBarrier(nodeStates),
  };
}

function buildConsistencyFailureDiagnostics(mismatch) {
  const reasonCode =
    typeof mismatch?.reasonCode === 'string' && mismatch.reasonCode.length > 0 ?
      mismatch.reasonCode :
      CONSISTENCY_REASON_CODE_FINAL_CONSISTENCY_MISMATCH;
  const laggingNodeIds = Array.isArray(mismatch?.revisionBarrier?.laggingNodeIds) ?
    mismatch.revisionBarrier.laggingNodeIds :
    [];
  const affectedNodeIds =
    laggingNodeIds.length > EMPTY_LIST_LENGTH ?
      laggingNodeIds :
      [
        String(mismatch?.referenceNodeId || VALUE_UNKNOWN),
        String(mismatch?.otherNodeId || VALUE_UNKNOWN),
      ];
  return {
    rootCauseClass:
      reasonCode === CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REVISION_LAG ||
      reasonCode === CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED ||
      reasonCode === CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE ||
      reasonCode === CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG ?
        CONSISTENCY_ROOT_CAUSE_CLASS_CACHE :
        CONSISTENCY_ROOT_CAUSE_CLASS_TOPOLOGY,
    dominantReason: reasonCode,
    reasonCounts: {
      [reasonCode]: CONSISTENCY_SINGLE_REASON_COUNT,
    },
    affectedNodeIds,
  };
}

function buildConsistencyControlPlaneDiagnostics(nodeStates, mismatch) {
  const publicationConvergenceByNodeId = {};
  const snapshotDiagnosticsByNodeId = {};

  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    const convergence = buildPublicationConvergenceFromState(state);
    if (convergence) {
      publicationConvergenceByNodeId[nodeId] = convergence;
    }
    const snapshotDiagnostics = cloneDiagnostics(
      state?.controlPlaneDiagnostics,
    );
    if (snapshotDiagnostics) {
      snapshotDiagnosticsByNodeId[nodeId] = snapshotDiagnostics;
    }
  }

  const hasMismatch = Boolean(mismatch) && typeof mismatch === 'object';
  if (
    Object.keys(publicationConvergenceByNodeId).length === 0 &&
    Object.keys(snapshotDiagnosticsByNodeId).length === 0 &&
    hasMismatch !== true
  ) {
    return null;
  }

  const preferredSnapshotNodeId = String(
    mismatch?.referenceNodeId ||
      (Array.isArray(nodeStates) && nodeStates.length > 0 ?
        nodeStates[0]?.nodeId :
        VALUE_UNKNOWN) ||
      VALUE_UNKNOWN,
  );
  const publicationConvergence =
    publicationConvergenceByNodeId[preferredSnapshotNodeId] ||
    Object.values(publicationConvergenceByNodeId)[0] ||
    null;

  return {
    snapshotNodeId: preferredSnapshotNodeId,
    publicationConvergence,
    publicationConvergenceByNodeId,
    mismatch: {
      ...(mismatch && typeof mismatch === 'object' ? mismatch : {}),
      observedAt: new Date().toISOString(),
    },
    finalConsistency: buildFinalConsistencyDiagnostics(nodeStates, mismatch),
    consistencyStateByNodeId: buildConsistencyStateByNodeId(nodeStates),
    snapshotDiagnosticsByNodeId,
  };
}

function createConsistencyMismatchError(message, options = {}) {
  const error = new Error(message);
  const controlPlaneDiagnostics = buildConsistencyControlPlaneDiagnostics(
    options.nodeStates,
    options.mismatch,
  );
  if (!controlPlaneDiagnostics) {
    return error;
  }
  error.diagnostics = {
    ...(error?.diagnostics && typeof error.diagnostics === 'object' ?
      error.diagnostics :
      {}),
    failure: buildConsistencyFailureDiagnostics(options.mismatch),
    controlPlaneDiagnostics,
  };
  return error;
}

function buildObservationCohortSummary(nodeStates) {
  return {
    controlSnapshotNodeIds: (Array.isArray(nodeStates) ? nodeStates : [])
      .filter(isControlSnapshotObservation)
      .map((state) => String(state?.nodeId || VALUE_UNKNOWN))
      .sort(),
    sqlFallbackNodeIds: (Array.isArray(nodeStates) ? nodeStates : [])
      .filter((state) => !isControlSnapshotObservation(state))
      .map((state) => String(state?.nodeId || VALUE_UNKNOWN))
      .sort(),
  };
}

function buildMixedObservationModeMismatch(nodeStates, cohortState) {
  const summary = buildObservationCohortSummary(nodeStates);
  return buildConsistencyMismatch(
    'Cannot compare consistency from mixed observation modes. ' +
      'Control snapshot nodes: ' +
      JSON.stringify(summary.controlSnapshotNodeIds) +
      '. SQL fallback nodes: ' +
      JSON.stringify(summary.sqlFallbackNodeIds),
    CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE,
    summary.controlSnapshotNodeIds[EMPTY_LIST_LENGTH] || VALUE_UNKNOWN,
    summary.sqlFallbackNodeIds[EMPTY_LIST_LENGTH] || VALUE_UNKNOWN,
    {
      state: CONSISTENCY_FINAL_STATE_OBSERVATION_MODE_MISMATCH,
      observationCohortState: cohortState,
      observationCohort: summary,
    },
  );
}

function resolveConsistencyObservationCohort(nodeStates) {
  const allStates = Array.isArray(nodeStates) ? nodeStates : [];
  const controlSnapshotStates = allStates.filter(isControlSnapshotObservation);
  const sqlFallbackStates = allStates.filter(
    (state) => !isControlSnapshotObservation(state),
  );
  const evidence = Object.freeze({
    allStates,
    controlSnapshotStates,
    sqlFallbackStates,
    controlSnapshotCount: controlSnapshotStates.length,
    sqlFallbackCount: sqlFallbackStates.length,
  });
  const decisionTable = Object.freeze([
    Object.freeze({
      state: CONSISTENCY_OBSERVATION_COHORT_STATE_CONTROL_SNAPSHOT,
      match: (candidate) =>
        candidate.controlSnapshotCount >=
        CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT,
      records: (candidate) => candidate.controlSnapshotStates,
    }),
    Object.freeze({
      state: CONSISTENCY_OBSERVATION_COHORT_STATE_SQL_FALLBACK,
      match: (candidate) =>
        candidate.controlSnapshotCount === EMPTY_LIST_LENGTH &&
        candidate.sqlFallbackCount >=
          CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT,
      records: (candidate) => candidate.sqlFallbackStates,
    }),
    Object.freeze({
      state: CONSISTENCY_OBSERVATION_COHORT_STATE_MIXED_UNAVAILABLE,
      match: (candidate) =>
        candidate.controlSnapshotCount > EMPTY_LIST_LENGTH &&
        candidate.sqlFallbackCount > EMPTY_LIST_LENGTH,
      mismatch: (candidate, state) =>
        buildMixedObservationModeMismatch(candidate.allStates, state),
    }),
  ]);
  for (const decision of decisionTable) {
    if (decision.match(evidence) !== true) {
      continue;
    }
    return {
      state: decision.state,
      records:
        typeof decision.records === 'function' ?
          decision.records(evidence) :
          [],
      mismatch:
        typeof decision.mismatch === 'function' ?
          decision.mismatch(evidence, decision.state) :
          null,
    };
  }
  return {
    state: CONSISTENCY_OBSERVATION_COHORT_STATE_INSUFFICIENT,
    records: [],
    mismatch: buildMixedObservationModeMismatch(
      allStates,
      CONSISTENCY_OBSERVATION_COHORT_STATE_INSUFFICIENT,
    ),
  };
}

/**
 * Assert all reachable nodes agree on cluster state: active
 * nodes, partition assignments, and leader identities.
 *
 * @param {Array<Object>} nodes - NodeHandle instances.
 * @throws {Error} If any disagreement is found.
 */
async function assertConsistency(nodes, options = {}) {
  const forceRepair = options.forceRepair === true;
  const forceAuthoritativeRepair = options.forceAuthoritativeRepair === true;
  const tolerateEmptyLeaders = options.tolerateEmptyLeaders === true;
  const tolerateActiveNodeSkew = options.tolerateActiveNodeSkew === true;
  const maxActiveNodeSkew = Number.isFinite(options.maxActiveNodeSkew) ?
    Math.max(0, Math.floor(options.maxActiveNodeSkew)) :
    1;
  const toleratePartitionSkew = options.toleratePartitionSkew === true;
  const maxPartitionSkew = Number.isFinite(options.maxPartitionSkew) ?
    Math.max(0, Math.floor(options.maxPartitionSkew)) :
    2;
  const queryable = [];
  const reports = [];
  for (const node of nodes) {
    try {
      const report = await probeNodeReachability(node);
      reports.push(report);
      if (report.reachable !== true) {
        continue;
      }
      if (
        typeof node?.getControlSnapshot === 'function' &&
        report.adminReady !== true
      ) {
        continue;
      }
      queryable.push(node);
    } catch (_err) {
      // skip
    }
  }

  if (queryable.length < 2) {
    const summary = summarizeReachabilityReports(reports);
    throw new Error(
      'Cannot assert consistency: fewer than 2 reachable ' +
        'nodes (found ' +
        queryable.length +
        '). Reachability: ' +
        summary,
    );
  }

  const nodeStates = [];
  const queryFailures = [];
  const queryResults = await Promise.all(
    queryable.map(async (node) => {
      try {
        return {
          nodeId: node.id,
          state: await queryNodeConsistencyState(node, {
            forceRepair,
            forceAuthoritativeRepair,
            timeoutMs: options.timeoutMs,
          }),
        };
      } catch (error) {
        return {
          nodeId: node.id,
          error: error?.message || String(error),
        };
      }
    }),
  );
  for (const result of queryResults) {
    if (result?.state) {
      nodeStates.push(result.state);
    } else if (result?.error) {
      queryFailures.push({
        nodeId: result.nodeId,
        error: result.error,
      });
    }
  }

  if (nodeStates.length < 2) {
    const summary = summarizeReachabilityReports(reports);
    const queryFailureSummary = queryFailures
      .map((failure) => failure.nodeId + '=' + failure.error)
      .join('; ');
    throw new Error(
      'Cannot assert consistency: fewer than 2 queryable ' +
        'nodes (found ' +
        nodeStates.length +
        '). Reachability: ' +
        summary +
        (queryFailureSummary ? '. Query failures: ' + queryFailureSummary : ''),
    );
  }

  const observationCohort = resolveConsistencyObservationCohort(nodeStates);
  if (observationCohort.mismatch) {
    throw createConsistencyMismatchError(observationCohort.mismatch.message, {
      nodeStates,
      mismatch: observationCohort.mismatch,
    });
  }

  const comparisonRecords = observationCohort.records.map(
    buildConsistencyComparisonRecordFromState,
  );
  const mismatch = findConsistencyMismatch(comparisonRecords, {
    tolerateEmptyLeaders,
    tolerateActiveNodeSkew,
    maxActiveNodeSkew,
    toleratePartitionSkew,
    maxPartitionSkew,
  });
  if (mismatch) {
    throw createConsistencyMismatchError(mismatch.message, {
      nodeStates,
      mismatch,
    });
  }
}

/**
 * Retry {@link assertConsistency} until all nodes agree or the
 * convergence window expires. This absorbs short-lived CDC
 * propagation skew that is expected after topology changes,
 * restarts, and fault-injection recovery.
 *
 * @param {Array<Object>} nodes - Cluster node handles.
 * @param {Object} [options]
 * @param {number} [options.timeoutMs] - Max convergence window.
 * @param {number} [options.pollIntervalMs] - Delay between retries.
 * @returns {Promise<void>}
 */
async function waitForConsistencyConvergence(nodes, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ?
    options.timeoutMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) ?
    options.pollIntervalMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE_POLL_INTERVAL;
  const forceRepairAfterMs = Number.isFinite(options.forceRepairAfterMs) ?
    options.forceRepairAfterMs :
    TIMEOUTS.CONSISTENCY_CONVERGENCE_FORCE_REPAIR_AFTER;
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const forceRepairThreshold = Date.now() + Math.max(0, forceRepairAfterMs);
  let lastError = null;

  while (Date.now() <= deadline) {
    const forceRepair = Date.now() >= forceRepairThreshold;
    try {
      await assertConsistency(nodes, {
        forceRepair,
        forceAuthoritativeRepair: forceRepair,
        tolerateEmptyLeaders: true,
        tolerateActiveNodeSkew: options.tolerateActiveNodeSkew === true,
        maxActiveNodeSkew: options.maxActiveNodeSkew,
        toleratePartitionSkew: options.toleratePartitionSkew === true,
        maxPartitionSkew: options.maxPartitionSkew,
        timeoutMs: options.snapshotTimeoutMs ?? options.timeoutMs,
      });
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw (
    lastError ||
    new Error('Consistency check did not converge within ' + timeoutMs + 'ms')
  );
}

/**
 * Sort object keys for deterministic JSON comparison.
 *
 * @param {Object} obj - Plain object.
 * @returns {Object} New object with sorted keys.
 */
function sortObjectKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/**
 * Assert consistency from pre-collected control snapshots.
 *
 * Uses the same comparison logic as {@link assertConsistency}
 * but operates on already-fetched evaluator snapshots instead
 * of re-querying each node. This eliminates the CDC
 * propagation race between the evaluator repair cycle and a
 * redundant re-query.
 *
 * Each snapshot must have: nodeId, nodes (array),
 * partitions (array), leaders (object).
 *
 * @param {Array<Object>} snapshots - Control snapshots from
 *   the consistency evaluator (post-repair).
 * @throws {Error} If fewer than 2 snapshots or any
 *   disagreement is found.
 */
function assertConsistencyFromSnapshots(snapshots) {
  const valid = Array.isArray(snapshots) ? snapshots : [];
  if (valid.length < 2) {
    return;
  }
  const normalized = valid.map(buildConsistencyComparisonRecordFromSnapshot);
  const mismatch = findConsistencyMismatch(normalized);
  if (mismatch) {
    throw new Error(mismatch.message);
  }
}

/**
 * Assert data integrity across replicas. Queries the given
 * table on each reachable node and compares results.
 *
 * @param {Array<Object>} nodes - NodeHandle instances.
 * @param {string} table - Table name to query.
 * @param {Array<Object>} expectedRows - Expected row data.
 * @throws {Error} If any node returns different data.
 */
async function assertDataIntegrity(nodes, table, expectedRows) {
  const reachable = [];
  const reports = [];
  for (const node of nodes) {
    try {
      const report = await probeNodeReachability(node);
      reports.push(report);
      if (report.reachable) reachable.push(node);
    } catch (_err) {
      // skip
    }
  }

  if (reachable.length === 0) {
    const summary = summarizeReachabilityReports(reports);
    throw new Error(
      'Cannot assert data integrity: no reachable nodes. Reachability: ' +
        summary,
    );
  }

  const sql = 'SELECT * FROM ' + table + ' ORDER BY rowid';

  const resultsByNode = [];
  for (const node of reachable) {
    const result = await node.query(sql);
    const rows = (result && result.rows) || [];
    resultsByNode.push({nodeId: node.id, rows});
  }

  // Compare each node's rows against expectedRows.
  const expectedStr = JSON.stringify(expectedRows);
  for (const {nodeId, rows} of resultsByNode) {
    const actualStr = JSON.stringify(rows);
    if (actualStr !== expectedStr) {
      throw new Error(
        'Data integrity mismatch on node ' +
          nodeId +
          '. ' +
          'Expected: ' +
          expectedStr +
          '. ' +
          'Actual: ' +
          actualStr,
      );
    }
  }

  // Also compare across nodes for cross-replica consistency.
  if (resultsByNode.length >= 2) {
    const refStr = JSON.stringify(resultsByNode[0].rows);
    for (let i = 1; i < resultsByNode.length; i++) {
      const otherStr = JSON.stringify(resultsByNode[i].rows);
      if (otherStr !== refStr) {
        throw new Error(
          'Cross-replica data mismatch between ' +
            resultsByNode[0].nodeId +
            ' and ' +
            resultsByNode[i].nodeId +
            ' for table ' +
            table,
        );
      }
    }
  }
}

export const ASSERTIONS_SEGMENT_3 = {
  SERVICES_QUERY,
  NODES_QUERY,
  PARTITIONS_QUERY,
  CONTROL_SNAPSHOT_REQUIRED_ERROR_PREFIX,
  CONVERGENCE_REACHABILITY_TIMEOUT_MS,
  CONVERGENCE_CONTROL_SNAPSHOT_TIMEOUT_MS,
  ADMIN_SOCKET_LANE_DEFAULT,
  ADMIN_SOCKET_LANE_SNAPSHOT,
  RAFT_ROLE_LEARNER,
  REACHABILITY_SUMMARY_SEPARATOR,
  REACHABILITY_SUMMARY_SOURCE_UNKNOWN,
  REACHABILITY_SUMMARY_ERROR_NONE,
  STATUS_LEADER,
  STATUS_UNKNOWN,
  VALUE_UNKNOWN,
  VALUE_NONE,
  VALUE_UNAVAILABLE,
  REPLICA_MEMBERSHIP_SEPARATOR,
  REPLICA_MEMBER_SEPARATOR,
  MEMBER_SNIPPET_PREFIX,
  MEMBER_SNIPPET_SUFFIX,
  MEMBER_REPLICA_PREFIX,
  MEMBER_LEADER_PREFIX,
  MEMBER_VOTER_PREFIX,
  MEMBER_VOTER_SEPARATOR,
  SNIPPET_EXTRA_PREFIX,
  SNIPPET_EXTRA_SUFFIX,
  PARTITION_MEMBERSHIP_SNIPPET_LIMIT,
  PARTITION_REPLICA_SNIPPET_LIMIT,
  OPERATION_HISTORY_LIMIT,
  OPERATION_HISTORY_SNIPPET_LIMIT,
  OPERATION_HISTORY_SEPARATOR,
  OPERATION_HISTORY_AT_PREFIX,
  OPERATION_FIELD_CANDIDATE_IDS,
  OPERATION_FIELD_CANDIDATE_PARTITION_IDS,
  OPERATION_FIELD_CANDIDATE_TYPES,
  OPERATION_FIELD_CANDIDATE_STATUSES,
  OPERATION_FIELD_CANDIDATE_FROM_NODE_IDS,
  OPERATION_FIELD_CANDIDATE_TO_NODE_IDS,
  OPERATION_FIELD_CANDIDATE_TIMESTAMPS,
  CONTROL_SNAPSHOT_FIELD_NODES,
  CONTROL_SNAPSHOT_FIELD_PUBLISHED_NODES,
  CONTROL_SNAPSHOT_FIELD_PROJECTED_NODES,
  CONTROL_SNAPSHOT_FIELD_PARTITIONS,
  CONTROL_SNAPSHOT_FIELD_LEADERS,
  CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY,
  CONTROL_SNAPSHOT_FIELD_VOTER_COUNTS,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_STATE,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_EXPECTED_MINIMUM_REVISION,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION_GAP,
  CONTROL_SNAPSHOT_FIELD_SNAPSHOT_RESUME_TOKEN,
  CONTROL_SNAPSHOT_FIELD_REPLICA_OPERATIONS,
  CONTROL_SNAPSHOT_FIELD_IN_FLIGHT_COUNT,
  CONTROL_SNAPSHOT_FIELD_STATUS_HISTOGRAM,
  CONTROL_SNAPSHOT_FIELD_ROWS,
  CONTROL_SNAPSHOT_FIELD_PARTITION_MEMBERSHIP,
  CONTROL_SNAPSHOT_FIELD_REPLICA_ROLE_DIAGNOSTICS,
  CONTROL_SNAPSHOT_FIELD_ACTIVE_NODE_VIEWS,
  REPLICA_ROLE_DIAGNOSTICS_LEADER_NODE_IDS,
  CONTROL_SNAPSHOT_FIELD_REPLICA_ROLES,
  REPLICA_ROLE_LEADER,
  LEADER_ADDRESS_PATH_SEPARATOR,
  UUID_PREFIX_PATTERN,
  normalizeLeaderAddress,
  normalizeLeaders,
  hasConflictingLeaders,
  isTolerableActiveNodeSkew,
  isTolerablePartitionSkew,
  probeNodeReachability,
  summarizeReachabilityReports,
  isVoterReady,
  countVotersPerPartition,
  extractLeaders,
  supplementPartitionIdsFromServiceTopology,
  updateOverTargetState,
  finalizeOverTargetState,
  normalizeStatusCountMap,
  normalizeVoterCountMap,
  extractControlSnapshotPayload,
  extractControlSnapshotNodeIds,
  extractControlSnapshotPublishedNodeIds,
  extractControlSnapshotProjectedNodeIds,
  extractControlSnapshotPartitionIds,
  extractControlSnapshotLeaders,
  extractControlSnapshotPartitionLeaderAuthority,
  extractControlSnapshotVoterCounts,
  extractControlSnapshotInFlightSummary,
  extractControlSnapshotOperationRows,
  extractControlSnapshotPartitionMembership,
  extractControlSnapshotPublicationConvergence,
  extractControlSnapshotControlPlaneDiagnostics,
  extractControlSnapshotRevisionMetadata,
  queryControlSnapshot,
  queryNodeConsistencyStateViaSql,
  queryConvergenceSnapshotViaSql,
  queryNodeConsistencyState,
  isControlSnapshotObservation,
  resolveSnapshotExpectedPartitionIds,
  buildConvergenceSnapshotDebt,
  compareConvergenceSnapshotDebt,
  isConvergedSnapshot,
  queryReachableClusterSnapshot,
  waitForConvergence,
  buildPartitionMembership,
  compareReplicaMembershipEntries,
  formatPartitionMembershipSnippet,
  formatSinglePartitionMembershipSnippet,
  formatReplicaMembershipEntry,
  summarizeReplicaOperations,
  normalizeReplicaOperationRow,
  pickFirstFieldValue,
  parseTimestampMs,
  formatOperationHistorySnippet,
  formatOperationHistoryEntry,
  cloneDiagnostics,
  buildPublicationConvergenceFromState,
  buildConsistencyStateByNodeId,
  buildConsistencyControlPlaneDiagnostics,
  createConsistencyMismatchError,
  assertConsistency,
  waitForConsistencyConvergence,
  sortObjectKeys,
  assertConsistencyFromSnapshots,
  assertDataIntegrity,
};
