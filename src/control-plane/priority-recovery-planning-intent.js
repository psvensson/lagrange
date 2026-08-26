import {
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP,
} from './priority-recovery-admission-constants.js';
import {
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  readExpectedReplicaCount,
} from './membership-publication-priority-partition-canonical-data.js';

const PRIORITY_RECOVERY_PLANNER_FIELD_UNAVAILABLE = null;
const PRIORITY_RECOVERY_PLANNER_EMPTY_REASON_COLLECTION = Object.freeze([]);

function buildPriorityRecoveryPlannerReasons(spreadGap) {
  return spreadGap > 0 ?
    [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP] :
    [];
}

function buildPriorityRecoveryExclusionReasonCounts(partition) {
  return partition?.exclusionReasonCounts &&
    typeof partition.exclusionReasonCounts === 'object' ?
    {exclusionReasonCounts: {...partition.exclusionReasonCounts}} :
    {};
}

function buildPriorityRecoveryBlockedPartitionPlanner(partition) {
  const partitionId = String(partition?.partitionId || '').trim();
  if (partitionId.length === 0) {
    return PRIORITY_RECOVERY_PLANNER_FIELD_UNAVAILABLE;
  }
  const spreadGap = Math.max(
    0,
    normalizePriorityRecoveryInteger(partition?.spreadGap) || 0,
  );
  const expectedReplicaCount = readExpectedReplicaCount(partition);
  return {
    partitionId,
    ...(expectedReplicaCount !== null ? {expectedReplicaCount} : {}),
    requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
      partition?.requiredDistinctNodeCount,
    ),
    readyDistinctNodeCount: normalizePriorityRecoveryInteger(
      partition?.readyDistinctNodeCount,
    ),
    readyReplicaCount: normalizePriorityRecoveryInteger(
      partition?.readyReplicaCount,
    ),
    ...buildPriorityRecoveryExclusionReasonCounts(partition),
    spreadGap,
    ready: spreadGap === 0,
    reasons: buildPriorityRecoveryPlannerReasons(spreadGap),
  };
}

function appendPriorityRecoveryBlockedPartitionPlanner(
  plannerByPartitionId,
  partition,
) {
  const planner = buildPriorityRecoveryBlockedPartitionPlanner(partition);
  if (!planner) {
    return;
  }
  plannerByPartitionId[planner.partitionId] = planner;
}

function appendPriorityRecoveryPlannerReason(planner, reason) {
  if (planner.reasons.includes(reason)) {
    return;
  }
  planner.reasons.push(reason);
}

function buildPriorityRecoveryMissingPartitionPlanner(
  partitionId,
  normalizedSummary,
) {
  return {
    partitionId,
    requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
      normalizedSummary?.requiredDistinctNodeCount,
    ),
    readyDistinctNodeCount: 0,
    spreadGap:
      normalizePriorityRecoveryInteger(
        normalizedSummary?.requiredDistinctNodeCount,
      ) || 1,
    ready: false,
    reasons: [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING],
  };
}

function appendPriorityRecoveryMissingPartitionPlanner(
  plannerByPartitionId,
  partitionId,
  normalizedSummary,
) {
  if (plannerByPartitionId[partitionId]) {
    appendPriorityRecoveryPlannerReason(
      plannerByPartitionId[partitionId],
      PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
    );
    return;
  }
  plannerByPartitionId[partitionId] =
    buildPriorityRecoveryMissingPartitionPlanner(
      partitionId,
      normalizedSummary,
    );
}

function buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary) {
  const normalizedSummary =
    priorityPartitionSummary &&
    typeof priorityPartitionSummary === 'object' ?
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
    appendPriorityRecoveryBlockedPartitionPlanner(plannerByPartitionId, partition);
  }
  for (const partitionId of missingPartitionIds) {
    appendPriorityRecoveryMissingPartitionPlanner(
      plannerByPartitionId,
      partitionId,
      normalizedSummary,
    );
  }
  return plannerByPartitionId;
}

function buildUnknownPriorityRecoveryPlanner(partitionId) {
  return {
    partitionId,
    requiredDistinctNodeCount: PRIORITY_RECOVERY_PLANNER_FIELD_UNAVAILABLE,
    readyDistinctNodeCount: PRIORITY_RECOVERY_PLANNER_FIELD_UNAVAILABLE,
    spreadGap: PRIORITY_RECOVERY_PLANNER_FIELD_UNAVAILABLE,
    ready: PRIORITY_RECOVERY_PLANNER_FIELD_UNAVAILABLE,
    reasons: PRIORITY_RECOVERY_PLANNER_EMPTY_REASON_COLLECTION,
  };
}

function buildPriorityRecoveryPlannerEntry(
  partitionId,
  priorityPartitionSummary,
  plannerByPartitionId = null,
) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === 0) {
    return buildUnknownPriorityRecoveryPlanner(normalizedPartitionId);
  }
  const normalizedSummary =
    priorityPartitionSummary &&
    typeof priorityPartitionSummary === 'object' ?
      priorityPartitionSummary :
      null;
  const plannerById =
    plannerByPartitionId && typeof plannerByPartitionId === 'object' ?
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
    blockedPartitionIds.length === 0
  ) {
    return buildUnknownPriorityRecoveryPlanner(normalizedPartitionId);
  }
  return {
    partitionId: normalizedPartitionId,
    requiredDistinctNodeCount: normalizePriorityRecoveryInteger(
      normalizedSummary.requiredDistinctNodeCount,
    ),
    readyDistinctNodeCount: PRIORITY_RECOVERY_PLANNER_FIELD_UNAVAILABLE,
    spreadGap: 0,
    ready: true,
    reasons: PRIORITY_RECOVERY_PLANNER_EMPTY_REASON_COLLECTION,
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
    typeof priorityPartitionSummary === 'object' ?
      priorityPartitionSummary :
      null;
  if (!normalizedSummary) {
    return false;
  }
  if (buildPriorityRecoveryBlockedPartitionIds(normalizedSummary).length > 0) {
    return true;
  }
  return normalizedSummary.satisfied === false;
}

export {
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryPlannerByPartitionId,
  buildPriorityRecoveryPlannerEntry,
  buildUnknownPriorityRecoveryPlanner,
  hasPriorityRecoverySpreadGap,
};
