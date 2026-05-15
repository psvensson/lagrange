import {NUM, SERVICE_STATUS, SERVICE_TYPE, TYPEOF} from '../constants/index.js';
import {
  buildActiveMembershipSnapshot,
  buildReadinessByNodeId,
  resolveActiveNodeViews,
  resolvePriorityRecoveryActiveNodeCohort,
} from './active-node-projection.js';
import {
  buildMembershipLifecycleSummary,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
} from './membership-lifecycle-constants.js';
import {
  normalizeControlPlanePublicationRow,
  normalizeNodeRow,
  normalizeServiceRow,
} from './system-row-normalizers.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from './control-plane-publication-merge.js';
import {
  buildPriorityRecoveryClosureWitness,
  buildPriorityRecoveryDecisionSnapshots,
  hasPriorityRecoverySpreadGap,
} from './priority-recovery-snapshot.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from './control-plane-readiness-constants.js';
import {buildRecoveryProtocolSnapshot} from './recovery-protocol-snapshot.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
  buildPartitionRowByPartitionId,
  isPriorityControlPlanePartition,
  resolvePriorityControlPlanePartitionIds,
} from '../bootstrap/system-partition-classification.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  buildMembershipEpochFence,
  buildMembershipEpochSnapshot,
} from './membership-epoch-contract.js';

const LOCAL_STR_EMPTY = '';
const READINESS_REASON_CODE_KEY = 'code';
const READINESS_REASON_CODES_KEY = 'reasonCodes';
const READINESS_REASONS_KEY = 'reasons';

const MEMBERSHIP_PUBLICATION_STATUS = CONTROL_PLANE_PUBLICATION_STATUS;
const PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT = 3;
const AUTHORITATIVE_MEMBERSHIP_CHANGED_REASON = 'authoritative_membership_changed';
const PRIORITY_RECOVERY_PENDING_PUBLICATION_DIMENSIONS = Object.freeze({
  [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
});
const MEMBERSHIP_PUBLICATION_TARGET_STATE = Object.freeze({
  EXPLICIT_PUBLICATION: 'explicit_publication',
  OBSERVED_ACTIVE: 'observed_active',
  PROJECTED_STEADY_TRIM: 'projected_steady_trim',
  RECOVERY_COHORT: 'recovery_cohort',
});
const MEMBERSHIP_PUBLICATION_TARGET_DECISION_ORDER = Object.freeze([
  MEMBERSHIP_PUBLICATION_TARGET_STATE.EXPLICIT_PUBLICATION,
  MEMBERSHIP_PUBLICATION_TARGET_STATE.PROJECTED_STEADY_TRIM,
  MEMBERSHIP_PUBLICATION_TARGET_STATE.RECOVERY_COHORT,
  MEMBERSHIP_PUBLICATION_TARGET_STATE.OBSERVED_ACTIVE,
]);
const MEMBERSHIP_PUBLICATION_ACK_COMPLETION_STATE = Object.freeze({
  COMPLETE: 'complete',
  PENDING: 'pending',
});
const MEMBERSHIP_PUBLICATION_ACK_CARRY_STATE = Object.freeze({
  RECOVERY_ELIGIBLE_ACK: 'recovery_eligible_ack',
  OBSERVED_ACK: 'observed_ack',
});
const MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE = Object.freeze({
  ELIGIBLE: 'eligible',
  DEFERRED: 'deferred',
});
const MEMBERSHIP_PUBLICATION_ACK_READINESS_REASON = Object.freeze({
  RECOVERY_ELIGIBLE: 'recovery_eligible',
});
const MEMBERSHIP_PUBLICATION_ACK_READINESS_RULES = Object.freeze([
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE,
    reasonCodes: Object.freeze([
      MEMBERSHIP_PUBLICATION_ACK_READINESS_REASON.RECOVERY_ELIGIBLE,
    ]),
    matches: (dimensions) =>
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true &&
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
      ] === true &&
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
      ] !== false,
  }),
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.DEFERRED,
    reasonCodes: Object.freeze([
      CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
    ]),
    matches: (dimensions) =>
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === false,
  }),
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE,
    reasonCodes: Object.freeze([]),
    matches: () => true,
  }),
]);
const MEMBERSHIP_PUBLICATION_ACK_CARRY_RULES = Object.freeze([
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_CARRY_STATE.RECOVERY_ELIGIBLE_ACK,
    nodeIds: (evidence) => [
      ...evidence.observedAcknowledgedNodeIds,
      ...evidence.publishableRecoveryActiveNodeIds,
    ],
    matches: (evidence) =>
      evidence.publicationChanged !== true &&
      evidence.publishableRecoveryActiveNodeIds.length > NUM.ZERO,
  }),
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_CARRY_STATE.OBSERVED_ACK,
    nodeIds: (evidence) => evidence.observedAcknowledgedNodeIds,
    matches: () => true,
  }),
]);

function normalizePartitionIdList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || LOCAL_STR_EMPTY).trim())
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort();
}

function normalizeBlockedPriorityPartition(
  entry,
  requiredDistinctNodeCount = NUM.ZERO,
  helperFns = {},
) {
  if (!entry || typeof entry !== TYPEOF.OBJECT) {
    return null;
  }
  const partitionId = String(entry.partitionId || entry.partition_id || '').trim();
  if (!partitionId) {
    return null;
  }
  const normalizedRequiredDistinctNodeCount = helperFns.normalizePositiveInteger(
    entry.requiredDistinctNodeCount ?? entry.required_distinct_node_count,
    requiredDistinctNodeCount,
  );
  const readyDistinctNodeCount = helperFns.normalizePositiveInteger(
    entry.readyDistinctNodeCount ?? entry.ready_distinct_node_count,
    NUM.ZERO,
  );
  const readyReplicaCount = helperFns.normalizePositiveInteger(
    entry.readyReplicaCount ?? entry.ready_replica_count,
    readyDistinctNodeCount,
  );
  const spreadGap = helperFns.normalizePositiveInteger(
    entry.spreadGap ?? entry.spread_gap,
    Math.max(NUM.ZERO, normalizedRequiredDistinctNodeCount - readyDistinctNodeCount),
  );
  return {
    partitionId,
    requiredDistinctNodeCount: normalizedRequiredDistinctNodeCount,
    readyDistinctNodeCount,
    readyReplicaCount,
    spreadGap,
  };
}

function normalizePriorityPartitionSummary(summary, options = {}, helperFns = {}) {
  if (!summary || typeof summary !== TYPEOF.OBJECT) {
    return null;
  }
  const fallbackRequiredDistinctNodeCount = helperFns.normalizePositiveInteger(
    options.requiredDistinctNodeCount,
    NUM.ZERO,
  );
  const requiredDistinctNodeCount = helperFns.normalizePositiveInteger(
    summary.requiredDistinctNodeCount ?? summary.required_distinct_node_count,
    fallbackRequiredDistinctNodeCount,
  );
  const blockedPartitions = (
    Array.isArray(summary.blockedPartitions) ? summary.blockedPartitions : []
  )
    .map((entry) =>
      normalizeBlockedPriorityPartition(entry, requiredDistinctNodeCount, helperFns),
    )
    .filter(Boolean)
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
  const missingPartitionIds = normalizePartitionIdList([
    ...(Array.isArray(summary.missingPartitionIds) ? summary.missingPartitionIds : []),
    ...blockedPartitions.map((entry) => entry.partitionId),
  ]);
  const readyEligibleNodeCount = helperFns.normalizePositiveInteger(
    summary.readyEligibleNodeCount ?? summary.ready_eligible_node_count,
    helperFns.normalizePositiveInteger(options.readyEligibleNodeCount, NUM.ZERO),
  );
  const totalPriorityPartitionCount = helperFns.normalizePositiveInteger(
    summary.totalPriorityPartitionCount ?? summary.total_priority_partition_count,
    PRIORITY_CONTROL_PLANE_TABLE_IDS.size,
  );
  const satisfied =
    summary.satisfied === true &&
    missingPartitionIds.length === NUM.ZERO &&
    blockedPartitions.length === NUM.ZERO;
  return {
    satisfied,
    requiredDistinctNodeCount,
    readyEligibleNodeCount,
    totalPriorityPartitionCount,
    missingPartitionIds,
    blockedPartitions,
  };
}

