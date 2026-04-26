import {NUM, TYPEOF} from '../../../src/constants/index.js';

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

const POST_REBALANCE_CLOSURE_BLOCKER_SUFFIX = '_open';
const POST_REBALANCE_CLOSURE_SOFT_SUFFIX = '_soft_closed';
const POST_REBALANCE_CLOSURE_TEXT_EMPTY = '';
const POST_REBALANCE_CLOSURE_EMPTY_LIST = Object.freeze([]);
const POST_REBALANCE_CLOSURE_EMPTY_RECORD = Object.freeze({});

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
      NUM.ZERO,
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
    staleDiscountCount,
    ignoreStaleInFlightReplicaOperations:
      options.ignoreStaleInFlightReplicaOperations === true,
    inFlightReplicaOperationStatuses: getDiagnosticsObject(
      options.inFlightReplicaOperationStatuses,
    ),
    publicationStatus: resolvePublicationStatus(controlPlaneDiagnostics),
    publicationAvailable:
      getPublicationConvergence(controlPlaneDiagnostics) !==
        POST_REBALANCE_CLOSURE_EMPTY_RECORD ||
      publishedActiveNodeIds.length > NUM.ZERO,
    publishedActiveNodeIds,
    projectedActiveNodeIds,
    stalePublishedNodeIds,
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
  if (!evidence.publicationAvailable) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE,
      POST_REBALANCE_CLOSURE_STATE.UNAVAILABLE,
      [POST_REBALANCE_CLOSURE_REASON.PUBLICATION_UNAVAILABLE],
      evidence,
    );
  }
  if (
    evidence.publicationStatus.length === NUM.ZERO ||
    evidence.publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
  ) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE,
      POST_REBALANCE_CLOSURE_STATE.CLOSED,
      POST_REBALANCE_CLOSURE_EMPTY_LIST,
      evidence,
    );
  }
  return buildDimension(
    POST_REBALANCE_CLOSURE_DIMENSION.PUBLICATION_VISIBLE,
    POST_REBALANCE_CLOSURE_STATE.OPEN,
    [POST_REBALANCE_CLOSURE_REASON.PUBLICATION_PENDING],
    evidence,
  );
}

function classifyCdcProjectionVisible(evidence) {
  if (evidence.expectedPartitionIds.length === NUM.ZERO) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE,
      POST_REBALANCE_CLOSURE_STATE.UNAVAILABLE,
      [POST_REBALANCE_CLOSURE_REASON.CDC_PROJECTION_UNAVAILABLE],
      evidence,
    );
  }
  if (evidence.missingLeaderPartitionIds.length > NUM.ZERO) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE,
      POST_REBALANCE_CLOSURE_STATE.OPEN,
      [POST_REBALANCE_CLOSURE_REASON.MISSING_PARTITION_LEADERS],
      evidence,
    );
  }
  return buildDimension(
    POST_REBALANCE_CLOSURE_DIMENSION.CDC_PROJECTION_VISIBLE,
    POST_REBALANCE_CLOSURE_STATE.CLOSED,
    POST_REBALANCE_CLOSURE_EMPTY_LIST,
    evidence,
  );
}

function classifyMembershipTrim(evidence, operationDrainState) {
  if (evidence.stalePublishedNodeIds.length > NUM.ZERO) {
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

export {
  POST_REBALANCE_CLOSURE_DIMENSION,
  POST_REBALANCE_CLOSURE_REASON,
  POST_REBALANCE_CLOSURE_STATE,
  buildPostRebalanceClosureSnapshot,
};
