import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {PRIORITY_CONTROL_PLANE_TABLE_IDS} from '../bootstrap/system-partition-classification.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON,
} from './priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP,
} from './priority-recovery-admission-constants.js';
import {
  inferPriorityRecoveryTableNameFromPartitionId,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {isReplaceRemoveDispatchPhase} from '../rebalancer/replica-status.js';
import {
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_SNAPSHOT_LITERAL,
  PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from './priority-recovery-snapshot-contract.js';
import {isPriorityRecoveryCompletedPlacementOperationContext, isPriorityRecoveryOperationContextTerminal} from './priority-recovery-snapshot-rebalancer.js';

function readFirstStringField(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === TYPEOF.STRING) {
      const trimmedValue = value.trim();
      if (trimmedValue.length > NUM.ZERO) {
        return trimmedValue;
      }
    }
  }
  return null;
}

function readFirstIntegerField(row, ...keys) {
  for (const key of keys) {
    const value = normalizePriorityRecoveryInteger(row?.[key]);
    if (Number.isFinite(value) && value > NUM.ZERO) {
      return value;
    }
  }
  return PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS;
}

function buildPriorityRecoverySemanticPartitionSetMap() {
  const partitionIdsBySemanticState = {};
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  return partitionIdsBySemanticState;
}

function isPriorityRecoverySpreadSatisfyingOperationContext(
  operationContext,
  options = {},
) {
  const targetNodeId = String(operationContext?.targetNodeId || '').trim();
  if (targetNodeId.length === NUM.ZERO) {
    return false;
  }
  const eligibleTargetNodeIds = new Set(
    normalizePriorityRecoveryStringList(options.eligibleTargetNodeIds),
  );
  if (eligibleTargetNodeIds.size === NUM.ZERO) {
    return false;
  }
  if (!eligibleTargetNodeIds.has(targetNodeId)) {
    return false;
  }
  if (isReplaceRemoveDispatchPhase(operationContext)) {
    return true;
  }
  return (
    operationContext?.targetVisibilityState ===
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL
  );
}

function resolvePriorityRecoverySpreadSatisfyingReasonCode(
  satisfyingOperationContexts = [],
) {
  if (
    satisfyingOperationContexts.some((operationContext) =>
      isReplaceRemoveDispatchPhase(operationContext),
    )
  ) {
    return PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.REPLACE_REMOVE_DISPATCH_PHASE_ON_ELIGIBLE_TARGET;
  }
  if (
    satisfyingOperationContexts.some(
      (operationContext) =>
        operationContext?.targetVisibilityState ===
        PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
    )
  ) {
    return PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE;
  }
  return PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.UNSATISFIED;
}

function buildPriorityRecoverySpreadCompletion(options = {}) {
  const activeOperationContexts = Array.isArray(options.activeOperationContexts) ?
    options.activeOperationContexts :
    [];
  const eligibleTargetNodeIds = normalizePriorityRecoveryStringList(
    options.eligibleTargetNodeIds,
  );
  const satisfyingOperationIds = [];
  const satisfyingOperationContexts = [];
  const blockingOperationIds = [];
  for (const operationContext of activeOperationContexts) {
    const operationId = String(operationContext?.operationId || '').trim();
    if (operationId.length === NUM.ZERO) {
      continue;
    }
    if (
      isPriorityRecoverySpreadSatisfyingOperationContext(operationContext, {
        eligibleTargetNodeIds,
      })
    ) {
      satisfyingOperationIds.push(operationId);
      satisfyingOperationContexts.push(operationContext);
      continue;
    }
    if (isPriorityRecoveryOperationContextTerminal(operationContext)) {
      continue;
    }
    blockingOperationIds.push(operationId);
  }
  if (options.plannerReady === true) {
    return Object.freeze({
      satisfied: true,
      reasonCode: PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.PLANNER_READY,
      satisfyingOperationIds: Object.freeze([...satisfyingOperationIds]),
      satisfyingOperationCount: satisfyingOperationIds.length,
      blockingOperationIds: Object.freeze([...blockingOperationIds]),
      blockingOperationCount: blockingOperationIds.length,
    });
  }
  if (satisfyingOperationIds.length > NUM.ZERO) {
    return Object.freeze({
      satisfied: true,
      reasonCode: resolvePriorityRecoverySpreadSatisfyingReasonCode(
        satisfyingOperationContexts,
      ),
      satisfyingOperationIds: Object.freeze([...satisfyingOperationIds]),
      satisfyingOperationCount: satisfyingOperationIds.length,
      blockingOperationIds: Object.freeze([...blockingOperationIds]),
      blockingOperationCount: blockingOperationIds.length,
    });
  }
  return Object.freeze({
    satisfied: false,
    reasonCode:
      blockingOperationIds.length > NUM.ZERO ?
        PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.ACTIVE_OPERATION_STILL_BLOCKS_SPREAD :
        PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.UNSATISFIED,
    satisfyingOperationIds: Object.freeze([]),
    satisfyingOperationCount: NUM.ZERO,
    blockingOperationIds: Object.freeze([...blockingOperationIds]),
    blockingOperationCount: blockingOperationIds.length,
  });
}

