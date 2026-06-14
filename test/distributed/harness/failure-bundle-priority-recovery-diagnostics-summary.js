import {
  PRIORITY_RECOVERY_INVARIANT_FALLBACK,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {FAILURE_BUNDLE_FOUNDATION} from './failure-bundle-foundation.js';

const {
  ZERO,
  isRecord,
  normalizeDistinctStringArray,
  normalizeNonNegativeCount,
  normalizePriorityRecoverySemanticStateId,
  normalizePriorityRecoveryDecisionSnapshots,
} = FAILURE_BUNDLE_FOUNDATION;

const PRIORITY_RECOVERY_OPERATION_ID_FIELD = Object.freeze({
  CAMEL: 'operationId',
  SNAKE: 'operation_id',
});

export function normalizePriorityRecoveryInvariants(value) {
  if (!isRecord(value)) {
    return null;
  }
  const invariantsById = new Map();
  for (const invariant of Array.isArray(value.invariants) ?
    value.invariants :
    []) {
    if (!isRecord(invariant)) {
      continue;
    }
    const invariantId = String(invariant.id || '').trim();
    if (invariantId.length === ZERO) {
      continue;
    }
    invariantsById.set(invariantId, {
      id: invariantId,
      invariantId:
        typeof invariant.invariantId === 'string' &&
        invariant.invariantId.length > ZERO ?
          invariant.invariantId :
          invariantId,
      reasonCode:
        typeof invariant.reasonCode === 'string' &&
        invariant.reasonCode.length > ZERO ?
          invariant.reasonCode :
          typeof invariant.code === 'string' && invariant.code.length > ZERO ?
            invariant.code :
            PRIORITY_RECOVERY_INVARIANT_FALLBACK,
      severity:
        typeof invariant.severity === 'string' &&
        invariant.severity.length > ZERO ?
          invariant.severity :
          null,
      scope:
        typeof invariant.scope === 'string' && invariant.scope.length > ZERO ?
          invariant.scope :
          null,
      owningSubsystem:
        typeof invariant.owningSubsystem === 'string' &&
        invariant.owningSubsystem.length > ZERO ?
          invariant.owningSubsystem :
          null,
      passed: invariant.passed === true,
      details: isRecord(invariant.details) ?
        cloneJsonValue(invariant.details) :
        null,
    });
  }
  const failingInvariantIds = normalizeDistinctStringArray([
    ...Array.from(invariantsById.values())
      .filter((invariant) => invariant.passed !== true)
      .map((invariant) => invariant.id),
    ...normalizeDistinctStringArray(value.failingInvariantIds),
  ]);

  return {
    invariants: [...invariantsById.values()],
    failingInvariantIds,
    passed: failingInvariantIds.length === ZERO,
  };
}

export function mergePriorityRecoveryInvariants(primary, fallback) {
  const normalizedPrimary = normalizePriorityRecoveryInvariants(primary);
  const normalizedFallback = normalizePriorityRecoveryInvariants(fallback);
  if (!normalizedPrimary && !normalizedFallback) {
    return null;
  }
  if (!normalizedPrimary) {
    return normalizedFallback;
  }
  if (!normalizedFallback) {
    return normalizedPrimary;
  }

  const invariantsById = new Map();
  for (const source of [normalizedFallback, normalizedPrimary]) {
    for (const invariant of source.invariants) {
      invariantsById.set(invariant.id, invariant);
    }
  }
  const failingInvariantIds = normalizeDistinctStringArray([
    ...normalizedFallback.failingInvariantIds,
    ...normalizedPrimary.failingInvariantIds,
    ...Array.from(invariantsById.values())
      .filter((invariant) => invariant.passed !== true)
      .map((invariant) => invariant.id),
  ]);
  return {
    invariants: [...invariantsById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    failingInvariantIds,
    passed: failingInvariantIds.length === ZERO,
  };
}

function normalizePriorityRecoveryOwnerStateString(value) {
  const normalizedValue = String(value || '').trim();
  return normalizedValue.length > ZERO ? normalizedValue : null;
}

function buildPriorityRecoveryDecisionWitnessOwnerState(snapshot) {
  const progress = isRecord(snapshot?.progress) ? snapshot.progress : null;
  const actuation = isRecord(snapshot?.actuation) ? snapshot.actuation : null;
  const pressure = isRecord(snapshot?.conditions?.pressure) ?
    snapshot.conditions.pressure :
    null;
  const progressEvidenceSourceIds = normalizeDistinctStringArray(
    progress?.evidenceSourceIds,
  );
  const stepAgeMs = normalizeNonNegativeCount(progress?.stepAgeMs);
  const stepTimeoutMs = normalizeNonNegativeCount(progress?.stepTimeoutMs);
  const pendingWrites = normalizeNonNegativeCount(pressure?.pendingWrites);
  const pendingWriteGrowthCount = normalizeNonNegativeCount(
    pressure?.pendingWriteGrowthCount,
  );
  const retainedBacklogGrowthCount = normalizeNonNegativeCount(
    pressure?.retainedBacklogGrowthCount,
  );
  const lastProgressAtMs = normalizeNonNegativeCount(
    progress?.lastProgressAtMs,
  );
  const retryAfterMs = normalizeNonNegativeCount(progress?.retryAfterMs);
  const progressContractState = normalizePriorityRecoveryOwnerStateString(
    progress?.contractState,
  );
  const progressNextAction = normalizePriorityRecoveryOwnerStateString(
    progress?.nextAction,
  );
  const actuationState = normalizePriorityRecoveryOwnerStateString(
    actuation?.state,
  );
  const actuationOwner = normalizePriorityRecoveryOwnerStateString(
    actuation?.owner,
  );
  const currentOwner = normalizePriorityRecoveryOwnerStateString(
    progress?.currentOwner,
  );
  const nextRequiredAction = normalizePriorityRecoveryOwnerStateString(
    progress?.nextRequiredAction,
  );
  const blockingBoundary = normalizePriorityRecoveryOwnerStateString(
    progress?.blockingBoundary,
  );
  const waitMode = normalizePriorityRecoveryOwnerStateString(
    progress?.waitMode,
  );
  const workflowProgressPhaseId = normalizePriorityRecoveryOwnerStateString(
    progress?.workflowProgressPhaseId,
  );
  const pressureState = normalizePriorityRecoveryOwnerStateString(
    pressure?.pressureState,
  );
  return {
    ...(progressContractState ? {progressContractState} : {}),
    ...(progressNextAction ? {progressNextAction} : {}),
    ...(actuationState ? {actuationState} : {}),
    ...(actuationOwner ? {actuationOwner} : {}),
    ...(currentOwner ? {currentOwner} : {}),
    ...(nextRequiredAction ? {nextRequiredAction} : {}),
    ...(blockingBoundary ? {blockingBoundary} : {}),
    ...(waitMode ? {waitMode} : {}),
    ...(workflowProgressPhaseId ? {workflowProgressPhaseId} : {}),
    ...(stepAgeMs !== null ? {stepAgeMs} : {}),
    ...(stepTimeoutMs !== null ? {stepTimeoutMs} : {}),
    ...(lastProgressAtMs !== null ? {lastProgressAtMs} : {}),
    ...(retryAfterMs !== null ? {retryAfterMs} : {}),
    ...(progressEvidenceSourceIds.length > ZERO ?
      {progressEvidenceSourceIds} :
      {}),
    ...(pressureState ? {pressureState} : {}),
    ...(pressure ? {
      blocksCriticalRecoveryActuation:
        pressure.blocksCriticalRecoveryActuation === true,
    } : {}),
    ...(pendingWrites !== null ? {pendingWrites} : {}),
    ...(pendingWriteGrowthCount !== null ? {pendingWriteGrowthCount} : {}),
    ...(retainedBacklogGrowthCount !== null ?
      {retainedBacklogGrowthCount} :
      {}),
  };
}

export function summarizePriorityRecoveryDecisionSnapshots(value) {
  const decisionSnapshots = normalizePriorityRecoveryDecisionSnapshots(value);
  if (!decisionSnapshots) {
    return null;
  }
  const partitionIdsByReason = {};
  const partitionIdsBySemanticState = {};
  const blockerReasonHistoryByPartitionId = {};
  const semanticStateHistoryByPartitionId = {};
  const decisionDimensions = new Set();
  for (const progressClassId of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    partitionIdsByReason[progressClassId] = new Set();
  }
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }

  if (isRecord(decisionSnapshots.blockerPartitionIdsByReason)) {
    for (const [blockerReason, partitionIds] of Object.entries(
      decisionSnapshots.blockerPartitionIdsByReason,
    )) {
      if (!(partitionIdsByReason[blockerReason] instanceof Set)) {
        partitionIdsByReason[blockerReason] = new Set();
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        partitionIdsByReason[blockerReason].add(partitionId);
      }
    }
  }
  if (isRecord(decisionSnapshots.partitionIdsBySemanticState)) {
    for (const [semanticState, partitionIds] of Object.entries(
      decisionSnapshots.partitionIdsBySemanticState,
    )) {
      const normalizedSemanticState =
        normalizePriorityRecoverySemanticStateId(semanticState);
      if (!normalizedSemanticState) {
        continue;
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        partitionIdsBySemanticState[normalizedSemanticState].add(partitionId);
      }
    }
  }

  for (const snapshot of decisionSnapshots.snapshots) {
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    if (!Array.isArray(blockerReasonHistoryByPartitionId[partitionId])) {
      blockerReasonHistoryByPartitionId[partitionId] = [];
    }
    for (const blockerReason of normalizeDistinctStringArray(
      snapshot.blockerReasons,
    )) {
      blockerReasonHistoryByPartitionId[partitionId].push(blockerReason);
    }
    if (!Array.isArray(semanticStateHistoryByPartitionId[partitionId])) {
      semanticStateHistoryByPartitionId[partitionId] = [];
    }
    const semanticState = normalizePriorityRecoverySemanticStateId(
      snapshot.semanticState,
    );
    semanticStateHistoryByPartitionId[partitionId].push(semanticState);
    const decisionDimension = String(
      snapshot?.admission?.decisionDimension || '',
    ).trim();
    if (decisionDimension.length > ZERO) {
      decisionDimensions.add(decisionDimension);
    }
  }

  const blockerPartitionIdsByReason = {};
  const unresolvedClassIds = [];
  const blockedPartitionIds = new Set();
  for (const [blockerReason, partitionIds] of Object.entries(
    partitionIdsByReason,
  )) {
    blockerPartitionIdsByReason[blockerReason] = [...partitionIds].sort();
    if (partitionIds.size > ZERO) {
      unresolvedClassIds.push(blockerReason);
      for (const partitionId of partitionIds) {
        blockedPartitionIds.add(partitionId);
      }
    }
  }
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = [
      ...partitionIds,
    ].sort();
  }
  const unresolvedSemanticStateIds =
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter(
      (semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState].length > ZERO,
    );
  const blockedPartitionIdsBySemanticState = new Set();
  for (const semanticState of unresolvedSemanticStateIds) {
    for (const partitionId of normalizedPartitionIdsBySemanticState[
      semanticState
    ]) {
      blockedPartitionIdsBySemanticState.add(partitionId);
    }
  }
  const unresolvedPartitionIds = [...blockedPartitionIdsBySemanticState].sort();
  const explicitSemanticStateByPartitionId =
    buildPriorityRecoveryExplicitSemanticStateByPartitionId(
      decisionSnapshots.partitionIdsBySemanticState,
    );
  const witnessPartitionIds = resolvePriorityRecoveryWitnessPartitionIds(
    [...blockedPartitionIds].sort(),
    unresolvedPartitionIds,
  );

  const partitionBlockerHistory = Object.entries(
    blockerReasonHistoryByPartitionId,
  )
    .map(([partitionId, blockerReasons]) => ({
      partitionId,
      blockerReasons: normalizeDistinctStringArray(blockerReasons),
    }))
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
  const partitionSemanticStateHistory = Object.entries(
    semanticStateHistoryByPartitionId,
  )
    .map(([partitionId, semanticStates]) => ({
      partitionId,
      semanticStates: normalizeDistinctStringArray(semanticStates),
    }))
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
  const selectLatestPriorityRecoveryPartitionSnapshot = (partitionSnapshots) =>
    partitionSnapshots
      .filter((snapshot) => isRecord(snapshot))
      .sort((left, right) => {
        const leftUpdatedAtMs = Number(
          left?.coordinator?.operation?.updatedAtMs ??
            left?.observation?.provenance?.capturedAt ??
            decisionSnapshots?.capturedAt ??
            ZERO,
        );
        const rightUpdatedAtMs = Number(
          right?.coordinator?.operation?.updatedAtMs ??
            right?.observation?.provenance?.capturedAt ??
            decisionSnapshots?.capturedAt ??
            ZERO,
        );
        if (leftUpdatedAtMs !== rightUpdatedAtMs) {
          return rightUpdatedAtMs - leftUpdatedAtMs;
        }
        const leftEpoch = Number.isFinite(left?.epoch) ? left.epoch : ZERO;
        const rightEpoch = Number.isFinite(right?.epoch) ? right.epoch : ZERO;
        if (leftEpoch !== rightEpoch) {
          return rightEpoch - leftEpoch;
        }
        return String(right?.correlationKey || '').localeCompare(
          String(left?.correlationKey || ''),
        );
      })[0] || null;
  const selectPriorityRecoveryPartitionOperationOwnerObservation = (
    partitionSnapshots,
  ) => {
    const selectedSnapshot = selectLatestPriorityRecoveryPartitionSnapshot(
      partitionSnapshots.filter((snapshot) =>
        isRecord(snapshot?.operationOwnerObservation),
      ),
    );
    return isRecord(selectedSnapshot?.operationOwnerObservation) ?
      cloneJsonValue(selectedSnapshot.operationOwnerObservation) :
      null;
  };
  const partitionWitnesses = witnessPartitionIds
    .map((partitionId) => {
      const partitionSnapshots = decisionSnapshots.snapshots.filter(
        (snapshot) =>
          String(snapshot?.partitionId || '').trim() === partitionId,
      );
      const latestPartitionSnapshot =
        selectLatestPriorityRecoveryPartitionSnapshot(partitionSnapshots);
      const operationOwnerObservation =
        selectPriorityRecoveryPartitionOperationOwnerObservation(
          partitionSnapshots,
        );
      const blockerReasons = normalizeDistinctStringArray(
        latestPartitionSnapshot?.blockerReasons,
      );
      const semanticState =
        resolvePriorityRecoveryExplicitSemanticState(
          latestPartitionSnapshot,
          explicitSemanticStateByPartitionId,
        );
      const decisionDimension =
        String(
          latestPartitionSnapshot?.admission?.decisionDimension || '',
        ).trim() || null;
      const effectiveEligibleNodeIds = Array.isArray(
        latestPartitionSnapshot?.admission?.effectiveEligibleNodeIds,
      ) ?
        latestPartitionSnapshot.admission.effectiveEligibleNodeIds :
        [];
      const eligibleNodeIds =
        effectiveEligibleNodeIds.length > ZERO ?
          normalizeDistinctStringArray(effectiveEligibleNodeIds) :
          normalizeDistinctStringArray(
            latestPartitionSnapshot?.admission?.eligibleNodeIds,
          );
      const excludedNodeIds = normalizeDistinctStringArray(
        latestPartitionSnapshot?.admission?.recoveryEligibleExcludedNodeIds,
      );
      const activeLearnerNodeIds = normalizeDistinctStringArray(
        latestPartitionSnapshot?.readiness?.learnerPromotion
          ?.activeLearnerNodeIds,
      );
      const promotableLearnerNodeIds = normalizeDistinctStringArray(
        latestPartitionSnapshot?.readiness?.learnerPromotion
          ?.promotableLearnerNodeIds,
      );
      const operationIds = normalizeDistinctStringArray(
        partitionSnapshots.flatMap((snapshot) => [
          ...(Array.isArray(snapshot?.coordinator?.operationIds) ?
            snapshot.coordinator.operationIds :
            []),
          snapshot?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.CAMEL],
          snapshot?.[PRIORITY_RECOVERY_OPERATION_ID_FIELD.SNAKE],
          snapshot?.coordinator?.operation?.[
            PRIORITY_RECOVERY_OPERATION_ID_FIELD.CAMEL
          ],
          snapshot?.coordinator?.operation?.[
            PRIORITY_RECOVERY_OPERATION_ID_FIELD.SNAKE
          ],
        ]),
      );
      const spreadGap = Number.isFinite(
        latestPartitionSnapshot?.planner?.spreadGap,
      ) ?
        Number(latestPartitionSnapshot.planner.spreadGap) :
        partitionSnapshots
          .map((snapshot) => Number(snapshot?.planner?.spreadGap))
          .filter((value) => Number.isFinite(value))
          .reduce((maximum, value) => Math.max(maximum, value), ZERO);
      const latestOperation = isRecord(
        latestPartitionSnapshot?.coordinator?.operation,
      ) ?
        latestPartitionSnapshot.coordinator.operation :
        partitionSnapshots
          .map((snapshot) => snapshot?.coordinator?.operation)
          .filter((operation) => isRecord(operation))
          .sort(
            (left, right) =>
              Number(right.updatedAtMs || ZERO) -
              Number(left.updatedAtMs || ZERO),
          )[0] || null;

      return {
        partitionId,
        semanticState: semanticState || null,
        blockerReasons,
        spreadGap,
        decisionDimension,
        eligibleNodeCount: eligibleNodeIds.length,
        recoveryEligibleExcludedNodeIds: excludedNodeIds,
        activeLearnerNodeIds,
        promotableLearnerNodeIds,
        operationIds,
        ...buildPriorityRecoveryDecisionWitnessOwnerState(
          latestPartitionSnapshot,
        ),
        operationOwnerObservation,
        completionState:
          String(latestPartitionSnapshot?.completion?.state || '').trim() ||
          null,
        workflowState:
          String(latestPartitionSnapshot?.observation?.workflowState || '')
            .trim() || null,
        visibilityState:
          String(latestPartitionSnapshot?.observation?.visibilityState || '')
            .trim() || null,
        convergenceState:
          String(latestPartitionSnapshot?.observation?.convergenceState || '')
            .trim() || null,
        workflowSource:
          String(
            latestPartitionSnapshot?.observation?.provenance?.workflowSource ||
              '',
          ).trim() || null,
        snapshotCapturedAt: Number.isFinite(
          latestPartitionSnapshot?.observation?.provenance?.capturedAt,
        ) ?
          Math.floor(
            latestPartitionSnapshot.observation.provenance.capturedAt,
          ) :
          Number.isFinite(decisionSnapshots?.capturedAt) ?
            Math.floor(decisionSnapshots.capturedAt) :
            null,
        latestOperationWorkflowStep:
          String(latestOperation?.workflowStep || '').trim() || null,
        latestOperationStatus:
          String(latestOperation?.status || '').trim() || null,
        latestOperationTimelineStep:
          String(latestOperation?.latestTimelineStep || '').trim() || null,
      };
    })
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));

  return {
    schemaVersion: decisionSnapshots.schemaVersion,
    publicationEpoch: decisionSnapshots.publicationEpoch,
    snapshotCount: decisionSnapshots.snapshotCount,
    partitionCount: decisionSnapshots.partitionCount,
    unresolvedClassIds: unresolvedClassIds.sort(),
    unresolvedClassCount: unresolvedClassIds.length,
    unresolvedSemanticStateIds,
    unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
    blockedPartitionIds: unresolvedPartitionIds,
    blockedPartitionCount: unresolvedPartitionIds.length,
    blockerPartitionIdsByReason,
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    partitionBlockerHistory,
    partitionSemanticStateHistory,
    partitionWitnesses,
    admissionDecisionDimensions: [...decisionDimensions].sort(),
  };
}

