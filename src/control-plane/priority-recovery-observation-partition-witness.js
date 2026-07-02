import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE,
  PRIORITY_RECOVERY_PRESSURE_STATE,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from './priority-recovery-diagnostics-constants.js';
import {
  buildPriorityRecoveryCorrelationKey,
  buildPriorityRecoveryPressureConditions,
} from './priority-recovery-helpers.js';
import {fastJsonClone} from '../utils/fast-json-clone.js';
import {LOCAL_EMPTY_LIST, LOCAL_NUM_ONE, LOCAL_NUM_TWO, LOCAL_NUM_ZERO, LOCAL_STR_BLOCKERREASONCODES, LOCAL_STR_EMPTY, LOCAL_STR_SEMANTICSTATEIDS, PRIORITY_RECOVERY_OPERATION_ID_FIELD, PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD, buildPriorityRecoveryExplicitSemanticStateByPartitionId, collectPriorityRecoveryPartitionIndexes, isRecord, normalizeDistinctStringArray, normalizeNonNegativeInteger, normalizePriorityRecoveryBlockedClassIds, normalizePriorityRecoveryObservationStateValue, normalizePriorityRecoverySemanticStatePartitions, resolvePriorityRecoverySnapshotSemanticState} from './priority-recovery-observation-normalization.js';

function cloneJsonValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return fastJsonClone(value);
}

function resolvePriorityRecoveryWitnessPartitionIds(
  blockedClassIds,
  semanticStatePartitions,
) {
  const unresolvedPartitionIds = Array.isArray(
    semanticStatePartitions?.blockedPartitionIds,
  ) ?
    semanticStatePartitions.blockedPartitionIds :
    [];
  if (unresolvedPartitionIds.length > 0) {
    return Object.freeze([...unresolvedPartitionIds]);
  }
  const fallbackWitnessPartitionIds = Array.isArray(
    blockedClassIds?.blockedPartitionIds,
  ) ?
    blockedClassIds.blockedPartitionIds :
    [];
  if (fallbackWitnessPartitionIds.length > 0) {
    return Object.freeze([...fallbackWitnessPartitionIds]);
  }
  const nonBlockingInFlightWitnessPartitionIds = Array.isArray(
    semanticStatePartitions?.partitionIdsBySemanticState?.[
      PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT
    ],
  ) ?
    semanticStatePartitions.partitionIdsBySemanticState[
      PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT
    ] :
    [];
  if (nonBlockingInFlightWitnessPartitionIds.length > 0) {
    return Object.freeze([...nonBlockingInFlightWitnessPartitionIds]);
  }
  return Object.freeze([]);
}

function buildPriorityRecoveryPartitionHistory(
  historyByPartitionId,
  outputField,
) {
  return Object.freeze(
    Object.entries(historyByPartitionId)
      .map(([partitionId, values]) => ({
        partitionId,
        [outputField]: Object.freeze(normalizeDistinctStringArray(values)),
      }))
      .sort((left, right) => left.partitionId.localeCompare(right.partitionId)),
  );
}

function resolvePriorityRecoverySnapshotSortProgressTimestamp(snapshot) {
  const operation = isRecord(snapshot?.coordinator?.operation) ?
    snapshot.coordinator.operation :
    {};
  const progressTimestampCandidates = [
    operation[PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.COMPLETED_AT_MS],
    operation[PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.UPDATED_AT_MS],
    operation[
      PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.TARGET_SERVICE_PROGRESS_AT_MS
    ],
    snapshot?.progress?.[
      PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.LAST_PROGRESS_AT_MS
    ],
    operation[PRIORITY_RECOVERY_SNAPSHOT_PROGRESS_FIELD.CREATED_AT_MS],
  ]
    .map((candidate) => normalizeNonNegativeInteger(candidate))
    .filter((candidate) =>
      Number.isFinite(candidate) && candidate > 0,
    );
  return progressTimestampCandidates.length > 0 ?
    Math.max(...progressTimestampCandidates) :
    0;
}

