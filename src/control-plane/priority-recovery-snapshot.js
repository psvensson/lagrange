import {NUM, TYPEOF} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {
  buildActiveMembershipSnapshot as buildPriorityRecoveryPublicationContext,
  resolvePriorityRecoveryActiveNodeCohort,
} from './active-node-projection.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from './priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
  buildPriorityRecoveryCompletion,
} from './priority-recovery-completion.js';
import {
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  PRIORITY_RECOVERY_ADMISSION_SOURCE,
  PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY,
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP,
  PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY,
  PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED,
  PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED,
} from './priority-recovery-admission-constants.js';
import {
  buildPriorityRecoveryCorrelationKey,
  inferPriorityRecoveryTableNameFromPartitionId,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  OperationType,
  TERMINAL_STATUSES as REPLICA_OPERATION_TERMINAL_STATUSES,
  isReplaceRemoveDispatchPhase,
  isTerminalStep as isTerminalReplicaOperationStep,
  isValidWorkflowStep as isValidReplicaOperationStep,
} from '../rebalancer/replica-status.js';
import {normalizeReplicaOperationRecord} from '../rebalancer/replica-operation-liveness.js';
const PRIORITY_RECOVERY_SNAPSHOT_LITERAL = Object.freeze({
  VALUE: '',
  TYPE: 'type',
  OPERATION_TYPE: 'operation_type',
  OPERATIONTYPE: 'operationType',
  STATUS: 'status',
  WORKFLOWSTEP: 'workflowStep',
  SOURCENODEID: 'sourceNodeId',
  TARGETNODEID: 'targetNodeId',
  REPLICAID: 'replicaId',
  SERVICE_ID: 'service_id',
  SERVICEID: 'serviceId',
  ACTIVE: 'ACTIVE',
});
const STATUS_ACTIVE = 'active';
const PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION = 'partition';
const PRIORITY_RECOVERY_RAFT_ROLE_LEARNER = 'learner';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID = 'operation_id';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT = 'created_at';
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT = 'updated_at';
const PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE = 'raft_role';
const PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID = 'node_id';
const PRIORITY_RECOVERY_SERVICE_FIELD_STATUS = 'status';
const PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID = 'partition_id';
const PRIORITY_RECOVERY_STATUS_ACTIVE = 'active';
const PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET = new Set(
  REPLICA_OPERATION_TERMINAL_STATUSES.map((status) => String(status || '').toLowerCase()),
);
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
function buildPriorityRecoverySemanticPartitionSetMap() {
  const partitionIdsBySemanticState = {};
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  return partitionIdsBySemanticState;
}
function isPriorityRecoverySpreadSatisfyingOperationContext(operationContext, options = {}) {
  if (!isReplaceRemoveDispatchPhase(operationContext)) {
    return false;
  }
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
  return eligibleTargetNodeIds.has(targetNodeId);
}
function buildPriorityRecoverySpreadCompletion(options = {}) {
  const activeOperationContexts = Array.isArray(options.activeOperationContexts) ?
    options.activeOperationContexts :
    [];
  const eligibleTargetNodeIds = normalizePriorityRecoveryStringList(options.eligibleTargetNodeIds);
  const satisfyingOperationIds = [];
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
      reasonCode:
        PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.REPLACE_REMOVE_DISPATCH_PHASE_ON_ELIGIBLE_TARGET,
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
function resolvePriorityRecoverySemanticState(options = {}) {
  const blockerReasons = normalizePriorityRecoveryStringList(options.blockerReasons);
  for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
    if (!blockerReasons.includes(blockerReason)) {
      continue;
    }
    return (
      PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED
    );
  }
  if (options.spreadCompletion?.satisfied === true && options.hasActiveOperationContexts === true) {
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
  const reasons = Array.isArray(readinessEntry?.reasons) ? readinessEntry.reasons : [];
  return normalizePriorityRecoveryStringList(
    reasons.map((reason) =>
      String(reason?.code || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).trim(),
    ),
  );
}
function buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary) {
  const normalizedSummary =
    priorityPartitionSummary && typeof priorityPartitionSummary === TYPEOF.OBJECT ?
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
      readyDistinctNodeCount: normalizePriorityRecoveryInteger(partition?.readyDistinctNodeCount),
      spreadGap,
      ready: spreadGap === NUM.ZERO,
      reasons: spreadGap > NUM.ZERO ? [PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP] : [],
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
        normalizePriorityRecoveryInteger(normalizedSummary?.requiredDistinctNodeCount) || NUM.ONE,
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
    priorityPartitionSummary && typeof priorityPartitionSummary === TYPEOF.OBJECT ?
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
  const blockedPartitionIds = buildPriorityRecoveryBlockedPartitionIds(normalizedSummary);
  if (hasPriorityRecoverySpreadGap(normalizedSummary) && blockedPartitionIds.length === NUM.ZERO) {
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
  return Object.values(buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary)).sort(
    (left, right) => left.partitionId.localeCompare(right.partitionId),
  );
}
function buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary) {
  return buildPriorityRecoveryBlockedPartitions(priorityPartitionSummary).map(
    (entry) => entry.partitionId,
  );
}
function hasPriorityRecoverySpreadGap(priorityPartitionSummary) {
  const normalizedSummary =
    priorityPartitionSummary && typeof priorityPartitionSummary === TYPEOF.OBJECT ?
      priorityPartitionSummary :
      null;
  if (!normalizedSummary) {
    return false;
  }
  if (buildPriorityRecoveryBlockedPartitionIds(normalizedSummary).length > NUM.ZERO) {
    return true;
  }
  return normalizedSummary.satisfied === false;
}
function resolvePriorityPartitionSummaryFromPublication(publicationRow = null) {
  if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
    return null;
  }
  const summary =
    publicationRow.priorityPartitionSummary ?? publicationRow.priority_partition_summary ?? null;
  return summary && typeof summary === TYPEOF.OBJECT ? summary : null;
}
function buildPriorityRecoveryAdmissionPlan(options = {}) {
  const maxConcurrentAdds = Math.max(
    NUM.ZERO,
    normalizePriorityRecoveryInteger(options.maxConcurrentAdds) || NUM.ZERO,
  );
  const isEmergencyPriorityPartition =
    typeof options.isEmergencyPriorityPartition === TYPEOF.FUNCTION ?
      options.isEmergencyPriorityPartition :
      () => false;
  const isPriorityPartition =
    typeof options.isPriorityPartition === TYPEOF.FUNCTION ?
      options.isPriorityPartition :
      isEmergencyPriorityPartition;
  const blockedPartitions = buildPriorityRecoveryBlockedPartitions(
    options.priorityPartitionSummary,
  );
  const blockedPartitionIds = blockedPartitions.map((entry) => entry.partitionId);
  const blockedPartitionIdSet = new Set(blockedPartitionIds);
  const recoveryActive = hasPriorityRecoverySpreadGap(options.priorityPartitionSummary);
  const blockedPartitionDetailUnavailable =
    recoveryActive === true && blockedPartitionIds.length === NUM.ZERO;
  const emergencyBlockedPartitionIds = blockedPartitions
    .filter((entry) => isEmergencyPriorityPartition(entry.partitionId))
    .map((entry) => entry.partitionId);
  const emergencyRecoveryActive =
    emergencyBlockedPartitionIds.length > NUM.ZERO || blockedPartitionDetailUnavailable;
  const ordinaryPriorityAddBudgetLimit = maxConcurrentAdds;
  const emergencyPriorityAddBudgetLimit = emergencyRecoveryActive ?
    maxConcurrentAdds + NUM.ONE :
    maxConcurrentAdds;
  const admissionSource =
    typeof options.admissionSource === TYPEOF.STRING &&
    options.admissionSource.trim().length > NUM.ZERO ?
      options.admissionSource.trim() :
      options.priorityPartitionSummary ?
        PRIORITY_RECOVERY_ADMISSION_SOURCE.PUBLICATION_SUMMARY :
        PRIORITY_RECOVERY_ADMISSION_SOURCE.INACTIVE_DEFAULT;
  const getPartitionClass = (partitionId) => {
    const normalizedPartitionId = String(partitionId || '').trim();
    if (normalizedPartitionId.length === NUM.ZERO || !isPriorityPartition(normalizedPartitionId)) {
      return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY;
    }
    if (isEmergencyPriorityPartition(normalizedPartitionId)) {
      return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY;
    }
    return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY;
  };
  const getReservedNonPrioritySlots = (partitionId, slotType = 'add') => {
    if (
      getPartitionClass(partitionId) !== PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY
    ) {
      return NUM.ZERO;
    }
    return slotType === 'move' ?
      recoveryActive ?
        NUM.ONE :
        NUM.ZERO :
      recoveryActive ?
        NUM.ONE :
        NUM.ZERO;
  };
  const getPriorityAddBudgetLimit = (partitionId) =>
    getPartitionClass(partitionId) ===
    PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY ?
      emergencyPriorityAddBudgetLimit :
      ordinaryPriorityAddBudgetLimit;
  const usesEmergencyPriorityOverflow = (partitionId) =>
    emergencyRecoveryActive === true &&
    getPartitionClass(partitionId) ===
      PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY;
  const evaluatePriorityAddAdmission = (partitionId, counts = {}) => {
    const partitionClass = getPartitionClass(partitionId);
    const priorityCount = Number(counts.priorityCount || NUM.ZERO);
    const ordinaryPriorityCount = Number(counts.ordinaryPriorityCount || NUM.ZERO);
    const budgetLimit = getPriorityAddBudgetLimit(partitionId);
    if (partitionClass === PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY) {
      return Object.freeze({
        allowed: false,
        reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.NOT_PRIORITY_PARTITION,
        partitionClass,
        budgetLimit,
      });
    }
    if (emergencyPriorityAddBudgetLimit <= NUM.ZERO) {
      return Object.freeze({
        allowed: false,
        reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.PRIORITY_LANE_DISABLED,
        partitionClass,
        budgetLimit,
      });
    }
    if (priorityCount >= emergencyPriorityAddBudgetLimit) {
      return Object.freeze({
        allowed: false,
        reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.EMERGENCY_PRIORITY_LANE_EXHAUSTED,
        partitionClass,
        budgetLimit: emergencyPriorityAddBudgetLimit,
      });
    }
    if (partitionClass === PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY) {
      return Object.freeze({
        allowed: true,
        reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ADMITTED,
        partitionClass,
        budgetLimit: emergencyPriorityAddBudgetLimit,
      });
    }
    if (ordinaryPriorityAddBudgetLimit <= NUM.ZERO) {
      return Object.freeze({
        allowed: false,
        reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.PRIORITY_LANE_DISABLED,
        partitionClass,
        budgetLimit,
      });
    }
    if (ordinaryPriorityCount >= ordinaryPriorityAddBudgetLimit) {
      return Object.freeze({
        allowed: false,
        reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ORDINARY_PRIORITY_LANE_EXHAUSTED,
        partitionClass,
        budgetLimit: ordinaryPriorityAddBudgetLimit,
      });
    }
    return Object.freeze({
      allowed: true,
      reason: PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ADMITTED,
      partitionClass,
      budgetLimit,
    });
  };
  return Object.freeze({
    maxConcurrentAdds,
    admissionSource,
    recoveryActive,
    blockedPartitionIds: Object.freeze([...blockedPartitionIds]),
    blockedPartitionIdSet,
    emergencyRecoveryActive,
    emergencyBlockedPartitionIds: Object.freeze([...emergencyBlockedPartitionIds]),
    blockedPartitionDetailUnavailable,
    reservedNonPriorityAddSlots: recoveryActive ? NUM.ONE : NUM.ZERO,
    reservedNonPriorityMoveSlots: recoveryActive ? NUM.ONE : NUM.ZERO,
    ordinaryPriorityAddBudgetLimit,
    emergencyPriorityAddBudgetLimit,
    getPartitionClass,
    getReservedNonPrioritySlots,
    getPriorityAddBudgetLimit,
    usesEmergencyPriorityOverflow,
    evaluatePriorityAddAdmission,
    hasBlockedPartition(partitionId) {
      const normalizedPartitionId = String(partitionId || '').trim();
      if (blockedPartitionDetailUnavailable === true) {
        return (
          normalizedPartitionId.length > NUM.ZERO &&
          isEmergencyPriorityPartition(normalizedPartitionId)
        );
      }
      return (
        normalizedPartitionId.length > NUM.ZERO && blockedPartitionIdSet.has(normalizedPartitionId)
      );
    },
  });
}
function withPriorityRecoveryAdmissionSource(admissionPlan, admissionSource) {
  if (!admissionPlan || typeof admissionPlan !== TYPEOF.OBJECT) {
    return admissionPlan;
  }
  return Object.freeze({...admissionPlan, admissionSource});
}
function resolvePriorityRecoveryAdmissionPlanFromPublication(options = {}) {
  const publicationRow =
    options.publicationRow && typeof options.publicationRow === TYPEOF.OBJECT ?
      options.publicationRow :
      null;
  const nowMs = normalizePriorityRecoveryInteger(options.nowMs);
  const staleGraceMs = Math.max(
    NUM.ZERO,
    normalizePriorityRecoveryInteger(options.staleGraceMs) || NUM.ZERO,
  );
  const lastObservedAdmissionPlan =
    options.lastObservedAdmissionPlan &&
    typeof options.lastObservedAdmissionPlan === TYPEOF.OBJECT ?
      options.lastObservedAdmissionPlan :
      null;
  const lastObservedAdmissionPlanAtMs = normalizePriorityRecoveryInteger(
    options.lastObservedAdmissionPlanAtMs,
  );
  const maxConcurrentAdds = Math.max(
    NUM.ZERO,
    normalizePriorityRecoveryInteger(options.maxConcurrentAdds) || NUM.ZERO,
  );
  const isPriorityPartition =
    typeof options.isPriorityPartition === TYPEOF.FUNCTION ?
      options.isPriorityPartition :
      options.isEmergencyPriorityPartition;
  const isEmergencyPriorityPartition =
    typeof options.isEmergencyPriorityPartition === TYPEOF.FUNCTION ?
      options.isEmergencyPriorityPartition :
      () => false;
  const buildAdmissionPlan = (priorityPartitionSummary = null, admissionSource = null) =>
    buildPriorityRecoveryAdmissionPlan({
      admissionSource,
      isPriorityPartition,
      maxConcurrentAdds,
      priorityPartitionSummary,
      isEmergencyPriorityPartition,
    });
  const priorityPartitionSummary = resolvePriorityPartitionSummaryFromPublication(publicationRow);
  let admissionPlan = null;
  let nextLastObservedAdmissionPlan = null;
  let nextLastObservedAdmissionPlanAtMs = null;
  if (priorityPartitionSummary) {
    admissionPlan = buildAdmissionPlan(
      priorityPartitionSummary,
      PRIORITY_RECOVERY_ADMISSION_SOURCE.PUBLICATION_SUMMARY,
    );
    if (admissionPlan.recoveryActive === true && Number.isFinite(nowMs)) {
      nextLastObservedAdmissionPlan = admissionPlan;
      nextLastObservedAdmissionPlanAtMs = nowMs;
    }
  } else if (
    lastObservedAdmissionPlan &&
    lastObservedAdmissionPlanAtMs !== null &&
    staleGraceMs > NUM.ZERO &&
    Number.isFinite(nowMs) &&
    nowMs - lastObservedAdmissionPlanAtMs <= staleGraceMs
  ) {
    admissionPlan = withPriorityRecoveryAdmissionSource(
      lastObservedAdmissionPlan,
      PRIORITY_RECOVERY_ADMISSION_SOURCE.STALE_ACTIVE_GRACE,
    );
    nextLastObservedAdmissionPlan = lastObservedAdmissionPlan;
    nextLastObservedAdmissionPlanAtMs = lastObservedAdmissionPlanAtMs;
  } else {
    admissionPlan = buildAdmissionPlan(null, PRIORITY_RECOVERY_ADMISSION_SOURCE.INACTIVE_DEFAULT);
  }
  return buildPriorityRecoveryAdmissionPlanResult(
    admissionPlan,
    nextLastObservedAdmissionPlan,
    nextLastObservedAdmissionPlanAtMs,
  );
}
function buildPriorityRecoveryAdmissionPlanResult(
  admissionPlan,
  lastObservedAdmissionPlan,
  lastObservedAdmissionPlanAtMs,
) {
  return {admissionPlan, lastObservedAdmissionPlan, lastObservedAdmissionPlanAtMs};
}
function resolveTrackedPriorityRecoveryAdmissionPlan(options = {}) {
  const tracker =
    options.tracker && typeof options.tracker === TYPEOF.OBJECT ? options.tracker : null;
  const resolvedAdmission = resolvePriorityRecoveryAdmissionPlanFromPublication({
    publicationRow: options.publicationRow,
    nowMs: options.nowMs,
    staleGraceMs: options.staleGraceMs,
    lastObservedAdmissionPlan: tracker?.lastObservedAdmissionPlan ?? null,
    lastObservedAdmissionPlanAtMs: tracker?.lastObservedAdmissionPlanAtMs ?? null,
    maxConcurrentAdds: options.maxConcurrentAdds,
    isPriorityPartition: options.isPriorityPartition,
    isEmergencyPriorityPartition: options.isEmergencyPriorityPartition,
  });
  if (tracker) {
    tracker.lastObservedAdmissionPlan = resolvedAdmission.lastObservedAdmissionPlan ?? null;
    tracker.lastObservedAdmissionPlanAtMs = resolvedAdmission.lastObservedAdmissionPlanAtMs ?? null;
  }
  return resolvedAdmission.admissionPlan;
}
function buildPriorityRecoveryReplicaOperationContexts(
  replicaOperationRows = [],
  replicaOperationsSummary = null,
) {
  const operationTimelineById =
    replicaOperationsSummary?.operationTimelineById &&
    typeof replicaOperationsSummary.operationTimelineById === TYPEOF.OBJECT ?
      replicaOperationsSummary.operationTimelineById :
      {};
  const byOperationId = {};
  const byPartitionId = {};
  for (const replicaOperationRow of Array.isArray(replicaOperationRows) ?
    replicaOperationRows :
    []) {
    const normalizedReplicaOperation = normalizeReplicaOperationRecord(replicaOperationRow);
    const operationId = String(
      normalizedReplicaOperation.operationId ||
        readFirstStringField(
          replicaOperationRow,
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
          'operationId',
        ) ||
        '',
    ).trim();
    if (operationId.length === NUM.ZERO) {
      continue;
    }
    const entityType = String(
      normalizedReplicaOperation.entityType ||
        PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION,
    ).toLowerCase();
    if (entityType !== PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION) {
      continue;
    }
    const partitionId = String(
      normalizedReplicaOperation.partitionId ||
        normalizedReplicaOperation.partitionGroupId ||
        normalizedReplicaOperation.entityId ||
        '',
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const timeline = Array.isArray(operationTimelineById[operationId]) ?
      operationTimelineById[operationId] :
      [];
    const timelineSteps = normalizePriorityRecoveryStringList(
      timeline.map((entry) => String(entry?.step || '').trim()),
    );
    const latestTimelineEntry = timeline.length > NUM.ZERO ? timeline[timeline.length - 1] : null;
    const context = {
      operationId,
      partitionId,
      tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
      type: String(normalizedReplicaOperation.type || '').toUpperCase(),
      status: String(normalizedReplicaOperation.status || '').toLowerCase(),
      workflowStep: String(normalizedReplicaOperation.workflowStep || '').toUpperCase(),
      sourceNodeId: normalizedReplicaOperation.sourceNodeId || null,
      targetNodeId: normalizedReplicaOperation.targetNodeId || null,
      replicaId: normalizedReplicaOperation.replicaId || null,
      createdAtMs: normalizePriorityRecoveryInteger(
        normalizedReplicaOperation.createdAt ??
          replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] ??
          replicaOperationRow.createdAt,
      ),
      updatedAtMs: normalizePriorityRecoveryInteger(
        normalizedReplicaOperation.updatedAt ??
          replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] ??
          replicaOperationRow.updatedAt,
      ),
      timelineLength: timeline.length,
      timelineStepCount: timelineSteps.length,
      latestTimelineStep: String(latestTimelineEntry?.step || '').toUpperCase() || null,
      latestTimelineStatus: String(latestTimelineEntry?.status || '').toLowerCase() || null,
      latestTimelineInFlight: latestTimelineEntry?.inFlight === true,
    };
    byOperationId[operationId] = context;
    if (!byPartitionId[partitionId]) {
      byPartitionId[partitionId] = [];
    }
    byPartitionId[partitionId].push(context);
  }
  for (const partitionId of Object.keys(byPartitionId)) {
    byPartitionId[partitionId].sort((left, right) =>
      String(left.operationId).localeCompare(String(right.operationId)),
    );
  }
  return {byOperationId, byPartitionId};
}
function parsePriorityRecoveryStepsHistory(stepsHistoryRaw) {
  if (Array.isArray(stepsHistoryRaw)) {
    return stepsHistoryRaw;
  }
  if (typeof stepsHistoryRaw !== TYPEOF.STRING || stepsHistoryRaw.length === NUM.ZERO) {
    return [];
  }
  try {
    const parsed = JSON.parse(stepsHistoryRaw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function buildPriorityRecoveryOperationContextFromRecord(record) {
  if (!record || typeof record !== TYPEOF.OBJECT) {
    return null;
  }
  const normalizedRecord = normalizeReplicaOperationRecord(record);
  const operationId = String(
    normalizedRecord.operationId ||
      readFirstStringField(
        record,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
        'operationId',
      ) ||
      '',
  ).trim();
  if (operationId.length === NUM.ZERO) {
    return null;
  }
  const partitionId = String(
    normalizedRecord.partitionId ||
      normalizedRecord.partitionGroupId ||
      normalizedRecord.entityId ||
      '',
  ).trim();
  if (partitionId.length === NUM.ZERO) {
    return null;
  }
  const stepsHistory = parsePriorityRecoveryStepsHistory(
    record.stepsHistory ?? record.steps_history,
  );
  const timelineSteps = normalizePriorityRecoveryStringList(
    stepsHistory.map((entry) => String(entry?.step || entry?.workflowStep || '').trim()),
  );
  const latestTimelineEntry =
    stepsHistory.length > NUM.ZERO ? stepsHistory[stepsHistory.length - NUM.ONE] : null;
  return {
    operationId,
    partitionId,
    tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
    type: String(normalizedRecord.type || '').toUpperCase(),
    status: String(normalizedRecord.status || '').toLowerCase(),
    workflowStep: String(normalizedRecord.workflowStep || '').toUpperCase(),
    sourceNodeId: normalizedRecord.sourceNodeId || null,
    targetNodeId: normalizedRecord.targetNodeId || null,
    replicaId: normalizedRecord.replicaId || null,
    createdAtMs: normalizePriorityRecoveryInteger(
      normalizedRecord.createdAt ??
        record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT] ??
        record.createdAt,
    ),
    updatedAtMs: normalizePriorityRecoveryInteger(
      normalizedRecord.updatedAt ??
        record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT] ??
        record.updatedAt,
    ),
    timelineLength: stepsHistory.length,
    timelineStepCount: timelineSteps.length,
    latestTimelineStep:
      String(
        latestTimelineEntry?.step ||
          latestTimelineEntry?.workflowStep ||
          PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
      ).toUpperCase() || null,
    latestTimelineStatus:
      String(
        latestTimelineEntry?.status ||
          latestTimelineEntry?.state ||
          PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
      ).toLowerCase() || null,
    latestTimelineInFlight: latestTimelineEntry?.inFlight === true,
  };
}
function resolvePriorityRecoveryOperationStepTerminalState(operationType, workflowStep) {
  const normalizedOperationType = String(operationType || '').toUpperCase();
  const normalizedWorkflowStep = String(workflowStep || '').toUpperCase();
  if (
    normalizedOperationType.length === NUM.ZERO ||
    normalizedWorkflowStep.length === NUM.ZERO ||
    !isValidReplicaOperationStep(normalizedOperationType, normalizedWorkflowStep)
  ) {
    return null;
  }
  return isTerminalReplicaOperationStep(normalizedOperationType, normalizedWorkflowStep);
}
function isPriorityRecoveryOperationContextTerminal(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  const workflowStepTerminalState = resolvePriorityRecoveryOperationStepTerminalState(
    operationType,
    operationContext.workflowStep,
  );
  if (typeof workflowStepTerminalState === TYPEOF.BOOLEAN) {
    return workflowStepTerminalState;
  }
  const latestTimelineStepTerminalState = resolvePriorityRecoveryOperationStepTerminalState(
    operationType,
    operationContext.latestTimelineStep,
  );
  if (typeof latestTimelineStepTerminalState === TYPEOF.BOOLEAN) {
    return latestTimelineStepTerminalState;
  }
  if (operationContext.latestTimelineInFlight === true) {
    return false;
  }
  const status = String(operationContext.status || '').toLowerCase();
  if (status.length === NUM.ZERO) {
    return false;
  }
  if (status === STATUS_ACTIVE) {
    return operationType !== OperationType.REPLACE;
  }
  return PRIORITY_RECOVERY_TERMINAL_OPERATION_STATUS_SET.has(status);
}
function isPriorityRecoveryCompletedAddOperationContext(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  if (operationType !== OperationType.ADD) {
    return false;
  }
  const workflowStep = String(operationContext.workflowStep || '').toUpperCase();
  if (
    workflowStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE &&
    resolvePriorityRecoveryOperationStepTerminalState(operationType, workflowStep) === true
  ) {
    return true;
  }
  const latestTimelineStep = String(operationContext.latestTimelineStep || '').toUpperCase();
  return (
    latestTimelineStep === PRIORITY_RECOVERY_SNAPSHOT_LITERAL.ACTIVE &&
    operationContext.latestTimelineInFlight !== true &&
    resolvePriorityRecoveryOperationStepTerminalState(operationType, latestTimelineStep) === true
  );
}

function buildPriorityRecoveryAdmissionByPartitionId(workflowAdmissionsByWorkflowId = {}) {
  const admissionByPartitionId = {};
  for (const workflow of Object.values(workflowAdmissionsByWorkflowId || {})) {
    if (!workflow || typeof workflow !== TYPEOF.OBJECT) {
      continue;
    }
    const workflowId = String(workflow.workflowId || '').trim();
    if (workflowId.length === NUM.ZERO) {
      continue;
    }
    const admission =
      workflow.admission && typeof workflow.admission === TYPEOF.OBJECT ? workflow.admission : null;
    const partitionIds = normalizePriorityRecoveryStringList([
      workflow.sourcePartitionId,
      ...(Array.isArray(workflow.targetPartitionIds) ? workflow.targetPartitionIds : []),
    ]);
    for (const partitionId of partitionIds) {
      admissionByPartitionId[partitionId] = {
        workflowId,
        workflowType: workflow.workflowType || null,
        transitionState: workflow.transitionState || null,
        decisionType: admission?.decisionType || null,
        decisionDimension: admission?.decisionDimension || null,
        admissionDecisionAt: workflow.admissionDecisionAt || null,
        eligibleNodeIds: normalizePriorityRecoveryStringList(admission?.eligibleNodeIds),
        ineligibleNodes: Array.isArray(admission?.ineligibleNodes) ?
          admission.ineligibleNodes
            .map((entry) => ({
              nodeId: String(entry?.nodeId || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE),
              reasonCodes: normalizePriorityRecoveryStringList(entry?.reasonCodes),
            }))
            .filter((entry) => entry.nodeId.length > NUM.ZERO) :
          [],
        blockingReasons: normalizePriorityRecoveryStringList(workflow.blockingReasons),
      };
    }
  }
  return admissionByPartitionId;
}

function buildPriorityRecoveryLearnerPromotionByPartitionId(
  serviceRows = [],
  readinessByNodeId = {},
) {
  const learnerByPartitionId = {};
  for (const serviceRow of Array.isArray(serviceRows) ? serviceRows : []) {
    const partitionId = readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
      'partitionId',
    );
    if (!partitionId) {
      continue;
    }
    const status = String(
      readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_STATUS, 'status') || '',
    ).toLowerCase();
    const raftRole = String(
      readFirstStringField(serviceRow, PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE, 'raftRole') || '',
    ).toLowerCase();
    if (
      status !== PRIORITY_RECOVERY_STATUS_ACTIVE ||
      raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER
    ) {
      continue;
    }
    const nodeId = readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
      'nodeId',
    );
    if (!nodeId) {
      continue;
    }
    if (!learnerByPartitionId[partitionId]) {
      learnerByPartitionId[partitionId] = [];
    }
    learnerByPartitionId[partitionId].push(nodeId);
  }

  const learnerPromotionByPartitionId = {};
  for (const [partitionId, learnerNodeIds] of Object.entries(learnerByPartitionId)) {
    const learnerHoldByNodeId = {};
    const promotableLearnerNodeIds = [];
    for (const nodeId of normalizePriorityRecoveryStringList(learnerNodeIds)) {
      const readiness = readinessByNodeId[nodeId] || null;
      const dimensions =
        readiness?.dimensions && typeof readiness.dimensions === TYPEOF.OBJECT ?
          readiness.dimensions :
          {};
      const repairEligible = dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true;
      const recoveryEligible =
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true;
      if (repairEligible) {
        promotableLearnerNodeIds.push(nodeId);
        continue;
      }
      const reasonCodes = resolvePriorityRecoveryReasonCodesFromReadiness(readiness);
      learnerHoldByNodeId[nodeId] = {
        holdReason: readiness ?
          recoveryEligible ?
            PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY :
            PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE :
          PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
        reasonCodes,
      };
    }
    learnerPromotionByPartitionId[partitionId] = {
      activeLearnerNodeIds: normalizePriorityRecoveryStringList(learnerNodeIds),
      promotableLearnerNodeIds,
      activeLearnerNodeCount: learnerNodeIds.length,
      promotableLearnerNodeCount: promotableLearnerNodeIds.length,
      learnerHoldByNodeId,
    };
  }

  return learnerPromotionByPartitionId;
}

