import {CLUSTER_SEGMENT_1} from './cluster-segment-1.js';
import {
  TYPEOF_OBJECT,
  TYPEOF_STRING,
  normalizeDistinctStringArray,
  normalizeFirstNonEmptyDistinctStringArray,
} from './cluster-active-wait-normalization.js';

const {
  ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK,
  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
  ACTIVE_PROBE_REASON_CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
  ACTIVE_PROBE_REASON_PRIORITY_RECOVERY_PENDING,
  ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING,
  ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_BOOTSTRAP_JOIN_DURING_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_TRAFFIC_GATE_DURING_RECOVERY,
  ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
  ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING,
  ACTIVE_WAIT_PUBLICATION_STATUS_PREPARED,
  ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED,
  ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHING,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  INVARIANT_SEVERITY,
  UNKNOWN_STATE,
  ZERO,
} = CLUSTER_SEGMENT_1;

const PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD = Object.freeze({});
const PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT = Object.freeze({
  BLOCKED: 'blocked',
  DETAIL_SEPARATOR: '#',
  EMPTY: '',
  MISSING_PUBLISHED_PREFIX: 'missingPublished=',
  NONE: 'none',
  OBJECT_TYPE: 'object',
  PENDING_ACK_PREFIX: 'pendingAck=',
  READY: 'ready',
  REASON_SEPARATOR: ',',
  RECOVERY_PREFIX: 'recovery=',
  REASONS: 'reasons',
  STATUS_PREFIX: 'status=',
  STRING_TYPE: 'string',
});
const ACTIVE_WAIT_PUBLICATION_STATUS_UNKNOWN = UNKNOWN_STATE;
const ACTIVE_WAIT_PUBLICATION_STATUS_RANK = Object.freeze({
  PUBLISHED: 3,
  ACK_PENDING: 2,
  PUBLISHING_OR_PREPARED: 1,
});
const ACTIVE_WAIT_PUBLICATION_CONVERGENCE_REASONS_EMPTY = Object.freeze([]);
const PUBLICATION_CONVERGENCE_GATE_SUMMARY_DECISION_TABLE = Object.freeze([
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.NONE,
    matches: (evidence) => evidence.recordPresent !== true,
  }),
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.REASONS,
    matches: (evidence) => evidence.reasons.length > ZERO,
  }),
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.BLOCKED,
    matches: (evidence) => evidence.openDebtPresent === true,
  }),
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.READY,
    matches: (evidence) => evidence.ready === true,
  }),
  Object.freeze({
    summary: PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.BLOCKED,
    matches: () => true,
  }),
]);
const ACTIVE_WAIT_RECOVERY_PROTOCOL_STATE = Object.freeze({
  STEADY_PUBLISHED: 'steady_published',
});
const ACTIVE_GATE_OWNER_COHORT_FIELD = Object.freeze({
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME:
    'membershipPublicationHandoffOutcome',
  MISSING_PUBLISHED_COUNT: 'missingPublishedCount',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  PENDING_RECOVERY_COUNT: 'pendingRecoveryCount',
  PENDING_RECOVERY_NODE_IDS: 'pendingRecoveryNodeIds',
  PENDING_RECONCILE_COUNT: 'pendingReconcileCount',
  PENDING_RECONCILE_NODE_IDS: 'pendingReconcileNodeIds',
  REASON_CODE: 'reasonCode',
  NEXT_ACTION: 'nextAction',
  RUNTIME_PROMOTION_ALLOWED: 'runtimePromotionAllowed',
  STATE: 'state',
});
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD = Object.freeze({
  ENQUEUED: 'enqueued',
  REASON_CODE: 'reasonCode',
  RETRY_AFTER_MS: 'retryAfterMs',
  STATE: 'state',
});

function normalizeActiveGateOwnerCohortRecord(value) {
  return value && typeof value === TYPEOF_OBJECT && !Array.isArray(value) ?
    value :
    null;
}

