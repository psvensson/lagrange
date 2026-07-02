import {
  isReplicaOperationInFlight,
  isReplicaOperationStale,
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
  IGNORED_POST_PUBLICATION_REPLICA_OPERATIONS:
    'ignored_post_publication_replica_operations',
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
const PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT = 'in_flight';
const PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE = 'remove_phase';
const PRIORITY_RECOVERY_OPERATION_STATUS_FAILED = 'failed';
const PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE_TERMINAL = 'terminal';
const PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_FRESH =
  'closure_satisfied_fresh';
const PRIORITY_RECOVERY_FAILURE_STATES = Object.freeze(new Set([
  PRIORITY_RECOVERY_OPERATION_STATUS_FAILED,
  'failed_terminal',
  'terminal_failed',
]));
const PRIORITY_RECOVERY_SATISFIED_COMPLETION_STATES = Object.freeze([
  PRIORITY_RECOVERY_COMPLETION_STATE_SPREAD_SATISFIED_IN_FLIGHT,
  PRIORITY_RECOVERY_COMPLETION_STATE_CONVERGED,
]);
const PRIORITY_RECOVERY_ACTIVE_WORKFLOW_STATES = Object.freeze(new Set([
  PRIORITY_RECOVERY_WORKFLOW_STATE_IN_FLIGHT,
  PRIORITY_RECOVERY_WORKFLOW_STATE_REMOVE_PHASE,
]));
const POST_REBALANCE_CLOSURE_TERMINAL_STATES = Object.freeze([
  POST_REBALANCE_CLOSURE_STATE.CLOSED,
  POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
]);
const POST_REBALANCE_CLOSURE_BLOCKER_SUFFIX = '_open';
const POST_REBALANCE_CLOSURE_SOFT_SUFFIX = '_soft_closed';
const POST_REBALANCE_CLOSURE_TEXT_EMPTY = '';
// Marker written into per-dimension evidence where the shared (multi-MB)
// controlPlaneDiagnostics object used to be embedded; the single real copy
// lives at the closure snapshot's own top level.
const POST_REBALANCE_CLOSURE_DIAGNOSTICS_HOISTED_REF =
  '@postRebalanceClosure.controlPlaneDiagnostics';
const POST_REBALANCE_CLOSURE_EMPTY_LIST = Object.freeze([]);
const POST_REBALANCE_CLOSURE_EMPTY_RECORD = Object.freeze({});
const REPLICA_OPERATION_DRAIN_DISCOUNT_REASON = Object.freeze({
  CACHE_VISIBLE_PRIORITY_RECOVERY: 'cache_visible_priority_recovery',
  POST_PUBLICATION_TOPOLOGY: 'post_publication_topology',
  STALE_IN_FLIGHT: 'stale_in_flight',
});
const POST_PUBLICATION_TOPOLOGY_PARTITION_IDS = Object.freeze(new Set([
  'message_groups-p1',
  'node_endpoints-p1',
  'nodes-p1',
  'partitions-p1',
  'service_endpoints-p1',
  'services-p1',
]));
const PRIORITY_RECOVERY_PARTITION_IDS = Object.freeze(new Set([
  'control_plane_publications-p1',
  'replica_operations-p1',
  'sql_transaction_participants-p1',
  'sql_transactions-p1',
  'sql_write_operations-p1',
]));
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
    matches: (evidence) => evidence.expectedPartitionIds.length === 0,
    state: POST_REBALANCE_CLOSURE_STATE.UNAVAILABLE,
    reasonCodes: Object.freeze([
      POST_REBALANCE_CLOSURE_REASON.CDC_PROJECTION_UNAVAILABLE,
    ]),
  }),
  Object.freeze({
    matches: (evidence) => evidence.missingLeaderPartitionIds.length === 0,
    state: POST_REBALANCE_CLOSURE_STATE.CLOSED,
    reasonCodes: POST_REBALANCE_CLOSURE_EMPTY_LIST,
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.ignoreStaleInFlightReplicaOperations === true &&
      evidence.staleDiscountCount > 0 &&
      evidence.uncoveredMissingLeaderPartitionIds.length === 0,
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

function normalizeNonNegativeInteger(value, fallback = 0) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue >= 0) {
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
        .filter((value) => value.length > 0),
    ),
  ].sort();
}

function normalizeEntries(value = POST_REBALANCE_CLOSURE_EMPTY_RECORD) {
  if (value instanceof Map) {
    return Array.from(value.entries());
  }
  if (
    value &&
    typeof value === 'object' &&
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
    if (key.length === 0) {
      continue;
    }
    countMap.set(key, normalizeNonNegativeInteger(rawCount, 0));
  }
  return countMap;
}