function buildPriorityPartitionSummaryAdvancement(summary, helperFns = {}) {
  const normalizedSummary = normalizePriorityPartitionSummary(summary, {}, helperFns);
  if (normalizedSummary === null) {
    return null;
  }
  let blockedPartitionSpreadGap = NUM.ZERO;
  let blockedPartitionReadyDistinctNodeCount = NUM.ZERO;
  for (const blockedPartition of normalizedSummary.blockedPartitions) {
    blockedPartitionSpreadGap += helperFns.normalizePositiveInteger(
      blockedPartition.spreadGap,
      NUM.ZERO,
    );
    blockedPartitionReadyDistinctNodeCount += helperFns.normalizePositiveInteger(
      blockedPartition.readyDistinctNodeCount,
      NUM.ZERO,
    );
  }
  return {
    normalizedSummary,
    satisfiedRank: normalizedSummary.satisfied === true ? NUM.ONE : NUM.ZERO,
    missingPartitionCount: normalizedSummary.missingPartitionIds.length,
    blockedPartitionCount: normalizedSummary.blockedPartitions.length,
    blockedPartitionSpreadGap,
    blockedPartitionReadyDistinctNodeCount,
  };
}

function comparePriorityPartitionSummaryAdvancement(leftSummary, rightSummary, helperFns = {}) {
  const leftAdvancement = buildPriorityPartitionSummaryAdvancement(leftSummary, helperFns);
  const rightAdvancement = buildPriorityPartitionSummaryAdvancement(rightSummary, helperFns);
  if (leftAdvancement === null || rightAdvancement === null) {
    return NUM.ZERO;
  }
  const decisiveDelta = [
    leftAdvancement.satisfiedRank - rightAdvancement.satisfiedRank,
    rightAdvancement.missingPartitionCount - leftAdvancement.missingPartitionCount,
    rightAdvancement.blockedPartitionCount - leftAdvancement.blockedPartitionCount,
    rightAdvancement.blockedPartitionSpreadGap - leftAdvancement.blockedPartitionSpreadGap,
    leftAdvancement.blockedPartitionReadyDistinctNodeCount -
      rightAdvancement.blockedPartitionReadyDistinctNodeCount,
    leftAdvancement.normalizedSummary.readyEligibleNodeCount -
      rightAdvancement.normalizedSummary.readyEligibleNodeCount,
  ].find((delta) => delta !== NUM.ZERO);
  return typeof decisiveDelta === TYPEOF.NUMBER ? decisiveDelta : NUM.ZERO;
}

function chooseMoreAdvancedPriorityPartitionSummary(
  baselineSummary,
  candidateSummary,
  helperFns = {},
) {
  const normalizedBaselineSummary = normalizePriorityPartitionSummary(
    baselineSummary,
    {},
    helperFns,
  );
  const normalizedCandidateSummary = normalizePriorityPartitionSummary(
    candidateSummary,
    {},
    helperFns,
  );
  if (normalizedBaselineSummary === null) {
    return normalizedCandidateSummary;
  }
  if (normalizedCandidateSummary === null) {
    return normalizedBaselineSummary;
  }
  return comparePriorityPartitionSummaryAdvancement(
    normalizedCandidateSummary,
    normalizedBaselineSummary,
    helperFns,
  ) > NUM.ZERO ?
    normalizedCandidateSummary :
    normalizedBaselineSummary;
}