function resolvePriorityRecoverySnapshotSortTimestamp(
  snapshot,
  decisionSnapshots,
) {
  const progressTimestamp =
    resolvePriorityRecoverySnapshotSortProgressTimestamp(snapshot);
  if (progressTimestamp > 0) {
    return progressTimestamp;
  }
  return Number(
    snapshot?.observation?.provenance?.capturedAt ??
      decisionSnapshots?.capturedAt ??
      0,
  );
}

function resolvePriorityRecoverySnapshotEvidenceRank(snapshot) {
  const operationCount = normalizeNonNegativeInteger(
    snapshot?.coordinator?.operationCount,
  );
  if (
    (Number.isFinite(operationCount) && operationCount > 0) ||
    resolvePriorityRecoverySnapshotOperationIds(snapshot).length > 0
  ) {
    return LOCAL_NUM_TWO;
  }
  const workflowState = normalizePriorityRecoveryObservationStateValue(
    snapshot?.observation?.workflowState,
    LOCAL_STR_EMPTY,
  );
  const visibilityState = normalizePriorityRecoveryObservationStateValue(
    snapshot?.observation?.visibilityState,
    LOCAL_STR_EMPTY,
  );
  if (
    (workflowState.length > 0 &&
      workflowState !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE) ||
    (visibilityState.length > 0 &&
      visibilityState !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE)
  ) {
    return LOCAL_NUM_ONE;
  }
  return LOCAL_NUM_ZERO;
}

function resolvePriorityRecoverySnapshotSortEpoch(
  snapshot,
  decisionSnapshots,
) {
  return normalizeNonNegativeInteger(
    snapshot?.epoch ?? decisionSnapshots?.publicationEpoch,
  ) ?? 0;
}

function resolvePriorityRecoveryExplicitSemanticStateMatchRank(
  snapshot,
  explicitSemanticStateByPartitionId = null,
) {
  const partitionId = String(snapshot?.partitionId || LOCAL_STR_EMPTY).trim();
  if (
    partitionId.length === 0 ||
    !(explicitSemanticStateByPartitionId instanceof Map)
  ) {
    return LOCAL_NUM_ZERO;
  }
  const explicitSemanticState =
    explicitSemanticStateByPartitionId.get(partitionId) || null;
  if (typeof explicitSemanticState !== 'string') {
    return LOCAL_NUM_ZERO;
  }
  const snapshotSemanticState = resolvePriorityRecoverySnapshotSemanticState(
    snapshot,
    normalizeDistinctStringArray(snapshot?.blockerReasons),
    null,
    true,
  );
  return snapshotSemanticState === explicitSemanticState ?
    LOCAL_NUM_ONE :
    LOCAL_NUM_ZERO;
}

function resolvePriorityRecoveryProgressOwnerActionRank(snapshot) {
  const progress = isRecord(snapshot?.progress) ? snapshot.progress : {};
  const actuation = isRecord(snapshot?.actuation) ? snapshot.actuation : {};
  const nextRequiredAction = String(
    progress.nextRequiredAction || LOCAL_STR_EMPTY,
  ).trim();
  const workflowOwnedProgress =
    progress.currentOwner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
    nextRequiredAction.length > LOCAL_NUM_ZERO &&
    nextRequiredAction !== PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.NONE;
  if (workflowOwnedProgress) {
    return LOCAL_NUM_TWO;
  }
  const workflowOwnedActuation =
    actuation.owner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
    actuation.state !== PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_FAILED &&
    actuation.state !== PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_COMPLETED;
  return workflowOwnedActuation ? LOCAL_NUM_ONE : LOCAL_NUM_ZERO;
}