function resolvePriorityRecoveryExplicitSemanticState(
  snapshot,
  explicitSemanticStateByPartitionId,
) {
  const explicitSemanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticStateId) ||
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState);
  if (explicitSemanticState) {
    return explicitSemanticState;
  }
  const partitionId = String(snapshot?.partitionId || '').trim();
  if (
    partitionId.length === ZERO ||
    !(explicitSemanticStateByPartitionId instanceof Map)
  ) {
    return null;
  }
  return explicitSemanticStateByPartitionId.get(partitionId) || null;
}

function buildPriorityRecoveryExplicitSemanticStateByPartitionId(
  partitionIdsBySemanticState,
) {
  const explicitSemanticStateByPartitionId = new Map();
  if (!isRecord(partitionIdsBySemanticState)) {
    return explicitSemanticStateByPartitionId;
  }
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    const normalizedSemanticState =
      normalizePriorityRecoverySemanticStateId(semanticState);
    if (!normalizedSemanticState) {
      continue;
    }
    for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
      if (!explicitSemanticStateByPartitionId.has(partitionId)) {
        explicitSemanticStateByPartitionId.set(
          partitionId,
          normalizedSemanticState,
        );
      }
    }
  }
  return explicitSemanticStateByPartitionId;
}

function resolvePriorityRecoveryWitnessPartitionIds(
  blockedPartitionIds,
  blockedPartitionIdsBySemanticState,
) {
  const unresolvedPartitionIds = Array.isArray(
    blockedPartitionIdsBySemanticState,
  ) ?
    blockedPartitionIdsBySemanticState :
    [];
  if (unresolvedPartitionIds.length > ZERO) {
    return [...unresolvedPartitionIds];
  }
  return Array.isArray(blockedPartitionIds) ? [...blockedPartitionIds] : [];
}

export function cloneJsonValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry));
  }
  if (typeof value !== 'object') {
    return value;
  }
  const cloned = {};
  for (const [key, entry] of Object.entries(value)) {
    cloned[key] = cloneJsonValue(entry);
  }
  return cloned;
}
