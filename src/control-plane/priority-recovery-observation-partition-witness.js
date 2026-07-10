import {
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE,
  PRIORITY_RECOVERY_PRESSURE_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from './priority-recovery-diagnostics-constants.js';
import {
  buildPriorityRecoveryCorrelationKey,
  buildPriorityRecoveryPressureConditions,
} from './priority-recovery-helpers.js';
import {fastJsonClone} from '../utils/fast-json-clone.js';
import {
  LOCAL_EMPTY_LIST,
  LOCAL_STR_BLOCKERREASONCODES,
  LOCAL_STR_EMPTY,
  LOCAL_STR_SEMANTICSTATEIDS,
  buildPriorityRecoveryExplicitSemanticStateByPartitionId,
  collectPriorityRecoveryPartitionIndexes,
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeInteger,
  normalizePriorityRecoveryBlockedClassIds,
  normalizePriorityRecoveryObservationStateValue,
  normalizePriorityRecoverySemanticStatePartitions,
  resolvePriorityRecoveryProgressOwnerActionRank,
  resolvePriorityRecoverySnapshotEvidenceRank,
  resolvePriorityRecoverySnapshotOperationIds,
  resolvePriorityRecoverySnapshotSemanticState,
  resolvePriorityRecoverySnapshotSortEpoch,
  resolvePriorityRecoverySnapshotSortProgressTimestamp,
  resolvePriorityRecoverySnapshotSortTimestamp,
  selectLatestPriorityRecoveryPartitionSnapshot,
} from './priority-recovery-observation-normalization.js';

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

function collectPriorityRecoveryRelatedSnapshots(
  snapshots = [],
  partitionId,
) {
  return snapshots.filter((snapshot) => {
    return String(snapshot?.partitionId || LOCAL_STR_EMPTY).trim() === partitionId;
  });
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