function selectLatestPriorityRecoveryPartitionSnapshot(
  partitionSnapshots = [],
  decisionSnapshots = null,
  explicitSemanticStateByPartitionId = null,
) {
  return partitionSnapshots
    .filter((snapshot) => isRecord(snapshot))
    .sort((left, right) => {
      const leftEpoch = resolvePriorityRecoverySnapshotSortEpoch(
        left,
        decisionSnapshots,
      );
      const rightEpoch = resolvePriorityRecoverySnapshotSortEpoch(
        right,
        decisionSnapshots,
      );
      if (leftEpoch !== rightEpoch) {
        return rightEpoch - leftEpoch;
      }
      const leftExplicitMatchRank =
        resolvePriorityRecoveryExplicitSemanticStateMatchRank(
          left,
          explicitSemanticStateByPartitionId,
        );
      const rightExplicitMatchRank =
        resolvePriorityRecoveryExplicitSemanticStateMatchRank(
          right,
          explicitSemanticStateByPartitionId,
        );
      if (leftExplicitMatchRank !== rightExplicitMatchRank) {
        return rightExplicitMatchRank - leftExplicitMatchRank;
      }
      const leftProgressOwnerActionRank =
        resolvePriorityRecoveryProgressOwnerActionRank(left);
      const rightProgressOwnerActionRank =
        resolvePriorityRecoveryProgressOwnerActionRank(right);
      if (leftProgressOwnerActionRank !== rightProgressOwnerActionRank) {
        return rightProgressOwnerActionRank - leftProgressOwnerActionRank;
      }
      const leftEvidenceRank =
        resolvePriorityRecoverySnapshotEvidenceRank(left);
      const rightEvidenceRank =
        resolvePriorityRecoverySnapshotEvidenceRank(right);
      if (leftEvidenceRank !== rightEvidenceRank) {
        return rightEvidenceRank - leftEvidenceRank;
      }
      const leftUpdatedAtMs = resolvePriorityRecoverySnapshotSortTimestamp(
        left,
        decisionSnapshots,
      );
      const rightUpdatedAtMs = resolvePriorityRecoverySnapshotSortTimestamp(
        right,
        decisionSnapshots,
      );
      if (leftUpdatedAtMs !== rightUpdatedAtMs) {
        return rightUpdatedAtMs - leftUpdatedAtMs;
      }
      return String(right?.correlationKey || LOCAL_STR_EMPTY).localeCompare(
        String(left?.correlationKey || LOCAL_STR_EMPTY),
      );
    })[LOCAL_NUM_ZERO] || null;
}

function collectPriorityRecoveryRelatedSnapshots(
  snapshots = [],
  partitionId,
) {
  return snapshots.filter((snapshot) => {
    return String(snapshot?.partitionId || LOCAL_STR_EMPTY).trim() === partitionId;
  });
}

function resolvePriorityRecoverySnapshotOperationIds(snapshot = null) {
  return normalizeDistinctStringArray([
    snapshot?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.CAMEL],
    snapshot?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.SNAKE],
    snapshot?.coordinator?.operation?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.CAMEL],
    snapshot?.coordinator?.operation?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.SNAKE],
  ]);
}

function resolvePriorityRecoveryOperationIds(relatedSnapshots = []) {
  return normalizeDistinctStringArray(
    relatedSnapshots.flatMap((snapshot) => {
      return [
        ...(Array.isArray(snapshot?.coordinator?.operationIds) ?
          snapshot.coordinator.operationIds :
          []),
        ...resolvePriorityRecoverySnapshotOperationIds(snapshot),
      ];
    }),
  );
}

function resolvePriorityRecoverySerialWaitOperationIds(relatedSnapshots = []) {
  return normalizeDistinctStringArray(
    relatedSnapshots.flatMap((snapshot) =>
      Array.isArray(snapshot?.coordinator?.serialWaitOperationIds) ?
        snapshot.coordinator.serialWaitOperationIds :
        LOCAL_EMPTY_LIST,
    ),
  );
}

function resolvePriorityRecoverySerialWaitPartitionIds(relatedSnapshots = []) {
  return normalizeDistinctStringArray(
    relatedSnapshots.flatMap((snapshot) =>
      Array.isArray(snapshot?.coordinator?.serialWaitPartitionIds) ?
        snapshot.coordinator.serialWaitPartitionIds :
        LOCAL_EMPTY_LIST,
    ),
  );
}

