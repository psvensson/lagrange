import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  PRIORITY_RECOVERY_ADMISSION_SOURCE,
  PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS,
} from './priority-recovery-admission-constants.js';
import {
  inferPriorityRecoveryTableNameFromPartitionId,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  normalizeReplicaOperationRecord,
  resolveStepTimeoutMs,
} from '../rebalancer/replica-operation-liveness.js';
import {
  PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_COMPLETED_AT,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_OPERATION_ID,
  PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT,
  PRIORITY_RECOVERY_REPLICA_OPERATION_SUMMARY_FIELD_ROWS,
} from './priority-recovery-snapshot-contract.js';
import {buildPriorityRecoveryBlockedPartitions, hasPriorityRecoverySpreadGap, readFirstStringField} from './priority-recovery-snapshot-ingress.js';
import {buildPriorityRecoveryEmergencyBudgetOwnerIds, resolvePriorityPartitionSummaryFromPublication} from './priority-recovery-snapshot-active-gate.js';
import {buildPriorityRecoveryTargetServiceEvidence} from './priority-recovery-snapshot-rebalancer.js';

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
  const blockedPartitionIds = blockedPartitions.map(
    (entry) => entry.partitionId,
  );
  const blockedPartitionIdSet = new Set(blockedPartitionIds);
  const recoveryActive = hasPriorityRecoverySpreadGap(
    options.priorityPartitionSummary,
  );
  const blockedPartitionDetailUnavailable =
    recoveryActive === true && blockedPartitionIds.length === NUM.ZERO;
  const emergencyBlockedPartitionIds = blockedPartitions
    .filter((entry) => isEmergencyPriorityPartition(entry.partitionId))
    .map((entry) => entry.partitionId);
  const emergencyRecoveryActive =
    emergencyBlockedPartitionIds.length > NUM.ZERO ||
    blockedPartitionDetailUnavailable;
  const emergencyPriorityOverflowSlotCount = emergencyRecoveryActive ?
    blockedPartitionDetailUnavailable ?
      PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS.size :
      buildPriorityRecoveryEmergencyBudgetOwnerIds(
        emergencyBlockedPartitionIds,
      ).size :
    NUM.ZERO;
  const ordinaryPriorityAddBudgetLimit = maxConcurrentAdds;
  const emergencyPriorityAddBudgetLimit = emergencyRecoveryActive ?
    maxConcurrentAdds + emergencyPriorityOverflowSlotCount :
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
    if (
      normalizedPartitionId.length === NUM.ZERO ||
      !isPriorityPartition(normalizedPartitionId)
    ) {
      return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY;
    }
    if (isEmergencyPriorityPartition(normalizedPartitionId)) {
      return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY;
    }
    return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY;
  };
  const getReservedNonPrioritySlots = (partitionId, slotType = 'add') => {
    if (
      getPartitionClass(partitionId) !==
      PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY
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
    const ordinaryPriorityCount = Number(
      counts.ordinaryPriorityCount || NUM.ZERO,
    );
    const budgetLimit = getPriorityAddBudgetLimit(partitionId);
    if (
      partitionClass ===
      PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY
    ) {
      return Object.freeze({
        allowed: false,
        reason:
          PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.NOT_PRIORITY_PARTITION,
        partitionClass,
        budgetLimit,
      });
    }
    if (emergencyPriorityAddBudgetLimit <= NUM.ZERO) {
      return Object.freeze({
        allowed: false,
        reason:
          PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.PRIORITY_LANE_DISABLED,
        partitionClass,
        budgetLimit,
      });
    }
    if (priorityCount >= emergencyPriorityAddBudgetLimit) {
      return Object.freeze({
        allowed: false,
        reason:
          PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.EMERGENCY_PRIORITY_LANE_EXHAUSTED,
        partitionClass,
        budgetLimit: emergencyPriorityAddBudgetLimit,
      });
    }
    if (
      partitionClass ===
      PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY
    ) {
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
        reason:
          PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.PRIORITY_LANE_DISABLED,
        partitionClass,
        budgetLimit,
      });
    }
    if (ordinaryPriorityCount >= ordinaryPriorityAddBudgetLimit) {
      return Object.freeze({
        allowed: false,
        reason:
          PRIORITY_RECOVERY_ADMISSION_DECISION_REASON.ORDINARY_PRIORITY_LANE_EXHAUSTED,
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
    emergencyBlockedPartitionIds: Object.freeze([
      ...emergencyBlockedPartitionIds,
    ]),
    emergencyPriorityOverflowSlotCount,
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
        normalizedPartitionId.length > NUM.ZERO &&
        blockedPartitionIdSet.has(normalizedPartitionId)
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
  const buildAdmissionPlan = (
    priorityPartitionSummary = null,
    admissionSource = null,
  ) =>
    buildPriorityRecoveryAdmissionPlan({
      admissionSource,
      isPriorityPartition,
      maxConcurrentAdds,
      priorityPartitionSummary,
      isEmergencyPriorityPartition,
    });
  const priorityPartitionSummary =
    resolvePriorityPartitionSummaryFromPublication(publicationRow);
  const publicationAdmissionPlan =
    priorityPartitionSummary ?
      buildAdmissionPlan(
        priorityPartitionSummary,
        PRIORITY_RECOVERY_ADMISSION_SOURCE.PUBLICATION_SUMMARY,
      ) :
      null;
  const publicationAdmissionPlanObserved =
    publicationAdmissionPlan?.recoveryActive === true &&
    Number.isFinite(nowMs);
  const staleAdmissionPlanAvailable =
    !priorityPartitionSummary &&
    Boolean(lastObservedAdmissionPlan) &&
    lastObservedAdmissionPlanAtMs !== null &&
    staleGraceMs > NUM.ZERO &&
    Number.isFinite(nowMs) &&
    nowMs - lastObservedAdmissionPlanAtMs <= staleGraceMs;
  const admissionDecision = [
    {
      matches: Boolean(priorityPartitionSummary),
      admissionPlan: publicationAdmissionPlan,
      nextLastObservedAdmissionPlan:
        publicationAdmissionPlanObserved ? publicationAdmissionPlan : null,
      nextLastObservedAdmissionPlanAtMs:
        publicationAdmissionPlanObserved ? nowMs : null,
    },
    {
      matches: staleAdmissionPlanAvailable,
      admissionPlan: withPriorityRecoveryAdmissionSource(
        lastObservedAdmissionPlan,
        PRIORITY_RECOVERY_ADMISSION_SOURCE.STALE_ACTIVE_GRACE,
      ),
      nextLastObservedAdmissionPlan: lastObservedAdmissionPlan,
      nextLastObservedAdmissionPlanAtMs: lastObservedAdmissionPlanAtMs,
    },
    {
      matches: true,
      admissionPlan: buildAdmissionPlan(
        null,
        PRIORITY_RECOVERY_ADMISSION_SOURCE.INACTIVE_DEFAULT,
      ),
      nextLastObservedAdmissionPlan: null,
      nextLastObservedAdmissionPlanAtMs: null,
    },
  ].find((entry) => entry.matches === true);
  return buildPriorityRecoveryAdmissionPlanResult(
    admissionDecision.admissionPlan,
    admissionDecision.nextLastObservedAdmissionPlan,
    admissionDecision.nextLastObservedAdmissionPlanAtMs,
  );
}

function buildPriorityRecoveryAdmissionPlanResult(
  admissionPlan,
  lastObservedAdmissionPlan,
  lastObservedAdmissionPlanAtMs,
) {
  return {
    admissionPlan,
    lastObservedAdmissionPlan,
    lastObservedAdmissionPlanAtMs,
  };
}

function normalizePriorityRecoveryReplicaOperationContextBuildOptions(
  options = {},
) {
  return {
    nowMs: normalizePriorityRecoveryInteger(options.nowMs),
    stepTimeoutMsByWorkflowStep:
      options.stepTimeoutMsByWorkflowStep &&
      typeof options.stepTimeoutMsByWorkflowStep === TYPEOF.OBJECT ?
        options.stepTimeoutMsByWorkflowStep :
        null,
  };
}

function resolvePriorityRecoveryOperationTimeline(
  operationTimelineById,
  operationId,
) {
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
  if (
    entityType !== PRIORITY_RECOVERY_REPLICA_OPERATION_ENTITY_TYPE_PARTITION
  ) {
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
  const targetServiceEvidence = buildPriorityRecoveryTargetServiceEvidence({
    operationContext: normalizedReplicaOperation,
    serviceRows,
  });
  const context = {
    operationId,
    partitionId,
    tableName: inferPriorityRecoveryTableNameFromPartitionId(partitionId),
    type: String(normalizedReplicaOperation.type || '').toUpperCase(),
    status: String(normalizedReplicaOperation.status || '').toLowerCase(),
    workflowStep: String(
      normalizedReplicaOperation.workflowStep || '',
    ).toUpperCase(),
    sourceNodeId: normalizedReplicaOperation.sourceNodeId || null,
    targetNodeId: normalizedReplicaOperation.targetNodeId || null,
    replicaId: normalizedReplicaOperation.replicaId || null,
    createdAtMs: normalizePriorityRecoveryInteger(
      normalizedReplicaOperation.createdAt ??
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_CREATED_AT
        ] ??
        replicaOperationRow.createdAt,
    ),
    updatedAtMs: normalizePriorityRecoveryInteger(
      normalizedReplicaOperation.updatedAt ??
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_UPDATED_AT
        ] ??
        replicaOperationRow.updatedAt,
    ),
    completedAtMs: normalizePriorityRecoveryInteger(
      normalizedReplicaOperation.completedAt ??
        replicaOperationRow[
          PRIORITY_RECOVERY_REPLICA_OPERATION_FIELD_COMPLETED_AT
        ] ??
        replicaOperationRow.completedAt,
    ),
    ageMs: normalizePriorityRecoveryInteger(normalizedReplicaOperation.ageMs),
    stepTimeoutMs: normalizePriorityRecoveryInteger(
      resolveStepTimeoutMs(normalizedReplicaOperation.workflowStep, {
        stepTimeoutMsByWorkflowStep: options.stepTimeoutMsByWorkflowStep,
      }),
    ),
    timelineLength: timeline.length,
    timelineStepCount: timelineSteps.length,
    latestTimelineStep:
      String(latestTimelineEntry?.step || '').toUpperCase() || null,
    latestTimelineStatus:
      String(latestTimelineEntry?.status || '').toLowerCase() || null,
    latestTimelineInFlight: latestTimelineEntry?.inFlight === true,
    targetVisibilityState: targetServiceEvidence.visibilityState,
    targetServiceTerminalState: targetServiceEvidence.terminalState,
    ...(Number.isFinite(targetServiceEvidence.progressAtMs) ?
      {targetServiceProgressAtMs: targetServiceEvidence.progressAtMs} :
      {}),
  };
  return {operationId, partitionId, context};
}

function resolveTrackedPriorityRecoveryAdmissionPlan(options = {}) {
  const tracker =
    options.tracker && typeof options.tracker === TYPEOF.OBJECT ?
      options.tracker :
      null;
  const resolvedAdmission = resolvePriorityRecoveryAdmissionPlanFromPublication(
    {
      publicationRow: options.publicationRow,
      nowMs: options.nowMs,
      staleGraceMs: options.staleGraceMs,
      lastObservedAdmissionPlan: tracker?.lastObservedAdmissionPlan ?? null,
      lastObservedAdmissionPlanAtMs:
        tracker?.lastObservedAdmissionPlanAtMs ?? null,
      maxConcurrentAdds: options.maxConcurrentAdds,
      isPriorityPartition: options.isPriorityPartition,
      isEmergencyPriorityPartition: options.isEmergencyPriorityPartition,
    },
  );
  if (tracker) {
    tracker.lastObservedAdmissionPlan =
      resolvedAdmission.lastObservedAdmissionPlan ?? null;
    tracker.lastObservedAdmissionPlanAtMs =
      resolvedAdmission.lastObservedAdmissionPlanAtMs ?? null;
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

export {
  buildPriorityRecoveryAdmissionPlan,
  buildPriorityRecoveryAdmissionPlanResult,
  buildPriorityRecoveryReplicaOperationContext,
  buildPriorityRecoveryReplicaOperationSourceRows,
  normalizePriorityRecoveryReplicaOperationContextBuildOptions,
  resolvePriorityRecoveryAdmissionPlanFromPublication,
  resolvePriorityRecoveryOperationTimeline,
  resolvePriorityRecoveryReplicaOperationSummaryRows,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  withPriorityRecoveryAdmissionSource,
};