function buildPriorityRecoveryPublicationNodeDecisions(publicationConvergence) {
  const projectionDiagnostics =
    publicationConvergence?.projectionDiagnostics &&
    typeof publicationConvergence.projectionDiagnostics === TYPEOF.OBJECT ?
      publicationConvergence.projectionDiagnostics :
      publicationConvergence?.membershipLifecycleSummary?.projectionDiagnostics &&
          typeof publicationConvergence.membershipLifecycleSummary.projectionDiagnostics ===
            TYPEOF.OBJECT ?
        publicationConvergence.membershipLifecycleSummary.projectionDiagnostics :
        null;
  const inclusionReasonsByNodeId = {};
  const exclusionReasonsByNodeId = {};
  for (const nodeId of normalizePriorityRecoveryStringList(
    projectionDiagnostics?.recoveryEligibleIncludedNodeIds,
  )) {
    inclusionReasonsByNodeId[nodeId] = [
      PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED,
    ];
  }
  for (const nodeId of normalizePriorityRecoveryStringList(
    projectionDiagnostics?.readinessExcludedNodeIds,
  )) {
    exclusionReasonsByNodeId[nodeId] = [
      PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED,
    ];
  }
  for (const nodeId of normalizePriorityRecoveryStringList(
    projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds,
  )) {
    exclusionReasonsByNodeId[nodeId] = [
      ...(Array.isArray(exclusionReasonsByNodeId[nodeId]) ? exclusionReasonsByNodeId[nodeId] : []),
      PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY,
    ];
  }
  return {
    inclusionReasonsByNodeId,
    exclusionReasonsByNodeId,
  };
}