function buildPriorityRecoverySpreadRelevantOperationContexts(
  operationContexts = [],
) {
  const spreadRelevantOperationContexts = [];
  const seenOperationIds = new Set();
  const supersededOperationIds =
    buildPriorityRecoverySupersededOperationIdSet(operationContexts);
  for (const operationContext of Array.isArray(operationContexts) ?
    operationContexts :
    []) {
    if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
      continue;
    }
    const operationId = String(operationContext.operationId || '').trim();
    if (operationId.length > NUM.ZERO && seenOperationIds.has(operationId)) {
      continue;
    }
    if (
      operationId.length > NUM.ZERO &&
      supersededOperationIds.has(operationId)
    ) {
      continue;
    }
    if (
      isPriorityRecoveryOperationContextTerminal(operationContext) !== false &&
      isPriorityRecoveryCompletedPlacementOperationContext(operationContext) !==
        true
    ) {
      continue;
    }
    if (operationId.length > NUM.ZERO) {
      seenOperationIds.add(operationId);
    }
    spreadRelevantOperationContexts.push(operationContext);
  }
  return spreadRelevantOperationContexts;
}

function resolvePriorityRecoveryOperationContextFreshnessMs(operationContext) {
  const freshnessCandidates = [
    operationContext?.completedAtMs,
    operationContext?.updatedAtMs,
    operationContext?.createdAtMs,
  ]
    .map((candidate) => normalizePriorityRecoveryInteger(candidate))
    .filter((candidate) => Number.isFinite(candidate));
  if (freshnessCandidates.length === NUM.ZERO) {
    return NUM.NEGATIVE_ONE;
  }
  return Math.max(...freshnessCandidates);
}

function isPriorityRecoverySupersedableInFlightOperationContext(
  operationContext,
) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return false;
  }
  if (isPriorityRecoveryOperationContextTerminal(operationContext)) {
    return false;
  }
  if (isReplaceRemoveDispatchPhase(operationContext)) {
    return false;
  }
  return (
    operationContext.targetVisibilityState !==
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL
  );
}