function arePriorityPartitionSummariesEqual(leftSummary, rightSummary, helperFns = {}) {
  const left = normalizePriorityPartitionSummary(leftSummary, {}, helperFns);
  const right = normalizePriorityPartitionSummary(rightSummary, {}, helperFns);
  if (left === null || right === null) {
    return left === right;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function areMembershipLifecycleSummariesEqual(leftSummary, rightSummary) {
  const left =
    leftSummary && typeof leftSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(leftSummary) :
      null;
  const right =
    rightSummary && typeof rightSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(rightSummary) :
      null;
  if (left === null || right === null) {
    return left === right;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function listHasMembershipLifecycleNodeAdvance(
  baselineNodeIds = [],
  candidateNodeIds = [],
  helperFns = {},
) {
  const baselineNodeIdSet = new Set(helperFns.normalizeNodeIdList(baselineNodeIds));
  return helperFns.normalizeNodeIdList(candidateNodeIds).some(
    (nodeId) => !baselineNodeIdSet.has(nodeId),
  );
}

function hasMembershipLifecycleSummaryProjectionAdvance(
  baselineSummary,
  candidateSummary,
  helperFns = {},
) {
  const baselineProjectionDiagnostics =
    baselineSummary?.projectionDiagnostics &&
      typeof baselineSummary.projectionDiagnostics === TYPEOF.OBJECT ?
      baselineSummary.projectionDiagnostics :
      {};
  const candidateProjectionDiagnostics =
    candidateSummary?.projectionDiagnostics &&
      typeof candidateSummary.projectionDiagnostics === TYPEOF.OBJECT ?
      candidateSummary.projectionDiagnostics :
      {};
  return [
    listHasMembershipLifecycleNodeAdvance(
      baselineSummary?.projectedServingNodeIds,
      candidateSummary?.projectedServingNodeIds,
      helperFns,
    ),
    listHasMembershipLifecycleNodeAdvance(
      baselineSummary?.locallyEligibleNodeIds,
      candidateSummary?.locallyEligibleNodeIds,
      helperFns,
    ),
    listHasMembershipLifecycleNodeAdvance(
      baselineSummary?.recoveryActiveNodeIds,
      candidateSummary?.recoveryActiveNodeIds,
      helperFns,
    ),
    listHasMembershipLifecycleNodeAdvance(
      baselineSummary?.missingPublishedRecoveryActiveNodeIds,
      candidateSummary?.missingPublishedRecoveryActiveNodeIds,
      helperFns,
    ),
    listHasMembershipLifecycleNodeAdvance(
      baselineProjectionDiagnostics.recoveryEligibleIncludedNodeIds,
      candidateProjectionDiagnostics.recoveryEligibleIncludedNodeIds,
      helperFns,
    ),
    baselineProjectionDiagnostics.recoveryEligibleProjectionEnabled !== true &&
      candidateProjectionDiagnostics.recoveryEligibleProjectionEnabled === true,
  ].some(Boolean);
}

function hasMembershipLifecycleSummaryProjectionEvidence(summary, helperFns = {}) {
  if (!summary || typeof summary !== TYPEOF.OBJECT) {
    return false;
  }
  const projectionDiagnostics =
    summary.projectionDiagnostics &&
      typeof summary.projectionDiagnostics === TYPEOF.OBJECT ?
      summary.projectionDiagnostics :
      {};
  return [
    summary.projectedServingNodeIds,
    summary.locallyEligibleNodeIds,
    summary.recoveryActiveNodeIds,
    summary.missingPublishedRecoveryActiveNodeIds,
    projectionDiagnostics.recoveryEligibleIncludedNodeIds,
    projectionDiagnostics.livenessFallbackIncludedNodeIds,
    projectionDiagnostics.runtimeAuthorityIncludedNodeIds,
  ].some((nodeIds) =>
    helperFns.normalizeNodeIdList(nodeIds).length > NUM.ZERO,
  );
}

function hasPublishedMembershipAuthoritativeRefreshDebt(
  publicationRow,
  helperFns = {},
) {
  const publishedActiveNodeIds = helperFns.normalizeNodeIdList(
    publicationRow?.publishedActiveNodeIds,
  );
  if (publishedActiveNodeIds.length === NUM.ZERO) {
    return false;
  }
  return hasMembershipLifecycleSummaryProjectionEvidence(
    publicationRow?.membershipLifecycleSummary,
    helperFns,
  ) !== true;
}

function chooseMembershipLifecycleSummaryBase(
  planningMembershipLifecycleSummary,
  derivedMembershipLifecycleSummary,
  helperFns = {},
) {
  const derivedSummary = buildMembershipLifecycleSummary(
    derivedMembershipLifecycleSummary,
  );
  if (
    !planningMembershipLifecycleSummary ||
    typeof planningMembershipLifecycleSummary !== TYPEOF.OBJECT
  ) {
    return derivedSummary;
  }
  const planningSummary = buildMembershipLifecycleSummary(
    planningMembershipLifecycleSummary,
  );
  return hasMembershipLifecycleSummaryProjectionAdvance(
    planningSummary,
    derivedSummary,
    helperFns,
  ) ?
    derivedSummary :
    planningSummary;
}

function normalizePriorityRecoveryClosureWitness(value) {
  return value && typeof value === TYPEOF.OBJECT ?
    value :
    null;
}

function normalizeReadinessReasonCodeValue(reason) {
  if (typeof reason === TYPEOF.STRING) {
    return reason;
  }
  if (
    reason &&
    typeof reason === TYPEOF.OBJECT &&
    typeof reason[READINESS_REASON_CODE_KEY] === TYPEOF.STRING
  ) {
    return reason[READINESS_REASON_CODE_KEY];
  }
  return LOCAL_STR_EMPTY;
}

function normalizeReadinessReasonCodes(readinessEntry = null) {
  if (!readinessEntry || typeof readinessEntry !== TYPEOF.OBJECT) {
    return [];
  }
  return normalizePartitionIdList([
    ...(Array.isArray(readinessEntry[READINESS_REASON_CODES_KEY]) ?
      readinessEntry[READINESS_REASON_CODES_KEY] :
      []),
    ...(Array.isArray(readinessEntry[READINESS_REASONS_KEY]) ?
      readinessEntry[READINESS_REASONS_KEY].map((reason) =>
        normalizeReadinessReasonCodeValue(reason),
      ) :
      []),
  ]);
}

function resolveReadinessDimensions(readinessEntry = null) {
  return readinessEntry?.dimensions &&
    typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
    readinessEntry.dimensions :
    null;
}

function hasPriorityRecoveryPendingPublicationRepairEvidence(
  readinessEntry = null,
) {
  if (!readinessEntry || typeof readinessEntry !== TYPEOF.OBJECT) {
    return false;
  }
  const priorityRecoveryPending = normalizeReadinessReasonCodes(
    readinessEntry,
  ).includes(
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  );
  if (priorityRecoveryPending !== true) {
    return false;
  }
  const dimensions = resolveReadinessDimensions(readinessEntry);
  return dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !==
    false;
}

function buildPublicationPlanningReadinessEntry(readinessEntry = null) {
  if (
    hasPriorityRecoveryPendingPublicationRepairEvidence(readinessEntry) !== true
  ) {
    return readinessEntry;
  }
  return {
    ...readinessEntry,
    dimensions: {
      ...(resolveReadinessDimensions(readinessEntry) || {}),
      ...PRIORITY_RECOVERY_PENDING_PUBLICATION_DIMENSIONS,
    },
  };
}

function buildPublicationPlanningReadinessByNodeId(options = {}) {
  const readinessByNodeId = buildReadinessByNodeId(options);
  return Object.keys(readinessByNodeId)
    .sort()
    .reduce((accumulator, nodeId) => {
      accumulator[nodeId] = buildPublicationPlanningReadinessEntry(
        readinessByNodeId[nodeId],
      );
      return accumulator;
    }, {});
}

function buildPriorityRecoveryDecisionPublicationConvergence(options = {}, helperFns = {}) {
  const latestPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublicationRow,
  );
  const latestPublishedPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublishedPublicationRow,
  );
  const publicationEpoch = helperFns.normalizePositiveInteger(
    latestPublicationRow?.publicationEpoch ??
      latestPublishedPublicationRow?.publicationEpoch,
    null,
  );
  const publicationStatus =
    typeof latestPublicationRow?.status === TYPEOF.STRING &&
      latestPublicationRow.status.length > NUM.ZERO ?
      latestPublicationRow.status :
      typeof latestPublishedPublicationRow?.status === TYPEOF.STRING &&
        latestPublishedPublicationRow.status.length > NUM.ZERO ?
        latestPublishedPublicationRow.status :
        MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
  return {
    publicationEpoch,
    publicationStatus,
    publishedActiveNodeIds: options.publishedActiveNodeIds,
    pendingAckNodeIds: options.pendingAckNodeIds,
    priorityPartitionSummary: options.priorityPartitionSummary,
    membershipLifecycleSummary: options.membershipLifecycleSummary,
    recoveryActiveNodeIds: options.recoveryActiveNodeIds,
    recoveryActiveNodeSource: options.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds:
      options.missingPublishedRecoveryActiveNodeIds,
  };
}

function buildPriorityRecoveryClosureEvidence(options = {}, helperFns = {}) {
  const retainedPriorityRecoveryClosureWitness =
    normalizePriorityRecoveryClosureWitness(
      options.priorityRecoveryPlanningSnapshot?.priorityRecoveryClosureWitness,
    );
  const replicaOperationRows = Array.isArray(options.replicaOperationRows) ?
    options.replicaOperationRows :
    [];
  const closureShortcut = [
    {
      matches: Boolean(retainedPriorityRecoveryClosureWitness),
      priorityRecoveryClosureWitness: retainedPriorityRecoveryClosureWitness,
      priorityRecoveryDecisionSnapshots: null,
    },
    {
      matches: replicaOperationRows.length === NUM.ZERO,
      priorityRecoveryClosureWitness: null,
      priorityRecoveryDecisionSnapshots: null,
    },
  ].find((entry) => entry.matches === true);
  if (closureShortcut) {
    return {
      priorityRecoveryClosureWitness:
        closureShortcut.priorityRecoveryClosureWitness,
      priorityRecoveryDecisionSnapshots:
        closureShortcut.priorityRecoveryDecisionSnapshots,
    };
  }
  const priorityRecoveryDecisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
    capturedAt: helperFns.normalizePositiveInteger(options.nowMs, null),
    publicationConvergence:
      buildPriorityRecoveryDecisionPublicationConvergence(options, helperFns),
    readinessByNodeId: options.readinessByNodeId,
    workflowAdmissionsByWorkflowId: {},
    replicaOperationRows,
    serviceRows: options.serviceRows,
  });
  return {
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness:
      normalizePriorityRecoveryClosureWitness(
        priorityRecoveryDecisionSnapshots?.closureWitness,
      ) || buildPriorityRecoveryClosureWitness({
        decisionSnapshots: priorityRecoveryDecisionSnapshots,
        priorityPartitionSummary: options.priorityPartitionSummary,
      }),
  };
}

function isReadinessPromotable(readinessEntry = null) {
  const dimensions =
    readinessEntry?.dimensions && typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
      readinessEntry.dimensions :
      null;
  if (!dimensions) {
    return true;
  }
  const hasPublicationSignal =
    Object.hasOwn(dimensions, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED) ||
    Object.hasOwn(dimensions, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE);
  if (!hasPublicationSignal) {
    return (
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== false
    );
  }
  if (dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] === true) {
    return (
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === true &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] !== false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== false &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== false
    );
  }
  return dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true;
}

function buildPrioritySpreadEligibleNodeIdSet(options = {}, helperFns = {}) {
  const preferredNodeIds = helperFns.normalizeNodeIdList(
    options.locallyEligibleNodeIds?.length > NUM.ZERO ?
      options.locallyEligibleNodeIds :
      options.projectedServingNodeIds?.length > NUM.ZERO ?
        options.projectedServingNodeIds :
        options.publishedActiveNodeIds,
  );
  if (preferredNodeIds.length > NUM.ZERO) {
    return new Set(preferredNodeIds);
  }
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const promotableNodeIds = helperFns.normalizeNodeIdList(
    Object.keys(readinessByNodeId).filter((nodeId) =>
      isReadinessPromotable(readinessByNodeId[nodeId]),
    ),
  );
  return new Set(promotableNodeIds);
}

function isPrioritySpreadReadyReplica(normalizedService, readinessByNodeId = {}) {
  if (!normalizedService || typeof normalizedService !== TYPEOF.OBJECT) {
    return false;
  }
  if (
    normalizedService.serviceType !== SERVICE_TYPE.PARTITION ||
    normalizedService.status !== SERVICE_STATUS.ACTIVE ||
    !normalizedService.raftRole ||
    !normalizedService.address ||
    !normalizedService.nodeId
  ) {
    return false;
  }
  if (normalizedService.raftRole !== RAFT_ROLE.LEARNER) {
    return true;
  }
  return isReadinessPromotable(readinessByNodeId[normalizedService.nodeId] || null);
}