function buildEffectivePriorityRecoveryAdmission(admission, options = {}) {
  const normalizedAdmission = admission && typeof admission === TYPEOF.OBJECT ? admission : {};
  const explicitEligibleNodeIds = normalizePriorityRecoveryStringList(
    normalizedAdmission.eligibleNodeIds,
  );
  const publicationEligibleNodeIds = normalizePriorityRecoveryStringList(
    options.publicationEligibleNodeIds,
  );
  const projectionEligibleNodeIds = normalizePriorityRecoveryStringList(
    options.recoveryEligibleIncludedNodeIds,
  );
  const readyEligibleNodeCount = Math.max(
    NUM.ZERO,
    normalizePriorityRecoveryInteger(options.prioritySummaryReadyEligibleNodeCount) || NUM.ZERO,
  );

  let effectiveEligibleNodeIds = explicitEligibleNodeIds;
  let effectiveEligibleNodeCount = explicitEligibleNodeIds.length;
  let eligibilityEvidenceSource = PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.UNKNOWN;
  if (effectiveEligibleNodeCount > NUM.ZERO) {
    eligibilityEvidenceSource = PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.WORKFLOW_ADMISSION;
  } else if (publicationEligibleNodeIds.length > NUM.ZERO) {
    effectiveEligibleNodeIds = publicationEligibleNodeIds;
    effectiveEligibleNodeCount = publicationEligibleNodeIds.length;
    eligibilityEvidenceSource = PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.PUBLICATION_MEMBERSHIP;
  } else if (projectionEligibleNodeIds.length > NUM.ZERO) {
    effectiveEligibleNodeIds = projectionEligibleNodeIds;
    effectiveEligibleNodeCount = projectionEligibleNodeIds.length;
    eligibilityEvidenceSource =
      PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.PUBLICATION_RECOVERY_PROJECTION;
  } else if (readyEligibleNodeCount > NUM.ZERO) {
    effectiveEligibleNodeCount = readyEligibleNodeCount;
    eligibilityEvidenceSource =
      PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE.PRIORITY_SUMMARY_READY_ELIGIBLE;
  }

  return {
    workflowId: normalizedAdmission.workflowId || null,
    workflowType: normalizedAdmission.workflowType || null,
    transitionState: normalizedAdmission.transitionState || null,
    decisionType: normalizedAdmission.decisionType || null,
    decisionDimension: normalizedAdmission.decisionDimension || null,
    admissionDecisionAt: normalizedAdmission.admissionDecisionAt || null,
    eligibleNodeIds: explicitEligibleNodeIds,
    ineligibleNodes: Array.isArray(normalizedAdmission.ineligibleNodes) ?
      normalizedAdmission.ineligibleNodes :
      [],
    blockingReasons: normalizePriorityRecoveryStringList(normalizedAdmission.blockingReasons),
    effectiveEligibleNodeIds,
    effectiveEligibleNodeCount,
    eligibilityEvidenceSource,
    eligibilityCohortComplete: effectiveEligibleNodeIds.length === effectiveEligibleNodeCount,
    decisionMissing:
      normalizedAdmission.decisionType === null &&
      normalizedAdmission.decisionDimension === null &&
      explicitEligibleNodeIds.length === NUM.ZERO &&
      (!Array.isArray(normalizedAdmission.ineligibleNodes) ||
        normalizedAdmission.ineligibleNodes.length === NUM.ZERO) &&
      (!Array.isArray(normalizedAdmission.blockingReasons) ||
        normalizedAdmission.blockingReasons.length === NUM.ZERO),
  };
}