function resolvePriorityRecoveryEligibleNodeIds(latestPartitionSnapshot) {
  const effectiveEligibleNodeIds = Array.isArray(
    latestPartitionSnapshot?.admission?.effectiveEligibleNodeIds,
  ) ?
    latestPartitionSnapshot.admission.effectiveEligibleNodeIds :
    [];
  return Object.freeze(
    normalizeDistinctStringArray(
      effectiveEligibleNodeIds.length > 0 ?
        effectiveEligibleNodeIds :
        latestPartitionSnapshot?.admission?.eligibleNodeIds,
    ),
  );
}

function resolvePriorityRecoveryTopologyOperatorWitness(
  latestPartitionSnapshot,
) {
  if (isRecord(latestPartitionSnapshot?.progress?.topologyOperatorWitness)) {
    return latestPartitionSnapshot.progress.topologyOperatorWitness;
  }
  if (isRecord(latestPartitionSnapshot?.topologyOperatorWitness)) {
    return latestPartitionSnapshot.topologyOperatorWitness;
  }
  return null;
}

function resolvePriorityRecoveryOperationOwnerObservation(
  relatedSnapshots,
  decisionSnapshots,
  explicitSemanticStateByPartitionId,
) {
  const selectedSnapshot = selectLatestPriorityRecoveryPartitionSnapshot(
    relatedSnapshots.filter((snapshot) =>
      isRecord(snapshot?.operationOwnerObservation),
    ),
    decisionSnapshots,
    explicitSemanticStateByPartitionId,
  );
  return isRecord(selectedSnapshot?.operationOwnerObservation) ?
    cloneJsonValue(selectedSnapshot.operationOwnerObservation) :
    null;
}