function normalizeActiveGateOwnerCohortString(value) {
  return typeof value === TYPEOF_STRING && value.length > ZERO ? value : null;
}

function normalizeActiveGateOwnerCohortNodeIds(record, fieldName) {
  return normalizeDistinctStringArray(record?.[fieldName]);
}

function normalizeActiveGateOwnerCohortCount(record, countField, nodeIds) {
  const explicitCount =
    Number.isInteger(record?.[countField]) && record[countField] >= ZERO ?
      record[countField] :
      ZERO;
  return Math.max(nodeIds.length, explicitCount);
}

function resolveSteadyPublishedSelectedMissingCount({
  expectedNodeCount = ZERO,
  publicationStatus = PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY,
  recoveryProtocolState = null,
  priorityPartitionSummary = null,
  pendingAckNodeIds = [],
  selectedPublishedActiveNodeIds = [],
  selectedMissingPublishedNodeIds = [],
} = {}) {
  const normalizedExpectedNodeCount =
    Number.isInteger(expectedNodeCount) && expectedNodeCount > ZERO ?
      expectedNodeCount :
      ZERO;
  const normalizedPendingAckNodeIds =
    normalizeDistinctStringArray(pendingAckNodeIds);
  const normalizedSelectedPublishedActiveNodeIds =
    normalizeDistinctStringArray(selectedPublishedActiveNodeIds);
  const normalizedSelectedMissingPublishedNodeIds =
    normalizeDistinctStringArray(selectedMissingPublishedNodeIds);
  const steadyPublishedSelection =
    publicationStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED &&
    normalizedPendingAckNodeIds.length === ZERO &&
    normalizedSelectedPublishedActiveNodeIds.length > ZERO &&
    normalizedSelectedMissingPublishedNodeIds.length > ZERO &&
    normalizedSelectedPublishedActiveNodeIds.length +
      normalizedSelectedMissingPublishedNodeIds.length ===
      normalizedExpectedNodeCount &&
    (
      recoveryProtocolState ===
        ACTIVE_WAIT_RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED ||
      priorityPartitionSummary?.satisfied === true
    );
  return steadyPublishedSelection === true ?
    normalizedSelectedMissingPublishedNodeIds.length :
    ZERO;
}

function resolveStartupPublicationLagSelectedMissingCount({
  readinessMode = UNKNOWN_STATE,
  expectedNodeCount = ZERO,
  publicationStatus = PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY,
  pendingAckNodeIds = [],
  selectedPublishedActiveNodeIds = [],
  selectedMissingPublishedNodeIds = [],
} = {}) {
  const normalizedExpectedNodeCount =
    Number.isInteger(expectedNodeCount) && expectedNodeCount > ZERO ?
      expectedNodeCount :
      ZERO;
  const normalizedPendingAckNodeIds =
    normalizeDistinctStringArray(pendingAckNodeIds);
  const normalizedSelectedPublishedActiveNodeIds =
    normalizeDistinctStringArray(selectedPublishedActiveNodeIds);
  const normalizedSelectedMissingPublishedNodeIds =
    normalizeDistinctStringArray(selectedMissingPublishedNodeIds);
  const startupPublicationLagSelection =
    readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
    publicationStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED &&
    normalizedPendingAckNodeIds.length === ZERO &&
    normalizedSelectedPublishedActiveNodeIds.length > ZERO &&
    normalizedSelectedMissingPublishedNodeIds.length > ZERO &&
    normalizedSelectedPublishedActiveNodeIds.length +
      normalizedSelectedMissingPublishedNodeIds.length ===
      normalizedExpectedNodeCount;
  return startupPublicationLagSelection === true ?
    normalizedSelectedMissingPublishedNodeIds.length :
    ZERO;
}

