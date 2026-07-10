import {
  PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  PRIORITY_RECOVERY_ADMISSION_SOURCE,
  PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS,
} from './priority-recovery-admission-constants.js';
import {
  normalizePriorityRecoveryInteger,
} from './priority-recovery-helpers.js';
import {buildPriorityRecoveryBlockedPartitions, hasPriorityRecoverySpreadGap} from './priority-recovery-snapshot-ingress.js';
import {buildPriorityRecoveryEmergencyBudgetOwnerIds, resolvePriorityPartitionSummaryFromPublication} from './priority-recovery-snapshot-active-gate.js';

function buildPriorityRecoveryAdmissionPlan(options = {}) {
  const maxConcurrentAdds = Math.max(
    0,
    normalizePriorityRecoveryInteger(options.maxConcurrentAdds) || 0,
  );
  const isEmergencyPriorityPartition =
    typeof options.isEmergencyPriorityPartition === 'function' ?
      options.isEmergencyPriorityPartition :
      () => false;
  const isPriorityPartition =
    typeof options.isPriorityPartition === 'function' ?
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
    recoveryActive === true && blockedPartitionIds.length === 0;
  const emergencyBlockedPartitionIds = blockedPartitions
    .filter((entry) => isEmergencyPriorityPartition(entry.partitionId))
    .map((entry) => entry.partitionId);
  const emergencyRecoveryActive =
    emergencyBlockedPartitionIds.length > 0 ||
    blockedPartitionDetailUnavailable;
  const emergencyPriorityOverflowSlotCount = emergencyRecoveryActive ?
    blockedPartitionDetailUnavailable ?
      PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS.size :
      buildPriorityRecoveryEmergencyBudgetOwnerIds(
        emergencyBlockedPartitionIds,
      ).size :
    0;
  const ordinaryPriorityAddBudgetLimit = maxConcurrentAdds;
  const emergencyPriorityAddBudgetLimit = emergencyRecoveryActive ?
    maxConcurrentAdds + emergencyPriorityOverflowSlotCount :
    maxConcurrentAdds;
  const admissionSource =
    typeof options.admissionSource === 'string' &&
    options.admissionSource.trim().length > 0 ?
      options.admissionSource.trim() :
      options.priorityPartitionSummary ?
        PRIORITY_RECOVERY_ADMISSION_SOURCE.PUBLICATION_SUMMARY :
        PRIORITY_RECOVERY_ADMISSION_SOURCE.INACTIVE_DEFAULT;
  const getPartitionClass = (partitionId) => {
    const normalizedPartitionId = String(partitionId || '').trim();
    if (
      normalizedPartitionId.length === 0 ||
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
      return 0;
    }
    return slotType === 'move' ?
      recoveryActive ?
        1 :
        0 :
      recoveryActive ?
        1 :
        0;
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
    const priorityCount = Number(counts.priorityCount || 0);
    const ordinaryPriorityCount = Number(
      counts.ordinaryPriorityCount || 0,
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
    if (emergencyPriorityAddBudgetLimit <= 0) {
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
    if (ordinaryPriorityAddBudgetLimit <= 0) {
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
    reservedNonPriorityAddSlots: recoveryActive ? 1 : 0,
    reservedNonPriorityMoveSlots: recoveryActive ? 1 : 0,
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
          normalizedPartitionId.length > 0 &&
          isEmergencyPriorityPartition(normalizedPartitionId)
        );
      }
      return (
        normalizedPartitionId.length > 0 &&
        blockedPartitionIdSet.has(normalizedPartitionId)
      );
    },
  });
}

function withPriorityRecoveryAdmissionSource(admissionPlan, admissionSource) {
  if (!admissionPlan || typeof admissionPlan !== 'object') {
    return admissionPlan;
  }
  return Object.freeze({...admissionPlan, admissionSource});
}

function resolvePriorityRecoveryAdmissionPlanFromPublication(options = {}) {
  const publicationRow =
    options.publicationRow && typeof options.publicationRow === 'object' ?
      options.publicationRow :
      null;
  const nowMs = normalizePriorityRecoveryInteger(options.nowMs);
  const staleGraceMs = Math.max(
    0,
    normalizePriorityRecoveryInteger(options.staleGraceMs) || 0,
  );
  const lastObservedAdmissionPlan =
    options.lastObservedAdmissionPlan &&
    typeof options.lastObservedAdmissionPlan === 'object' ?
      options.lastObservedAdmissionPlan :
      null;
  const lastObservedAdmissionPlanAtMs = normalizePriorityRecoveryInteger(
    options.lastObservedAdmissionPlanAtMs,
  );
  const maxConcurrentAdds = Math.max(
    0,
    normalizePriorityRecoveryInteger(options.maxConcurrentAdds) || 0,
  );
  const isPriorityPartition =
    typeof options.isPriorityPartition === 'function' ?
      options.isPriorityPartition :
      options.isEmergencyPriorityPartition;
  const isEmergencyPriorityPartition =
    typeof options.isEmergencyPriorityPartition === 'function' ?
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
    staleGraceMs > 0 &&
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

function resolveTrackedPriorityRecoveryAdmissionPlan(options = {}) {
  const tracker =
    options.tracker && typeof options.tracker === 'object' ?
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

export {
  buildPriorityRecoveryAdmissionPlan,
  buildPriorityRecoveryAdmissionPlanResult,
  resolvePriorityRecoveryAdmissionPlanFromPublication,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  withPriorityRecoveryAdmissionSource,
};