function buildPriorityRecoverySupersededOperationIdSet(operationContexts = []) {
  const normalizedOperationContexts = Array.isArray(operationContexts) ?
    operationContexts.filter(
      (operationContext) =>
        operationContext && typeof operationContext === TYPEOF.OBJECT,
    ) :
    [];
  const latestTerminalFreshnessByPartitionId = new Map();
  for (const operationContext of normalizedOperationContexts) {
    if (isPriorityRecoveryOperationContextTerminal(operationContext) !== true) {
      continue;
    }
    if (
      isPriorityRecoveryCompletedPlacementOperationContext(operationContext)
    ) {
      continue;
    }
    const partitionId = String(
      operationContext.partitionId || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const terminalFreshness =
      resolvePriorityRecoveryOperationContextFreshnessMs(operationContext);
    if (!Number.isFinite(terminalFreshness)) {
      continue;
    }
    const previousFreshness =
      latestTerminalFreshnessByPartitionId.get(partitionId) || NUM.ZERO;
    if (terminalFreshness > previousFreshness) {
      latestTerminalFreshnessByPartitionId.set(partitionId, terminalFreshness);
    }
  }
  const supersededOperationIds = new Set();
  for (const operationContext of normalizedOperationContexts) {
    if (
      !isPriorityRecoverySupersedableInFlightOperationContext(operationContext)
    ) {
      continue;
    }
    const operationId = String(
      operationContext.operationId || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
    ).trim();
    const partitionId = String(
      operationContext.partitionId || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
    ).trim();
    if (operationId.length === NUM.ZERO || partitionId.length === NUM.ZERO) {
      continue;
    }
    const operationFreshness =
      resolvePriorityRecoveryOperationContextFreshnessMs(operationContext);
    const latestTerminalFreshness =
      latestTerminalFreshnessByPartitionId.get(partitionId) || NUM.NEGATIVE_ONE;
    if (
      Number.isFinite(operationFreshness) &&
      Number.isFinite(latestTerminalFreshness) &&
      latestTerminalFreshness > operationFreshness
    ) {
      supersededOperationIds.add(operationId);
    }
  }
  return supersededOperationIds;
}

function resolvePriorityRecoverySemanticState(options = {}) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    options.blockerReasons,
  );
  for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
    if (!blockerReasons.includes(blockerReason)) {
      continue;
    }
    return (
      PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED
    );
  }
  if (
    options.spreadCompletion?.satisfied === true &&
    options.hasActiveOperationContexts === true
  ) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  if (options.plannerReady === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
  }
  if (options.spreadCompletion?.satisfied === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  if (options.hasActiveOperationContexts === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
}

function resolvePriorityRecoveryReasonCodesFromReadiness(readinessEntry) {
  const reasons = Array.isArray(readinessEntry?.reasons) ?
    readinessEntry.reasons :
    [];
  return normalizePriorityRecoveryStringList(
    reasons.map((reason) =>
      String(reason?.code || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).trim(),
    ),
  );
}

function buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary) {
  const normalizedSummary =
    priorityPartitionSummary &&
    typeof priorityPartitionSummary === TYPEOF.OBJECT ?
      priorityPartitionSummary :
      null;
  const blockedPartitions = Array.isArray(normalizedSummary?.blockedPartitions) ?
    normalizedSummary.blockedPartitions :
    [];
  const missingPartitionIds = normalizePriorityRecoveryStringList(
    normalizedSummary?.missingPartitionIds,
  );
  const plannerByPartitionId = {};
  for (const partition of blockedPartitions) {
    const partitionId = String(partition?.partitionId || '').trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const spreadGap = Math.max(
      NUM.ZERO,
      normalizePriorityRecoveryInteger(partition?.spreadGap) || NUM.ZERO,
    );
    plannerByPartitionId[partitionId] = {
      partitionId,
      requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
        partition?.requiredDistinctNodeCount,
      ),
      readyDistinctNodeCount: normalizePriorityRecoveryInteger(
        partition?.readyDistinctNodeCount,
      ),
      readyReplicaCount: normalizePriorityRecoveryInteger(
        partition?.readyReplicaCount,
      ),
      // CL-021 witness pass-through: WHY rows were excluded from the ready
      // count (e.g. raft_role_missing) — without it the planner-blindness
      // cause is stripped before reaching the rebalancer diagnostics.
      ...(partition?.exclusionReasonCounts &&
        typeof partition.exclusionReasonCounts === TYPEOF.OBJECT ?
        {exclusionReasonCounts: {...partition.exclusionReasonCounts}} :
        {}),
      spreadGap,
      ready: spreadGap === NUM.ZERO,
      reasons:
        spreadGap > NUM.ZERO ?
          [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP] :
          [],
    };
  }
  for (const partitionId of missingPartitionIds) {
    if (plannerByPartitionId[partitionId]) {
      if (
        !plannerByPartitionId[partitionId].reasons.includes(
          PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
        )
      ) {
        plannerByPartitionId[partitionId].reasons.push(
          PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
        );
      }
      continue;
    }
    plannerByPartitionId[partitionId] = {
      partitionId,
      requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
        normalizedSummary?.requiredDistinctNodeCount,
      ),
      readyDistinctNodeCount: NUM.ZERO,
      spreadGap:
        normalizePriorityRecoveryInteger(
          normalizedSummary?.requiredDistinctNodeCount,
        ) || NUM.ONE,
      ready: false,
      reasons: [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING],
    };
  }
  return plannerByPartitionId;
}

function buildUnknownPriorityRecoveryPlanner(partitionId) {
  return {
    partitionId,
    requiredDistinctNodeCount: null,
    readyDistinctNodeCount: null,
    spreadGap: null,
    ready: null,
    reasons: [],
  };
}

function buildPriorityRecoveryPlannerEntry(
  partitionId,
  priorityPartitionSummary,
  plannerByPartitionId = null,
) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === NUM.ZERO) {
    return buildUnknownPriorityRecoveryPlanner(normalizedPartitionId);
  }
  const normalizedSummary =
    priorityPartitionSummary &&
    typeof priorityPartitionSummary === TYPEOF.OBJECT ?
      priorityPartitionSummary :
      null;
  const plannerById =
    plannerByPartitionId && typeof plannerByPartitionId === TYPEOF.OBJECT ?
      plannerByPartitionId :
      buildPriorityRecoveryPlannerByPartitionId(normalizedSummary);
  if (plannerById[normalizedPartitionId]) {
    return plannerById[normalizedPartitionId];
  }
  if (!normalizedSummary) {
    return buildUnknownPriorityRecoveryPlanner(normalizedPartitionId);
  }
  const blockedPartitionIds =
    buildPriorityRecoveryBlockedPartitionIds(normalizedSummary);
  if (
    hasPriorityRecoverySpreadGap(normalizedSummary) &&
    blockedPartitionIds.length === NUM.ZERO
  ) {
    return buildUnknownPriorityRecoveryPlanner(normalizedPartitionId);
  }
  return {
    partitionId: normalizedPartitionId,
    requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
      normalizedSummary.requiredDistinctNodeCount,
    ),
    readyDistinctNodeCount: null,
    spreadGap: NUM.ZERO,
    ready: true,
    reasons: [],
  };
}

