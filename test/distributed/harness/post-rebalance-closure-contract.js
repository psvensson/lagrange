import {NUM, TYPEOF} from '../../../src/constants/index.js';
import {
  normalizeReplicaOperationRecord,
} from '../../../src/rebalancer/replica-operation-liveness.js';

const POST_REBALANCE_CLOSURE_STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  SOFT_CLOSED: 'soft_closed',
  UNAVAILABLE: 'unavailable',
});

const POST_REBALANCE_CLOSURE_DIMENSION = Object.freeze({
  OPERATION_DRAIN: 'operation_drain',
  MEMBERSHIP_TRIM: 'membership_trim',
  PUBLICATION_VISIBLE: 'publication_visible',
  CDC_PROJECTION_VISIBLE: 'cdc_projection_visible',
  NO_OVER_TARGET: 'no_over_target',
});

const POST_REBALANCE_CLOSURE_REASON = Object.freeze({
  CDC_PROJECTION_UNAVAILABLE: 'cdc_projection_unavailable',
  CURRENT_OVERTARGET_VOTERS: 'current_overtarget_voters',
  EFFECTIVE_PUBLISHED_MEMBERSHIP_DURING_FREEZE:
    'effective_published_membership_during_freeze',
  IGNORED_STALE_REPLICA_OPERATIONS: 'ignored_stale_replica_operations',
  IN_FLIGHT_REPLICA_OPERATIONS: 'in_flight_replica_operations',
  MEMBERSHIP_TRIM_BLOCKED_BY_OPERATION_DRAIN:
    'membership_trim_blocked_by_operation_drain',
  MISSING_PARTITION_LEADERS: 'missing_partition_leaders',
  OVERTARGET_BUDGET_EXCEEDED: 'overtarget_budget_exceeded',
  PUBLICATION_PENDING: 'publication_pending',
  PUBLICATION_UNAVAILABLE: 'publication_unavailable',
  PUBLISHED_MEMBERSHIP_TRIM_DEBT: 'published_membership_trim_debt',
});

const CONTROL_PLANE_PUBLICATION_STATUS = Object.freeze({
  PUBLISHED: 'PUBLISHED',
});

const CONTROL_PLANE_ACTIVE_NODE_SOURCE = Object.freeze({
  PUBLISHED_MEMBERSHIP: 'published_membership',
});

const POST_REBALANCE_PUBLICATION_VISIBILITY_SOURCE = Object.freeze({
  PUBLICATION_CONVERGENCE: 'publication_convergence',
  PUBLISHED_MEMBERSHIP_OBSERVATION: 'published_membership_observation',
});

const PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const PRIORITY_RECOVERY_COMPLETION_STATE_SPREAD_SATISFIED_IN_FLIGHT =
  'spread_satisfied_in_flight';
const PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED = 'converged';
const PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE = 'cache_visible';
const PRIORITY_RECOVERY_SATISFIED_COMPLETION_STATES = Object.freeze([
  PRIORITY_RECOVERY_COMPLETION_STATE_SPREAD_SATISFIED_IN_FLIGHT,
  PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED,
]);
const POST_REBALANCE_CLOSURE_TERMINAL_STATES = Object.freeze([
  POST_REBALANCE_CLOSURE_STATE.CLOSED,
  POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
]);
const POST_REBALANCE_CLOSURE_BLOCKER_SUFFIX = '_open';
const POST_REBALANCE_CLOSURE_SOFT_SUFFIX = '_soft_closed';
const POST_REBALANCE_CLOSURE_TEXT_EMPTY = '';
const POST_REBALANCE_CLOSURE_EMPTY_LIST = Object.freeze([]);
const POST_REBALANCE_CLOSURE_EMPTY_RECORD = Object.freeze({});
const POST_REBALANCE_PUBLICATION_VISIBILITY_DECISION_TABLE = Object.freeze([
  Object.freeze({
    matches: (evidence) =>
      evidence.membershipFreezeActive === true &&
      evidence.activeNodeEffectiveSource ===
        CONTROL_PLANE_ACTIVE_NODE_SOURCE.PUBLISHED_MEMBERSHIP &&
      evidence.publishedMembershipAvailable === true &&
      evidence.publishedMembershipObservationStatus ===
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    state: POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
    source:
      POST_REBALANCE_PUBLICATION_VISIBILITY_SOURCE
        .PUBLISHED_MEMBERSHIP_OBSERVATION,
    reasonCodes: Object.freeze([
      POST_REBALANCE_CLOSURE_REASON
        .EFFECTIVE_PUBLISHED_MEMBERSHIP_DURING_FREEZE,
    ]),
  }),
  Object.freeze({
    matches: (evidence) => evidence.publicationAvailable !== true,
    state: POST_REBALANCE_CLOSURE_STATE.UNAVAILABLE,
    source: POST_REBALANCE_PUBLICATION_VISIBILITY_SOURCE.PUBLICATION_CONVERGENCE,
    reasonCodes: Object.freeze([
      POST_REBALANCE_CLOSURE_REASON.PUBLICATION_UNAVAILABLE,
    ]),
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.rawPublicationStatus.length === NUM.ZERO ||
      evidence.rawPublicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    state: POST_REBALANCE_CLOSURE_STATE.CLOSED,
    source: POST_REBALANCE_PUBLICATION_VISIBILITY_SOURCE.PUBLICATION_CONVERGENCE,
    reasonCodes: POST_REBALANCE_CLOSURE_EMPTY_LIST,
  }),
  Object.freeze({
    matches: () => true,
    state: POST_REBALANCE_CLOSURE_STATE.OPEN,
    source: POST_REBALANCE_PUBLICATION_VISIBILITY_SOURCE.PUBLICATION_CONVERGENCE,
    reasonCodes: Object.freeze([
      POST_REBALANCE_CLOSURE_REASON.PUBLICATION_PENDING,
    ]),
  }),
]);
const POST_REBALANCE_CDC_PROJECTION_VISIBILITY_DECISION_TABLE = Object.freeze([
  Object.freeze({
    matches: (evidence) => evidence.expectedPartitionIds.length === NUM.ZERO,
    state: POST_REBALANCE_CLOSURE_STATE.UNAVAILABLE,
    reasonCodes: Object.freeze([
      POST_REBALANCE_CLOSURE_REASON.CDC_PROJECTION_UNAVAILABLE,
    ]),
  }),
  Object.freeze({
    matches: (evidence) => evidence.missingLeaderPartitionIds.length === NUM.ZERO,
    state: POST_REBALANCE_CLOSURE_STATE.CLOSED,
    reasonCodes: POST_REBALANCE_CLOSURE_EMPTY_LIST,
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.ignoreStaleInFlightReplicaOperations === true &&
      evidence.staleDiscountCount > NUM.ZERO &&
      evidence.uncoveredMissingLeaderPartitionIds.length === NUM.ZERO,
    state: POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
    reasonCodes: Object.freeze([
      POST_REBALANCE_CLOSURE_REASON.IGNORED_STALE_REPLICA_OPERATIONS,
    ]),
  }),
  Object.freeze({
    matches: () => true,
    state: POST_REBALANCE_CLOSURE_STATE.OPEN,
    reasonCodes: Object.freeze([
      POST_REBALANCE_CLOSURE_REASON.MISSING_PARTITION_LEADERS,
    ]),
  }),
]);

function normalizeNonNegativeInteger(value, fallback = NUM.ZERO) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue >= NUM.ZERO) {
    return Math.floor(numericValue);
  }
  return fallback;
}