function buildPriorityRecoveryDecisionSnapshots(options = {}) {
  const publicationConvergence =
    options.publicationConvergence && typeof options.publicationConvergence === TYPEOF.OBJECT ?
      options.publicationConvergence :
      null;
  const publicationEpoch = normalizePriorityRecoveryInteger(
    publicationConvergence?.publicationEpoch,
  );
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const priorityPartitionSummary = publicationConvergence?.priorityPartitionSummary || null;
  const plannerByPartitionId = buildPriorityRecoveryPlannerByPartitionId(priorityPartitionSummary);
  const publicationContext = buildPriorityRecoveryPublicationContext(publicationConvergence);
  const admissionByPartitionId = buildPriorityRecoveryAdmissionByPartitionId(
    options.workflowAdmissionsByWorkflowId,
  );
  const replicaOperationContexts = buildPriorityRecoveryReplicaOperationContexts(
    options.replicaOperationRows,
    options.replicaOperations,
  );
  const learnerPromotionByPartitionId = buildPriorityRecoveryLearnerPromotionByPartitionId(
    options.serviceRows,
    readinessByNodeId,
  );
  const publicationNodeDecisions =
    buildPriorityRecoveryPublicationNodeDecisions(publicationConvergence);

  const allPartitionIds = new Set([
    ...Object.keys(plannerByPartitionId),
    ...Object.keys(admissionByPartitionId),
    ...Object.keys(replicaOperationContexts.byPartitionId),
    ...Object.keys(learnerPromotionByPartitionId),
  ]);
  const snapshots = [];
  const blockerPartitionIdsByReason = {};
  for (const blockerReason of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    blockerPartitionIdsByReason[blockerReason] = new Set();
  }
  const partitionIdsBySemanticState = buildPriorityRecoverySemanticPartitionSetMap();
  const partitionIdsByCompletionState = {};
  for (const completionState of PRIORITY_RECOVERY_COMPLETION_STATE_IDS) {
    partitionIdsByCompletionState[completionState] = new Set();
  }

  for (const partitionId of [...allPartitionIds].sort()) {
    const planner = buildPriorityRecoveryPlannerEntry(
      partitionId,
      priorityPartitionSummary,
      plannerByPartitionId,
    );
    const admission = buildEffectivePriorityRecoveryAdmission(
      admissionByPartitionId[partitionId] || null,
      {
        publicationEligibleNodeIds: publicationContext.concreteEligibleNodeIds,
        recoveryEligibleIncludedNodeIds: publicationContext.recoveryEligibleIncludedNodeIds,
        prioritySummaryReadyEligibleNodeCount: priorityPartitionSummary?.readyEligibleNodeCount,
      },
    );
    const learnerPromotion = learnerPromotionByPartitionId[partitionId] || {
      activeLearnerNodeIds: [],
      promotableLearnerNodeIds: [],
      activeLearnerNodeCount: 0,
      promotableLearnerNodeCount: 0,
      learnerHoldByNodeId: {},
    };
    const operationContexts = Array.isArray(replicaOperationContexts.byPartitionId[partitionId]) ?
      replicaOperationContexts.byPartitionId[partitionId] :
      [];
    const assessment = buildPriorityRecoveryPartitionAssessment({
      partitionId,
      priorityPartitionSummary,
      planner,
      admission,
      learnerPromotion,
      operationContexts,
    });
    const operationIds =
      operationContexts.length > NUM.ZERO ?
        operationContexts.map((context) => context.operationId) :
        [null];
    const spreadCompletion = assessment.spreadCompletion;
    const blockerReasons = assessment.blockerReasons;
    const ineligibleNodeIds = assessment.ineligibleNodeIds;
    const recoveryEligibleExcludedNodeIds = assessment.recoveryEligibleExcludedNodeIds;
    for (const blockerReason of blockerReasons) {
      blockerPartitionIdsByReason[blockerReason].add(partitionId);
    }
    const semanticState = assessment.semanticState;
    if (partitionIdsBySemanticState[semanticState] instanceof Set) {
      partitionIdsBySemanticState[semanticState].add(partitionId);
    }
    const completion = buildPriorityRecoveryCompletion({
      assessment,
    });
    if (partitionIdsByCompletionState[completion.state] instanceof Set) {
      partitionIdsByCompletionState[completion.state].add(partitionId);
    }

    for (const operationId of operationIds) {
      const operationContext =
        operationId && replicaOperationContexts.byOperationId[operationId] ?
          replicaOperationContexts.byOperationId[operationId] :
          null;
      snapshots.push({
        partitionId,
        epoch: publicationEpoch,
        operationId,
        correlationKey: buildPriorityRecoveryCorrelationKey(
          partitionId,
          publicationEpoch,
          operationId,
        ),
        semanticState,
        completion,
        planner,
        admission: {
          ...admission,
          ineligibleNodeIds,
          recoveryEligibleExcludedNodeIds,
        },
        spreadCompletion,
        coordinator: {
          operationCount: operationContexts.length,
          operationIds: operationContexts.map((context) => context.operationId),
          operation: operationContext,
        },
        publication: {
          publicationStatus: publicationConvergence?.publicationStatus || null,
          publishedActiveNodeIds: publicationContext.publishedActiveNodeIds,
          projectedServingNodeIds: publicationContext.projectedServingNodeIds,
          locallyEligibleNodeIds: publicationContext.locallyEligibleNodeIds,
          concreteEligibleNodeIds: publicationContext.concreteEligibleNodeIds,
          recoveryActiveNodeIds: publicationContext.recoveryActiveNodeIds,
          recoveryActiveNodeSource: publicationContext.recoveryActiveNodeSource,
          missingPublishedRecoveryActiveNodeIds:
            publicationContext.missingPublishedRecoveryActiveNodeIds,
          missingPublishedEligibleNodeIds: publicationContext.missingPublishedEligibleNodeIds,
          pendingAckNodeIds: normalizePriorityRecoveryStringList(
            publicationConvergence?.pendingAckNodeIds,
          ),
          inclusionReasonsByNodeId: publicationNodeDecisions.inclusionReasonsByNodeId,
          exclusionReasonsByNodeId: publicationNodeDecisions.exclusionReasonsByNodeId,
        },
        readiness: {
          recoveryEligibleOnlyNodeIds: normalizePriorityRecoveryStringList(
            Object.entries(readinessByNodeId)
              .filter(([_nodeId, readinessEntry]) => {
                const dimensions =
                  readinessEntry?.dimensions && typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
                    readinessEntry.dimensions :
                    {};
                return (
                  dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] ===
                    true && dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true
                );
              })
              .map(([nodeId]) => nodeId),
          ),
          learnerPromotion,
        },
        blockerReasons,
      });
    }
  }

  const normalizedPartitionIdsBySemanticState = {};
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    normalizedPartitionIdsBySemanticState[semanticState] = [
      ...partitionIdsBySemanticState[semanticState],
    ].sort();
  }
  const normalizedPartitionIdsByCompletionState = {};
  for (const [completionState, partitionIds] of Object.entries(partitionIdsByCompletionState)) {
    normalizedPartitionIdsByCompletionState[completionState] = [...partitionIds].sort();
  }
  const unresolvedSemanticStateIds = PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter(
    (semanticState) => normalizedPartitionIdsBySemanticState[semanticState].length > NUM.ZERO,
  );
  const unresolvedSemanticPartitionIds = normalizePriorityRecoveryStringList(
    unresolvedSemanticStateIds.flatMap(
      (semanticState) => normalizedPartitionIdsBySemanticState[semanticState],
    ),
  );

  return {
    schemaVersion: options.schemaVersion || NUM.ONE,
    capturedAt: options.capturedAt || null,
    publicationEpoch,
    snapshotCount: snapshots.length,
    partitionCount: allPartitionIds.size,
    snapshots,
    blockerPartitionIdsByReason: PRIORITY_RECOVERY_PROGRESS_CLASS_IDS.reduce(
      (accumulator, blockerReason) => {
        accumulator[blockerReason] = [...(blockerPartitionIdsByReason[blockerReason] || [])].sort();
        return accumulator;
      },
      {},
    ),
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    partitionIdsByCompletionState: normalizedPartitionIdsByCompletionState,
    unresolvedSemanticStateIds,
    unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
    unresolvedSemanticBlockedPartitionIds: unresolvedSemanticPartitionIds,
    unresolvedSemanticBlockedPartitionCount: unresolvedSemanticPartitionIds.length,
  };
}