function buildDerivedPriorityPartitionSummary(options = {}, helperFns = {}) {
  const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : [];
  if (serviceRows.length === NUM.ZERO) {
    return null;
  }
  const partitionRows = Array.isArray(options.partitionRows) ? options.partitionRows : [];
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const partitionRowByPartitionId = buildPartitionRowByPartitionId(partitionRows);
  const readyReplicaStatsByPartitionId = new Map();
  let observedPriorityServiceRow = false;
  const eligibleNodeIds = buildPrioritySpreadEligibleNodeIdSet(options, helperFns);
  for (const serviceRow of serviceRows) {
    const normalizedService = normalizeServiceRow(serviceRow);
    const partitionId = normalizedService.partitionId;
    const partitionRow = partitionRowByPartitionId.get(partitionId) || null;
    if (!isPriorityControlPlanePartition({partitionId, partitionRow})) {
      continue;
    }
    observedPriorityServiceRow = true;
    if (!isPrioritySpreadReadyReplica(normalizedService, readinessByNodeId)) {
      continue;
    }
    if (eligibleNodeIds.size > NUM.ZERO && !eligibleNodeIds.has(normalizedService.nodeId)) {
      continue;
    }
    if (!readyReplicaStatsByPartitionId.has(partitionId)) {
      readyReplicaStatsByPartitionId.set(partitionId, {
        readyReplicaCount: NUM.ZERO,
        nodeIds: new Set(),
      });
    }
    const stats = readyReplicaStatsByPartitionId.get(partitionId);
    stats.readyReplicaCount += NUM.ONE;
    stats.nodeIds.add(normalizedService.nodeId);
  }
  const observedPriorityPartitionRow = partitionRows.some((partitionRow) =>
    isPriorityControlPlanePartition({partitionRow}),
  );
  if (!observedPriorityServiceRow && !observedPriorityPartitionRow) {
    return null;
  }
  const priorityPartitionIds = resolvePriorityControlPlanePartitionIds({
    partitionRows,
    serviceRows,
    partitionRowByPartitionId,
    includeInitialWhenMissing: true,
  });
  if (eligibleNodeIds.size === NUM.ZERO) {
    for (const stats of readyReplicaStatsByPartitionId.values()) {
      for (const nodeId of stats.nodeIds) {
        eligibleNodeIds.add(nodeId);
      }
    }
  }
  const requiredDistinctNodeCount = Math.min(
    PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
    eligibleNodeIds.size,
  );
  const blockedPartitions = [];
  for (const partitionId of priorityPartitionIds) {
    const stats = readyReplicaStatsByPartitionId.get(partitionId) || {
      readyReplicaCount: NUM.ZERO,
      nodeIds: new Set(),
    };
    const readyDistinctNodeCount = stats.nodeIds.size;
    const spreadGap = Math.max(NUM.ZERO, requiredDistinctNodeCount - readyDistinctNodeCount);
    if (requiredDistinctNodeCount <= NUM.ONE || spreadGap <= NUM.ZERO) {
      continue;
    }
    blockedPartitions.push({
      partitionId,
      requiredDistinctNodeCount,
      readyDistinctNodeCount,
      readyReplicaCount: stats.readyReplicaCount,
      spreadGap,
    });
  }
  return normalizePriorityPartitionSummary(
    {
      satisfied: blockedPartitions.length === NUM.ZERO,
      requiredDistinctNodeCount,
      readyEligibleNodeCount: eligibleNodeIds.size,
      totalPriorityPartitionCount: priorityPartitionIds.length,
      missingPartitionIds: blockedPartitions.map((entry) => entry.partitionId),
      blockedPartitions,
    },
    {
      requiredDistinctNodeCount,
      readyEligibleNodeCount: eligibleNodeIds.size,
    },
    helperFns,
  );
}

function buildPublicationMetadataRefreshRow(options = {}, helperFns = {}) {
  const publicationRow = options.publicationRow;
  if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
    return publicationRow;
  }
  const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
  const acknowledgedNodeIds = Array.isArray(options.acknowledgedNodeIds) ?
    helperFns.normalizeNodeIdList(options.acknowledgedNodeIds) :
    normalizedPublication.acknowledgedNodeIds;
  const priorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary ?? normalizedPublication.priorityPartitionSummary,
    {},
    helperFns,
  );
  const membershipLifecycleSummary =
    options.membershipLifecycleSummary &&
    typeof options.membershipLifecycleSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(options.membershipLifecycleSummary) :
      normalizedPublication.membershipLifecycleSummary &&
          typeof normalizedPublication.membershipLifecycleSummary === TYPEOF.OBJECT ?
        buildMembershipLifecycleSummary(normalizedPublication.membershipLifecycleSummary) :
        null;
  return {
    ...publicationRow,
    acknowledged_node_ids: acknowledgedNodeIds,
    acknowledgedNodeIds,
    priority_partition_summary: priorityPartitionSummary,
    priorityPartitionSummary,
    membership_lifecycle_summary: membershipLifecycleSummary,
    membershipLifecycleSummary,
    updated_at: helperFns.normalizePositiveInteger(options.nowMs, Date.now()),
    transition_history: Array.isArray(publicationRow.transition_history) ?
      publicationRow.transition_history :
      normalizedPublication.transitionHistory,
  };
}

function shouldAllowRecoveryEligibleProjection(options = {}, helperFns = {}) {
  const latestPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublicationRow,
  );
  const latestPublishedPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublishedPublicationRow,
  );
  const latestVisiblePublicationRow = latestPublicationRow || latestPublishedPublicationRow;
  const latestPublicationStatus = String(latestVisiblePublicationRow?.status || '').toUpperCase();
  if (
    !latestVisiblePublicationRow ||
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
  ) {
    return false;
  }
  if (latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
    return true;
  }
  const prioritySpreadGapPending = hasPriorityRecoverySpreadGap(
    latestPublicationRow?.priorityPartitionSummary ||
      latestPublishedPublicationRow?.priorityPartitionSummary,
  );
  if (prioritySpreadGapPending) {
    return true;
  }
  if (options.observedRecoveryProjectionGap === true) {
    return true;
  }
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(options.publishedBaselineNodeIds);
  if (publishedBaselineNodeIds.length === NUM.ZERO) {
    return false;
  }
  const defaultObservedNodeIds = helperFns.normalizeNodeIdList(
    helperFns.resolveObservedActiveNodeIds({
      ...options,
      readinessByNodeId: options.readinessByNodeId,
    }),
  );
  const recoveryEligibleObservedNodeIds = helperFns.normalizeNodeIdList(
    helperFns.resolveObservedActiveNodeIds({
      ...options,
      readinessByNodeId: options.readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: true,
    }),
  );
  return recoveryEligibleObservedNodeIds.some(
    (nodeId) =>
      !publishedBaselineNodeIds.includes(nodeId) &&
      !defaultObservedNodeIds.includes(nodeId) &&
      isReadinessPromotable(options.readinessByNodeId?.[nodeId] || null),
  );
}

function shouldPreferAuthoritativeMembershipState(options = {}, helperFns = {}) {
  if (options.preferAuthoritativeRead === true || options.requireAuthoritative === true) {
    return true;
  }
  const publicationRows = [
    helperFns.normalizeLatestPublicationRow(options.latestPublicationRow),
    helperFns.normalizeLatestPublicationRow(options.latestPublishedPublicationRow),
  ];
  return publicationRows.some((row) => {
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return false;
    }
    const publicationStatus = String(row.status || '').toUpperCase();
    if (publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
      return (
        hasPriorityRecoverySpreadGap(row.priorityPartitionSummary) ||
        hasPublishedMembershipAuthoritativeRefreshDebt(row, helperFns)
      );
    }
    if (
      publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
      publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
    ) {
      return false;
    }
    return (
      row.publishedActiveNodeIdsPresent === true ||
      (Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO) ||
      (Array.isArray(row.requiredAckNodeIds) && row.requiredAckNodeIds.length > NUM.ZERO) ||
      (Array.isArray(row.acknowledgedNodeIds) && row.acknowledgedNodeIds.length > NUM.ZERO)
    );
  });
}

