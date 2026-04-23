import {NUM, TYPEOF, WORKFLOW_STEP} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {
  buildActiveMembershipSnapshot as buildPriorityRecoveryPublicationContext,
  resolvePriorityRecoveryActiveNodeCohort,
} from './active-node-projection.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_PRESSURE_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from './priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
  buildPriorityRecoveryCompletion,
} from './priority-recovery-completion.js';
import {
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  PRIORITY_RECOVERY_ADMISSION_SOURCE,
  PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS,
  PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY,
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP,
  PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY,
  PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED,
  PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED,
  isPriorityRecoveryEmergencyPartition,
} from './priority-recovery-admission-constants.js';
import {
  buildPriorityRecoveryCorrelationKey,
  buildPriorityRecoveryPressureConditions,
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
import {
  normalizeReplicaOperationRecord,
  resolveStepTimeoutMs,
} from '../rebalancer/replica-operation-liveness.js';
import {
  buildOwnerContractOutcome,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from './owner-contract-outcome.js';
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
const PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_COMPLETED_AT = 'completed_at';
const PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_ROWS = 'rows';
const PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_OPERATION_TIMELINE_BY_ID =
  'operationTimelineById';
const PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE = 'raft_role';
const PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID = 'node_id';
const PRIORITY_RECOVERY_SERVICE_FIELD_REPLICA_ID = 'replica_id';
const PRIORITY_RECOVERY_SERVICE_FIELD_SERVICE_TYPE = 'service_type';
const PRIORITY_RECOVERY_SERVICE_FIELD_STATUS = 'status';
const PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID = 'partition_id';
const PRIORITY_RECOVERY_STATUS_ACTIVE = 'active';
const PRIORITY_RECOVERY_SERVICE_TYPE_PARTITION = 'partition';
const PRIORITY_RECOVERY_WORKFLOW_STATE = Object.freeze({
  NONE: 'none',
  IN_FLIGHT: 'in_flight',
  REMOVE_PHASE: 'remove_phase',
  TERMINAL: 'terminal',
});
const PRIORITY_RECOVERY_VISIBILITY_STATE = Object.freeze({
  NONE: 'none',
  CACHE_VISIBLE: 'cache_visible',
  DEFERRED: 'deferred',
  UNKNOWN: 'unknown',
});
const PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE = Object.freeze({
  ABSENT: 'absent',
  ACTIVE_OPERATIONAL: 'active_operational',
  ACTIVE_NON_OPERATIONAL: 'active_non_operational',
  NON_ACTIVE: 'non_active',
});
const PRIORITY_RECOVERY_CONVERGENCE_STATE = Object.freeze({
  CONVERGED: 'converged',
  SPREAD_SATISFIED_IN_FLIGHT: 'spread_satisfied_in_flight',
  SPREAD_GAP: 'spread_gap',
});
const PRIORITY_RECOVERY_PROVENANCE_SOURCE = Object.freeze({
  NONE: 'none',
  SYSTEM_TABLE_CACHE: 'system_table_cache',
  REPLICA_OPERATION_TIMELINE: 'replica_operation_timeline',
  PRIORITY_RECOVERY_SNAPSHOT: 'priority_recovery_snapshot',
});
const PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE = Object.freeze({
  COMPLETION_STATE: 'completion_state',
  WORKFLOW_STATE: 'workflow_state',
  OPERATION_CONTEXT: 'operation_context',
  TIMELINE: 'operation_timeline',
  BLOCKER_REASONS: 'blocker_reasons',
  LAST_PROGRESS_TIMESTAMP: 'last_progress_timestamp',
});
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
    return (
      PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON
        .REPLACE_REMOVE_DISPATCH_PHASE_ON_ELIGIBLE_TARGET
    );
  }
  if (
    satisfyingOperationContexts.some((operationContext) =>
      operationContext?.targetVisibilityState ===
        PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL,
    )
  ) {
    return (
      PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON
        .OPERATIONAL_TARGET_VISIBLE_ON_ELIGIBLE_NODE
    );
  }
  return PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.UNSATISFIED;
}
function buildPriorityRecoverySpreadCompletion(options = {}) {
  const activeOperationContexts = Array.isArray(options.activeOperationContexts) ?
    options.activeOperationContexts :
    [];
  const eligibleTargetNodeIds = normalizePriorityRecoveryStringList(options.eligibleTargetNodeIds);
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
function buildPriorityRecoverySpreadRelevantOperationContexts(operationContexts = []) {
  const spreadRelevantOperationContexts = [];
  const seenOperationIds = new Set();
  for (const operationContext of Array.isArray(operationContexts) ? operationContexts : []) {
    if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
      continue;
    }
    const operationId = String(operationContext.operationId || '').trim();
    if (operationId.length > NUM.ZERO && seenOperationIds.has(operationId)) {
      continue;
    }
    if (
      isPriorityRecoveryOperationContextTerminal(operationContext) !== false &&
      isPriorityRecoveryCompletedAddOperationContext(operationContext) !== true
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
function normalizePriorityRecoveryReplicaOperationContextBuildOptions(options = {}) {
  return {
    nowMs: normalizePriorityRecoveryInteger(options.nowMs),
    stepTimeoutMsByWorkflowStep:
      options.stepTimeoutMsByWorkflowStep &&
      typeof options.stepTimeoutMsByWorkflowStep === TYPEOF.OBJECT ?
        options.stepTimeoutMsByWorkflowStep :
        null,
  };
}
function resolvePriorityRecoveryOperationTimeline(operationTimelineById, operationId) {
  return Array.isArray(operationTimelineById[operationId]) ?
    operationTimelineById[operationId] :
    [];
}
function buildPriorityRecoveryReplicaOperationContext(
  replicaOperationRow,
  operationTimelineById,
  serviceRows,
  options = {},
) {
  const normalizedReplicaOperation = normalizeReplicaOperationRecord(
    replicaOperationRow,
    {
      ...(Number.isFinite(options.nowMs) ? {nowMs: options.nowMs} : {}),
    },
  );
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
    return null;
  }
  const entityType = String(
    normalizedReplicaOperation.entityType ||
      PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION,
  ).toLowerCase();
  if (entityType !== PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION) {
    return null;
  }
  const partitionId = String(
    normalizedReplicaOperation.partitionId ||
      normalizedReplicaOperation.partitionGroupId ||
      normalizedReplicaOperation.entityId ||
      '',
  ).trim();
  if (partitionId.length === NUM.ZERO) {
    return null;
  }
  const timeline = resolvePriorityRecoveryOperationTimeline(
    operationTimelineById,
    operationId,
  );
  const timelineSteps = normalizePriorityRecoveryStringList(
    timeline.map((entry) => String(entry?.step || '').trim()),
  );
  const latestTimelineEntry =
    timeline.length > NUM.ZERO ? timeline[timeline.length - 1] : null;
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
    completedAtMs: normalizePriorityRecoveryInteger(
      normalizedReplicaOperation.completedAt ??
        replicaOperationRow[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_COMPLETED_AT] ??
        replicaOperationRow.completedAt,
    ),
    ageMs: normalizePriorityRecoveryInteger(normalizedReplicaOperation.ageMs),
    stepTimeoutMs: normalizePriorityRecoveryInteger(
      resolveStepTimeoutMs(
        normalizedReplicaOperation.workflowStep,
        {
          stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
        },
      ),
    ),
    timelineLength: timeline.length,
    timelineStepCount: timelineSteps.length,
    latestTimelineStep: String(latestTimelineEntry?.step || '').toUpperCase() || null,
    latestTimelineStatus: String(latestTimelineEntry?.status || '').toLowerCase() || null,
    latestTimelineInFlight: latestTimelineEntry?.inFlight === true,
    targetVisibilityState: resolvePriorityRecoveryTargetVisibilityState({
      operationContext: normalizedReplicaOperation,
      serviceRows,
    }),
  };
  return {operationId, partitionId, context};
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
function resolvePriorityRecoveryReplicaOperationSummaryRows(
  replicaOperationsSummary = null,
) {
  const summaryRows =
    replicaOperationsSummary?.[
      PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_ROWS
    ];
  return Array.isArray(summaryRows) ? summaryRows : [];
}
function buildPriorityRecoveryReplicaOperationSourceRows(
  replicaOperationRows = [],
  replicaOperationsSummary = null,
) {
  const sourceRows = [];
  const sourceRowIndexByOperationId = {};
  const appendSourceRow = (sourceRow) => {
    if (!sourceRow || typeof sourceRow !== TYPEOF.OBJECT) {
      return;
    }
    const operationId = String(
      readFirstStringField(
        sourceRow,
        PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
        'operationId',
      ) || '',
    ).trim();
    if (operationId.length === NUM.ZERO) {
      sourceRows.push(sourceRow);
      return;
    }
    if (
      !Object.prototype.hasOwnProperty.call(
        sourceRowIndexByOperationId,
        operationId,
      )
    ) {
      sourceRowIndexByOperationId[operationId] = sourceRows.length;
      sourceRows.push(sourceRow);
      return;
    }
    sourceRows[sourceRowIndexByOperationId[operationId]] = sourceRow;
  };
  for (const replicaOperationRow of Array.isArray(replicaOperationRows) ?
    replicaOperationRows :
    []) {
    appendSourceRow(replicaOperationRow);
  }
  // Canonical liveness-summary rows may be fresher than lagging raw cache rows.
  for (const summaryRow of resolvePriorityRecoveryReplicaOperationSummaryRows(
    replicaOperationsSummary,
  )) {
    appendSourceRow(summaryRow);
  }
  return sourceRows;
}
function buildPriorityRecoveryReplicaOperationContexts(
  replicaOperationRows = [],
  replicaOperationsSummary = null,
  serviceRows = [],
  options = {},
) {
  const normalizedOptions =
    normalizePriorityRecoveryReplicaOperationContextBuildOptions(options);
  const operationTimelineById =
    replicaOperationsSummary?.[
      PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_OPERATION_TIMELINE_BY_ID
    ] &&
    typeof replicaOperationsSummary[
      PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_OPERATION_TIMELINE_BY_ID
    ] === TYPEOF.OBJECT ?
      replicaOperationsSummary[
        PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_OPERATION_TIMELINE_BY_ID
      ] :
      {};
  const byOperationId = {};
  const byPartitionId = {};
  for (const replicaOperationRow of buildPriorityRecoveryReplicaOperationSourceRows(
    replicaOperationRows,
    replicaOperationsSummary,
  )) {
    const builtContext = buildPriorityRecoveryReplicaOperationContext(
      replicaOperationRow,
      operationTimelineById,
      serviceRows,
      normalizedOptions,
    );
    if (!builtContext) {
      continue;
    }
    const {operationId, partitionId, context} = builtContext;
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
function doesPriorityRecoveryServiceRowMatchOperationTarget(
  operationContext,
  serviceRow,
) {
  if (!operationContext || !serviceRow || typeof serviceRow !== TYPEOF.OBJECT) {
    return false;
  }
  const targetNodeId = String(operationContext?.targetNodeId || '').trim();
  const partitionId = String(operationContext?.partitionId || '').trim();
  if (targetNodeId.length === NUM.ZERO || partitionId.length === NUM.ZERO) {
    return false;
  }
  const serviceType = String(
    readFirstStringField(
      serviceRow,
      PRIORITY_RECOVERY_SERVICE_FIELD_SERVICE_TYPE,
      'serviceType',
    ) || PRIORITY_RECOVERY_SERVICE_TYPE_PARTITION,
  ).toLowerCase();
  if (serviceType !== PRIORITY_RECOVERY_SERVICE_TYPE_PARTITION) {
    return false;
  }
  const serviceNodeId = readFirstStringField(
    serviceRow,
    PRIORITY_RECOVERY_SERVICE_FIELD_NODE_ID,
    'nodeId',
  );
  if (serviceNodeId !== targetNodeId) {
    return false;
  }
  const servicePartitionId = readFirstStringField(
    serviceRow,
    PRIORITY_RECOVERY_SERVICE_FIELD_PARTITION_ID,
    'partitionId',
  );
  if (servicePartitionId && servicePartitionId !== partitionId) {
    return false;
  }
  const operationReplicaId = String(operationContext?.replicaId || '').trim();
  if (operationReplicaId.length === NUM.ZERO) {
    return true;
  }
  const serviceReplicaId = readFirstStringField(
    serviceRow,
    PRIORITY_RECOVERY_SERVICE_FIELD_REPLICA_ID,
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.REPLICAID,
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.SERVICE_ID,
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.SERVICEID,
  );
  if (!serviceReplicaId) {
    return true;
  }
  return serviceReplicaId === operationReplicaId;
}
function resolvePriorityRecoveryTargetVisibilityState(options = {}) {
  const operationContext =
    options.operationContext && typeof options.operationContext === TYPEOF.OBJECT ?
      options.operationContext :
      null;
  const serviceRows = Array.isArray(options.serviceRows) ? options.serviceRows : [];
  let hasMatchingTargetServiceRow = false;
  let hasActiveMatchingTargetServiceRow = false;
  for (const serviceRow of serviceRows) {
    if (
      !doesPriorityRecoveryServiceRowMatchOperationTarget(
        operationContext,
        serviceRow,
      )
    ) {
      continue;
    }
    hasMatchingTargetServiceRow = true;
    const status = String(
      readFirstStringField(
        serviceRow,
        PRIORITY_RECOVERY_SERVICE_FIELD_STATUS,
        'status',
      ) || '',
    ).toLowerCase();
    if (status !== PRIORITY_RECOVERY_STATUS_ACTIVE) {
      continue;
    }
    hasActiveMatchingTargetServiceRow = true;
    const raftRole = String(
      readFirstStringField(
        serviceRow,
        PRIORITY_RECOVERY_SERVICE_FIELD_RAFT_ROLE,
        'raftRole',
      ) || '',
    ).toLowerCase();
    if (
      raftRole.length > NUM.ZERO &&
      raftRole !== PRIORITY_RECOVERY_RAFT_ROLE_LEARNER
    ) {
      return PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL;
    }
  }
  if (hasActiveMatchingTargetServiceRow === true) {
    return PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_NON_OPERATIONAL;
  }
  if (hasMatchingTargetServiceRow === true) {
    return PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.NON_ACTIVE;
  }
  return PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ABSENT;
}
function buildPriorityRecoveryOperationContextFromRecord(record, options = {}) {
  if (!record || typeof record !== TYPEOF.OBJECT) {
    return null;
  }
  const nowMs = normalizePriorityRecoveryInteger(options.nowMs);
  const stepTimeoutMsByWorkflowStep =
    options.stepTimeoutMsByWorkflowStep &&
    typeof options.stepTimeoutMsByWorkflowStep === TYPEOF.OBJECT ?
      options.stepTimeoutMsByWorkflowStep :
      null;
  const normalizedRecord = normalizeReplicaOperationRecord(
    record,
    {
      ...(Number.isFinite(nowMs) ? {nowMs} : {}),
    },
  );
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
    completedAtMs: normalizePriorityRecoveryInteger(
      normalizedRecord.completedAt ??
        record[PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_COMPLETED_AT] ??
        record.completedAt,
    ),
    ageMs: normalizePriorityRecoveryInteger(normalizedRecord.ageMs),
    stepTimeoutMs: normalizePriorityRecoveryInteger(
      resolveStepTimeoutMs(
        normalizedRecord.workflowStep,
        {
          stepTimeoutMsByWorkflowStep,
        },
      ),
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
function resolvePriorityRecoveryWorkflowState(operationContexts = []) {
  const normalizedContexts = Array.isArray(operationContexts) ?
    operationContexts.filter((operationContext) => operationContext &&
      typeof operationContext === TYPEOF.OBJECT) :
    [];
  if (normalizedContexts.length === NUM.ZERO) {
    return PRIORITY_RECOVERY_WORKFLOW_STATE.NONE;
  }
  if (normalizedContexts.every((operationContext) =>
    isPriorityRecoveryOperationContextTerminal(operationContext),
  )) {
    return PRIORITY_RECOVERY_WORKFLOW_STATE.TERMINAL;
  }
  if (normalizedContexts.some((operationContext) =>
    isReplaceRemoveDispatchPhase(operationContext),
  )) {
    return PRIORITY_RECOVERY_WORKFLOW_STATE.REMOVE_PHASE;
  }
  return PRIORITY_RECOVERY_WORKFLOW_STATE.IN_FLIGHT;
}
function resolvePriorityRecoveryVisibilityState(options = {}) {
  const completion =
    options.completion && typeof options.completion === TYPEOF.OBJECT ?
      options.completion :
      null;
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  if (
    completion?.state === PRIORITY_RECOVERY_COMPLETION_STATE.OPERATION_VISIBILITY_DEFERRED ||
    options.authoritativeOperationReadDeferred === true
  ) {
    return PRIORITY_RECOVERY_VISIBILITY_STATE.DEFERRED;
  }
  if (operationContexts.length > NUM.ZERO) {
    return PRIORITY_RECOVERY_VISIBILITY_STATE.CACHE_VISIBLE;
  }
  if (resolvePriorityRecoveryWorkflowState(operationContexts) === PRIORITY_RECOVERY_WORKFLOW_STATE.NONE) {
    return PRIORITY_RECOVERY_VISIBILITY_STATE.NONE;
  }
  return PRIORITY_RECOVERY_VISIBILITY_STATE.UNKNOWN;
}
function resolvePriorityRecoveryConvergenceState(assessment = null) {
  if (!assessment || typeof assessment !== TYPEOF.OBJECT) {
    return PRIORITY_RECOVERY_CONVERGENCE_STATE.SPREAD_GAP;
  }
  if (assessment?.planner?.ready === true) {
    return PRIORITY_RECOVERY_CONVERGENCE_STATE.CONVERGED;
  }
  if (assessment?.spreadCompletion?.satisfied === true) {
    return PRIORITY_RECOVERY_CONVERGENCE_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_CONVERGENCE_STATE.SPREAD_GAP;
}
function resolvePriorityRecoveryOperationProgressTimestampMs(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return NUM.ZERO;
  }
  const completedAtMs = normalizePriorityRecoveryInteger(operationContext.completedAtMs);
  if (Number.isFinite(completedAtMs) && completedAtMs > NUM.ZERO) {
    return completedAtMs;
  }
  const updatedAtMs = normalizePriorityRecoveryInteger(operationContext.updatedAtMs);
  if (Number.isFinite(updatedAtMs) && updatedAtMs > NUM.ZERO) {
    return updatedAtMs;
  }
  const createdAtMs = normalizePriorityRecoveryInteger(operationContext.createdAtMs);
  if (Number.isFinite(createdAtMs) && createdAtMs > NUM.ZERO) {
    return createdAtMs;
  }
  return NUM.ZERO;
}
function resolvePriorityRecoveryWorkflowProgressPhaseId(operationContext) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.NONE;
  }
  const workflowStep = String(operationContext?.workflowStep || '').toUpperCase();
  if (
    workflowStep === WORKFLOW_STEP.PENDING ||
    workflowStep === WORKFLOW_STEP.SENDING
  ) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING;
  }
  if (workflowStep === WORKFLOW_STEP.CREATING) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION;
  }
  if (workflowStep === WORKFLOW_STEP.SYNCING) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC;
  }
  if (
    workflowStep === WORKFLOW_STEP.ACTIVE ||
    workflowStep === WORKFLOW_STEP.STOPPING
  ) {
    return isReplaceRemoveDispatchPhase(operationContext) ?
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL :
      PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.UNKNOWN;
  }
  if (isPriorityRecoveryOperationContextTerminal(operationContext) === true) {
    return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL;
  }
  return PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.UNKNOWN;
}
function resolvePriorityRecoveryWorkflowStepAgeMs(
  operationContext,
  nowMs = null,
) {
  const ageMs = normalizePriorityRecoveryInteger(operationContext?.ageMs);
  if (Number.isFinite(ageMs) && ageMs >= NUM.ZERO) {
    return ageMs;
  }
  const referenceNowMs = normalizePriorityRecoveryInteger(nowMs);
  const progressAtMs = resolvePriorityRecoveryOperationProgressTimestampMs(operationContext);
  if (
    Number.isFinite(referenceNowMs) &&
    Number.isFinite(progressAtMs) &&
    referenceNowMs >= progressAtMs
  ) {
    return Math.max(NUM.ZERO, referenceNowMs - progressAtMs);
  }
  return null;
}
function resolvePriorityRecoveryWorkflowStepTimeoutMs(
  operationContext,
  options = {},
) {
  const stepTimeoutMs = normalizePriorityRecoveryInteger(
    operationContext?.stepTimeoutMs,
  );
  if (Number.isFinite(stepTimeoutMs) && stepTimeoutMs > NUM.ZERO) {
    return stepTimeoutMs;
  }
  const stepTimeoutMsByWorkflowStep =
    options.stepTimeoutMsByWorkflowStep &&
    typeof options.stepTimeoutMsByWorkflowStep === TYPEOF.OBJECT ?
      options.stepTimeoutMsByWorkflowStep :
      null;
  const workflowStep = String(operationContext?.workflowStep || '').trim();
  if (workflowStep.length === NUM.ZERO) {
    return null;
  }
  return normalizePriorityRecoveryInteger(
    resolveStepTimeoutMs(
      workflowStep,
      {
        stepTimeoutMsByWorkflowStep,
      },
    ),
  );
}
function buildPriorityRecoveryWorkflowProgressMetrics(options = {}) {
  const latestOperationContext =
    options.latestOperationContext &&
    typeof options.latestOperationContext === TYPEOF.OBJECT ?
      options.latestOperationContext :
      null;
  const nowMs = normalizePriorityRecoveryInteger(options.nowMs);
  const stepTimeoutMsByWorkflowStep =
    options.stepTimeoutMsByWorkflowStep &&
    typeof options.stepTimeoutMsByWorkflowStep === TYPEOF.OBJECT ?
      options.stepTimeoutMsByWorkflowStep :
      null;
  const workflowProgressPhaseId =
    resolvePriorityRecoveryWorkflowProgressPhaseId(latestOperationContext);
  const stepAgeMs =
    resolvePriorityRecoveryWorkflowStepAgeMs(latestOperationContext, nowMs);
  const stepTimeoutMs = resolvePriorityRecoveryWorkflowStepTimeoutMs(
    latestOperationContext,
    {stepTimeoutMsByWorkflowStep},
  );
  return Object.freeze({
    workflowProgressPhaseId,
    ...(Number.isFinite(stepAgeMs) ? {stepAgeMs} : {}),
    ...(Number.isFinite(stepTimeoutMs) ? {stepTimeoutMs} : {}),
    timeoutReconcileDue:
      Number.isFinite(stepAgeMs) &&
      Number.isFinite(stepTimeoutMs) &&
      stepTimeoutMs > NUM.ZERO &&
      stepAgeMs >= stepTimeoutMs,
  });
}
function selectLatestPriorityRecoveryOperationContext(operationContexts = []) {
  const normalizedContexts = Array.isArray(operationContexts) ?
    operationContexts.filter((operationContext) => operationContext &&
      typeof operationContext === TYPEOF.OBJECT) :
    [];
  if (normalizedContexts.length === NUM.ZERO) {
    return null;
  }
  return normalizedContexts
    .slice()
    .sort((left, right) => {
      return resolvePriorityRecoveryOperationProgressTimestampMs(right) -
        resolvePriorityRecoveryOperationProgressTimestampMs(left);
    })[0] || null;
}
function hasPriorityRecoveryScheduledRetry(retryAfterMs) {
  return Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO;
}
function buildPriorityRecoveryProgressEvidenceSourceIds(options = {}) {
  const evidenceSourceIds = [];
  if (typeof options.completionState === TYPEOF.STRING && options.completionState.length > NUM.ZERO) {
    evidenceSourceIds.push(PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.COMPLETION_STATE);
  }
  if (typeof options.workflowState === TYPEOF.STRING && options.workflowState.length > NUM.ZERO) {
    evidenceSourceIds.push(PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.WORKFLOW_STATE);
  }
  if (options.hasOperationContext === true) {
    evidenceSourceIds.push(PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.OPERATION_CONTEXT);
  }
  if (options.hasTimelineEvidence === true) {
    evidenceSourceIds.push(PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.TIMELINE);
  }
  if (options.hasBlockerReasons === true) {
    evidenceSourceIds.push(PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.BLOCKER_REASONS);
  }
  if (Number.isFinite(options.lastProgressAtMs) && options.lastProgressAtMs > NUM.ZERO) {
    evidenceSourceIds.push(
      PRIORITY_RECOVERY_PROGRESS_EVIDENCE_SOURCE.LAST_PROGRESS_TIMESTAMP,
    );
  }
  return Object.freeze(normalizePriorityRecoveryStringList(evidenceSourceIds));
}
function buildPriorityRecoveryConditionsContract(options = {}) {
  const observation =
    options.observation && typeof options.observation === TYPEOF.OBJECT ?
      options.observation :
      null;
  const assessment =
    options.assessment && typeof options.assessment === TYPEOF.OBJECT ?
      options.assessment :
      null;
  const admission =
    options.admission && typeof options.admission === TYPEOF.OBJECT ?
      options.admission :
      null;
  const latestOperationContext =
    options.latestOperationContext &&
    typeof options.latestOperationContext === TYPEOF.OBJECT ?
      options.latestOperationContext :
      null;
  const pressure = buildPriorityRecoveryPressureConditions(options.logsTable);
  const visibilityState = String(
    observation?.visibilityState || PRIORITY_RECOVERY_VISIBILITY_STATE.NONE,
  ).trim();
  const latestOperationWorkflowStep =
    typeof latestOperationContext?.workflowStep === TYPEOF.STRING ?
      latestOperationContext.workflowStep.trim() :
      PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE;
  const latestOperationStatus =
    typeof latestOperationContext?.status === TYPEOF.STRING ?
      latestOperationContext.status.trim() :
      PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE;
  return Object.freeze({
    visibilityState,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
    blockerReasonCodes: Object.freeze(
      normalizePriorityRecoveryStringList(assessment?.blockerReasons),
    ),
    admissionBlockingReasonCodes: Object.freeze(
      normalizePriorityRecoveryStringList(admission?.blockingReasons),
    ),
    pressure,
    ...(latestOperationWorkflowStep.length > NUM.ZERO ?
      {latestOperationWorkflowStep} :
      {}),
    ...(latestOperationStatus.length > NUM.ZERO ?
      {latestOperationStatus} :
      {}),
  });
}
function buildPriorityRecoveryActuationShape(options = {}) {
  return {
    workflowProgressPhaseId: options.progressMetrics.workflowProgressPhaseId,
    owner: PRIORITY_RECOVERY_PROGRESS_OWNER.NONE,
    state: PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
    operationCount: options.operationCount,
    ...(options.latestOperationId ? {latestOperationId: options.latestOperationId} : {}),
    ...(Number.isFinite(options.progressMetrics.stepAgeMs) ?
      {stepAgeMs: options.progressMetrics.stepAgeMs} :
      {}),
    ...(Number.isFinite(options.progressMetrics.stepTimeoutMs) ?
      {stepTimeoutMs: options.progressMetrics.stepTimeoutMs} :
      {}),
    ...(Number.isFinite(options.lastProgressAtMs) ?
      {lastProgressAtMs: options.lastProgressAtMs} :
      {}),
    ...(Number.isFinite(options.retryAfterMs) ?
      {retryAfterMs: options.retryAfterMs} :
      {}),
    timeoutReconcileDue: options.progressMetrics.timeoutReconcileDue === true,
  };
}
function buildPriorityRecoveryActuationSnapshot(actuationShape, owner, state) {
  return Object.freeze({
    ...actuationShape,
    owner,
    state,
  });
}
function isPriorityRecoveryObservationDeferred(options = {}) {
  return (
    options.completionState ===
      PRIORITY_RECOVERY_COMPLETION_STATE.OPERATION_VISIBILITY_DEFERRED ||
    options.visibilityState === PRIORITY_RECOVERY_VISIBILITY_STATE.DEFERRED ||
    options.authoritativeOperationReadDeferred === true
  );
}
function resolvePriorityRecoveryInFlightActuationState(
  workflowState,
  progressMetrics,
) {
  if (
    workflowState !== PRIORITY_RECOVERY_WORKFLOW_STATE.IN_FLIGHT &&
    workflowState !== PRIORITY_RECOVERY_WORKFLOW_STATE.REMOVE_PHASE
  ) {
    return null;
  }
  return progressMetrics.timeoutReconcileDue === true ?
    PRIORITY_RECOVERY_ACTUATION_STATE.RECONCILE_DUE :
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED;
}
function resolvePriorityRecoveryFollowupActuationState(options = {}) {
  if (options.missingFollowupOperation !== true) {
    return null;
  }
  if (options.pressureState !== PRIORITY_RECOVERY_PRESSURE_STATE.NONE) {
    return PRIORITY_RECOVERY_ACTUATION_STATE.PERSIST_BLOCKED_BY_PRESSURE;
  }
  if (options.scheduledRetry === true) {
    return PRIORITY_RECOVERY_ACTUATION_STATE.PERSIST_FAILED_RETRYABLE;
  }
  return PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED;
}
function buildPriorityRecoveryActuationContract(options = {}) {
  const completion =
    options.completion && typeof options.completion === TYPEOF.OBJECT ?
      options.completion :
      null;
  const observation =
    options.observation && typeof options.observation === TYPEOF.OBJECT ?
      options.observation :
      null;
  const assessment =
    options.assessment && typeof options.assessment === TYPEOF.OBJECT ?
      options.assessment :
      null;
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  const latestOperationContext =
    options.latestOperationContext &&
    typeof options.latestOperationContext === TYPEOF.OBJECT ?
      options.latestOperationContext :
      selectLatestPriorityRecoveryOperationContext(operationContexts);
  const conditions =
    options.conditions && typeof options.conditions === TYPEOF.OBJECT ?
      options.conditions :
      buildPriorityRecoveryConditionsContract({
        observation,
        assessment,
        admission: options.admission,
        latestOperationContext,
        logsTable: options.logsTable,
        authoritativeOperationReadDeferred:
          options.authoritativeOperationReadDeferred === true,
      });
  const completionState = String(completion?.state || '').trim();
  const workflowState = String(
    observation?.workflowState || PRIORITY_RECOVERY_WORKFLOW_STATE.NONE,
  ).trim();
  const blockerReasons = normalizePriorityRecoveryStringList(
    assessment?.blockerReasons,
  );
  const nowMs = normalizePriorityRecoveryInteger(
    options.nowMs ?? observation?.provenance?.capturedAt,
  );
  const progressMetrics = buildPriorityRecoveryWorkflowProgressMetrics({
    latestOperationContext,
    nowMs,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
  });
  const retryAfterMs = normalizePriorityRecoveryInteger(completion?.retryAfterMs);
  const scheduledRetry = hasPriorityRecoveryScheduledRetry(retryAfterMs);
  const lastProgressAtMs =
    resolvePriorityRecoveryOperationProgressTimestampMs(latestOperationContext) ||
    normalizePriorityRecoveryInteger(observation?.provenance?.capturedAt) ||
    null;
  const pressureState = String(
    conditions?.pressure?.pressureState ||
      PRIORITY_RECOVERY_PRESSURE_STATE.NONE,
  ).trim();
  const missingFollowupOperation = blockerReasons.includes(
    PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  );
  const actuationShape = buildPriorityRecoveryActuationShape({
    progressMetrics,
    operationCount: operationContexts.length,
    latestOperationId: latestOperationContext?.operationId || null,
    lastProgressAtMs,
    retryAfterMs,
  });

  if (completionState === PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED) {
    return buildPriorityRecoveryActuationSnapshot(
      actuationShape,
      PRIORITY_RECOVERY_PROGRESS_OWNER.NONE,
      PRIORITY_RECOVERY_ACTUATION_STATE.NO_ACTION_NEEDED,
    );
  }
  if (isPriorityRecoveryObservationDeferred({
    completionState,
    visibilityState: conditions?.visibilityState,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  })) {
    return buildPriorityRecoveryActuationSnapshot(
      actuationShape,
      PRIORITY_RECOVERY_PROGRESS_OWNER.AUTHORITATIVE_VISIBILITY_OWNER,
      PRIORITY_RECOVERY_ACTUATION_STATE.AWAITING_OBSERVATION,
    );
  }
  const inFlightActuationState = resolvePriorityRecoveryInFlightActuationState(
    workflowState,
    progressMetrics,
  );
  if (inFlightActuationState) {
    return buildPriorityRecoveryActuationSnapshot(
      actuationShape,
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      inFlightActuationState,
    );
  }
  if (
    blockerReasons.includes(
      PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
    )
  ) {
    return buildPriorityRecoveryActuationSnapshot(
      actuationShape,
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      PRIORITY_RECOVERY_ACTUATION_STATE.RECONCILE_DUE,
    );
  }
  const followupActuationState = resolvePriorityRecoveryFollowupActuationState({
    missingFollowupOperation,
    pressureState,
    scheduledRetry,
  });
  if (followupActuationState) {
    return buildPriorityRecoveryActuationSnapshot(
      actuationShape,
      PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      followupActuationState,
    );
  }
  if (workflowState === PRIORITY_RECOVERY_WORKFLOW_STATE.TERMINAL) {
    return buildPriorityRecoveryActuationSnapshot(
      actuationShape,
      PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      PRIORITY_RECOVERY_ACTUATION_STATE.COMPLETED,
    );
  }
  return buildPriorityRecoveryActuationSnapshot(
    actuationShape,
    PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
    PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
  );
}
function buildPriorityRecoveryProgressOutcome(options = {}) {
  return Object.freeze({
    ...buildOwnerContractOutcome({
      contractState: options.contractState,
      nextAction: options.nextAction,
    }),
    ...options.progressShape,
    currentOwner: options.currentOwner,
    nextRequiredAction: options.nextRequiredAction,
    blockingBoundary: options.blockingBoundary,
    waitMode: options.waitMode,
    lastProgressAtMs: options.lastProgressAtMs,
    retryAfterMs: options.retryAfterMs,
    evidenceSourceIds: options.evidenceSourceIds,
  });
}
function buildPriorityRecoveryRetryScheduledDescriptor(defaultWaitMode) {
  return {
    contractState: OWNER_CONTRACT_STATE.PENDING,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    waitMode: defaultWaitMode,
  };
}
function buildPriorityRecoveryPendingDescriptor(scheduledRetry, defaultWaitMode) {
  if (scheduledRetry) {
    return buildPriorityRecoveryRetryScheduledDescriptor(
      PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
    );
  }
  return {
    contractState: OWNER_CONTRACT_STATE.PENDING,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
    waitMode: defaultWaitMode,
  };
}
function buildPriorityRecoveryBlockedDescriptor(scheduledRetry, defaultWaitMode) {
  if (scheduledRetry) {
    return buildPriorityRecoveryRetryScheduledDescriptor(
      PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
    );
  }
  return {
    contractState: OWNER_CONTRACT_STATE.BLOCKED,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
    waitMode: defaultWaitMode,
  };
}
function buildPriorityRecoveryProgressContext(options = {}) {
  const completion =
    options.completion && typeof options.completion === TYPEOF.OBJECT ?
      options.completion :
      null;
  const observation =
    options.observation && typeof options.observation === TYPEOF.OBJECT ?
      options.observation :
      null;
  const assessment =
    options.assessment && typeof options.assessment === TYPEOF.OBJECT ?
      options.assessment :
      null;
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  const latestOperationContext =
    options.latestOperationContext &&
    typeof options.latestOperationContext === TYPEOF.OBJECT ?
      options.latestOperationContext :
      selectLatestPriorityRecoveryOperationContext(operationContexts);
  const conditions =
    options.conditions && typeof options.conditions === TYPEOF.OBJECT ?
      options.conditions :
      buildPriorityRecoveryConditionsContract({
        observation,
        assessment,
        admission: options.admission,
        latestOperationContext,
        logsTable: options.logsTable,
        authoritativeOperationReadDeferred:
          options.authoritativeOperationReadDeferred === true,
      });
  const actuation =
    options.actuation && typeof options.actuation === TYPEOF.OBJECT ?
      options.actuation :
      buildPriorityRecoveryActuationContract({
        completion,
        observation,
        assessment,
        admission: options.admission,
        conditions,
        operationContexts,
        latestOperationContext,
        logsTable: options.logsTable,
        nowMs: options.nowMs,
        stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
        authoritativeOperationReadDeferred:
          options.authoritativeOperationReadDeferred === true,
      });
  const blockerReasons = normalizePriorityRecoveryStringList(assessment?.blockerReasons);
  const retryAfterMs = normalizePriorityRecoveryInteger(completion?.retryAfterMs);
  const scheduledRetry = hasPriorityRecoveryScheduledRetry(retryAfterMs);
  const completionState = String(completion?.state || '').trim();
  const workflowState = String(
    observation?.workflowState || PRIORITY_RECOVERY_WORKFLOW_STATE.NONE,
  ).trim();
  const visibilityState = String(
    observation?.visibilityState || PRIORITY_RECOVERY_VISIBILITY_STATE.NONE,
  ).trim();
  const nowMs = normalizePriorityRecoveryInteger(
    options.nowMs ?? observation?.provenance?.capturedAt,
  );
  const progressMetrics = buildPriorityRecoveryWorkflowProgressMetrics({
    latestOperationContext,
    nowMs,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
  });
  const progressShape = Object.freeze({
    workflowProgressPhaseId: actuation.workflowProgressPhaseId,
    ...(Number.isFinite(actuation.stepAgeMs) ?
      {stepAgeMs: actuation.stepAgeMs} :
      {}),
    ...(Number.isFinite(actuation.stepTimeoutMs) ?
      {stepTimeoutMs: actuation.stepTimeoutMs} :
      {}),
  });
  const lastProgressAtMs =
    Number.isFinite(actuation.lastProgressAtMs) ?
      actuation.lastProgressAtMs :
      resolvePriorityRecoveryOperationProgressTimestampMs(latestOperationContext) ||
      normalizePriorityRecoveryInteger(observation?.provenance?.capturedAt) ||
      null;
  const evidenceSourceIds = buildPriorityRecoveryProgressEvidenceSourceIds({
    completionState,
    workflowState,
    hasOperationContext: latestOperationContext !== null,
    hasTimelineEvidence:
      Number(latestOperationContext?.timelineLength || NUM.ZERO) > NUM.ZERO,
    hasBlockerReasons: blockerReasons.length > NUM.ZERO,
    lastProgressAtMs,
  });
  return {
    actuation,
    blockerReasons,
    completionState,
    evidenceSourceIds,
    lastProgressAtMs,
    progressMetrics,
    progressShape,
    retryAfterMs,
    scheduledRetry,
    visibilityState,
    workflowState,
  };
}
function resolvePriorityRecoveryInFlightProgressDescriptor(options = {}) {
  const workflowOwned =
    options.workflowState === PRIORITY_RECOVERY_WORKFLOW_STATE.IN_FLIGHT ||
    options.workflowState === PRIORITY_RECOVERY_WORKFLOW_STATE.REMOVE_PHASE;
  if (!workflowOwned) {
    return null;
  }
  if (options.progressMetrics.timeoutReconcileDue === true) {
    return {
      ...buildPriorityRecoveryRetryScheduledDescriptor(
        options.scheduledRetry ?
          PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED :
          PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
      ),
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.RECONCILE_STALE_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT,
    };
  }
  return {
    ...buildPriorityRecoveryPendingDescriptor(
      options.scheduledRetry,
      PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    ),
    currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    nextRequiredAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
    blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
  };
}
function buildPriorityRecoveryProgressContract(options = {}) {
  const progressContext = buildPriorityRecoveryProgressContext(options);
  const {
    actuation,
    blockerReasons,
    completionState,
    evidenceSourceIds,
    lastProgressAtMs,
    progressMetrics,
    progressShape,
    retryAfterMs,
    scheduledRetry,
    visibilityState,
    workflowState,
  } = progressContext;
  if (completionState === PRIORITY_RECOVERY_COMPLETION_STATE.CONVERGED) {
    return buildPriorityRecoveryProgressOutcome({
      contractState: OWNER_CONTRACT_STATE.READY,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      progressShape,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.NONE,
      nextRequiredAction: PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.NONE,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.NONE,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.NONE,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  if (isPriorityRecoveryObservationDeferred({
    completionState,
    visibilityState,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  })) {
    return buildPriorityRecoveryProgressOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      progressShape,
      currentOwner:
        PRIORITY_RECOVERY_PROGRESS_OWNER.AUTHORITATIVE_VISIBILITY_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
          .OBSERVE_AUTHORITATIVE_VISIBILITY,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.AUTHORITATIVE_VISIBILITY,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.DEFERRED_VISIBILITY,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  const inFlightDescriptor = resolvePriorityRecoveryInFlightProgressDescriptor({
    workflowState,
    progressMetrics,
    scheduledRetry,
  });
  if (inFlightDescriptor) {
    return buildPriorityRecoveryProgressOutcome({
      ...inFlightDescriptor,
      progressShape,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  if (
    completionState ===
      PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT
  ) {
    return buildPriorityRecoveryProgressOutcome({
      contractState: OWNER_CONTRACT_STATE.READY,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      progressShape,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.NONE,
      nextRequiredAction: PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.NONE,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.NONE,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.NONE,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  if (blockerReasons.includes(PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS)) {
    return buildPriorityRecoveryProgressOutcome({
      ...buildPriorityRecoveryBlockedDescriptor(
        scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      progressShape,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  if (
    blockerReasons.includes(
      PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
    )
  ) {
    return buildPriorityRecoveryProgressOutcome({
      ...buildPriorityRecoveryBlockedDescriptor(
        scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      progressShape,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.ADMISSION_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.RECONCILE_ELIGIBLE_COHORT,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.ELIGIBLE_COHORT,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  if (
    blockerReasons.includes(
      PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE,
    )
  ) {
    return buildPriorityRecoveryProgressOutcome({
      ...buildPriorityRecoveryBlockedDescriptor(
        scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      progressShape,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.ADMISSION_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.RESTORE_PROMOTABLE_TARGET,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.LEARNER_PROMOTION,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  if (
    actuation.state === PRIORITY_RECOVERY_ACTUATION_STATE.PERSIST_BLOCKED_BY_PRESSURE
  ) {
    return buildPriorityRecoveryProgressOutcome({
      ...buildPriorityRecoveryRetryScheduledDescriptor(
        scheduledRetry ?
          PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED :
          PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      progressShape,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  if (blockerReasons.includes(PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION)) {
    return buildPriorityRecoveryProgressOutcome({
      ...buildPriorityRecoveryBlockedDescriptor(
        scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      progressShape,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  if (
    workflowState === PRIORITY_RECOVERY_WORKFLOW_STATE.TERMINAL ||
    completionState === PRIORITY_RECOVERY_COMPLETION_STATE.BLOCKED
  ) {
    return buildPriorityRecoveryProgressOutcome({
      ...buildPriorityRecoveryBlockedDescriptor(
        scheduledRetry,
        PRIORITY_RECOVERY_WAIT_MODE.STALLED,
      ),
      progressShape,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.SCHEDULE_FOLLOWUP_REBALANCE,
      blockingBoundary:
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
      lastProgressAtMs,
      retryAfterMs,
      evidenceSourceIds,
    });
  }
  return buildPriorityRecoveryProgressOutcome({
    ...buildPriorityRecoveryBlockedDescriptor(
      scheduledRetry,
      PRIORITY_RECOVERY_WAIT_MODE.STALLED,
    ),
    progressShape,
    currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
    nextRequiredAction:
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.SCHEDULE_FOLLOWUP_REBALANCE,
    blockingBoundary:
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
    lastProgressAtMs,
    retryAfterMs,
    evidenceSourceIds,
  });
}
function buildPriorityRecoveryPartitionObservation(options = {}) {
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  const capturedAt = normalizePriorityRecoveryInteger(options.capturedAt);
  const hasTimelineEvidence = operationContexts.some((operationContext) =>
    Number(operationContext?.timelineLength || NUM.ZERO) > NUM.ZERO,
  );
  return {
    workflowState: resolvePriorityRecoveryWorkflowState(operationContexts),
    visibilityState: resolvePriorityRecoveryVisibilityState({
      completion: options.completion,
      operationContexts,
      authoritativeOperationReadDeferred:
        options.authoritativeOperationReadDeferred === true,
    }),
    convergenceState: resolvePriorityRecoveryConvergenceState(options.assessment),
    provenance: {
      capturedAt,
      workflowSource:
        operationContexts.length > NUM.ZERO ?
          PRIORITY_RECOVERY_PROVENANCE_SOURCE.SYSTEM_TABLE_CACHE :
          PRIORITY_RECOVERY_PROVENANCE_SOURCE.NONE,
      timelineSource:
        hasTimelineEvidence === true ?
          PRIORITY_RECOVERY_PROVENANCE_SOURCE.REPLICA_OPERATION_TIMELINE :
          PRIORITY_RECOVERY_PROVENANCE_SOURCE.NONE,
      semanticSource: PRIORITY_RECOVERY_PROVENANCE_SOURCE.PRIORITY_RECOVERY_SNAPSHOT,
    },
  };
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
  recoveryActiveNodeIds = [],
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
    learnerPromotionByPartitionId[partitionId] =
      buildPriorityRecoveryLearnerPromotion({
        activeLearnerNodeIds: learnerNodeIds,
        readinessByNodeId,
        recoveryActiveNodeIds,
      });
  }

  return learnerPromotionByPartitionId;
}

function buildPriorityRecoveryLearnerPromotion(options = {}) {
  const activeLearnerNodeIds = normalizePriorityRecoveryStringList(
    options.activeLearnerNodeIds,
  );
  const normalizedReadinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const recoveryActiveNodeIdSet = new Set(
    normalizePriorityRecoveryStringList(options.recoveryActiveNodeIds),
  );
  const learnerHoldByNodeId = {};
  const promotableLearnerNodeIds = [];

  for (const nodeId of activeLearnerNodeIds) {
    const readiness = normalizedReadinessByNodeId[nodeId] || null;
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === TYPEOF.OBJECT ?
        readiness.dimensions :
        {};
    const repairEligible =
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true;
    const recoveryCohortIncludesNode = recoveryActiveNodeIdSet.has(nodeId);
    if (repairEligible || recoveryCohortIncludesNode) {
      promotableLearnerNodeIds.push(nodeId);
      continue;
    }
    const recoveryEligible =
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true;
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

  return {
    activeLearnerNodeIds,
    promotableLearnerNodeIds,
    activeLearnerNodeCount: activeLearnerNodeIds.length,
    promotableLearnerNodeCount: promotableLearnerNodeIds.length,
    learnerHoldByNodeId,
  };
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

function isPriorityRecoverySnapshotObject(value) {
  return value && typeof value === TYPEOF.OBJECT;
}

function resolvePriorityRecoveryDecisionPublicationConvergence(options = {}) {
  return isPriorityRecoverySnapshotObject(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
}

function resolvePriorityRecoveryDecisionReadinessByNodeId(options = {}) {
  return isPriorityRecoverySnapshotObject(options.readinessByNodeId) ?
    options.readinessByNodeId :
    {};
}

function resolvePriorityRecoveryDecisionPriorityPartitionSummary(
  options = {},
  publicationConvergence = null,
) {
  return isPriorityRecoverySnapshotObject(options.priorityPartitionSummary) ?
    options.priorityPartitionSummary :
    publicationConvergence?.priorityPartitionSummary || null;
}

function resolvePriorityRecoveryDecisionPlanner(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.planner)) {
    return options.planner;
  }
  return buildPriorityRecoveryPlannerEntry(
    options.partitionId,
    options.priorityPartitionSummary,
    buildPriorityRecoveryPlannerByPartitionId(options.priorityPartitionSummary),
  );
}

function resolvePriorityRecoveryDecisionPublicationContext(options = {}) {
  return isPriorityRecoverySnapshotObject(options.publicationContext) ?
    options.publicationContext :
    buildPriorityRecoveryPublicationContext(options.publicationConvergence);
}

function resolvePriorityRecoveryDecisionPublicationNodeDecisions(options = {}) {
  return isPriorityRecoverySnapshotObject(options.publicationNodeDecisions) ?
    options.publicationNodeDecisions :
    buildPriorityRecoveryPublicationNodeDecisions(options.publicationConvergence);
}

function resolvePriorityRecoveryDecisionAdmission(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.admission)) {
    return options.admission;
  }
  return buildEffectivePriorityRecoveryAdmission(options.workflowAdmission || null, {
    publicationEligibleNodeIds: options.publicationContext.concreteEligibleNodeIds,
    recoveryEligibleIncludedNodeIds:
      options.publicationContext.recoveryEligibleIncludedNodeIds,
    prioritySummaryReadyEligibleNodeCount:
      options.priorityPartitionSummary?.readyEligibleNodeCount,
  });
}

function buildPriorityRecoveryDefaultLearnerPromotion() {
  return {
    activeLearnerNodeIds: [],
    promotableLearnerNodeIds: [],
    activeLearnerNodeCount: NUM.ZERO,
    promotableLearnerNodeCount: NUM.ZERO,
    learnerHoldByNodeId: {},
  };
}

function resolvePriorityRecoveryDecisionLearnerPromotion(options = {}) {
  return isPriorityRecoverySnapshotObject(options.learnerPromotion) ?
    options.learnerPromotion :
    buildPriorityRecoveryDefaultLearnerPromotion();
}

function resolvePriorityRecoveryDecisionOperationContexts(options = {}) {
  const partitionId = String(options.partitionId || '').trim();
  const operationContexts = Array.isArray(options.operationContexts) ?
    options.operationContexts :
    [];
  return operationContexts.filter((operationContext) =>
    isPriorityRecoverySnapshotObject(operationContext) &&
    String(operationContext.partitionId || '').trim() === partitionId,
  );
}

function resolvePriorityRecoveryDecisionAssessment(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.assessment)) {
    return options.assessment;
  }
  return buildPriorityRecoveryPartitionAssessment({
    partitionId: options.partitionId,
    priorityPartitionSummary: options.priorityPartitionSummary,
    planner: options.planner,
    admission: options.admission,
    learnerPromotion: options.learnerPromotion,
    operationContexts: options.operationContexts,
  });
}

function resolvePriorityRecoveryDecisionCompletion(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.completion)) {
    return options.completion;
  }
  return buildPriorityRecoveryCompletion({
    assessment: options.assessment,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
}

function resolvePriorityRecoveryDecisionObservation(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.observation)) {
    return options.observation;
  }
  return buildPriorityRecoveryPartitionObservation({
    capturedAt: options.capturedAt,
    assessment: options.assessment,
    completion: options.completion,
    operationContexts: options.operationContexts,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
}

function resolvePriorityRecoveryDecisionOperationId(options = {}) {
  return typeof options.operationId === TYPEOF.STRING && options.operationId.length > NUM.ZERO ?
    options.operationId :
    null;
}

function resolvePriorityRecoveryDecisionOperationContext(options = {}) {
  if (isPriorityRecoverySnapshotObject(options.operationContext)) {
    return options.operationContext;
  }
  if (!options.operationId) {
    return null;
  }
  return options.operationContexts.find((candidate) => candidate.operationId === options.operationId) || null;
}

function buildPriorityRecoveryDecisionPublicationSnapshot(options = {}) {
  return {
    publicationStatus: options.publicationConvergence?.publicationStatus || null,
    publishedActiveNodeIds: options.publicationContext.publishedActiveNodeIds,
    projectedServingNodeIds: options.publicationContext.projectedServingNodeIds,
    locallyEligibleNodeIds: options.publicationContext.locallyEligibleNodeIds,
    concreteEligibleNodeIds: options.publicationContext.concreteEligibleNodeIds,
    recoveryActiveNodeIds: options.publicationContext.recoveryActiveNodeIds,
    recoveryActiveNodeSource: options.publicationContext.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds:
      options.publicationContext.missingPublishedRecoveryActiveNodeIds,
    missingPublishedEligibleNodeIds:
      options.publicationContext.missingPublishedEligibleNodeIds,
    pendingAckNodeIds: normalizePriorityRecoveryStringList(
      options.publicationConvergence?.pendingAckNodeIds,
    ),
    inclusionReasonsByNodeId:
      options.publicationNodeDecisions.inclusionReasonsByNodeId,
    exclusionReasonsByNodeId:
      options.publicationNodeDecisions.exclusionReasonsByNodeId,
  };
}

function isPriorityRecoveryReadinessRecoveryEligibleOnly(readinessEntry) {
  const dimensions =
    readinessEntry?.dimensions && typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
      readinessEntry.dimensions :
      {};
  return (
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === true &&
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true
  );
}

function buildPriorityRecoveryDecisionReadinessSnapshot(readinessByNodeId, learnerPromotion) {
  return {
    recoveryEligibleOnlyNodeIds: normalizePriorityRecoveryStringList(
      Object.entries(readinessByNodeId)
        .filter(([_nodeId, readinessEntry]) =>
          isPriorityRecoveryReadinessRecoveryEligibleOnly(readinessEntry),
        )
        .map(([nodeId]) => nodeId),
    ),
    learnerPromotion,
  };
}

function buildPriorityRecoveryDecisionSnapshot(options = {}) {
  const partitionId = String(options.partitionId || '').trim();
  if (partitionId.length === NUM.ZERO) {
    return null;
  }
  const publicationConvergence =
    resolvePriorityRecoveryDecisionPublicationConvergence(options);
  const publicationEpoch = normalizePriorityRecoveryInteger(
    options.publicationEpoch ?? publicationConvergence?.publicationEpoch,
  );
  const readinessByNodeId = resolvePriorityRecoveryDecisionReadinessByNodeId(options);
  const priorityPartitionSummary = resolvePriorityRecoveryDecisionPriorityPartitionSummary(
    options,
    publicationConvergence,
  );
  const planner = resolvePriorityRecoveryDecisionPlanner({
    partitionId,
    priorityPartitionSummary,
    planner: options.planner,
  });
  const publicationContext = resolvePriorityRecoveryDecisionPublicationContext({
    publicationConvergence,
    publicationContext: options.publicationContext,
  });
  const publicationNodeDecisions = resolvePriorityRecoveryDecisionPublicationNodeDecisions({
    publicationConvergence,
    publicationNodeDecisions: options.publicationNodeDecisions,
  });
  const admission = resolvePriorityRecoveryDecisionAdmission({
    admission: options.admission,
    workflowAdmission: options.workflowAdmission,
    publicationContext,
    priorityPartitionSummary,
  });
  const learnerPromotion = resolvePriorityRecoveryDecisionLearnerPromotion({
    learnerPromotion: options.learnerPromotion,
  });
  const operationContexts = resolvePriorityRecoveryDecisionOperationContexts({
    partitionId,
    operationContexts: options.operationContexts,
  });
  const assessment = resolvePriorityRecoveryDecisionAssessment({
    assessment: options.assessment,
    partitionId,
    priorityPartitionSummary,
    planner,
    admission,
    learnerPromotion,
    operationContexts,
  });
  const semanticState = assessment.semanticState;
  const completion = resolvePriorityRecoveryDecisionCompletion({
    completion: options.completion,
    assessment,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
  const observation = resolvePriorityRecoveryDecisionObservation({
    observation: options.observation,
    capturedAt: options.capturedAt,
    assessment,
    completion,
    operationContexts,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
  const operationId = resolvePriorityRecoveryDecisionOperationId(options);
  const operationContext = resolvePriorityRecoveryDecisionOperationContext({
    operationContext: options.operationContext,
    operationId,
    operationContexts,
  });
  const latestOperationContext =
    selectLatestPriorityRecoveryOperationContext(operationContexts);
  const conditions = buildPriorityRecoveryConditionsContract({
    observation,
    assessment,
    admission,
    latestOperationContext,
    logsTable: options.logsTable,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
  const actuation = buildPriorityRecoveryActuationContract({
    completion,
    observation,
    assessment,
    admission,
    conditions,
    operationContexts,
    latestOperationContext,
    logsTable: options.logsTable,
    nowMs: options.capturedAt,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });
  const progress = buildPriorityRecoveryProgressContract({
    completion,
    observation,
    assessment,
    actuation,
    operationContexts,
    latestOperationContext,
    nowMs: options.capturedAt,
    stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
    authoritativeOperationReadDeferred:
      options.authoritativeOperationReadDeferred === true,
  });

  return {
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
    observation,
    conditions,
    actuation,
    progress,
    planner,
    admission: {
      ...admission,
      ineligibleNodeIds: assessment.ineligibleNodeIds,
      recoveryEligibleExcludedNodeIds:
        assessment.recoveryEligibleExcludedNodeIds,
    },
    spreadCompletion: assessment.spreadCompletion,
    coordinator: {
      operationCount: operationContexts.length,
      operationIds: operationContexts.map((context) => context.operationId),
      operation: operationContext || latestOperationContext,
    },
    publication: buildPriorityRecoveryDecisionPublicationSnapshot({
      publicationConvergence,
      publicationContext,
      publicationNodeDecisions,
    }),
    readiness: buildPriorityRecoveryDecisionReadinessSnapshot(
      readinessByNodeId,
      learnerPromotion,
    ),
    blockerReasons: assessment.blockerReasons,
  };
}
function buildPriorityRecoveryCompletionPartitionSetMap() {
  const partitionIdsByCompletionState = {};
  for (const completionState of PRIORITY_RECOVERY_COMPLETION_STATE_IDS) {
    partitionIdsByCompletionState[completionState] = new Set();
  }
  return partitionIdsByCompletionState;
}
function buildPriorityRecoveryBlockerPartitionSetMap() {
  const blockerPartitionIdsByReason = {};
  for (const blockerReason of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    blockerPartitionIdsByReason[blockerReason] = new Set();
  }
  return blockerPartitionIdsByReason;
}
function recordPriorityRecoveryDecisionSnapshotSummary(
  partitionId,
  partitionSnapshot,
  blockerPartitionIdsByReason,
  partitionIdsBySemanticState,
  partitionIdsByCompletionState,
) {
  for (const blockerReason of partitionSnapshot.blockerReasons) {
    blockerPartitionIdsByReason[blockerReason].add(partitionId);
  }
  if (partitionIdsBySemanticState[partitionSnapshot.semanticState] instanceof Set) {
    partitionIdsBySemanticState[partitionSnapshot.semanticState].add(partitionId);
  }
  if (partitionIdsByCompletionState[partitionSnapshot.completion.state] instanceof Set) {
    partitionIdsByCompletionState[partitionSnapshot.completion.state].add(partitionId);
  }
}
function appendPriorityRecoveryPartitionSnapshots(
  snapshots,
  partitionSnapshot,
  partitionId,
  publicationEpoch,
  operationContexts,
  byOperationId,
) {
  const operationIds =
    operationContexts.length > NUM.ZERO ?
      operationContexts.map((context) => context.operationId) :
      [null];
  for (const operationId of operationIds) {
    const operationContext =
      operationId && byOperationId[operationId] ?
        byOperationId[operationId] :
        null;
    snapshots.push({
      ...partitionSnapshot,
      operationId,
      correlationKey: buildPriorityRecoveryCorrelationKey(
        partitionId,
        publicationEpoch,
        operationId,
      ),
      coordinator: {
        ...partitionSnapshot.coordinator,
        operation: operationContext,
      },
    });
  }
}
function normalizePriorityRecoveryPartitionIdSetMap(
  partitionIdsByState,
  orderedStateIds,
) {
  const normalizedPartitionIdsByState = {};
  for (const stateId of orderedStateIds) {
    normalizedPartitionIdsByState[stateId] = [...partitionIdsByState[stateId]].sort();
  }
  return normalizedPartitionIdsByState;
}
function normalizePriorityRecoveryBlockerPartitionIdsByReason(
  blockerPartitionIdsByReason,
) {
  return PRIORITY_RECOVERY_PROGRESS_CLASS_IDS.reduce((accumulator, blockerReason) => {
    accumulator[blockerReason] = [...(blockerPartitionIdsByReason[blockerReason] || [])].sort();
    return accumulator;
  }, {});
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
    options.serviceRows,
    {
      nowMs: options.capturedAt,
      stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
    },
  );
  const learnerPromotionByPartitionId = buildPriorityRecoveryLearnerPromotionByPartitionId(
    options.serviceRows,
    readinessByNodeId,
    publicationContext.recoveryActiveNodeIds,
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
  const blockerPartitionIdsByReason = buildPriorityRecoveryBlockerPartitionSetMap();
  const partitionIdsBySemanticState = buildPriorityRecoverySemanticPartitionSetMap();
  const partitionIdsByCompletionState = buildPriorityRecoveryCompletionPartitionSetMap();

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
    const operationIds =
      operationContexts.length > NUM.ZERO ?
        operationContexts.map((context) => context.operationId) :
        [null];
    const partitionSnapshot = buildPriorityRecoveryDecisionSnapshot({
      partitionId,
      publicationEpoch,
      capturedAt: options.capturedAt,
      publicationConvergence,
      publicationContext,
      publicationNodeDecisions,
      readinessByNodeId,
      priorityPartitionSummary,
      planner,
      admission,
      learnerPromotion,
      operationContexts,
      stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
      authoritativeOperationReadDeferred: false,
      logsTable: options.logsTable,
    });
    if (!partitionSnapshot) {
      continue;
    }
    recordPriorityRecoveryDecisionSnapshotSummary(
      partitionId,
      partitionSnapshot,
      blockerPartitionIdsByReason,
      partitionIdsBySemanticState,
      partitionIdsByCompletionState,
    );
    appendPriorityRecoveryPartitionSnapshots(
      snapshots,
      partitionSnapshot,
      partitionId,
      publicationEpoch,
      operationContexts,
      replicaOperationContexts.byOperationId,
    );
  }

  const normalizedPartitionIdsBySemanticState =
    normalizePriorityRecoveryPartitionIdSetMap(
      partitionIdsBySemanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
    );
  const normalizedPartitionIdsByCompletionState =
    normalizePriorityRecoveryPartitionIdSetMap(
      partitionIdsByCompletionState,
      PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
    );
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
    blockerPartitionIdsByReason:
      normalizePriorityRecoveryBlockerPartitionIdsByReason(
        blockerPartitionIdsByReason,
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
  const spreadRelevantOperationContexts =
    buildPriorityRecoverySpreadRelevantOperationContexts(operationContexts);
  const spreadCompletion = buildPriorityRecoverySpreadCompletion({
    plannerReady: planner.ready === true,
    activeOperationContexts: spreadRelevantOperationContexts,
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
  if (
    assessment.completion?.state ===
    PRIORITY_RECOVERY_COMPLETION_STATE.OPERATION_VISIBILITY_DEFERRED
  ) {
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
  PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS,
  buildPriorityRecoveryPublicationContext,
  buildPriorityRecoveryAdmissionPlan,
  buildPriorityRecoveryLearnerPromotion,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryCorrelationKey,
  buildPriorityRecoveryDecisionSnapshot,
  buildPriorityRecoveryDecisionSnapshots,
  buildPriorityRecoveryPlannerEntry,
  buildPriorityRecoveryPlannerByPartitionId,
  buildPriorityRecoveryRediscoveryState,
  hasPriorityRecoverySpreadGap,
  isPriorityRecoveryEmergencyPartition,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
  resolvePriorityPartitionSummaryFromPublication,
  resolvePriorityRecoveryAdmissionPlanFromPublication,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldUseAuthoritativePriorityRecoveryRediscovery,
  shouldPriorityRecoveryOperationBlockPlanning,
};