function evaluatePriorityRecoveryCrossServiceInvariants(options = {}) {
  const readinessMode =
    options.readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      CLUSTER_READINESS_MODE_LOAD :
      CLUSTER_READINESS_MODE_STARTUP;
  const publicationConvergenceGate =
    options.publicationConvergenceGate &&
    typeof options.publicationConvergenceGate === 'object' ?
      options.publicationConvergenceGate :
      {ready: true, reasons: []};
  const gateReasons = normalizeDistinctStringArray(
    publicationConvergenceGate.reasons,
  );
  const nodeDiagnostics = Array.isArray(options.nodeDiagnostics) ?
    options.nodeDiagnostics :
    [];
  const prioritySpreadPending = gateReasons.includes(
    ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING,
  );
  const bootstrapAdmittedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.active === true &&
        diagnostic?.activitySource ===
          ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficBlockedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.activitySource ===
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
        diagnostic?.active === false,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficPriorityRecoveryBlockedNodeIds = nodeDiagnostics
    .filter((diagnostic) => {
      if (
        diagnostic?.activitySource !==
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS ||
        diagnostic?.active !== false
      ) {
        return false;
      }
      const reasons = normalizeDistinctStringArray(diagnostic?.reasons);
      return (
        reasons.includes(ACTIVE_PROBE_REASON_PRIORITY_SPREAD_PENDING) ||
        reasons.includes(ACTIVE_PROBE_REASON_PRIORITY_RECOVERY_PENDING) ||
        reasons.includes(
          ACTIVE_PROBE_REASON_CONTROL_PLANE_DEPENDENCY_UNAVAILABLE,
        )
      );
    })
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const trafficAdmittedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.activitySource ===
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS &&
        diagnostic?.active === true,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const nonTrafficAdmittedNodeIds = nodeDiagnostics
    .filter(
      (diagnostic) =>
        diagnostic?.active === true &&
        diagnostic?.activitySource !==
          ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
    )
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const admittedNodeIds = normalizeDistinctStringArray([
    ...trafficAdmittedNodeIds,
    ...nonTrafficAdmittedNodeIds,
  ]);
  const readinessTimeoutFallbackAdmittedNodeIds = nodeDiagnostics
    .filter((diagnostic) => {
      if (
        diagnostic?.active !== true ||
        diagnostic?.activitySource !==
          ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK
      ) {
        return false;
      }
      const reasons = normalizeDistinctStringArray(diagnostic?.reasons);
      return reasons.some((reason) =>
        reason.startsWith(
          ACTIVE_PROBE_REASON_READINESS_TIMEOUT_FALLBACK_PREFIX,
        ),
      );
    })
    .map((diagnostic) => String(diagnostic.nodeId || ''))
    .filter((nodeId) => nodeId.length > ZERO);
  const deferredAdmittedNodeIds =
    readinessMode === CLUSTER_READINESS_MODE_LOAD && prioritySpreadPending ?
      readinessTimeoutFallbackAdmittedNodeIds :
      [];
  const deferredAdmittedNodeIdSet = new Set(deferredAdmittedNodeIds);
  const effectiveAdmittedNodeIds = admittedNodeIds.filter((nodeId) => {
    return !deferredAdmittedNodeIdSet.has(nodeId);
  });
  const expectedBlockedNodeCount = nodeDiagnostics.length;
  const observedBlockedNodeCount = Math.max(
    ZERO,
    expectedBlockedNodeCount - effectiveAdmittedNodeIds.length,
  );
  const invariants = [];

  const bootstrapJoinDuringRecoveryPassed =
    readinessMode === CLUSTER_READINESS_MODE_STARTUP ?
      !prioritySpreadPending || bootstrapAdmittedNodeIds.length > ZERO :
      true;
  invariants.push({
    id: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY,
    invariantId:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_BOOTSTRAP_JOIN_DURING_RECOVERY,
    reasonCode:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_BOOTSTRAP_JOIN_DURING_RECOVERY,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
    owningSubsystem: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
    passed: bootstrapJoinDuringRecoveryPassed,
    details: {
      mode: readinessMode,
      prioritySpreadPending,
      bootstrapAdmittedNodeIds,
    },
  });

  const trafficGateDuringRecoveryPassed =
    readinessMode === CLUSTER_READINESS_MODE_LOAD ?
      !prioritySpreadPending ||
        (expectedBlockedNodeCount > ZERO &&
          effectiveAdmittedNodeIds.length === ZERO) :
      true;
  invariants.push({
    id: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY,
    invariantId:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_TRAFFIC_GATE_DURING_PRIORITY_RECOVERY,
    reasonCode:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_TRAFFIC_GATE_DURING_RECOVERY,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
    owningSubsystem: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
    passed: trafficGateDuringRecoveryPassed,
    details: {
      mode: readinessMode,
      prioritySpreadPending,
      expectedBlockedNodeCount,
      observedBlockedNodeCount,
      trafficBlockedNodeIds,
      trafficPriorityRecoveryBlockedNodeIds,
      trafficAdmittedNodeIds,
      nonTrafficAdmittedNodeIds,
      observedAdmittedNodeIds: admittedNodeIds,
      deferredAdmittedNodeIds,
      violatingNodeIds: effectiveAdmittedNodeIds,
    },
  });

  const clusterActiveRequiresConvergencePassed =
    options.allActive === true ?
      publicationConvergenceGate.ready === true :
      true;
  invariants.push({
    id: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
    invariantId:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_ID_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
    reasonCode:
      ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_REASON_CLUSTER_ACTIVE_REQUIRES_CONVERGENCE,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_SCOPE_CLUSTER,
    owningSubsystem: ACTIVE_WAIT_PRIORITY_RECOVERY_INVARIANT_OWNING_SUBSYSTEM,
    passed: clusterActiveRequiresConvergencePassed,
    details: {
      mode: readinessMode,
      allActive: options.allActive === true,
      publicationConvergenceReady: publicationConvergenceGate.ready === true,
      publicationConvergenceReasons: gateReasons,
    },
  });

  const failingInvariantIds = invariants
    .filter((invariant) => invariant.passed !== true)
    .map((invariant) => invariant.id);
  const failingInvariantReasonCodes = invariants
    .filter((invariant) => invariant.passed !== true)
    .map((invariant) => invariant.reasonCode)
    .filter(
      (reasonCode) =>
        typeof reasonCode === 'string' && reasonCode.length > ZERO,
    );
  return {
    invariants: Object.freeze(
      invariants.map((invariant) =>
        Object.freeze({
          ...invariant,
          details: Object.freeze({...invariant.details}),
        }),
      ),
    ),
    failingInvariantIds: Object.freeze(failingInvariantIds),
    failingInvariantReasonCodes: Object.freeze(failingInvariantReasonCodes),
    passed: failingInvariantIds.length === ZERO,
  };
}

