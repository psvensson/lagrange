import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  NUM,
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE,
  TYPEOF,
  buildPriorityRecoveryBlockedPartitionIds,
  hasPriorityRecoverySpreadGap,
  normalizeNodeIdList,
  resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  DEFER: 'defer',
  FAIL: 'fail',
});

const PRIORITY_RECOVERY_SUPERSEDED_TARGET_DEFER_REASON_CODES = Object.freeze(
  new Set([
    CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
    CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
    CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
    CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
    CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
  ]),
);

const PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_TABLE = Object.freeze([
  Object.freeze({
    state: PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.NOT_APPLICABLE,
    matches: (evidence) => evidence.targetOutsideEligibleCohort !== true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.DEFER,
    matches: (evidence) => evidence.materializedPreSyncTarget === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.DEFER,
    matches: (evidence) => evidence.transientReadinessBlockerPresent === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.FAIL,
    matches: (evidence) => evidence.targetOutsideEligibleCohort === true,
  }),
]);

function normalizePriorityRecoverySupersededReasonCodes(readiness) {
  const runtimeAuthority =
    readiness?.runtimeAuthority && typeof readiness.runtimeAuthority === TYPEOF.OBJECT ?
      readiness.runtimeAuthority :
      null;
  const reasonCodes = [
    ...(Array.isArray(readiness?.reasonCodes) ? readiness.reasonCodes : []),
    ...(Array.isArray(runtimeAuthority?.reasonCodes) ?
      runtimeAuthority.reasonCodes :
      []),
  ];
  const normalizedReasonCodes = [];
  const seenReasonCodes = new Set();
  for (const reasonCode of reasonCodes) {
    const normalizedReasonCode = String(reasonCode || '').trim();
    if (
      normalizedReasonCode.length === NUM.ZERO ||
      seenReasonCodes.has(normalizedReasonCode)
    ) {
      continue;
    }
    seenReasonCodes.add(normalizedReasonCode);
    normalizedReasonCodes.push(normalizedReasonCode);
  }
  return Object.freeze(normalizedReasonCodes);
}

function buildPriorityRecoverySupersededTargetEvidence({
  operation,
  priorityPartitionSummary,
  eligibleNodeIds,
  targetReadiness,
  targetLifecycleStatus,
}) {
  const targetNodeId = String(operation?.targetNodeId || '').trim();
  const blockedPartitionIds = priorityPartitionSummary ?
    buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary) :
    [];
  const blockedPartitionScopeApplies =
    blockedPartitionIds.length === NUM.ZERO ||
    blockedPartitionIds.includes(operation?.partitionId);
  const targetOutsideEligibleCohort =
    hasPriorityRecoverySpreadGap(priorityPartitionSummary) &&
    eligibleNodeIds.length > NUM.ZERO &&
    targetNodeId.length > NUM.ZERO &&
    !eligibleNodeIds.includes(targetNodeId) &&
    blockedPartitionScopeApplies === true;
  const dimensions =
    targetReadiness?.dimensions &&
    typeof targetReadiness.dimensions === TYPEOF.OBJECT ?
      targetReadiness.dimensions :
      null;
  const reasonCodes = normalizePriorityRecoverySupersededReasonCodes(targetReadiness);
  const transientReasonCodePresent = reasonCodes.some((reasonCode) =>
    PRIORITY_RECOVERY_SUPERSEDED_TARGET_DEFER_REASON_CODES.has(reasonCode),
  );
  const transientDimensionBlockerPresent =
    dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === false ||
    dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] ===
      false ||
    dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE] ===
      false ||
    dimensions?.[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED] ===
      false;
  const materializedPreSyncTarget =
    resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence({
      operation,
      targetLifecycleStatus,
    }) === PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE.MATERIALIZED;
  return Object.freeze({
    materializedPreSyncTarget,
    targetOutsideEligibleCohort,
    transientReadinessBlockerPresent:
      transientReasonCodePresent || transientDimensionBlockerPresent,
  });
}

function decidePriorityRecoverySupersededTarget(evidence) {
  const decision = PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_TABLE.find(
    (candidate) => candidate.matches(evidence),
  );
  return Object.freeze({
    state: decision?.state ||
      PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.NOT_APPLICABLE,
  });
}

function resolvePriorityRecoverySupersededTargetDecision({
  operation,
  priorityRecoveryContext,
  targetReadiness,
  targetLifecycleStatus,
}) {
  const targetNodeId = String(operation?.targetNodeId || '').trim();
  if (!operation || targetNodeId.length === NUM.ZERO) {
    return Object.freeze({
      isFailure: false,
      targetNodeId,
      eligibleNodeIds: Object.freeze([]),
    });
  }
  if (
    !priorityRecoveryContext ||
    typeof priorityRecoveryContext !== TYPEOF.OBJECT
  ) {
    return Object.freeze({
      isFailure: false,
      targetNodeId,
      eligibleNodeIds: Object.freeze([]),
    });
  }

  const priorityPartitionSummary =
    priorityRecoveryContext.priorityPartitionSummary;
  const eligibleNodeIds = normalizeNodeIdList(
    priorityRecoveryContext.effectiveEligibleNodeIds,
  );
  const supersededTargetEvidence = buildPriorityRecoverySupersededTargetEvidence({
    operation,
    priorityPartitionSummary,
    eligibleNodeIds,
    targetReadiness,
    targetLifecycleStatus,
  });
  const supersededTargetDecision =
    decidePriorityRecoverySupersededTarget(supersededTargetEvidence);
  return Object.freeze({
    isFailure:
      supersededTargetDecision.state ===
      PRIORITY_RECOVERY_SUPERSEDED_TARGET_DECISION_STATE.FAIL,
    targetNodeId,
    eligibleNodeIds: Object.freeze([...eligibleNodeIds]),
  });
}

export {resolvePriorityRecoverySupersededTargetDecision};