function buildPublishedMemberStates(options = {}, helperFns = {}) {
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(options.publishedBaselineNodeIds);
  const desiredPublishedNodeIds = helperFns.normalizeNodeIdList(options.desiredPublishedNodeIds);
  const projectedServingNodeIds = helperFns.normalizeNodeIdList(options.projectedServingNodeIds);
  const suspectedOrTransitioningNodeIds = helperFns.normalizeNodeIdList(
    options.suspectedOrTransitioningNodeIds,
  );
  const recoveryEpochByNodeId = options.recoveryEpochByNodeId || {};
  const explicitRetiredNodeIds = new Set(
    helperFns.normalizeNodeIdList(options.explicitRetiredNodeIds),
  );
  const states = {};
  const allNodeIds = helperFns.normalizeNodeIdList([
    ...publishedBaselineNodeIds,
    ...desiredPublishedNodeIds,
    ...projectedServingNodeIds,
    ...suspectedOrTransitioningNodeIds,
    ...Object.keys(recoveryEpochByNodeId),
    ...explicitRetiredNodeIds,
  ]);
  for (const nodeId of allNodeIds) {
    const latestEpoch = recoveryEpochByNodeId[nodeId] || null;
    const recoveryOpen = latestEpoch?.open === true;
    if (explicitRetiredNodeIds.has(nodeId)) {
      states[nodeId] = MEMBERSHIP_MEMBER_STATE.RETIRED;
      continue;
    }
    if (desiredPublishedNodeIds.includes(nodeId)) {
      if (!publishedBaselineNodeIds.includes(nodeId)) {
        states[nodeId] =
          recoveryOpen ?
            MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
            MEMBERSHIP_MEMBER_STATE.JOINING;
        continue;
      }
      if (!projectedServingNodeIds.includes(nodeId)) {
        states[nodeId] = MEMBERSHIP_MEMBER_STATE.UNREACHABLE;
        continue;
      }
      states[nodeId] =
        recoveryOpen ?
          MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
          MEMBERSHIP_MEMBER_STATE.SERVING;
      continue;
    }
    if (projectedServingNodeIds.includes(nodeId)) {
      states[nodeId] =
        recoveryOpen ?
          MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
          MEMBERSHIP_MEMBER_STATE.JOINING;
      continue;
    }
    if (publishedBaselineNodeIds.includes(nodeId)) {
      states[nodeId] = MEMBERSHIP_MEMBER_STATE.UNREACHABLE;
    }
  }
  return states;
}

function buildProjectionDiagnosticsSummary(activeNodeViews = null, helperFns = {}) {
  const projectionDiagnostics =
    activeNodeViews?.projectionDiagnostics &&
    typeof activeNodeViews.projectionDiagnostics === TYPEOF.OBJECT ?
      activeNodeViews.projectionDiagnostics :
      null;
  if (!projectionDiagnostics) {
    return null;
  }
  return {
    readinessDecisionMode:
      typeof projectionDiagnostics.readinessDecisionMode === TYPEOF.STRING &&
      projectionDiagnostics.readinessDecisionMode.length > NUM.ZERO ?
        projectionDiagnostics.readinessDecisionMode :
        null,
    readinessDecisionDimensions: helperFns.normalizeStringList(
      projectionDiagnostics.readinessDecisionDimensions,
    ),
    recoveryEligibleProjectionEnabled:
      projectionDiagnostics.recoveryEligibleProjectionEnabled === true,
    recoveryEligibleIncludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.recoveryEligibleIncludedNodeIds,
    ),
    livenessFallbackIncludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.livenessFallbackIncludedNodeIds,
    ),
    readinessExcludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.readinessExcludedNodeIds,
    ),
    clusterMemberUnhealthyExcludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds,
    ),
  };
}

function buildMembershipPublicationTargetEvidence(options = {}, helperFns = {}) {
  const explicitPublishedNodeIds = helperFns.normalizeNodeIdList(
    options.explicitPublishedNodeIds,
  );
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(
    options.publishedBaselineNodeIds,
  );
  const projectedServingNodeIds = helperFns.normalizeNodeIdList(
    options.projectedServingNodeIds,
  );
  const recoveryActiveNodeIds = helperFns.normalizeNodeIdList(
    options.recoveryActiveNodeIds,
  );
  const observedActiveNodeIds = helperFns.normalizeNodeIdList(
    options.observedActiveNodeIds,
  );
  const projectedServingNodeIdSet = new Set(projectedServingNodeIds);
  const publishedTrimDebt =
    publishedBaselineNodeIds.length > NUM.ZERO &&
    projectedServingNodeIds.length > NUM.ZERO &&
    publishedBaselineNodeIds.some(
      (nodeId) => !projectedServingNodeIdSet.has(nodeId),
    );
  const canPublishSteadyTrim =
    publishedTrimDebt &&
    options.priorityRecoverySpreadGapPending !== true &&
    options.observedRecoveryProjectionGap !== true &&
    options.membershipFreezeActive !== true;
  return {
    decisions: Object.freeze({
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.EXPLICIT_PUBLICATION]:
        explicitPublishedNodeIds.length > NUM.ZERO,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.PROJECTED_STEADY_TRIM]:
        canPublishSteadyTrim,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.RECOVERY_COHORT]:
        publishedBaselineNodeIds.length > NUM.ZERO,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.OBSERVED_ACTIVE]: true,
    }),
    nodeIdsByState: Object.freeze({
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.EXPLICIT_PUBLICATION]:
        explicitPublishedNodeIds,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.PROJECTED_STEADY_TRIM]:
        projectedServingNodeIds,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.RECOVERY_COHORT]:
        recoveryActiveNodeIds,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.OBSERVED_ACTIVE]:
        observedActiveNodeIds,
    }),
  };
}

function resolveMembershipPublicationTargetState(evidence = {}) {
  return MEMBERSHIP_PUBLICATION_TARGET_DECISION_ORDER.find(
    (state) => evidence.decisions?.[state] === true,
  ) || MEMBERSHIP_PUBLICATION_TARGET_STATE.OBSERVED_ACTIVE;
}

function buildMembershipPublicationTargetSnapshot(options = {}, helperFns = {}) {
  const evidence = buildMembershipPublicationTargetEvidence(options, helperFns);
  const state = resolveMembershipPublicationTargetState(evidence);
  return {
    state,
    nodeIds: evidence.nodeIdsByState[state] || [],
  };
}

function buildPublicationAcknowledgementReadinessDecision(readinessEntry = null) {
  const dimensions =
    readinessEntry?.dimensions && typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
      readinessEntry.dimensions :
      null;
  if (!dimensions) {
    return {
      state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE,
      eligible: true,
      reasonCodes: [],
    };
  }
  const decision = MEMBERSHIP_PUBLICATION_ACK_READINESS_RULES.find((rule) =>
    rule.matches(dimensions),
  );
  const reasonCodes = decision.state ===
    MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE ?
    [] :
    normalizePartitionIdList(decision.reasonCodes);
  const eligible =
    decision.state === MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE;
  return {
    state: decision.state,
    eligible,
    reasonCodes,
  };
}

function buildPublicationAckTargetSnapshot(options = {}, helperFns = {}) {
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(
    options.publishedBaselineNodeIds,
  );
  const recoveryActiveNodeIds = helperFns.normalizeNodeIdList(
    options.recoveryActiveNodeIds,
  );
  const recoveryEligibleIncludedNodeIds = helperFns.normalizeNodeIdList(
    options.recoveryEligibleIncludedNodeIds,
  );
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const publishedBaselineNodeIdSet = new Set(publishedBaselineNodeIds);
  const recoveryEligibleIncludedNodeIdSet = new Set(recoveryEligibleIncludedNodeIds);
  const deferredNodeIds = [];
  const deferralReasonCodesByNodeId = {};
  const publishableRecoveryActiveNodeIds = [];

  for (const nodeId of recoveryActiveNodeIds) {
    const needsAcknowledgementReadiness =
      !publishedBaselineNodeIdSet.has(nodeId) &&
      recoveryEligibleIncludedNodeIdSet.has(nodeId);
    const readinessDecision = needsAcknowledgementReadiness ?
      buildPublicationAcknowledgementReadinessDecision(
        readinessByNodeId[nodeId] || null,
      ) :
      {
        state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE,
        eligible: true,
        reasonCodes: [],
      };
    if (readinessDecision.eligible === true) {
      publishableRecoveryActiveNodeIds.push(nodeId);
      continue;
    }
    deferredNodeIds.push(nodeId);
    deferralReasonCodesByNodeId[nodeId] = readinessDecision.reasonCodes;
  }

  return {
    publishableRecoveryActiveNodeIds:
      helperFns.normalizeNodeIdList(publishableRecoveryActiveNodeIds),
    deferredNodeIds: helperFns.normalizeNodeIdList(deferredNodeIds),
    deferralReasonCodesByNodeId: Object.keys(deferralReasonCodesByNodeId)
      .sort()
      .reduce((accumulator, nodeId) => {
        accumulator[nodeId] = deferralReasonCodesByNodeId[nodeId];
        return accumulator;
      }, {}),
  };
}