function normalizePublicationConvergenceGateText(value) {
  if (typeof value !==
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.STRING_TYPE) {
    return PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY;
  }
  const trimmed = value.trim();
  return trimmed.length > ZERO ?
    trimmed :
    PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY;
}

function normalizePublicationConvergenceGateRecord(value) {
  if (
    value &&
    typeof value === PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.OBJECT_TYPE
  ) {
    return value;
  }
  return PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD;
}

function isPublicationConvergenceGateRecordPresent(value) {
  return normalizePublicationConvergenceGateRecord(value) !==
    PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD;
}

function selectPublicationConvergenceGateStatus(candidates) {
  const normalizedStatuses = candidates
    .map((candidate) => normalizeActiveWaitPublicationStatus(candidate))
    .filter((candidate) => candidate);
  if (normalizedStatuses.length === ZERO) {
    return PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY;
  }
  return normalizedStatuses.sort(comparePublicationConvergenceGateStatusDebt)[
    ZERO
  ];
}

function comparePublicationConvergenceGateStatusDebt(left, right) {
  const leftRank = resolveActiveWaitPublicationStatusRank(left);
  const rightRank = resolveActiveWaitPublicationStatusRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.localeCompare(right);
}

function selectPublicationConvergenceGateText(candidates) {
  for (const candidate of candidates) {
    const normalizedText = normalizePublicationConvergenceGateText(candidate);
    if (normalizedText.length > ZERO) {
      return normalizedText;
    }
  }
  return PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.EMPTY;
}