function normalizeDurationRecord(value = POST_REBALANCE_CLOSURE_EMPTY_RECORD) {
  const durationRecord = {};
  for (const [rawKey, rawDuration] of normalizeEntries(value)) {
    const key = String(rawKey || POST_REBALANCE_CLOSURE_TEXT_EMPTY).trim();
    if (key.length === 0) {
      continue;
    }
    durationRecord[key] = normalizeNonNegativeInteger(rawDuration, 0);
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
    if (key.length > 0 && leader.length > 0) {
      leaderPartitionIds.add(key);
    }
  }
  return leaderPartitionIds;
}

function getDiagnosticsObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ?
    value :
    POST_REBALANCE_CLOSURE_EMPTY_RECORD;
}

function getPublicationConvergence(controlPlaneDiagnostics) {
  return getDiagnosticsObject(controlPlaneDiagnostics?.publicationConvergence);
}

function getPublishedMembershipObservation(controlPlaneDiagnostics) {
  return getDiagnosticsObject(
    controlPlaneDiagnostics?.publishedMembershipObservation,
  );
}

function getActiveNodeViews(controlPlaneDiagnostics) {
  return getDiagnosticsObject(controlPlaneDiagnostics?.activeNodeViews);
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
    if (durationMs > 0) {
      partitionIds.add(partitionId);
    }
  }
  return Array.from(partitionIds).sort();
}

function collectCacheVisiblePriorityRecoveryEvidence(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
  options = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const diagnosticsSources = collectPriorityRecoveryDiagnosticsSources(
    controlPlaneDiagnostics,
  );
  const openWorkflowPartitionIds =
    collectOpenPriorityRecoveryWorkflowPartitionIds(diagnosticsSources);
  const satisfiedClosurePartitionIds =
    collectSatisfiedPriorityRecoveryClosurePartitionIds(diagnosticsSources);
  const evidence = [];
  for (const source of diagnosticsSources) {
    evidence.push(...collectPriorityRecoveryWitnessEvidence(
      source,
      satisfiedClosurePartitionIds,
    ));
    evidence.push(...collectPriorityRecoverySummaryEvidence(
      source,
      openWorkflowPartitionIds,
      options,
      satisfiedClosurePartitionIds,
    ));
    evidence.push(...collectPriorityRecoveryDecisionSnapshotEvidence(
      source,
      satisfiedClosurePartitionIds,
    ));
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
    if (candidate && typeof candidate === 'object' &&
      !Array.isArray(candidate)) {
      sources.push(candidate);
    }
  }
  return sources;
}

function collectPriorityRecoveryWitnessEvidence(
  source,
  satisfiedClosurePartitionIds = new Set(),
) {
  const evidence = [];
  const allowOpenSatisfiedWorkflow =
    isPriorityRecoveryClosureSatisfied(source);
  for (const witness of collectPriorityRecoveryWitnessSnapshots(source)) {
    const partitionCoveredByClosure =
      isPriorityRecoveryPartitionCoveredBySatisfiedClosure(
        witness?.partitionId,
        satisfiedClosurePartitionIds,
      );
    if (!isCacheVisibleSatisfiedPriorityRecoverySnapshot(
      witness,
      {
        allowOpenSatisfiedWorkflow:
          allowOpenSatisfiedWorkflow || partitionCoveredByClosure,
      },
    )) {
      continue;
    }
    evidence.push({
      operationIds: witness.operationIds,
      partitionIds: [witness.partitionId],
    });
  }
  return evidence;
}

function collectPriorityRecoverySummaryEvidence(
  source,
  openWorkflowPartitionIds = new Set(),
  options = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
  satisfiedClosurePartitionIds = new Set(),
) {
  const evidence = [];
  const allowOpenSatisfiedWorkflow =
    isPriorityRecoveryClosureSatisfied(source);
  const hasSatisfiedClosurePartitionEvidence =
    satisfiedClosurePartitionIds.size > 0;
  const requireSatisfiedClosureForSummaryEvidence =
    options.requireSatisfiedClosureForSummaryEvidence === true;
  const allowSummaryPartitionEvidence =
    requireSatisfiedClosureForSummaryEvidence !== true ||
    allowOpenSatisfiedWorkflow === true ||
    hasSatisfiedClosurePartitionEvidence === true;
  const partitionIdsBySemanticState =
    source?.priorityRecoveryPartitionIdsBySemanticState &&
    typeof source.priorityRecoveryPartitionIdsBySemanticState === 'object' ?
      source.priorityRecoveryPartitionIdsBySemanticState :
      source?.partitionIdsBySemanticState &&
          typeof source.partitionIdsBySemanticState === 'object' ?
        source.partitionIdsBySemanticState :
        POST_REBALANCE_CLOSURE_EMPTY_RECORD;
  evidence.push({
    operationIds: POST_REBALANCE_CLOSURE_EMPTY_LIST,
    partitionIds: Array.isArray(
      partitionIdsBySemanticState[
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
      ],
    ) && allowSummaryPartitionEvidence === true ?
      partitionIdsBySemanticState[
        PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT
      ].filter((partitionId) => {
        const partitionCoveredByClosure =
          isPriorityRecoveryPartitionCoveredBySatisfiedClosure(
            partitionId,
            satisfiedClosurePartitionIds,
          );
        if (
          requireSatisfiedClosureForSummaryEvidence &&
          hasSatisfiedClosurePartitionEvidence
        ) {
          return partitionCoveredByClosure;
        }
        return (
          allowOpenSatisfiedWorkflow === true ||
          partitionCoveredByClosure ||
          !openWorkflowPartitionIds.has(String(
            partitionId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
          ).trim())
        );
      }) :
      POST_REBALANCE_CLOSURE_EMPTY_LIST,
  });

  for (const partitionSnapshot of collectPriorityRecoveryPartitionSnapshots(
    source,
  )) {
    if (!isCacheVisibleSatisfiedPriorityRecoverySnapshot(
      partitionSnapshot,
      {allowOpenSatisfiedWorkflow},
    )) {
      continue;
    }
    evidence.push({
      operationIds: partitionSnapshot.operationIds,
      partitionIds: [partitionSnapshot.partitionId],
    });
  }

  return evidence;
}