function buildPriorityRecoveryPartitionSnapshot(
  partitionId,
  snapshots,
  decisionSnapshots,
  explicitSemanticStateByPartitionId = null,
) {
  const relatedSnapshots = collectPriorityRecoveryRelatedSnapshots(
    snapshots,
    partitionId,
  );
  const latestPartitionSnapshot = selectLatestPriorityRecoveryPartitionSnapshot(
    relatedSnapshots,
    decisionSnapshots,
    explicitSemanticStateByPartitionId,
  );
  const blockerReasonCodes = normalizeDistinctStringArray(
    latestPartitionSnapshot?.blockerReasons,
  );
  const operationIds = resolvePriorityRecoveryOperationIds(relatedSnapshots);
  const serialWaitOperationIds =
    resolvePriorityRecoverySerialWaitOperationIds(relatedSnapshots);
  const serialWaitPartitionIds =
    resolvePriorityRecoverySerialWaitPartitionIds(relatedSnapshots);
  const latestOperation = isRecord(latestPartitionSnapshot?.coordinator?.operation) ?
    latestPartitionSnapshot.coordinator.operation :
    null;
  const topologyOperatorWitness =
    resolvePriorityRecoveryTopologyOperatorWitness(latestPartitionSnapshot);
  const pressureConditions = buildPriorityRecoveryPressureConditions(
    latestPartitionSnapshot?.conditions?.pressure,
  );
  const operationOwnerObservation =
    resolvePriorityRecoveryOperationOwnerObservation(
      relatedSnapshots,
      decisionSnapshots,
      explicitSemanticStateByPartitionId,
    );
  return Object.freeze({
    partitionId,
    semanticStateId: resolvePriorityRecoverySnapshotSemanticState(
      latestPartitionSnapshot,
      blockerReasonCodes,
      explicitSemanticStateByPartitionId,
    ) || null,
    progressClassIds: Object.freeze(blockerReasonCodes),
    blockerReasonCodes: Object.freeze(blockerReasonCodes),
    spreadGap: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.planner?.spreadGap,
    ),
    readyDistinctNodeCount: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.planner?.readyDistinctNodeCount,
    ),
    requiredDistinctNodeCount: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.planner?.requiredDistinctNodeCount,
    ),
    authoritativeVisibilityState:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.observation?.visibilityState,
      ),
    removeSafetyState:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.completion?.state,
      ),
    transportPressureState:
      pressureConditions?.pressureState ===
        PRIORITY_RECOVERY_PRESSURE_STATE.NONE ?
        PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE :
        normalizePriorityRecoveryObservationStateValue(
          pressureConditions?.pressureState,
        ),
    witnessIds: Object.freeze(
      normalizeDistinctStringArray([
        latestPartitionSnapshot?.correlationKey,
        ...operationIds,
        ...serialWaitOperationIds,
      ]),
    ),
    retryAfterMs: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.completion?.retryAfterMs,
    ),
    progressContractState:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.progress?.contractState,
      ),
    progressNextAction:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.progress?.nextAction,
      ),
    actuationState:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.actuation?.state,
      ),
    actuationOwner:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.actuation?.owner,
      ),
    currentOwner:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.progress?.currentOwner,
      ),
    nextRequiredAction:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.progress?.nextRequiredAction,
      ),
    blockingBoundary:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.progress?.blockingBoundary,
      ),
    waitMode:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.progress?.waitMode,
      ),
    workflowProgressPhaseId:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.progress?.workflowProgressPhaseId,
      ),
    stepAgeMs: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.progress?.stepAgeMs,
    ),
    stepTimeoutMs: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.progress?.stepTimeoutMs,
    ),
    pressureState:
      normalizePriorityRecoveryObservationStateValue(
        pressureConditions?.pressureState,
        PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE,
      ),
    blocksCriticalRecoveryActuation:
      pressureConditions?.blocksCriticalRecoveryActuation === true,
    pendingWrites: normalizeNonNegativeInteger(
      pressureConditions?.pendingWrites,
    ),
    pendingWriteGrowthCount: normalizeNonNegativeInteger(
      pressureConditions?.pendingWriteGrowthCount,
    ),
    retainedBacklogGrowthCount: normalizeNonNegativeInteger(
      pressureConditions?.retainedBacklogGrowthCount,
    ),
    lastProgressAtMs: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.progress?.lastProgressAtMs,
    ),
    progressEvidenceSourceIds: Object.freeze(
      normalizeDistinctStringArray(
        latestPartitionSnapshot?.progress?.evidenceSourceIds,
      ),
    ),
    ...(topologyOperatorWitness ? {topologyOperatorWitness} : {}),
    ...(operationOwnerObservation ? {operationOwnerObservation} : {}),
    decisionDimension:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.admission?.decisionDimension,
      ),
    eligibleNodeIds:
      resolvePriorityRecoveryEligibleNodeIds(latestPartitionSnapshot),
    recoveryEligibleExcludedNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        latestPartitionSnapshot?.admission?.recoveryEligibleExcludedNodeIds,
      ),
    ),
    activeLearnerNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        latestPartitionSnapshot?.readiness?.learnerPromotion?.activeLearnerNodeIds,
      ),
    ),
    promotableLearnerNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        latestPartitionSnapshot?.readiness?.learnerPromotion?.promotableLearnerNodeIds,
      ),
    ),
    operationIds: Object.freeze(operationIds),
    serialWaitOperationIds: Object.freeze(serialWaitOperationIds),
    serialWaitPartitionIds: Object.freeze(serialWaitPartitionIds),
    completionState:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.completion?.state,
      ),
    workflowState:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.observation?.workflowState,
      ),
    visibilityState:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.observation?.visibilityState,
      ),
    convergenceState:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.observation?.convergenceState,
      ),
    workflowSource:
      normalizePriorityRecoveryObservationStateValue(
        latestPartitionSnapshot?.observation?.provenance?.workflowSource,
      ),
    snapshotCapturedAt: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.observation?.provenance?.capturedAt ??
        decisionSnapshots?.capturedAt,
    ),
    latestOperationWorkflowStep:
      normalizePriorityRecoveryObservationStateValue(
        latestOperation?.workflowStep,
      ),
    latestOperationStatus:
      normalizePriorityRecoveryObservationStateValue(
        latestOperation?.status,
      ),
    correlationKey: buildPriorityRecoveryCorrelationKey(
      partitionId,
      latestPartitionSnapshot?.epoch ?? decisionSnapshots?.publicationEpoch ?? null,
      latestPartitionSnapshot?.operationId || null,
    ),
  });
}