function normalizePublicationConvergenceGateCount(countCandidates, nodeIdGroups) {
  const explicitCount = countCandidates.find((candidate) =>
    Number.isInteger(candidate) && candidate > ZERO,
  );
  if (Number.isInteger(explicitCount) && explicitCount > ZERO) {
    return explicitCount;
  }
  return normalizeDistinctStringArray(nodeIdGroups.flat()).length;
}

function buildPublicationConvergenceGateSummaryEvidence(
  publicationConvergenceGate,
  activeGateEvidence = PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD,
) {
  const gateRecordPresent = isPublicationConvergenceGateRecordPresent(
    publicationConvergenceGate,
  );
  const gateRecord = normalizePublicationConvergenceGateRecord(
    publicationConvergenceGate,
  );
  const evidenceRecord = normalizePublicationConvergenceGateRecord(
    activeGateEvidence,
  );
  const progressSnapshot = normalizePublicationConvergenceGateRecord(
    evidenceRecord.progressSnapshot,
  );
  const snapshotCoverage = isPublicationConvergenceGateRecordPresent(
    evidenceRecord.snapshotCoverage,
  ) ?
    normalizePublicationConvergenceGateRecord(evidenceRecord.snapshotCoverage) :
    evidenceRecord;
  const selectedPublicationConvergenceGate =
    normalizePublicationConvergenceGateRecord(
      snapshotCoverage.selectedPublicationConvergenceGate,
    );
  const selectedPublicationConvergence =
    normalizePublicationConvergenceGateRecord(
      snapshotCoverage.selectedPublicationConvergence,
    );
  const reasons = gateRecordPresent ?
    normalizeDistinctStringArray(gateRecord.reasons) :
    [];
  const status = selectPublicationConvergenceGateStatus([
    gateRecord.publicationStatus,
    progressSnapshot.publicationStatus,
    selectedPublicationConvergenceGate.publicationStatus,
    selectedPublicationConvergence.publicationStatus,
    selectedPublicationConvergence.status,
  ]);
  const recoveryProtocolState = selectPublicationConvergenceGateText([
    gateRecord.recoveryProtocolState,
    progressSnapshot.recoveryProtocolState,
    selectedPublicationConvergenceGate.recoveryProtocolState,
    selectedPublicationConvergence.recoveryProtocolState,
  ]);
  const pendingAckCount = normalizePublicationConvergenceGateCount(
    [
      gateRecord.pendingAckCount,
      progressSnapshot.pendingAckCount,
      selectedPublicationConvergenceGate.pendingAckCount,
      selectedPublicationConvergence.pendingAckCount,
    ],
    [
      gateRecord.pendingAckNodeIds,
      progressSnapshot.pendingAckNodeIds,
      snapshotCoverage.selectedPendingAckNodeIds,
      selectedPublicationConvergenceGate.pendingAckNodeIds,
      selectedPublicationConvergence.pendingAckNodeIds,
    ],
  );
  const missingPublishedCount = normalizePublicationConvergenceGateCount(
    [
      gateRecord.missingPublishedCount,
      progressSnapshot.missingPublishedCount,
      selectedPublicationConvergenceGate.missingPublishedCount,
      selectedPublicationConvergence.missingPublishedCount,
    ],
    [
      gateRecord.missingPublishedNodeIds,
      progressSnapshot.selectedMissingPublishedNodeIds,
      snapshotCoverage.selectedMissingPublishedNodeIds,
      selectedPublicationConvergenceGate.missingPublishedNodeIds,
      selectedPublicationConvergence.missingPublishedNodeIds,
    ],
  );
  const statusOpen =
    status.length > ZERO &&
    status !== ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED;
  return {
    recordPresent: gateRecordPresent,
    ready:
      gateRecordPresent &&
      gateRecord.ready === true &&
      reasons.length === ZERO &&
      statusOpen !== true &&
      pendingAckCount === ZERO &&
      missingPublishedCount === ZERO,
    reasons,
    status,
    recoveryProtocolState,
    pendingAckCount,
    missingPublishedCount,
    statusOpen,
    openDebtPresent:
      statusOpen ||
      pendingAckCount > ZERO ||
      missingPublishedCount > ZERO,
  };
}