function collectPriorityRecoveryDecisionSnapshotEvidence(
  source,
  satisfiedClosurePartitionIds = new Set(),
) {
  const evidence = [];
  const allowOpenSatisfiedWorkflow =
    isPriorityRecoveryClosureSatisfied(source);
  for (const snapshot of collectPriorityRecoveryDecisionSnapshots(source)) {
    const partitionCoveredByClosure =
      isPriorityRecoveryPartitionCoveredBySatisfiedClosure(
        snapshot?.partitionId,
        satisfiedClosurePartitionIds,
      );
    if (!isCacheVisibleSatisfiedPriorityRecoverySnapshot(
      snapshot,
      {
        allowOpenSatisfiedWorkflow:
          allowOpenSatisfiedWorkflow || partitionCoveredByClosure,
      },
    )) {
      continue;
    }
    evidence.push({
      operationIds: collectPriorityRecoverySnapshotOperationIds(snapshot),
      partitionIds: [snapshot.partitionId],
    });
  }
  return evidence;
}

function collectPriorityRecoveryWitnessSnapshots(source) {
  return Array.isArray(source?.priorityRecoveryPartitionWitnesses) ?
    source.priorityRecoveryPartitionWitnesses :
    Array.isArray(source?.partitionWitnesses) ?
      source.partitionWitnesses :
      POST_REBALANCE_CLOSURE_EMPTY_LIST;
}

function collectPriorityRecoveryPartitionSnapshots(source) {
  return Array.isArray(source?.priorityRecoveryPartitionSnapshots) ?
    source.priorityRecoveryPartitionSnapshots :
    Array.isArray(source?.partitionSnapshots) ?
      source.partitionSnapshots :
      POST_REBALANCE_CLOSURE_EMPTY_LIST;
}

function collectPriorityRecoveryDecisionSnapshots(source) {
  return Array.isArray(source?.priorityRecoveryDecisionSnapshots) ?
    source.priorityRecoveryDecisionSnapshots :
    Array.isArray(source?.priorityRecoveryDecisionSnapshots?.snapshots) ?
      source.priorityRecoveryDecisionSnapshots.snapshots :
      POST_REBALANCE_CLOSURE_EMPTY_LIST;
}

function collectPriorityRecoveryPartitionSummaries(source) {
  return [
    source?.priorityPartitionSummary,
    source?.priorityRecoveryPartitionSummary,
    source?.publicationConvergenceGate?.priorityPartitionSummary,
  ].filter((candidate) =>
    candidate && typeof candidate === 'object' && !Array.isArray(candidate));
}