function buildPriorityRecoveryBlockedPartitions(priorityPartitionSummary) {
  return Object.values(
    buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary),
  ).sort((left, right) => left.partitionId.localeCompare(right.partitionId));
}

function buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary) {
  return buildPriorityRecoveryBlockedPartitions(priorityPartitionSummary).map(
    (entry) => entry.partitionId,
  );
}

function hasPriorityRecoverySpreadGap(priorityPartitionSummary) {
  const normalizedSummary =
    priorityPartitionSummary &&
    typeof priorityPartitionSummary === TYPEOF.OBJECT ?
      priorityPartitionSummary :
      null;
  if (!normalizedSummary) {
    return false;
  }
  if (
    buildPriorityRecoveryBlockedPartitionIds(normalizedSummary).length >
    NUM.ZERO
  ) {
    return true;
  }
  return normalizedSummary.satisfied === false;
}

function buildPriorityRecoveryDecisionPartitionIdSet(decisionSnapshots = null) {
  const partitionIds = new Set();
  if (!decisionSnapshots || typeof decisionSnapshots !== TYPEOF.OBJECT) {
    return partitionIds;
  }
  for (const snapshot of Array.isArray(decisionSnapshots.snapshots) ?
    decisionSnapshots.snapshots :
    []) {
    const partitionId = String(snapshot?.partitionId || '').trim();
    if (partitionId.length > NUM.ZERO) {
      partitionIds.add(partitionId);
    }
  }
  const partitionIdsBySemanticState =
    decisionSnapshots.partitionIdsBySemanticState &&
    typeof decisionSnapshots.partitionIdsBySemanticState === TYPEOF.OBJECT ?
      decisionSnapshots.partitionIdsBySemanticState :
      {};
  for (const partitionIdsForState of Object.values(
    partitionIdsBySemanticState,
  )) {
    for (const partitionId of normalizePriorityRecoveryStringList(
      partitionIdsForState,
    )) {
      partitionIds.add(partitionId);
    }
  }
  return partitionIds;
}

function isPriorityRecoveryTrackedPartitionId(partitionId) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === NUM.ZERO) {
    return false;
  }
  const tableId = inferPriorityRecoveryTableNameFromPartitionId(
    normalizedPartitionId,
  );
  return tableId !== null && PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId);
}

function filterPriorityRecoveryTrackedPartitionIds(partitionIds = []) {
  return Object.freeze(
    normalizePriorityRecoveryStringList(partitionIds).filter((partitionId) =>
      isPriorityRecoveryTrackedPartitionId(partitionId),
    ),
  );
}

function normalizePriorityRecoveryDecisionSnapshotSemanticState(
  semanticState,
) {
  const normalizedSemanticState = String(semanticState || LOCAL_STR_EMPTY)
    .trim();
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(
    normalizedSemanticState,
  ) ?
    normalizedSemanticState :
    null;
}

export {
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryDecisionPartitionIdSet,
  buildPriorityRecoveryPlannerByPartitionId,
  buildPriorityRecoveryPlannerEntry,
  buildPriorityRecoverySemanticPartitionSetMap,
  buildPriorityRecoverySpreadCompletion,
  buildPriorityRecoverySpreadRelevantOperationContexts,
  buildPriorityRecoverySupersededOperationIdSet,
  buildUnknownPriorityRecoveryPlanner,
  filterPriorityRecoveryTrackedPartitionIds,
  hasPriorityRecoverySpreadGap,
  isPriorityRecoverySpreadSatisfyingOperationContext,
  isPriorityRecoverySupersedableInFlightOperationContext,
  isPriorityRecoveryTrackedPartitionId,
  normalizePriorityRecoveryDecisionSnapshotSemanticState,
  readFirstIntegerField,
  readFirstStringField,
  resolvePriorityRecoveryOperationContextFreshnessMs,
  resolvePriorityRecoveryReasonCodesFromReadiness,
  resolvePriorityRecoverySemanticState,
  resolvePriorityRecoverySpreadSatisfyingReasonCode,
};