function formatPublicationConvergenceGateDetails(evidence) {
  return [
    {
      include: evidence.statusOpen === true,
      value:
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.STATUS_PREFIX +
        evidence.status,
    },
    {
      include:
        evidence.openDebtPresent === true &&
        evidence.recoveryProtocolState.length > ZERO,
      value:
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.RECOVERY_PREFIX +
        evidence.recoveryProtocolState,
    },
    {
      include: evidence.pendingAckCount > ZERO,
      value:
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.PENDING_ACK_PREFIX +
        String(evidence.pendingAckCount),
    },
    {
      include: evidence.missingPublishedCount > ZERO,
      value:
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.MISSING_PUBLISHED_PREFIX +
        String(evidence.missingPublishedCount),
    },
  ]
    .filter((detail) => detail.include === true)
    .map((detail) => detail.value);
}

function formatPublicationConvergenceGate(
  publicationConvergenceGate,
  activeGateEvidence = PUBLICATION_CONVERGENCE_GATE_EMPTY_RECORD,
) {
  const evidence = buildPublicationConvergenceGateSummaryEvidence(
    publicationConvergenceGate,
    activeGateEvidence,
  );
  const decision =
    PUBLICATION_CONVERGENCE_GATE_SUMMARY_DECISION_TABLE.find((entry) =>
      entry.matches(evidence),
    );
  const summary =
    decision?.summary === PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.REASONS ?
      evidence.reasons.join(
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.REASON_SEPARATOR,
      ) :
      decision?.summary ||
        PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.BLOCKED;
  const details = formatPublicationConvergenceGateDetails(evidence);
  if (details.length === ZERO) {
    return summary;
  }
  return summary +
    PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.DETAIL_SEPARATOR +
    details.join(
      PUBLICATION_CONVERGENCE_GATE_SUMMARY_TEXT.DETAIL_SEPARATOR,
    );
}

function normalizeActiveWaitPublicationStatus(status) {
  if (typeof status !== TYPEOF_STRING) {
    return ACTIVE_WAIT_PUBLICATION_STATUS_UNKNOWN;
  }
  const normalized = status.trim().toUpperCase();
  return normalized.length > ZERO ?
    normalized :
    ACTIVE_WAIT_PUBLICATION_STATUS_UNKNOWN;
}

function resolveActiveWaitPublicationStatusRank(status) {
  const normalizedStatus = normalizeActiveWaitPublicationStatus(status);
  if (normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED) {
    return ACTIVE_WAIT_PUBLICATION_STATUS_RANK.PUBLISHED;
  }
  if (normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING) {
    return ACTIVE_WAIT_PUBLICATION_STATUS_RANK.ACK_PENDING;
  }
  if (
    normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHING ||
    normalizedStatus === ACTIVE_WAIT_PUBLICATION_STATUS_PREPARED
  ) {
    return ACTIVE_WAIT_PUBLICATION_STATUS_RANK.PUBLISHING_OR_PREPARED;
  }
  return ZERO;
}

export {
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
};