function buildPriorityRecoveryPartitionWitnesses(decisionSnapshots = null) {
  const snapshots = Array.isArray(decisionSnapshots?.snapshots) ?
    decisionSnapshots.snapshots :
    [];
  const explicitSemanticStateByPartitionId =
    buildPriorityRecoveryExplicitSemanticStateByPartitionId(
      decisionSnapshots?.partitionIdsBySemanticState,
    );
  const indexes = collectPriorityRecoveryPartitionIndexes(
    snapshots,
    decisionSnapshots?.partitionIdsBySemanticState,
  );
  const blockedClassIds = normalizePriorityRecoveryBlockedClassIds(
    indexes.partitionIdsByReason,
  );
  const semanticStatePartitions =
    normalizePriorityRecoverySemanticStatePartitions(
      indexes.partitionIdsBySemanticState,
    );
  const witnessPartitionIds = resolvePriorityRecoveryWitnessPartitionIds(
    blockedClassIds,
    semanticStatePartitions,
  );
  const partitionSnapshots = Object.freeze(
    witnessPartitionIds.map((partitionId) => {
      return buildPriorityRecoveryPartitionSnapshot(
        partitionId,
        snapshots,
        decisionSnapshots,
        explicitSemanticStateByPartitionId,
      );
    }),
  );
  return Object.freeze({
    blockerPartitionIdsByReason:
      blockedClassIds.blockerPartitionIdsByReason,
    partitionIdsBySemanticState:
      semanticStatePartitions.partitionIdsBySemanticState,
    unresolvedClassIds: blockedClassIds.unresolvedClassIds,
    unresolvedClassCount: blockedClassIds.unresolvedClassIds.length,
    unresolvedSemanticStateIds:
      semanticStatePartitions.unresolvedSemanticStateIds,
    unresolvedSemanticStateCount:
      semanticStatePartitions.unresolvedSemanticStateIds.length,
    blockedPartitionIds: Object.freeze(
      [...semanticStatePartitions.blockedPartitionIds],
    ),
    blockedPartitionCount:
      semanticStatePartitions.blockedPartitionIds.length,
    witnessPartitionIds,
    witnessPartitionCount: witnessPartitionIds.length,
    partitionBlockerHistory: buildPriorityRecoveryPartitionHistory(
      indexes.blockerReasonHistoryByPartitionId,
      LOCAL_STR_BLOCKERREASONCODES,
    ),
    partitionSemanticStateHistory: buildPriorityRecoveryPartitionHistory(
      indexes.semanticStateHistoryByPartitionId,
      LOCAL_STR_SEMANTICSTATEIDS,
    ),
    partitionSnapshots,
    partitionWitnesses: partitionSnapshots,
    admissionDecisionDimensions: Object.freeze(
      [...indexes.decisionDimensions].sort(),
    ),
  });
}

export {
  buildPriorityRecoveryPartitionHistory,
  buildPriorityRecoveryPartitionSnapshot,
  buildPriorityRecoveryPartitionWitnesses,
  collectPriorityRecoveryRelatedSnapshots,
  resolvePriorityRecoveryEligibleNodeIds,
  resolvePriorityRecoveryOperationIds,
  resolvePriorityRecoveryProgressOwnerActionRank,
  resolvePriorityRecoverySerialWaitOperationIds,
  resolvePriorityRecoverySerialWaitPartitionIds,
  resolvePriorityRecoverySnapshotEvidenceRank,
  resolvePriorityRecoverySnapshotOperationIds,
  resolvePriorityRecoverySnapshotSortEpoch,
  resolvePriorityRecoverySnapshotSortProgressTimestamp,
  resolvePriorityRecoverySnapshotSortTimestamp,
  resolvePriorityRecoveryTopologyOperatorWitness,
  resolvePriorityRecoveryWitnessPartitionIds,
  selectLatestPriorityRecoveryPartitionSnapshot,
};