function buildPriorityRecoveryPartitionAssessment(options = {}) {
  const partitionId = String(options.partitionId || '').trim();
  const planner =
    options.planner ||
    buildPriorityRecoveryPlannerEntry(
      partitionId,
      options.priorityPartitionSummary,
      options.plannerByPartitionId,
    );
  const admission =
    options.admission && typeof options.admission === TYPEOF.OBJECT ? options.admission : {};
  const learnerPromotion =
    options.learnerPromotion && typeof options.learnerPromotion === TYPEOF.OBJECT ?
      options.learnerPromotion :
      {
        activeLearnerNodeIds: [],
        promotableLearnerNodeIds: [],
        activeLearnerNodeCount: NUM.ZERO,
        promotableLearnerNodeCount: NUM.ZERO,
        learnerHoldByNodeId: {},
      };
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  const activeOperationContexts = operationContexts.filter(
    (context) => !isPriorityRecoveryOperationContextTerminal(context),
  );
  const spreadCompletion = buildPriorityRecoverySpreadCompletion({
    plannerReady: planner.ready === true,
    activeOperationContexts,
    eligibleTargetNodeIds: admission.effectiveEligibleNodeIds,
  });
  const blockingOperationIdSet = new Set(spreadCompletion.blockingOperationIds);
  const hasActiveOperationContexts = activeOperationContexts.length > NUM.ZERO;
  const hasCompletedAddOperationContext = operationContexts.some((context) =>
    isPriorityRecoveryCompletedAddOperationContext(context),
  );
  const ineligibleNodeIds = normalizePriorityRecoveryStringList(
    admission.ineligibleNodes?.map((entry) => entry?.nodeId),
  );
  const recoveryEligibleExcludedNodeIds = normalizePriorityRecoveryStringList(
    admission.effectiveEligibleNodeIds,
  ).filter((nodeId) => ineligibleNodeIds.includes(nodeId));
  const operationTargetsOutsideEligibleCohort =
    normalizePriorityRecoveryStringList(admission.effectiveEligibleNodeIds).length > NUM.ZERO &&
    activeOperationContexts
      .filter((context) => blockingOperationIdSet.has(context.operationId))
      .some((context) => {
        const targetNodeId = String(context?.targetNodeId || '').trim();
        return (
          targetNodeId.length > NUM.ZERO &&
          !admission.effectiveEligibleNodeIds.includes(targetNodeId)
        );
      });
  const eligibleButNoOperation =
    planner.ready === false &&
    admission.effectiveEligibleNodeCount !== NUM.ZERO &&
    hasActiveOperationContexts === false &&
    hasCompletedAddOperationContext === false;
  const operationCreatedNoStepTransitions =
    hasActiveOperationContexts &&
    spreadCompletion.blockingOperationCount > NUM.ZERO &&
    activeOperationContexts
      .filter((context) => blockingOperationIdSet.has(context.operationId))
      .every((context) => context.timelineStepCount <= NUM.ONE);
  const learnerActiveNeverPromotable =
    learnerPromotion.activeLearnerNodeCount > NUM.ZERO &&
    learnerPromotion.promotableLearnerNodeCount === NUM.ZERO;
  const publicationRecoveryEligibleButCoordinatorExcludesNode =
    recoveryEligibleExcludedNodeIds.length > NUM.ZERO || operationTargetsOutsideEligibleCohort;
  const blockerReasons = [];
  if (eligibleButNoOperation) {
    blockerReasons.push(PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION);
  }
  if (operationCreatedNoStepTransitions) {
    blockerReasons.push(PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS);
  }
  if (learnerActiveNeverPromotable) {
    blockerReasons.push(PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE);
  }
  if (publicationRecoveryEligibleButCoordinatorExcludesNode) {
    blockerReasons.push(PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED);
  }
  const semanticState = resolvePriorityRecoverySemanticState({
    blockerReasons,
    plannerReady: planner.ready === true,
    hasActiveOperationContexts,
    spreadCompletion,
  });
  return {
    planner,
    spreadCompletion,
    blockerReasons,
    semanticState,
    activeOperationContexts,
    ineligibleNodeIds,
    recoveryEligibleExcludedNodeIds,
    publicationRecoveryEligibleButCoordinatorExcludesNode,
  };
}