function normalizeStringList(values = POST_REBALANCE_CLOSURE_EMPTY_LIST) {
  const candidateValues =
    Array.isArray(values) ?
      values :
      values instanceof Set ?
        Array.from(values) :
        POST_REBALANCE_CLOSURE_EMPTY_LIST;
  return [
    ...new Set(
      candidateValues
        .map((value) => String(value || POST_REBALANCE_CLOSURE_TEXT_EMPTY).trim())
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort();
}

function normalizeEntries(value = POST_REBALANCE_CLOSURE_EMPTY_RECORD) {
  if (value instanceof Map) {
    return Array.from(value.entries());
  }
  if (
    value &&
    typeof value === TYPEOF.OBJECT &&
    !Array.isArray(value)
  ) {
    return Object.entries(value);
  }
  return POST_REBALANCE_CLOSURE_EMPTY_LIST;
}

function normalizeCountMap(value = POST_REBALANCE_CLOSURE_EMPTY_RECORD) {
  const countMap = new Map();
  for (const [rawKey, rawCount] of normalizeEntries(value)) {
    const key = String(rawKey || POST_REBALANCE_CLOSURE_TEXT_EMPTY).trim();
    if (key.length === NUM.ZERO) {
      continue;
    }
    countMap.set(key, normalizeNonNegativeInteger(rawCount, NUM.ZERO));
  }
  return countMap;
}

function normalizeDurationRecord(value = POST_REBALANCE_CLOSURE_EMPTY_RECORD) {
  const durationRecord = {};
  for (const [rawKey, rawDuration] of normalizeEntries(value)) {
    const key = String(rawKey || POST_REBALANCE_CLOSURE_TEXT_EMPTY).trim();
    if (key.length === NUM.ZERO) {
      continue;
    }
    durationRecord[key] = normalizeNonNegativeInteger(rawDuration, NUM.ZERO);
  }
  return durationRecord;
}

function normalizeLeaderPartitionIds(value = POST_REBALANCE_CLOSURE_EMPTY_RECORD) {
  const leaderPartitionIds = new Set();
  for (const [rawKey, rawLeader] of normalizeEntries(value)) {
    const key = String(rawKey || POST_REBALANCE_CLOSURE_TEXT_EMPTY).trim();
    const leader = String(
      rawLeader || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    ).trim();
    if (key.length > NUM.ZERO && leader.length > NUM.ZERO) {
      leaderPartitionIds.add(key);
    }
  }
  return leaderPartitionIds;
}

function getDiagnosticsObject(value) {
  return value && typeof value === TYPEOF.OBJECT && !Array.isArray(value) ?
    value :
    POST_REBALANCE_CLOSURE_EMPTY_RECORD;
}

function getPublicationConvergence(controlPlaneDiagnostics) {
  return getDiagnosticsObject(controlPlaneDiagnostics.publicationConvergence);
}

function getPublishedMembershipObservation(controlPlaneDiagnostics) {
  return getDiagnosticsObject(
    controlPlaneDiagnostics.publishedMembershipObservation,
  );
}

function getActiveNodeViews(controlPlaneDiagnostics) {
  return getDiagnosticsObject(controlPlaneDiagnostics.activeNodeViews);
}

function resolvePublishedActiveNodeIds(options, controlPlaneDiagnostics) {
  const publicationConvergence =
    getPublicationConvergence(controlPlaneDiagnostics);
  return normalizeStringList(
    Array.isArray(options.publishedActiveNodeIds) ?
      options.publishedActiveNodeIds :
      publicationConvergence.publishedActiveNodeIds,
  );
}

function resolveProjectedActiveNodeIds(options, controlPlaneDiagnostics) {
  const activeNodeViews = getActiveNodeViews(controlPlaneDiagnostics);
  return normalizeStringList(
    Array.isArray(options.projectedActiveNodeIds) ?
      options.projectedActiveNodeIds :
      activeNodeViews.projectedNodeIds,
  );
}

function resolvePublicationStatus(controlPlaneDiagnostics) {
  const publicationConvergence =
    getPublicationConvergence(controlPlaneDiagnostics);
  return String(
    publicationConvergence.publicationStatus ||
      publicationConvergence.status ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim().toUpperCase();
}

function resolvePublishedMembershipObservationStatus(controlPlaneDiagnostics) {
  const publishedMembershipObservation =
    getPublishedMembershipObservation(controlPlaneDiagnostics);
  return String(
    publishedMembershipObservation.publicationStatus ||
      publishedMembershipObservation.status ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim().toUpperCase();
}

function collectPublicationVisibilityEvidence(
  controlPlaneDiagnostics,
  publicationFallbackAvailable = false,
) {
  const publicationConvergence =
    getPublicationConvergence(controlPlaneDiagnostics);
  const publishedMembershipObservation =
    getPublishedMembershipObservation(controlPlaneDiagnostics);
  const activeNodeViews = getActiveNodeViews(controlPlaneDiagnostics);
  const membershipFreeze = getDiagnosticsObject(activeNodeViews.membershipFreeze);
  const rawPublicationStatus = resolvePublicationStatus(controlPlaneDiagnostics);
  const publishedMembershipObservationStatus =
    resolvePublishedMembershipObservationStatus(controlPlaneDiagnostics);
  return Object.freeze({
    rawPublicationStatus,
    publishedMembershipObservationStatus,
    publicationAvailable:
      publicationFallbackAvailable === true ||
      publicationConvergence !== POST_REBALANCE_CLOSURE_EMPTY_RECORD ||
      publishedMembershipObservation !== POST_REBALANCE_CLOSURE_EMPTY_RECORD,
    publishedMembershipAvailable:
      activeNodeViews.publishedMembershipAvailable === true ||
      publishedMembershipObservationStatus ===
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    membershipFreezeActive: membershipFreeze.active === true,
    activeNodeEffectiveSource: String(
      activeNodeViews.effectiveSource ||
        POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    ).trim(),
  });
}

function resolvePublicationVisibility(
  controlPlaneDiagnostics,
  publicationFallbackAvailable = false,
) {
  const evidence = collectPublicationVisibilityEvidence(
    controlPlaneDiagnostics,
    publicationFallbackAvailable,
  );
  const decision = POST_REBALANCE_PUBLICATION_VISIBILITY_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  const selectedDecision = decision;
  const status =
    selectedDecision.source ===
      POST_REBALANCE_PUBLICATION_VISIBILITY_SOURCE
        .PUBLISHED_MEMBERSHIP_OBSERVATION ?
      evidence.publishedMembershipObservationStatus :
      evidence.rawPublicationStatus;
  return Object.freeze({
    ...evidence,
    status,
    state: selectedDecision.state,
    source: selectedDecision.source,
    reasonCodes: selectedDecision.reasonCodes,
  });
}

function collectOverTargetPartitionIds(
  voterCounts,
  targetVoterCount,
  overTargetDurations,
) {
  const partitionIds = new Set();
  for (const [partitionId, voterCount] of voterCounts.entries()) {
    if (voterCount > targetVoterCount) {
      partitionIds.add(partitionId);
    }
  }
  for (const [partitionId, durationMs] of Object.entries(overTargetDurations)) {
    if (durationMs > NUM.ZERO) {
      partitionIds.add(partitionId);
    }
  }
  return Array.from(partitionIds).sort();
}

function collectCacheVisiblePriorityRecoveryEvidence(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const diagnosticsSources = collectPriorityRecoveryDiagnosticsSources(
    controlPlaneDiagnostics,
  );
  const evidence = [];
  for (const source of diagnosticsSources) {
    evidence.push(...collectPriorityRecoveryWitnessEvidence(source));
    evidence.push(...collectPriorityRecoverySummaryEvidence(source));
    evidence.push(...collectPriorityRecoveryDecisionSnapshotEvidence(source));
  }
  return evidence;
}

function collectPriorityRecoveryDiagnosticsSources(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const sources = [];
  for (const candidate of [
    controlPlaneDiagnostics,
    controlPlaneDiagnostics?.publicationConvergence,
    controlPlaneDiagnostics?.priorityRecoveryObservation,
    controlPlaneDiagnostics?.publicationConvergence
      ?.priorityRecoveryCurrentSummary,
    controlPlaneDiagnostics?.priorityRecoveryObservation
      ?.priorityRecoveryCurrentSummary,
  ]) {
    if (candidate && typeof candidate === TYPEOF.OBJECT &&
      !Array.isArray(candidate)) {
      sources.push(candidate);
    }
  }
  return sources;
}

function collectPriorityRecoveryWitnessEvidence(source) {
  const witnesses = Array.isArray(source?.priorityRecoveryPartitionWitnesses) ?
    source.priorityRecoveryPartitionWitnesses :
    Array.isArray(source?.partitionWitnesses) ?
      source.partitionWitnesses :
      POST_REBALANCE_CLOSURE_EMPTY_LIST;
  const evidence = [];
  for (const witness of witnesses) {
    if (!isCacheVisibleSatisfiedPriorityRecoverySnapshot(witness)) {
      continue;
    }
    evidence.push({
      operationIds: witness.operationIds,
      partitionIds: [witness.partitionId],
    });
  }
  return evidence;
}

function collectPriorityRecoverySummaryEvidence(source) {
  const evidence = [];
  const partitionIdsBySemanticState =
    source?.priorityRecoveryPartitionIdsBySemanticState &&
    typeof source.priorityRecoveryPartitionIdsBySemanticState === TYPEOF.OBJECT ?
      source.priorityRecoveryPartitionIdsBySemanticState :
      source?.partitionIdsBySemanticState &&
          typeof source.partitionIdsBySemanticState === TYPEOF.OBJECT ?
        source.partitionIdsBySemanticState :
        POST_REBALANCE_CLOSURE_EMPTY_RECORD;
  evidence.push({
    operationIds: POST_REBALANCE_CLOSURE_EMPTY_LIST,
    partitionIds: Array.isArray(
      partitionIdsBySemanticState[
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
      ],
    ) ?
      partitionIdsBySemanticState[
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
      ] :
      POST_REBALANCE_CLOSURE_EMPTY_LIST,
  });

  const partitionSnapshots = Array.isArray(
    source?.priorityRecoveryPartitionSnapshots,
  ) ?
    source.priorityRecoveryPartitionSnapshots :
    Array.isArray(source?.partitionSnapshots) ?
      source.partitionSnapshots :
      POST_REBALANCE_CLOSURE_EMPTY_LIST;
  for (const partitionSnapshot of partitionSnapshots) {
    if (!isCacheVisibleSatisfiedPriorityRecoverySnapshot(partitionSnapshot)) {
      continue;
    }
    evidence.push({
      operationIds: partitionSnapshot.operationIds,
      partitionIds: [partitionSnapshot.partitionId],
    });
  }

  return evidence;
}

function collectPriorityRecoveryDecisionSnapshotEvidence(source) {
  const snapshots = Array.isArray(source?.priorityRecoveryDecisionSnapshots) ?
    source.priorityRecoveryDecisionSnapshots :
    Array.isArray(source?.priorityRecoveryDecisionSnapshots?.snapshots) ?
      source.priorityRecoveryDecisionSnapshots.snapshots :
      POST_REBALANCE_CLOSURE_EMPTY_LIST;
  const evidence = [];
  for (const snapshot of snapshots) {
    if (!isCacheVisibleSatisfiedPriorityRecoverySnapshot(snapshot)) {
      continue;
    }
    evidence.push({
      operationIds: collectPriorityRecoverySnapshotOperationIds(snapshot),
      partitionIds: [snapshot.partitionId],
    });
  }
  return evidence;
}

function collectPriorityRecoverySnapshotOperationIds(snapshot) {
  const operationIds = [];
  if (snapshot?.operationId) {
    operationIds.push(snapshot.operationId);
  }
  if (snapshot?.coordinator?.operation?.operationId) {
    operationIds.push(snapshot.coordinator.operation.operationId);
  }
  if (Array.isArray(snapshot?.coordinator?.operationIds)) {
    operationIds.push(...snapshot.coordinator.operationIds);
  }
  if (Array.isArray(snapshot?.operationIds)) {
    operationIds.push(...snapshot.operationIds);
  }
  return operationIds;
}

function isCacheVisibleSatisfiedPriorityRecoverySnapshot(snapshot) {
  const visibilityState = String(
    snapshot?.visibilityState ||
      snapshot?.authoritativeVisibilityState ||
      snapshot?.observation?.visibilityState ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  const semanticState = String(
    snapshot?.semanticState ||
      snapshot?.semanticStateId ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  const completionState = String(
    snapshot?.completionState ||
      snapshot?.completion?.state ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  const spreadSatisfied = snapshot?.spreadCompletion?.satisfied === true;
  const visibilitySatisfied =
    visibilityState === PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE;
  const semanticSatisfied =
    semanticState ===
    PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT;
  const completionSatisfied =
    PRIORITY_RECOVERY_SATISFIED_COMPLETION_STATES.includes(completionState);

  return (
    visibilitySatisfied &&
    (semanticSatisfied || completionSatisfied || spreadSatisfied)
  );
}

function addNormalizedIds(target, ids) {
  for (const id of Array.isArray(ids) ? ids : POST_REBALANCE_CLOSURE_EMPTY_LIST) {
    const normalizedId = String(
      id || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    ).trim();
    if (normalizedId.length === NUM.ZERO) {
      continue;
    }
    target.add(normalizedId);
  }
}

function buildCacheVisibleSatisfiedPriorityRecoveryOperationIdSet(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const operationIds = new Set();
  for (const evidence of collectCacheVisiblePriorityRecoveryEvidence(
    controlPlaneDiagnostics,
  )) {
    addNormalizedIds(operationIds, evidence.operationIds);
  }
  return operationIds;
}

function buildCacheVisibleSatisfiedPriorityRecoveryPartitionIdSet(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const partitionIds = new Set();
  for (const evidence of collectCacheVisiblePriorityRecoveryEvidence(
    controlPlaneDiagnostics,
  )) {
    addNormalizedIds(partitionIds, evidence.partitionIds);
  }
  return partitionIds;
}

function countCacheVisibleSatisfiedPriorityRecoveryOperations(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
  operationRows = POST_REBALANCE_CLOSURE_EMPTY_LIST,
) {
  const operationIds =
    buildCacheVisibleSatisfiedPriorityRecoveryOperationIdSet(
      controlPlaneDiagnostics,
    );
  const partitionIds =
    buildCacheVisibleSatisfiedPriorityRecoveryPartitionIdSet(
      controlPlaneDiagnostics,
    );
  if (operationIds.size === NUM.ZERO && partitionIds.size === NUM.ZERO) {
    return NUM.ZERO;
  }
  let matchingOperationCount = NUM.ZERO;
  for (const operationRow of Array.isArray(operationRows) ?
    operationRows :
    POST_REBALANCE_CLOSURE_EMPTY_LIST) {
    const normalizedOperation = normalizeReplicaOperationRecord(operationRow);
    const operationId = String(
      normalizedOperation.operationId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    ).trim();
    const partitionId = String(
      normalizedOperation.partitionId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    ).trim();
    const matchesByOperationId =
      operationId.length > NUM.ZERO && operationIds.has(operationId);
    const matchesByPartitionId =
      partitionId.length > NUM.ZERO && partitionIds.has(partitionId);
    if (!matchesByOperationId && !matchesByPartitionId) {
      continue;
    }
    matchingOperationCount += NUM.ONE;
  }
  return matchingOperationCount > NUM.ZERO ?
    matchingOperationCount :
    Math.max(operationIds.size, partitionIds.size);
}

function buildDimension(dimension, state, reasonCodes, evidence) {
  return {
    dimension,
    state,
    reasonCodes,
    evidence,
  };
}

function collectClosureEvidence(options = POST_REBALANCE_CLOSURE_EMPTY_RECORD) {
  const controlPlaneDiagnostics = getDiagnosticsObject(
    options.controlPlaneDiagnostics,
  );
  const activeNodeViews = getActiveNodeViews(controlPlaneDiagnostics);
  const membershipFreeze = getDiagnosticsObject(activeNodeViews.membershipFreeze);
  const voterCounts = normalizeCountMap(options.voterCounts);
  const targetVoterCount = normalizeNonNegativeInteger(
    options.targetVoterCount,
    NUM.ZERO,
  );
  const overTargetDurations = normalizeDurationRecord(
    options.overTargetDurations,
  );
  const overTargetPartitionIds = collectOverTargetPartitionIds(
    voterCounts,
    targetVoterCount,
    overTargetDurations,
  );
  const expectedPartitionIdsFromOptions = normalizeStringList(
    options.expectedPartitionIds,
  );
  const expectedPartitionIds =
    expectedPartitionIdsFromOptions.length > NUM.ZERO ?
      expectedPartitionIdsFromOptions :
      normalizeStringList(Array.from(voterCounts.keys()));
  const leaderPartitionIds = normalizeLeaderPartitionIds(options.leaders);
  const missingLeaderPartitionIds = expectedPartitionIds.filter(
    (partitionId) => !leaderPartitionIds.has(partitionId),
  );
  const cacheVisibleSatisfiedPriorityRecoveryPartitionIds =
    normalizeStringList(
      options.cacheVisibleSatisfiedPriorityRecoveryPartitionIds,
    );
  const priorityRecoveryPartitionIds =
    cacheVisibleSatisfiedPriorityRecoveryPartitionIds.length > NUM.ZERO ?
      cacheVisibleSatisfiedPriorityRecoveryPartitionIds :
      normalizeStringList(
        buildCacheVisibleSatisfiedPriorityRecoveryPartitionIdSet(
          controlPlaneDiagnostics,
        ),
      );
  const priorityRecoveryPartitionIdSet = new Set(priorityRecoveryPartitionIds);
  const coveredMissingLeaderPartitionIds =
    missingLeaderPartitionIds.filter((partitionId) =>
      priorityRecoveryPartitionIdSet.has(partitionId),
    );
  const uncoveredMissingLeaderPartitionIds =
    missingLeaderPartitionIds.filter((partitionId) =>
      !priorityRecoveryPartitionIdSet.has(partitionId),
    );
  const publishedActiveNodeIds = resolvePublishedActiveNodeIds(
    options,
    controlPlaneDiagnostics,
  );
  const projectedActiveNodeIds = resolveProjectedActiveNodeIds(
    options,
    controlPlaneDiagnostics,
  );
  const projectedActiveNodeIdSet = new Set(projectedActiveNodeIds);
  const stalePublishedNodeIds =
    projectedActiveNodeIds.length > NUM.ZERO ?
      publishedActiveNodeIds.filter(
        (nodeId) => !projectedActiveNodeIdSet.has(nodeId),
      ) :
      POST_REBALANCE_CLOSURE_EMPTY_LIST;
  const publicationVisibility = resolvePublicationVisibility(
    controlPlaneDiagnostics,
    publishedActiveNodeIds.length > NUM.ZERO,
  );
  const inFlightReplicaOperationCount = normalizeNonNegativeInteger(
    options.inFlightReplicaOperationCount,
    NUM.ZERO,
  );
  const effectiveInFlightReplicaOperationCount = normalizeNonNegativeInteger(
    options.effectiveInFlightReplicaOperationCount,
    inFlightReplicaOperationCount,
  );
  const staleInFlightReplicaOperationCount = normalizeNonNegativeInteger(
    options.staleInFlightReplicaOperationCount,
    NUM.ZERO,
  );
  const cacheVisibleSatisfiedPriorityRecoveryOperationCount =
    normalizeNonNegativeInteger(
      options.cacheVisibleSatisfiedPriorityRecoveryOperationCount,
      priorityRecoveryPartitionIds.length,
    );
  const staleDiscountCount = Math.max(
    staleInFlightReplicaOperationCount,
    cacheVisibleSatisfiedPriorityRecoveryOperationCount,
  );

  return {
    controlPlaneDiagnostics,
    expectedPartitionIds,
    leaderPartitionIds: Array.from(leaderPartitionIds).sort(),
    missingLeaderPartitionIds,
    targetVoterCount,
    voterCounts: Object.fromEntries(voterCounts.entries()),
    overTargetDurations,
    overTargetPartitionIds,
    maxOverTargetMs: normalizeNonNegativeInteger(
      options.maxOverTargetMs,
      NUM.ZERO,
    ),
    maxSustainedOverTargetMs: normalizeNonNegativeInteger(
      options.maxSustainedOverTargetMs,
      NUM.ZERO,
    ),
    inFlightReplicaOperationCount,
    effectiveInFlightReplicaOperationCount,
    staleInFlightReplicaOperationCount,
    cacheVisibleSatisfiedPriorityRecoveryOperationCount,
    cacheVisibleSatisfiedPriorityRecoveryPartitionIds:
      priorityRecoveryPartitionIds,
    coveredMissingLeaderPartitionIds,
    uncoveredMissingLeaderPartitionIds,
    staleDiscountCount,
    ignoreStaleInFlightReplicaOperations:
      options.ignoreStaleInFlightReplicaOperations === true,
    inFlightReplicaOperationStatuses: getDiagnosticsObject(
      options.inFlightReplicaOperationStatuses,
    ),
    publicationStatus: publicationVisibility.status,
    rawPublicationStatus: publicationVisibility.rawPublicationStatus,
    publishedMembershipObservationStatus:
      publicationVisibility.publishedMembershipObservationStatus,
    publicationVisibilitySource: publicationVisibility.source,
    publicationVisibilityState: publicationVisibility.state,
    publicationVisibilityReasonCodes: publicationVisibility.reasonCodes,
    publicationAvailable: publicationVisibility.publicationAvailable,
    publishedActiveNodeIds,
    projectedActiveNodeIds,
    stalePublishedNodeIds,
    membershipFreezeActive: membershipFreeze.active === true,
  };
}

function classifyOperationDrain(evidence) {
  if (evidence.effectiveInFlightReplicaOperationCount > NUM.ZERO) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN,
      POST_REBALANCE_CLOSURE_STATE.OPEN,
      [POST_REBALANCE_CLOSURE_REASON.IN_FLIGHT_REPLICA_OPERATIONS],
      evidence,
    );
  }
  if (
    evidence.ignoreStaleInFlightReplicaOperations &&
    evidence.inFlightReplicaOperationCount > NUM.ZERO &&
    evidence.staleDiscountCount > NUM.ZERO
  ) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
      [POST_REBALANCE_CLOSURE_REASON.IGNORED_STALE_REPLICA_OPERATIONS],
      evidence,
    );
  }
  return buildDimension(
    POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN,
    POST_REBALANCE_CLOSURE_STATE.CLOSED,
    POST_REBALANCE_CLOSURE_EMPTY_LIST,
    evidence,
  );
}

function classifyPublicationVisible(evidence) {
  return buildDimension(
    POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE,
    evidence.publicationVisibilityState,
    evidence.publicationVisibilityReasonCodes,
    evidence,
  );
}

function classifyCdcProjectionVisible(evidence) {
  const decision = POST_REBALANCE_CDC_PROJECTION_VISIBILITY_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  return buildDimension(
    POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE,
    decision.state,
    decision.reasonCodes,
    evidence,
  );
}

function classifyMembershipTrim(evidence, operationDrainState) {
  if (
    evidence.stalePublishedNodeIds.length > NUM.ZERO &&
    evidence.membershipFreezeActive !== true
  ) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM,
      POST_REBALANCE_CLOSURE_STATE.OPEN,
      [POST_REBALANCE_CLOSURE_REASON.PUBLISHED_MEMBERSHIP_TRIM_DEBT],
      evidence,
    );
  }
  if (evidence.overTargetPartitionIds.length === NUM.ZERO) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM,
      POST_REBALANCE_CLOSURE_STATE.CLOSED,
      POST_REBALANCE_CLOSURE_EMPTY_LIST,
      evidence,
    );
  }
  if (operationDrainState === POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
      [POST_REBALANCE_CLOSURE_REASON.IGNORED_STALE_REPLICA_OPERATIONS],
      evidence,
    );
  }
  if (operationDrainState === POST_REBALANCE_CLOSURE_STATE.OPEN) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM,
      POST_REBALANCE_CLOSURE_STATE.UNAVAILABLE,
      [POST_REBALANCE_CLOSURE_REASON.MEMBERSHIP_TRIM_BLOCKED_BY_OPERATION_DRAIN],
      evidence,
    );
  }
  return buildDimension(
    POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM,
    POST_REBALANCE_CLOSURE_STATE.OPEN,
    [POST_REBALANCE_CLOSURE_REASON.CURRENT_OVERTARGET_VOTERS],
    evidence,
  );
}