function normalizeBlockedPriorityPartitionId(partition) {
  return String(
    partition?.partitionId ||
      partition?.partition_id ||
      partition?.id ||
      partition ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
}

function collectOpenPriorityRecoveryWorkflowPartitionIds(sources) {
  const partitionIds = new Set();
  for (const source of sources) {
    for (const snapshot of [
      ...collectPriorityRecoveryWitnessSnapshots(source),
      ...collectPriorityRecoveryPartitionSnapshots(source),
      ...collectPriorityRecoveryDecisionSnapshots(source),
    ]) {
      if (!isPriorityRecoveryWorkflowOpen(snapshot)) {
        continue;
      }
      const partitionId = String(
        snapshot?.partitionId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
      ).trim();
      if (partitionId.length > 0) {
        partitionIds.add(partitionId);
      }
    }
  }
  return partitionIds;
}

function collectOpenPriorityRecoverySummaryPartitionIds(sources) {
  const partitionIds = new Set();
  for (const source of sources) {
    for (const summary of collectPriorityRecoveryPartitionSummaries(source)) {
      for (const partitionId of normalizeStringList(summary.missingPartitionIds)) {
        partitionIds.add(partitionId);
      }
      for (const partition of Array.isArray(summary.blockedPartitions) ?
        summary.blockedPartitions :
        POST_REBALANCE_CLOSURE_EMPTY_LIST) {
        const partitionId = normalizeBlockedPriorityPartitionId(partition);
        if (partitionId.length > 0) {
          partitionIds.add(partitionId);
        }
      }
      for (const partitionId of normalizeStringList(summary.blockedPartitionIds)) {
        partitionIds.add(partitionId);
      }
      if (
        summary.satisfied === false ||
        normalizeNonNegativeInteger(summary.blockedPartitionCount) > 0
      ) {
        partitionIds.add(POST_REBALANCE_CLOSURE_TEXT_EMPTY);
      }
    }
  }
  return partitionIds;
}

function isPriorityRecoveryPartitionSummarySatisfied(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return false;
  }
  const blockedPartitions = Array.isArray(summary.blockedPartitions) ?
    summary.blockedPartitions :
    POST_REBALANCE_CLOSURE_EMPTY_LIST;
  return (
    summary.satisfied === true &&
    normalizeStringList(summary.missingPartitionIds).length === 0 &&
    normalizeStringList(summary.blockedPartitionIds).length === 0 &&
    blockedPartitions.length === 0 &&
    normalizeNonNegativeInteger(summary.blockedPartitionCount) === 0
  );
}

function hasSatisfiedPriorityRecoveryPartitionSummary(sources) {
  for (const source of sources) {
    if (
      collectPriorityRecoveryPartitionSummaries(source).some(
        isPriorityRecoveryPartitionSummarySatisfied,
      )
    ) {
      return true;
    }
  }
  return false;
}

function resolvePriorityRecoveryClosureWitness(source) {
  return source?.priorityRecoveryClosureWitness ||
    source?.publicationRecoveryGate?.priorityRecoveryClosureWitness ||
    source?.publicationConvergenceGate?.priorityRecoveryClosureWitness ||
    null;
}

function collectSatisfiedPriorityRecoveryClosurePartitionIds(sources) {
  const partitionIds = new Set();
  for (const source of sources) {
    const witness = resolvePriorityRecoveryClosureWitness(source);
    if (!isPriorityRecoveryClosureWitnessSatisfied(witness)) {
      continue;
    }
    addNormalizedIds(partitionIds, witness.satisfiedPartitionIds);
    addNormalizedIds(partitionIds, witness.decisionPartitionIds);
  }
  return partitionIds;
}