function buildPriorityRecoveryOperationAssessment(options = {}) {
  const operationContext = buildPriorityRecoveryOperationContextFromRecord(options.operation);
  const effectiveEligibleNodeIds = normalizePriorityRecoveryStringList(
    options.effectiveEligibleNodeIds,
  );
  const assessment = buildPriorityRecoveryPartitionAssessment({
    partitionId: operationContext?.partitionId || options.partitionId || '',
    priorityPartitionSummary: options.priorityPartitionSummary,
    admission: {
      effectiveEligibleNodeIds,
      effectiveEligibleNodeCount: effectiveEligibleNodeIds.length,
      ineligibleNodes: [],
    },
    operationContexts: operationContext ? [operationContext] : [],
  });
  return {
    ...assessment,
    operationContext,
  };
}

function shouldPriorityRecoveryOperationBlockPlanning(assessment) {
  if (!assessment || typeof assessment !== TYPEOF.OBJECT) {
    return true;
  }
  if (assessment.spreadCompletion?.satisfied === true) {
    return false;
  }
  return assessment.semanticState !== PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH;
}

function buildPriorityRecoveryRediscoveryState(options = {}) {
  const publicationConvergence =
    options.publicationConvergence && typeof options.publicationConvergence === TYPEOF.OBJECT ?
      options.publicationConvergence :
      null;
  const priorityPartitionSummary =
    options.priorityPartitionSummary && typeof options.priorityPartitionSummary === TYPEOF.OBJECT ?
      options.priorityPartitionSummary :
      publicationConvergence?.priorityPartitionSummary || null;
  const publicationContext = buildPriorityRecoveryPublicationContext(publicationConvergence);
  const nodeId = String(options.nodeId || '').trim();
  const spreadGapPending = hasPriorityRecoverySpreadGap(priorityPartitionSummary);
  const targetNodeInConcreteEligibleCohort =
    nodeId.length > NUM.ZERO && publicationContext.concreteEligibleNodeIds.includes(nodeId);
  const targetNodePublishedActive =
    nodeId.length > NUM.ZERO && publicationContext.publishedActiveNodeIds.includes(nodeId);
  const targetNodeMissingPublished =
    nodeId.length > NUM.ZERO && publicationContext.missingPublishedEligibleNodeIds.includes(nodeId);
  const requiresAuthoritativeRediscovery =
    options.cacheVisible !== true &&
    spreadGapPending &&
    (publicationContext.concreteEligibleNodeIds.length === NUM.ZERO ||
      targetNodeInConcreteEligibleCohort ||
      targetNodePublishedActive ||
      targetNodeMissingPublished);

  return Object.freeze({
    nodeId: nodeId || null,
    spreadGapPending,
    concreteEligibleNodeIds: Object.freeze([...publicationContext.concreteEligibleNodeIds]),
    publishedActiveNodeIds: Object.freeze([...publicationContext.publishedActiveNodeIds]),
    missingPublishedEligibleNodeIds: Object.freeze([
      ...publicationContext.missingPublishedEligibleNodeIds,
    ]),
    targetNodeInConcreteEligibleCohort,
    targetNodePublishedActive,
    targetNodeMissingPublished,
    requiresAuthoritativeRediscovery,
  });
}

function shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId, options = {}) {
  return buildPriorityRecoveryRediscoveryState({
    ...options,
    nodeId,
  }).requiresAuthoritativeRediscovery;
}

export {
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  PRIORITY_RECOVERY_ADMISSION_SOURCE,
  buildPriorityRecoveryPublicationContext,
  buildPriorityRecoveryAdmissionPlan,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryCorrelationKey,
  buildPriorityRecoveryDecisionSnapshots,
  buildPriorityRecoveryPlannerEntry,
  buildPriorityRecoveryPlannerByPartitionId,
  buildPriorityRecoveryRediscoveryState,
  hasPriorityRecoverySpreadGap,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
  resolvePriorityPartitionSummaryFromPublication,
  resolvePriorityRecoveryAdmissionPlanFromPublication,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldUseAuthoritativePriorityRecoveryRediscovery,
  shouldPriorityRecoveryOperationBlockPlanning,
};