function classifyNoOverTarget(evidence, operationDrainState) {
  if (
    evidence.membershipFreezeActive === true &&
    evidence.overTargetPartitionIds.length > NUM.ZERO
  ) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.NO_OVER_TARGET,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
      [POST_REBALANCE_CLOSURE_REASON.CURRENT_OVERTARGET_VOTERS],
      evidence,
    );
  }
  if (evidence.maxOverTargetMs > evidence.maxSustainedOverTargetMs) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.NO_OVER_TARGET,
      POST_REBALANCE_CLOSURE_STATE.OPEN,
      [POST_REBALANCE_CLOSURE_REASON.OVERTARGET_BUDGET_EXCEEDED],
      evidence,
    );
  }
  if (evidence.overTargetPartitionIds.length === NUM.ZERO) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.NO_OVER_TARGET,
      POST_REBALANCE_CLOSURE_STATE.CLOSED,
      POST_REBALANCE_CLOSURE_EMPTY_LIST,
      evidence,
    );
  }
  if (operationDrainState === POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.NO_OVER_TARGET,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
      [POST_REBALANCE_CLOSURE_REASON.IGNORED_STALE_REPLICA_OPERATIONS],
      evidence,
    );
  }
  return buildDimension(
    POST_REBALANCE_CLOSURE_DIMENSION.NO_OVER_TARGET,
    POST_REBALANCE_CLOSURE_STATE.OPEN,
    [POST_REBALANCE_CLOSURE_REASON.CURRENT_OVERTARGET_VOTERS],
    evidence,
  );
}