function buildPublicationAckProjectionDiagnostics(
  projectionDiagnostics,
  publicationAckTargetSnapshot,
) {
  const normalizedProjectionDiagnostics =
    projectionDiagnostics && typeof projectionDiagnostics === TYPEOF.OBJECT ?
      projectionDiagnostics :
      {};
  return {
    ...normalizedProjectionDiagnostics,
    publicationAckDeferredNodeIds:
      publicationAckTargetSnapshot.deferredNodeIds,
    publicationAckDeferralReasonCodesByNodeId:
      publicationAckTargetSnapshot.deferralReasonCodesByNodeId,
  };
}

function hasRecoveryEligiblePublicationRepairEvidence(options = {}, helperFns = {}) {
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(
    options.publishedBaselineNodeIds,
  );
  const publishableRecoveryActiveNodeIds = helperFns.normalizeNodeIdList(
    options.publishableRecoveryActiveNodeIds,
  );
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const publishedBaselineNodeIdSet = new Set(publishedBaselineNodeIds);

  return publishableRecoveryActiveNodeIds.some((nodeId) => {
    if (publishedBaselineNodeIdSet.has(nodeId)) {
      return false;
    }
    const dimensions = readinessByNodeId[nodeId]?.dimensions;
    return dimensions &&
      typeof dimensions === TYPEOF.OBJECT &&
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true;
  });
}

function buildMembershipPublicationAckCompletionSnapshot(options = {}, helperFns = {}) {
  const requiredAckNodeIds = helperFns.normalizeNodeIdList(
    options.requiredAckNodeIds,
  );
  const acknowledgedNodeIds = helperFns.normalizeNodeIdList(
    options.acknowledgedNodeIds,
  );
  const pendingAckNodeIds = requiredAckNodeIds.filter(
    (nodeId) => !acknowledgedNodeIds.includes(nodeId),
  );
  const state =
    requiredAckNodeIds.length > NUM.ZERO &&
      pendingAckNodeIds.length === NUM.ZERO ?
      MEMBERSHIP_PUBLICATION_ACK_COMPLETION_STATE.COMPLETE :
      MEMBERSHIP_PUBLICATION_ACK_COMPLETION_STATE.PENDING;

  return {
    state,
    complete:
      state === MEMBERSHIP_PUBLICATION_ACK_COMPLETION_STATE.COMPLETE,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
  };
}

function resolveMembershipPublicationAcknowledgedNodeIds(options = {}, helperFns = {}) {
  const observedAcknowledgedNodeIds = helperFns.normalizeNodeIdList([
    ...helperFns.resolveCarriedAcknowledgedNodeIds({
      latestPublicationRow: options.latestPublicationRow,
      latestPublishedPublicationRow: options.latestPublishedPublicationRow,
      requiredAckNodeIds: options.requiredAckNodeIds,
    }),
    ...(Array.isArray(options.planningAcknowledgedNodeIds) ?
      options.planningAcknowledgedNodeIds :
      []),
  ]);
  const evidence = Object.freeze({
    publicationChanged: options.publicationChanged,
    observedAcknowledgedNodeIds,
    publishableRecoveryActiveNodeIds: helperFns.normalizeNodeIdList(
      options.publishableRecoveryActiveNodeIds,
    ),
  });
  const decision = MEMBERSHIP_PUBLICATION_ACK_CARRY_RULES.find((rule) =>
    rule.matches(evidence),
  );
  return helperFns.normalizeNodeIdList(decision.nodeIds(evidence));
}

function resolveCandidatePublicationStatus(options = {}) {
  if (options.ackCompletionSnapshot?.complete === true) {
    return MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
  }
  if (options.changed === true) {
    return MEMBERSHIP_PUBLICATION_STATUS.OPEN;
  }
  return String(
    options.latestPublicationRow?.status || MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
  ).toUpperCase();
}

function resolveCandidatePublicationLifecycleState(publicationStatus) {
  return publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE :
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING;
}

function buildMembershipPublicationRecoveryCohortSnapshot(options = {}, helperFns = {}) {
  const publishedActiveNodeIds = helperFns.normalizeNodeIdList(
    options.publishedActiveNodeIds,
  );
  const recoveryActiveNodeIds = helperFns.normalizeNodeIdList(
    options.recoveryActiveNodeIds,
  );
  const targetState = options.publicationTargetSnapshot?.state;
  const steadyTrimTarget =
    targetState === MEMBERSHIP_PUBLICATION_TARGET_STATE.PROJECTED_STEADY_TRIM;
  return {
    activeNodeIds: steadyTrimTarget ? publishedActiveNodeIds : recoveryActiveNodeIds,
    source: steadyTrimTarget ? targetState : options.recoveryActiveNodeSource,
  };
}