function isPriorityRecoveryPartitionCoveredBySatisfiedClosure(
  partitionId,
  satisfiedClosurePartitionIds,
) {
  const normalizedPartitionId = String(
    partitionId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  return (
    normalizedPartitionId.length > 0 &&
    satisfiedClosurePartitionIds instanceof Set &&
    satisfiedClosurePartitionIds.has(normalizedPartitionId)
  );
}

function hasOpenPriorityRecoveryResiduals(controlPlaneDiagnostics) {
  const sources = collectPriorityRecoveryDiagnosticsSources(
    controlPlaneDiagnostics,
  );
  const openSummaryPartitionIds =
    collectOpenPriorityRecoverySummaryPartitionIds(sources);
  if (openSummaryPartitionIds.size > 0) {
    return true;
  }
  const openWorkflowPartitionIds =
    collectOpenPriorityRecoveryWorkflowPartitionIds(sources);
  if (
    openWorkflowPartitionIds.size > 0 &&
    hasSatisfiedPriorityRecoveryPartitionSummary(sources) !== true
  ) {
    return true;
  }
  return (
    false
  );
}

function isPriorityRecoveryClosureWitnessSatisfied(witness) {
  if (!witness || typeof witness !== 'object' || Array.isArray(witness)) {
    return false;
  }
  if (witness.state !== PRIORITY_RECOVERY_CLOSURE_STATE_SATISFIED_FRESH) {
    return false;
  }
  return (
    witness.prioritySpreadPending !== true &&
    witness.publicationRefreshRequired !== true &&
    normalizeStringList(witness.blockedPartitionIds).length === 0 &&
    normalizeStringList(witness.unresolvedSemanticStateIds).length ===
      0 &&
    normalizeNonNegativeInteger(witness.blockedPartitionCount) === 0 &&
    normalizeNonNegativeInteger(witness.unresolvedSemanticStateCount) ===
      0
  );
}

function isPriorityRecoveryClosureSatisfied(source) {
  return isPriorityRecoveryClosureWitnessSatisfied(
    resolvePriorityRecoveryClosureWitness(source),
  );
}

function hasOpenPublicationDebt(publicationConvergence) {
  if (
    normalizeStringList(publicationConvergence.pendingAckNodeIds).length >
      0 ||
    normalizeStringList(publicationConvergence.missingPublishedNodeIds).length >
      0 ||
    normalizeStringList(
      publicationConvergence.missingPublishedRecoveryActiveNodeIds,
    ).length > 0
  ) {
    return true;
  }
  return (
    normalizeNonNegativeInteger(publicationConvergence.pendingAckCount) >
      0 ||
    normalizeNonNegativeInteger(publicationConvergence.missingPublishedCount) >
      0
  );
}

function isPublishedPublicationVisibilityClosed(controlPlaneDiagnostics) {
  const publicationVisibility =
    resolvePublicationVisibility(controlPlaneDiagnostics, false);
  const publicationConvergence =
    getPublicationConvergence(controlPlaneDiagnostics);
  return (
    publicationVisibility.state === POST_REBALANCE_CLOSURE_STATE.CLOSED &&
    publicationVisibility.rawPublicationStatus ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
    hasOpenPublicationDebt(publicationConvergence) !== true
  );
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

function normalizePriorityRecoverySnapshotText(value) {
  return String(value || POST_REBALANCE_CLOSURE_TEXT_EMPTY).trim();
}

function normalizePriorityRecoverySnapshotState(value) {
  return normalizePriorityRecoverySnapshotText(value).toLowerCase();
}

function resolvePriorityRecoverySnapshotCompletionState(snapshot) {
  return normalizePriorityRecoverySnapshotText(
    snapshot?.completionState ||
      snapshot?.completion?.state ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  );
}

function isPriorityRecoverySnapshotCompletionSatisfied(snapshot) {
  const semanticState = String(
    snapshot?.semanticState ||
      snapshot?.semanticStateId ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  const completionState =
    resolvePriorityRecoverySnapshotCompletionState(snapshot);
  return (
    semanticState ===
      PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT ||
    PRIORITY_RECOVERY_SATISFIED_COMPLETION_STATES.includes(completionState) ||
    snapshot?.spreadCompletion?.satisfied === true
  );
}

function isPriorityRecoverySnapshotCacheVisible(snapshot) {
  const visibilityState = normalizePriorityRecoverySnapshotText(
    snapshot?.visibilityState ||
      snapshot?.authoritativeVisibilityState ||
      snapshot?.observation?.visibilityState ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  );
  return visibilityState === PRIORITY_RECOVERY_VISIBILITY_STATE_CACHE_VISIBLE;
}

function isPriorityRecoveryWorkflowTerminal(snapshot) {
  const workflowProgressPhaseId = normalizePriorityRecoverySnapshotText(
    snapshot?.workflowProgressPhaseId ||
      snapshot?.progress?.workflowProgressPhaseId ||
      snapshot?.observation?.workflowProgressPhaseId ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  );
  return (
    workflowProgressPhaseId ===
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE_TERMINAL
  );
}

function isPriorityRecoveryWorkflowFailure(snapshot) {
  return [
    snapshot?.latestOperationStatus,
    snapshot?.conditions?.latestOperationStatus,
    snapshot?.conditions?.operationStatus,
    snapshot?.observation?.latestOperationStatus,
    snapshot?.coordinator?.operation?.status,
    snapshot?.coordinator?.operation?.latestTimelineStatus,
    snapshot?.latestOperationWorkflowStep,
    snapshot?.observation?.latestOperationWorkflowStep,
    snapshot?.workflowState,
    snapshot?.observation?.workflowState,
    snapshot?.actuationState,
    snapshot?.conditions?.actuationState,
    snapshot?.observation?.actuationState,
    snapshot?.currentStepState,
    snapshot?.conditions?.currentStepState,
    snapshot?.topologyOperatorWitness?.currentStepState,
    snapshot?.terminalState,
    snapshot?.recoverability,
  ].some((value) =>
    PRIORITY_RECOVERY_FAILURE_STATES.has(
      normalizePriorityRecoverySnapshotState(value),
    ),
  );
}

function isPriorityRecoveryWorkflowOpen(snapshot) {
  const workflowState = normalizePriorityRecoverySnapshotState(
    snapshot?.workflowState ||
      snapshot?.observation?.workflowState ||
      POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  );
  if (isPriorityRecoveryWorkflowFailure(snapshot)) {
    return true;
  }
  // Terminal cache-visible satisfaction can outlive the durable operation row.
  if (
    isPriorityRecoveryWorkflowTerminal(snapshot) &&
    isPriorityRecoverySnapshotCacheVisible(snapshot) &&
    isPriorityRecoverySnapshotCompletionSatisfied(snapshot)
  ) {
    return false;
  }
  return (
    PRIORITY_RECOVERY_ACTIVE_WORKFLOW_STATES.has(workflowState)
  );
}

function isCacheVisibleSatisfiedPriorityRecoverySnapshot(
  snapshot,
  options = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  if (
    !isPriorityRecoverySnapshotCacheVisible(snapshot) ||
    !isPriorityRecoverySnapshotCompletionSatisfied(snapshot)
  ) {
    return false;
  }
  if (isPriorityRecoveryWorkflowFailure(snapshot)) {
    return false;
  }
  return (
    !isPriorityRecoveryWorkflowOpen(snapshot) ||
    options.allowOpenSatisfiedWorkflow === true
  );
}

function addNormalizedIds(target, ids) {
  for (const id of Array.isArray(ids) ? ids : POST_REBALANCE_CLOSURE_EMPTY_LIST) {
    const normalizedId = String(
      id || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    ).trim();
    if (normalizedId.length === 0) {
      continue;
    }
    target.add(normalizedId);
  }
}

function buildCacheVisibleSatisfiedPriorityRecoveryOperationIdSet(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
  options = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const operationIds = new Set();
  for (const evidence of collectCacheVisiblePriorityRecoveryEvidence(
    controlPlaneDiagnostics,
    options,
  )) {
    addNormalizedIds(operationIds, evidence.operationIds);
  }
  return operationIds;
}

function buildCacheVisibleSatisfiedPriorityRecoveryPartitionIdSet(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
  options = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const partitionIds = new Set();
  for (const evidence of collectCacheVisiblePriorityRecoveryEvidence(
    controlPlaneDiagnostics,
    options,
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
  if (operationIds.size === 0 && partitionIds.size === 0) {
    return 0;
  }
  let matchingOperationCount = 0;
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
      operationId.length > 0 && operationIds.has(operationId);
    const matchesByPartitionId =
      partitionId.length > 0 && partitionIds.has(partitionId);
    if (!matchesByOperationId && !matchesByPartitionId) {
      continue;
    }
    matchingOperationCount += 1;
  }
  return matchingOperationCount > 0 ?
    matchingOperationCount :
    Math.max(operationIds.size, partitionIds.size);
}

function isCacheVisibleSatisfiedPriorityRecoveryOperation(
  normalizedOperation,
  operationIds,
  partitionIds,
) {
  const operationId = String(
    normalizedOperation.operationId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  const partitionId = String(
    normalizedOperation.partitionId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  return (
    operationId.length > 0 && operationIds.has(operationId) ||
    partitionId.length > 0 && partitionIds.has(partitionId)
  );
}

function isPriorityRecoveryReplicaOperation(normalizedOperation) {
  const partitionId = String(
    normalizedOperation.partitionId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  return PRIORITY_RECOVERY_PARTITION_IDS.has(partitionId);
}

function isPostPublicationTopologyReplicaOperation(normalizedOperation) {
  const partitionId = String(
    normalizedOperation.partitionId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  const entityType = String(
    normalizedOperation.entityType || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim().toLowerCase();
  return (
    entityType === 'message_group' ||
    partitionId.startsWith('mg-') ||
    POST_PUBLICATION_TOPOLOGY_PARTITION_IDS.has(partitionId)
  );
}

function isPostPublicationReplicaOperationDiscountAllowed(
  controlPlaneDiagnostics,
  options,
) {
  if (
    options.allowPostPublicationNonBlockingReplicaOperations !== true ||
    options.cdcProjectionVisibleSatisfied !== true ||
    options.criticalSystemTopologyReady !== true
  ) {
    return false;
  }
  return (
    isPublishedPublicationVisibilityClosed(controlPlaneDiagnostics) &&
    hasOpenPriorityRecoveryResiduals(controlPlaneDiagnostics) !== true
  );
}

function hasReplicaOperationTimelineInFlightEvidence(operationId, options) {
  const timelineById =
    options.operationTimelineById &&
    typeof options.operationTimelineById === 'object' ?
      options.operationTimelineById :
      POST_REBALANCE_CLOSURE_EMPTY_RECORD;
  const timeline = Array.isArray(timelineById[operationId]) ?
    timelineById[operationId] :
    POST_REBALANCE_CLOSURE_EMPTY_LIST;
  return timeline.some((entry) => entry?.inFlight === true);
}

function hasReplicaOperationInFlightEvidence(normalizedOperation, options) {
  const operationId = String(
    normalizedOperation.operationId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
  ).trim();
  const inFlightOperationIds = new Set(normalizeStringList(
    options.inFlightOperationIds,
  ));
  return (
    isReplicaOperationInFlight(normalizedOperation) ||
    operationId.length > 0 && inFlightOperationIds.has(operationId) ||
    operationId.length > 0 &&
      hasReplicaOperationTimelineInFlightEvidence(operationId, options)
  );
}

function resolveAdditionalReplicaOperationDiscountReason(
  normalizedOperation,
  operationIds,
  partitionIds,
  postPublicationDiscountAllowed,
) {
  if (
    isCacheVisibleSatisfiedPriorityRecoveryOperation(
      normalizedOperation,
      operationIds,
      partitionIds,
    )
  ) {
    return REPLICA_OPERATION_DRAIN_DISCOUNT_REASON
      .CACHE_VISIBLE_PRIORITY_RECOVERY;
  }
  if (
    postPublicationDiscountAllowed &&
    !isPriorityRecoveryReplicaOperation(normalizedOperation) &&
    isPostPublicationTopologyReplicaOperation(normalizedOperation)
  ) {
    return REPLICA_OPERATION_DRAIN_DISCOUNT_REASON.POST_PUBLICATION_TOPOLOGY;
  }
  return null;
}

function buildReplicaOperationDrainDiagnosticRow(
  normalizedOperation,
  options,
) {
  const inFlight = options.inFlight === true;
  const stale = options.stale === true;
  const additionalDiscountReason = options.additionalDiscountReason || null;
  const additionalInFlightDiscountEligible =
    inFlight && stale !== true && additionalDiscountReason !== null;
  const additionalInFlightDiscountApplied =
    additionalInFlightDiscountEligible &&
    options.criticalSystemTopologyReady === true;

  return Object.freeze({
    operationId:
      normalizedOperation.operationId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    partitionId:
      normalizedOperation.partitionId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    entityType:
      normalizedOperation.entityType || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    entityId:
      normalizedOperation.entityId || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    type: normalizedOperation.type || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    status: normalizedOperation.status || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    workflowStep:
      normalizedOperation.workflowStep || POST_REBALANCE_CLOSURE_TEXT_EMPTY,
    updatedAt: Number.isFinite(normalizedOperation.updatedAt) ?
      normalizedOperation.updatedAt :
      null,
    inFlight,
    stale,
    staleDiscountApplied: inFlight && stale,
    additionalDiscountReason,
    additionalInFlightDiscountEligible,
    additionalInFlightDiscountApplied,
    effectiveInFlight:
      inFlight &&
      stale !== true &&
      additionalInFlightDiscountApplied !== true,
  });
}

function buildPostRebalanceReplicaOperationDrainDiagnostics(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
  operationRows = POST_REBALANCE_CLOSURE_EMPTY_LIST,
  options = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  const operationIds =
    buildCacheVisibleSatisfiedPriorityRecoveryOperationIdSet(
      controlPlaneDiagnostics,
      {requireSatisfiedClosureForSummaryEvidence: true},
    );
  const partitionIds =
    buildCacheVisibleSatisfiedPriorityRecoveryPartitionIdSet(
      controlPlaneDiagnostics,
      {requireSatisfiedClosureForSummaryEvidence: true},
    );
  const postPublicationDiscountAllowed =
    isPostPublicationReplicaOperationDiscountAllowed(
      controlPlaneDiagnostics,
      options,
    );
  const nowMs = Number.isFinite(options.nowMs) ?
    Math.floor(options.nowMs) :
    Date.now();
  const diagnosticRows = [];

  for (const operationRow of Array.isArray(operationRows) ?
    operationRows :
    POST_REBALANCE_CLOSURE_EMPTY_LIST) {
    const normalizedOperation = normalizeReplicaOperationRecord(operationRow, {
      nowMs,
    });
    const inFlight = hasReplicaOperationInFlightEvidence(
      normalizedOperation,
      options,
    );
    if (!inFlight) {
      continue;
    }
    // Census run2 rank3: this is the QUIESCENCE oracle's staleness classification, so cap
    // the SYNCING stale timeout for ALL partitions below the wait budget (the coordinator's
    // own retry budget is unaffected — it never passes this flag).
    const stale = isReplicaOperationStale(normalizedOperation, {
      nowMs,
      capSyncingStaleTimeoutForAllPartitions: true,
    });
    const additionalDiscountReason =
      stale ?
        null :
        resolveAdditionalReplicaOperationDiscountReason(
          normalizedOperation,
          operationIds,
          partitionIds,
          postPublicationDiscountAllowed,
        );
    diagnosticRows.push(buildReplicaOperationDrainDiagnosticRow(
      normalizedOperation,
      {
        inFlight,
        stale,
        additionalDiscountReason,
        criticalSystemTopologyReady: options.criticalSystemTopologyReady,
      },
    ));
  }

  return Object.freeze(diagnosticRows);
}

function countAdditionalPostRebalanceReplicaOperationDiscounts(
  controlPlaneDiagnostics = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
  operationRows = POST_REBALANCE_CLOSURE_EMPTY_LIST,
  options = POST_REBALANCE_CLOSURE_EMPTY_RECORD,
) {
  return buildPostRebalanceReplicaOperationDrainDiagnostics(
    controlPlaneDiagnostics,
    operationRows,
    options,
  ).filter((row) => row.additionalInFlightDiscountEligible).length;
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
    0,
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
    expectedPartitionIdsFromOptions.length > 0 ?
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
    cacheVisibleSatisfiedPriorityRecoveryPartitionIds.length > 0 ?
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
    projectedActiveNodeIds.length > 0 ?
      publishedActiveNodeIds.filter(
        (nodeId) => !projectedActiveNodeIdSet.has(nodeId),
      ) :
      POST_REBALANCE_CLOSURE_EMPTY_LIST;
  const publicationVisibility = resolvePublicationVisibility(
    controlPlaneDiagnostics,
    publishedActiveNodeIds.length > 0,
  );
  const inFlightReplicaOperationCount = normalizeNonNegativeInteger(
    options.inFlightReplicaOperationCount,
    0,
  );
  const effectiveInFlightReplicaOperationCount = normalizeNonNegativeInteger(
    options.effectiveInFlightReplicaOperationCount,
    inFlightReplicaOperationCount,
  );
  const staleInFlightReplicaOperationCount = normalizeNonNegativeInteger(
    options.staleInFlightReplicaOperationCount,
    0,
  );
  const cacheVisibleSatisfiedPriorityRecoveryOperationCount =
    normalizeNonNegativeInteger(
      options.cacheVisibleSatisfiedPriorityRecoveryOperationCount,
      priorityRecoveryPartitionIds.length,
    );
  const additionalInFlightDiscountCount = normalizeNonNegativeInteger(
    options.additionalInFlightDiscountCount,
    0,
  );
  const staleDiscountCount = Math.min(
    inFlightReplicaOperationCount,
    staleInFlightReplicaOperationCount + additionalInFlightDiscountCount,
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
      0,
    ),
    maxSustainedOverTargetMs: normalizeNonNegativeInteger(
      options.maxSustainedOverTargetMs,
      0,
    ),
    inFlightReplicaOperationCount,
    effectiveInFlightReplicaOperationCount,
    staleInFlightReplicaOperationCount,
    cacheVisibleSatisfiedPriorityRecoveryOperationCount,
    additionalInFlightDiscountCount,
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
  if (evidence.effectiveInFlightReplicaOperationCount > 0) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN,
      POST_REBALANCE_CLOSURE_STATE.OPEN,
      [POST_REBALANCE_CLOSURE_REASON.IN_FLIGHT_REPLICA_OPERATIONS],
      evidence,
    );
  }
  if (
    evidence.ignoreStaleInFlightReplicaOperations &&
    evidence.inFlightReplicaOperationCount > 0 &&
    evidence.staleDiscountCount > 0
  ) {
    const reasonCodes = [];
    if (evidence.staleInFlightReplicaOperationCount > 0) {
      reasonCodes.push(
        POST_REBALANCE_CLOSURE_REASON.IGNORED_STALE_REPLICA_OPERATIONS,
      );
    }
    if (evidence.additionalInFlightDiscountCount > 0) {
      reasonCodes.push(
        POST_REBALANCE_CLOSURE_REASON
          .IGNORED_POST_PUBLICATION_REPLICA_OPERATIONS,
      );
    }
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.OPERATION_DRAIN,
      POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED,
      reasonCodes.length > 0 ?
        reasonCodes :
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
    evidence.stalePublishedNodeIds.length > 0 &&
    evidence.membershipFreezeActive !== true
  ) {
    return buildDimension(
      POST_REBALANCE_CLOSURE_DIMENSION.MEMBERSHIP_TRIM,
      POST_REBALANCE_CLOSURE_STATE.OPEN,
      [POST_REBALANCE_CLOSURE_REASON.PUBLISHED_MEMBERSHIP_TRIM_DEBT],
      evidence,
    );
  }
  if (evidence.overTargetPartitionIds.length === 0) {
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
    evidence.overTargetPartitionIds.length > 0
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
  if (evidence.overTargetPartitionIds.length === 0) {
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
  // The five dimensions share ONE evidence object in memory, but
  // JSON.stringify expands the shared reference into five byte-identical
  // copies — with the full controlPlaneDiagnostics blob (multi-MB on a real
  // cluster) inside each, this alone accounted for the bulk of a gate
  // report's ~190MB. Hoist the diagnostics to a single snapshot-level copy
  // and leave a path marker in the per-dimension evidence.
  const sharedEvidence = {
    ...evidence,
    controlPlaneDiagnostics: POST_REBALANCE_CLOSURE_DIAGNOSTICS_HOISTED_REF,
  };
  const dimensions = Object.fromEntries(
    dimensionList.map((dimension) => [
      dimension.dimension,
      {...dimension, evidence: sharedEvidence},
    ]),
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
    blockers.length > 0 ?
      POST_REBALANCE_CLOSURE_STATE.OPEN :
      softClosures.length > 0 ?
        POST_REBALANCE_CLOSURE_STATE.SOFT_CLOSED :
        POST_REBALANCE_CLOSURE_STATE.CLOSED;

  return {
    state,
    blockers,
    softClosures,
    controlPlaneDiagnostics: evidence.controlPlaneDiagnostics,
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
  buildPostRebalanceReplicaOperationDrainDiagnostics,
  countAdditionalPostRebalanceReplicaOperationDiscounts,
  countCacheVisibleSatisfiedPriorityRecoveryOperations,
  isPostRebalanceCdcProjectionVisibleSatisfied,
};