function buildClosureMarker(dimension, suffix) {
  return dimension + suffix;
}

function buildPostRebalanceClosureSnapshot(
  options = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const evidence = collectClosureEvidence(options);
  const operationDrain = classifyOperationDrain(evidence);
  const publicationVisible = classifyPublicationVisible(evidence);
  const cdcProjectionVisible = classifyCdcProjectionVisible(evidence);
  const membershipTrim = classifyMembershipTrim(
    evidence,
    operationDrain.state,
  );
  const noOverTarget = classifyNoOverTarget(evidence, operationDrain.state);
  const dimensionList = [
    operationDrain,
    membershipTrim,
    publicationVisible,
    cdcProjectionVisible,
    noOverTarget,
  ];
  const dimensions = Object.fromEntries(
    dimensionList.map((dimension) => [dimension.dimension, dimension]),
  );
  const blockers = dimensionList
    .filter((dimension) => dimension.state === POST_REBALANCE_CLOSURE_STATE.OPEN)
    .map((dimension) => ({
      id: buildClosureMarker(
        dimension.dimension,
        POST_REBALANCE_CLOSURE_BLOCKER_SUFFIX,
      ),
      dimension: dimension.dimension,
      reasonCodes: dimension.reasonCodes,
    }));
  const softClosures = dimensionList
    .filter(
      (dimension) =>
        dimension.state === POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
    )
    .map((dimension) => ({
      id: buildClosureMarker(
        dimension.dimension,
        POST_REBALANCE_CLOSURE_SOFT_SUFFIX,
      ),
      dimension: dimension.dimension,
      reasonCodes: dimension.reasonCodes,
    }));
  const state =
    blockers.length > NUM.ZERO ?
      POST_REBALANCE_CLOSURE_STATE.OPEN :
      softClosures.length > NUM.ZERO ?
        POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED :
        POST_REBALANCE_CLOSURE_STATE.CLOSED;

  return {
    state,
    blockers,
    softClosures,
    dimensions,
  };
}

function isPostRebalanceCdcProjectionVisibleSatisfied(
  options = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const evidence = collectClosureEvidence(options);
  const cdcProjectionVisible = classifyCdcProjectionVisible(evidence);
  return POST_REBALANCE_CLOSURE_TERMINAL_STATES.includes(
    cdcProjectionVisible.state,
  );
}

export {
  POST_REBALANCE_CLOSURE_DIMENSION,
  POST_REBALANCE_CLOSURE_REASON,
  POST_REBALANCE_CLOSURE_STATE,
  buildPostRebalanceClosureSnapshot,
  countCacheVisibleSatisfiedPriorityRecoveryOperations,
  isPostRebalanceCdcProjectionVisibleSatisfied,
};