function deriveMembershipPublicationCandidate(options = {}, helperFns = {}) {
  const planningSnapshot =
    options.planningSnapshot && typeof options.planningSnapshot === TYPEOF.OBJECT ?
      options.planningSnapshot :
      helperFns.buildMembershipPublicationEvidenceSnapshot(options);
  const latestPublicationRow = helperFns.normalizeLatestPublicationRow(
    planningSnapshot.latestPublicationRow,
  );
  const latestPublishedPublicationRow = helperFns.normalizeLatestPublicationRow(
    planningSnapshot.latestPublishedPublicationRow,
  );
  const latestPublicationStatus = String(latestPublicationRow?.status || '').toUpperCase();
  const carryForwardLatestPublicationBaseline =
    latestPublicationRow &&
    latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED &&
    latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED &&
    Array.isArray(latestPublicationRow.publishedActiveNodeIds) &&
    latestPublicationRow.publishedActiveNodeIds.length > NUM.ZERO;
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(
    carryForwardLatestPublicationBaseline ?
      latestPublicationRow.publishedActiveNodeIds :
      latestPublishedPublicationRow?.publishedActiveNodeIds,
  );
  const readinessByNodeId = buildPublicationPlanningReadinessByNodeId({
    readinessByNodeId: planningSnapshot.readinessByNodeId,
    readinessEntries: planningSnapshot.readinessEntries,
  });
  const observedRecoveryProjectionNodeIds = helperFns.normalizeNodeIdList(
    helperFns.resolveObservedActiveNodeIds({
      ...planningSnapshot,
      readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: true,
      allowLivenessFallbackProjection: true,
    }),
  );
  const observedRecoveryProjectionGap = observedRecoveryProjectionNodeIds.some(
    (nodeId) => !publishedBaselineNodeIds.includes(nodeId),
  );
  const allowRecoveryEligibleProjection = shouldAllowRecoveryEligibleProjection(
    {
      ...options,
      latestPublicationRow,
      publishedBaselineNodeIds,
      readinessByNodeId,
      observedRecoveryProjectionGap,
    },
    helperFns,
  );
  const priorityRecoverySpreadGapPending = hasPriorityRecoverySpreadGap(
    latestPublicationRow?.priorityPartitionSummary ||
      latestPublishedPublicationRow?.priorityPartitionSummary,
  );
  const allowPrioritySpreadLivenessFallbackProjection =
    allowRecoveryEligibleProjection &&
    (priorityRecoverySpreadGapPending || observedRecoveryProjectionGap);
  const activeNodeViews = resolveActiveNodeViews({
    ...planningSnapshot,
    publicationRows:
      publishedBaselineNodeIds.length > 0 ?
        [
          {
            publication_epoch:
                latestPublishedPublicationRow?.publicationEpoch ||
                latestPublicationRow?.publicationEpoch ||
                NUM.ONE,
            status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
            published_active_node_ids: publishedBaselineNodeIds,
          },
        ] :
        [],
    latestPublicationRow:
      publishedBaselineNodeIds.length > 0 ?
        {
          publication_epoch:
              latestPublishedPublicationRow?.publicationEpoch ||
              latestPublicationRow?.publicationEpoch ||
              NUM.ONE,
          status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
          published_active_node_ids: publishedBaselineNodeIds,
        } :
        null,
    readinessByNodeId,
    allowControlPlaneRecoveryEligibleProjection: allowRecoveryEligibleProjection,
    allowLivenessFallbackProjection: allowPrioritySpreadLivenessFallbackProjection,
  });
  const initialProjectionDiagnostics =
    buildProjectionDiagnosticsSummary(activeNodeViews, helperFns);
  const projectedServingNodeIds = helperFns.normalizeNodeIdList(
    activeNodeViews.projectedServingNodeIds || activeNodeViews.projectedActiveNodeIds,
  );
  const locallyEligibleNodeIds = helperFns.normalizeNodeIdList(
    activeNodeViews.locallyEligibleNodeIds || projectedServingNodeIds,
  );
  const recoveryActiveNodeCohort = resolvePriorityRecoveryActiveNodeCohort({
    publishedActiveNodeIds: publishedBaselineNodeIds,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState,
    admissionReasonCodes: planningSnapshot.admissionReasonCodes,
    clusterIncarnationFence: planningSnapshot.clusterIncarnationFence,
    membershipLifecycleSummary: {
      publishedActiveNodeIds: publishedBaselineNodeIds,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      projectionDiagnostics: initialProjectionDiagnostics,
      participationByNodeId:
        planningSnapshot.membershipLifecycleSummary?.participationByNodeId,
    },
  });
  const publicationAckTargetSnapshot = buildPublicationAckTargetSnapshot(
    {
      publishedBaselineNodeIds,
      recoveryActiveNodeIds: recoveryActiveNodeCohort.activeNodeIds,
      recoveryEligibleIncludedNodeIds:
        initialProjectionDiagnostics?.recoveryEligibleIncludedNodeIds,
      readinessByNodeId,
    },
    helperFns,
  );
  const projectionDiagnostics = buildPublicationAckProjectionDiagnostics(
    initialProjectionDiagnostics,
    publicationAckTargetSnapshot,
  );
  const publicationProjectedServingNodeIds = helperFns.normalizeNodeIdList(
    projectedServingNodeIds.filter((nodeId) =>
      !publicationAckTargetSnapshot.deferredNodeIds.includes(nodeId),
    ),
  );
  const publicationLocallyEligibleNodeIds = helperFns.normalizeNodeIdList(
    locallyEligibleNodeIds.filter((nodeId) =>
      !publicationAckTargetSnapshot.deferredNodeIds.includes(nodeId),
    ),
  );
  const recoveryEpochByNodeId = helperFns.buildLatestRecoveryEpochByNodeId(
    options.recoveryEpochsByNodeId,
  );
  const observedActiveNodeIds = helperFns.resolveObservedActiveNodeIds({
    ...planningSnapshot,
    readinessByNodeId,
  });
  const publicationWideningProjection = publicationProjectedServingNodeIds.some(
    (nodeId) => !publishedBaselineNodeIds.includes(nodeId),
  );
  const publicationProjectionNodeRowIds = new Set(
    planningSnapshot.nodeRows
      .map((nodeRow) => normalizeNodeRow(nodeRow).nodeId)
      .filter((nodeId) => nodeId.length > NUM.ZERO),
  );
  const publicationWideningHasNodeRowEvidence =
    publicationProjectedServingNodeIds.some(
      (nodeId) =>
        !publishedBaselineNodeIds.includes(nodeId) &&
        publicationProjectionNodeRowIds.has(nodeId),
    );
  const recoveryEligiblePublicationRepairEvidence =
    hasRecoveryEligiblePublicationRepairEvidence(
      {
        publishedBaselineNodeIds,
        publishableRecoveryActiveNodeIds:
          publicationAckTargetSnapshot.publishableRecoveryActiveNodeIds,
        readinessByNodeId,
      },
      helperFns,
    );
  const retainPublishedDurableTarget =
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED &&
    priorityRecoverySpreadGapPending !== true &&
    publicationWideningProjection === true &&
    publicationWideningHasNodeRowEvidence !== true &&
    recoveryEligiblePublicationRepairEvidence !== true;
  const publicationTargetSnapshot = buildMembershipPublicationTargetSnapshot(
    {
      explicitPublishedNodeIds:
        Array.isArray(planningSnapshot.publishedActiveNodeIds) ?
          planningSnapshot.publishedActiveNodeIds :
          retainPublishedDurableTarget === true ?
            publishedBaselineNodeIds :
            [],
      publishedBaselineNodeIds,
      projectedServingNodeIds: publicationProjectedServingNodeIds,
      recoveryActiveNodeIds:
        publicationAckTargetSnapshot.publishableRecoveryActiveNodeIds,
      observedActiveNodeIds,
      priorityRecoverySpreadGapPending,
      observedRecoveryProjectionGap,
      membershipFreezeActive: activeNodeViews.membershipFreeze?.active === true,
    },
    helperFns,
  );
  const publishedActiveNodeIds = helperFns.normalizeNodeIdList(
    publicationTargetSnapshot.nodeIds,
  );
  const publicationRecoveryCohortSnapshot =
    buildMembershipPublicationRecoveryCohortSnapshot(
      {
        publicationTargetSnapshot,
        publishedActiveNodeIds,
        recoveryActiveNodeIds:
          publicationAckTargetSnapshot.publishableRecoveryActiveNodeIds,
        recoveryActiveNodeSource: recoveryActiveNodeCohort.source,
      },
      helperFns,
    );
  const priorityRecoveryPublicationContext = buildActiveMembershipSnapshot({
    publishedActiveNodeIds,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState,
    admissionReasonCodes: planningSnapshot.admissionReasonCodes,
    clusterIncarnationFence: planningSnapshot.clusterIncarnationFence,
    membershipLifecycleSummary: {
      publishedActiveNodeIds,
      projectedServingNodeIds: publicationProjectedServingNodeIds,
      locallyEligibleNodeIds: publicationLocallyEligibleNodeIds,
      projectionDiagnostics,
    },
    recoveryActiveNodeIds: publicationRecoveryCohortSnapshot.activeNodeIds,
    recoveryActiveNodeSource: publicationRecoveryCohortSnapshot.source,
  });
  const requiredAckNodeIds = helperFns.normalizeNodeIdList(
    Array.isArray(planningSnapshot.requiredAckNodeIds) ?
      planningSnapshot.requiredAckNodeIds :
      publishedActiveNodeIds,
  );
  const sourceTopologyEpoch = helperFns.normalizePositiveInteger(
    planningSnapshot.sourceTopologyEpoch,
    null,
  );
  const sourceSnapshotVersion = helperFns.normalizePositiveInteger(
    planningSnapshot.sourceSnapshotVersion,
    null,
  );
  const baselineEpoch = helperFns.normalizePositiveInteger(
    latestPublicationRow?.publicationEpoch,
    NUM.ZERO,
  );
  const changed =
    !latestPublicationRow ||
    !helperFns.listEquals(latestPublicationRow.publishedActiveNodeIds, publishedActiveNodeIds) ||
    helperFns.didOptionalSourceVersionChange(
      latestPublicationRow.sourceTopologyEpoch,
      sourceTopologyEpoch,
    ) ||
    helperFns.didOptionalSourceVersionChange(
      latestPublicationRow.sourceSnapshotVersion,
      sourceSnapshotVersion,
    );
  const acknowledgedNodeIds = resolveMembershipPublicationAcknowledgedNodeIds(
    {
      latestPublicationRow,
      latestPublishedPublicationRow,
      requiredAckNodeIds,
      planningAcknowledgedNodeIds: planningSnapshot.acknowledgedNodeIds,
      publishableRecoveryActiveNodeIds:
        publicationAckTargetSnapshot.publishableRecoveryActiveNodeIds,
      publicationChanged: changed,
    },
    helperFns,
  );
  const ackCompletionSnapshot = buildMembershipPublicationAckCompletionSnapshot(
    {
      requiredAckNodeIds,
      acknowledgedNodeIds,
    },
    helperFns,
  );
  const candidatePublicationEpoch =
    changed ?
      baselineEpoch + NUM.ONE :
      Math.max(baselineEpoch, NUM.ONE);
  const membershipEpochSnapshot =
    planningSnapshot.membershipEpochSnapshot &&
    typeof planningSnapshot.membershipEpochSnapshot === TYPEOF.OBJECT ?
      planningSnapshot.membershipEpochSnapshot :
      buildMembershipEpochSnapshot({
        latestPublicationRow,
        latestPublishedPublicationRow,
        sourceTopologyEpoch,
        sourceSnapshotVersion,
      });
  const membershipEpochFence = buildMembershipEpochFence({
    membershipEpochSnapshot,
    publicationEpoch: candidatePublicationEpoch,
  });
  const candidatePublicationStatus = resolveCandidatePublicationStatus({
    changed,
    latestPublicationRow,
    ackCompletionSnapshot,
  });
  const candidateLifecycleState = resolveCandidatePublicationLifecycleState(
    candidatePublicationStatus,
  );
  const durablePublishedActiveNodeIds =
    candidatePublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
      publishedActiveNodeIds :
      publishedBaselineNodeIds;
  const normalizedPriorityPartitionSummary = normalizePriorityPartitionSummary(
    planningSnapshot.priorityPartitionSummary ||
      planningSnapshot.priorityRecoveryPlanningSnapshot?.priorityPartitionSummary,
    {
      requiredDistinctNodeCount: Math.min(
        PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
        publicationLocallyEligibleNodeIds.length,
      ),
      readyEligibleNodeCount: publicationLocallyEligibleNodeIds.length,
    },
    helperFns,
  );
  const derivedPriorityPartitionSummary = buildDerivedPriorityPartitionSummary(
    {
      serviceRows: planningSnapshot.serviceRows,
      partitionRows: planningSnapshot.partitionRows,
      readinessByNodeId,
      projectedServingNodeIds: publicationProjectedServingNodeIds,
      locallyEligibleNodeIds: publicationLocallyEligibleNodeIds,
      publishedActiveNodeIds,
    },
    helperFns,
  );
  const priorityPartitionSummaryBase = chooseMoreAdvancedPriorityPartitionSummary(
    normalizedPriorityPartitionSummary,
    derivedPriorityPartitionSummary,
    helperFns,
  );
  const reasonCode =
    typeof planningSnapshot.reasonCode === TYPEOF.STRING && planningSnapshot.reasonCode.length > 0 ?
      planningSnapshot.reasonCode :
      AUTHORITATIVE_MEMBERSHIP_CHANGED_REASON;
  const derivedMembershipLifecycleSummaryBase = buildMembershipLifecycleSummary({
    lifecycleState: candidateLifecycleState,
    publishedActiveNodeIds,
    projectedServingNodeIds,
    locallyEligibleNodeIds: publicationLocallyEligibleNodeIds,
    suspectedOrTransitioningNodeIds: activeNodeViews.suspectedOrTransitioningNodeIds,
    memberStatesByNodeId: buildPublishedMemberStates(
      {
        publishedBaselineNodeIds,
        desiredPublishedNodeIds: publishedActiveNodeIds,
        projectedServingNodeIds,
        suspectedOrTransitioningNodeIds: activeNodeViews.suspectedOrTransitioningNodeIds,
        recoveryEpochByNodeId,
      },
      helperFns,
    ),
    recoveryEpochByNodeId: Object.keys(recoveryEpochByNodeId).reduce(
      (accumulator, nodeId) => {
        accumulator[nodeId] = recoveryEpochByNodeId[nodeId].epochId;
        return accumulator;
      },
      {},
    ),
    membershipFreeze: activeNodeViews.membershipFreeze,
    projectionDiagnostics,
    recoveryActiveNodeIds: priorityRecoveryPublicationContext.recoveryActiveNodeIds,
    recoveryActiveNodeSource: priorityRecoveryPublicationContext.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds:
      priorityRecoveryPublicationContext.missingPublishedRecoveryActiveNodeIds,
  });
  const membershipLifecycleSummaryBase = chooseMembershipLifecycleSummaryBase(
    planningSnapshot.membershipLifecycleSummary,
    derivedMembershipLifecycleSummaryBase,
    helperFns,
  );
  const pendingAckNodeIds = ackCompletionSnapshot.pendingAckNodeIds;
  const {
    priorityRecoveryClosureWitness,
    priorityRecoveryDecisionSnapshots,
  } = buildPriorityRecoveryClosureEvidence(
    {
      latestPublicationRow,
      latestPublishedPublicationRow,
      publishedActiveNodeIds,
      pendingAckNodeIds,
      priorityPartitionSummary: priorityPartitionSummaryBase,
      membershipLifecycleSummary: membershipLifecycleSummaryBase,
      recoveryActiveNodeIds:
        priorityRecoveryPublicationContext.recoveryActiveNodeIds,
      recoveryActiveNodeSource:
        priorityRecoveryPublicationContext.recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds:
        priorityRecoveryPublicationContext.missingPublishedRecoveryActiveNodeIds,
      readinessByNodeId,
      replicaOperationRows: planningSnapshot.replicaOperationRows,
      serviceRows: planningSnapshot.serviceRows,
      priorityRecoveryPlanningSnapshot:
        planningSnapshot.priorityRecoveryPlanningSnapshot,
      nowMs: options.nowMs,
    },
    helperFns,
  );
  const priorityPartitionSummary = chooseMoreAdvancedPriorityPartitionSummary(
    priorityPartitionSummaryBase,
    priorityRecoveryClosureWitness?.refreshedPriorityPartitionSummary,
    helperFns,
  );
  const priorityPartitionSummaryChanged = !arePriorityPartitionSummariesEqual(
    latestPublicationRow?.priorityPartitionSummary,
    priorityPartitionSummary,
    helperFns,
  );
  const recoveryProtocolSnapshot = buildRecoveryProtocolSnapshot({
    publicationEpoch: candidatePublicationEpoch,
    publicationStatus: candidatePublicationStatus,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState,
    admissionReasonCodes: planningSnapshot.admissionReasonCodes,
    clusterIncarnationFence: planningSnapshot.clusterIncarnationFence,
    publishedActiveNodeIdsPresent: true,
    durablePublishedActiveNodeIds,
    publishedActiveNodeIds,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    sourceTopologyEpoch,
    sourceSnapshotVersion,
    priorityPartitionSummary,
    priorityRecoveryClosureWitness,
    membershipLifecycleSummary: membershipLifecycleSummaryBase,
    projectionDiagnostics,
  });
  const membershipLifecycleSummary = buildMembershipLifecycleSummary({
    ...membershipLifecycleSummaryBase,
    lifecycleState: candidateLifecycleState,
    participationByNodeId: recoveryProtocolSnapshot.participationByNodeId,
    participationStateCounts: recoveryProtocolSnapshot.participationStateCounts,
    recoveryProtocolState: recoveryProtocolSnapshot.recoveryProtocolState,
    recoveryProtocolReasonCodes: recoveryProtocolSnapshot.priorityRecoveryReasonCodes,
  });
  return {
    publicationKind: helperFns.publicationKind,
    publicationEpoch: candidatePublicationEpoch,
    publicationStatus: candidatePublicationStatus,
    publicationObservationState: recoveryProtocolSnapshot.publicationObservationState,
    publisherNodeId: planningSnapshot.publisherNodeId,
    sourceTopologyEpoch,
    sourceSnapshotVersion,
    membershipEpochSnapshot,
    membershipEpochFence,
    publishedPlanningEpoch: recoveryProtocolSnapshot.publishedPlanningEpoch,
    publishedActiveNodeIdsPresent: recoveryProtocolSnapshot.publishedActiveNodeIdsPresent,
    publishedActiveNodeIds,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    priorityPartitionSummary,
    membershipLifecycleSummary,
    projectedServingNodeIds,
    locallyEligibleNodeIds: publicationLocallyEligibleNodeIds,
    recoveryEligibleIncludedNodeIds: recoveryProtocolSnapshot.recoveryEligibleIncludedNodeIds,
    recoveryActiveNodeIds: recoveryProtocolSnapshot.recoveryActiveNodeIds,
    recoveryActiveNodeSource: recoveryProtocolSnapshot.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds:
      recoveryProtocolSnapshot.missingPublishedRecoveryActiveNodeIds,
    participationByNodeId: recoveryProtocolSnapshot.participationByNodeId,
    participationStateCounts: recoveryProtocolSnapshot.participationStateCounts,
    recoveryProtocolState: recoveryProtocolSnapshot.recoveryProtocolState,
    targetParticipation: recoveryProtocolSnapshot.targetParticipation,
    priorityRecoveryReasonCodes: recoveryProtocolSnapshot.priorityRecoveryReasonCodes,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState || null,
    admissionReasonCodes: Array.isArray(planningSnapshot.admissionReasonCodes) ?
      planningSnapshot.admissionReasonCodes :
      [],
    clusterIncarnationFence:
      planningSnapshot.clusterIncarnationFence &&
        typeof planningSnapshot.clusterIncarnationFence === TYPEOF.OBJECT ?
        planningSnapshot.clusterIncarnationFence :
        null,
    priorityRecoveryClosureWitness,
    priorityRecoveryDecisionSnapshots,
    projectionDiagnostics,
    reasonCode,
    changed,
    priorityPartitionSummaryChanged,
    membershipLifecycleSummaryChanged: !areMembershipLifecycleSummariesEqual(
      latestPublicationRow?.membershipLifecycleSummary,
      membershipLifecycleSummary,
    ),
  };
}

export {
  buildPublicationMetadataRefreshRow,
  deriveMembershipPublicationCandidate,
  shouldPreferAuthoritativeMembershipState,
};
