import {NUM, TYPEOF} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_INVARIANT_FALLBACK,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from './priority-recovery-diagnostics-constants.js';
import {buildPublicationRecoveryGateSnapshot} from './publication-recovery-gate.js';
import {
  buildPriorityRecoveryCorrelationKey,
  buildPriorityRecoveryPressureConditions,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {buildTrackedPriorityRecoveryDecisionSnapshots} from
  './priority-recovery-snapshot.js';

const PRIORITY_RECOVERY_OPERATION_ID_FIELD = Object.freeze({
  CAMEL: 'operationId',
  SNAKE: 'operation_id',
});
const PRIORITY_RECOVERY_CURRENT_SUMMARY_SCOPE = Object.freeze({
  TRACKED_PRIORITY_PARTITIONS: 'tracked_priority_partitions',
});

function isRecord(value) {
  return Boolean(value) &&
    typeof value === TYPEOF.OBJECT &&
    !Array.isArray(value);
}

function normalizeDistinctStringArray(values = []) {
  return normalizePriorityRecoveryStringList(values);
}

function normalizeNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalizedValue = normalizePriorityRecoveryInteger(value);
  if (!Number.isFinite(normalizedValue) || normalizedValue < NUM.ZERO) {
    return null;
  }
  return normalizedValue;
}

function normalizePriorityRecoverySemanticStateId(semanticState) {
  const normalizedSemanticState = String(semanticState || '').trim();
  if (normalizedSemanticState.length === NUM.ZERO) {
    return null;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(normalizedSemanticState) ?
    normalizedSemanticState :
    null;
}

function inferPriorityRecoverySemanticState(snapshot, blockerReasons = []) {
  for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
    if (!blockerReasons.includes(blockerReason)) {
      continue;
    }
    return (
      PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED
    );
  }
  const completionSemanticState = normalizePriorityRecoverySemanticStateId(
    snapshot?.completion?.state,
  );
  if (completionSemanticState) {
    return completionSemanticState;
  }
  if (snapshot?.planner?.ready === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
  }
  if (snapshot?.spreadCompletion?.satisfied === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  if (
    Number(snapshot?.coordinator?.operationCount) > NUM.ZERO ||
    (typeof snapshot?.operationId === TYPEOF.STRING &&
      snapshot.operationId.length > NUM.ZERO)
  ) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
}

function buildPriorityRecoveryExplicitSemanticStateByPartitionId(
  partitionIdsBySemanticState = null,
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

function shouldAllowLegacyPriorityRecoverySemanticStateInference(
  partitionIdsBySemanticState = null,
) {
  return !isRecord(partitionIdsBySemanticState);
}

function resolvePriorityRecoveryExplicitSemanticState(
  snapshot,
  explicitSemanticStateByPartitionId = null,
) {
  const explicitSemanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticStateId) ||
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState);
  if (explicitSemanticState) {
    return explicitSemanticState;
  }
  const partitionId = String(snapshot?.partitionId || '').trim();
  if (
    partitionId.length === NUM.ZERO ||
    !(explicitSemanticStateByPartitionId instanceof Map)
  ) {
    return null;
  }
  return explicitSemanticStateByPartitionId.get(partitionId) || null;
}

function normalizePriorityRecoveryBlockedPartitions(blockedPartitions = []) {
  const normalizedBlockedPartitions = [];
  for (const blockedPartition of Array.isArray(blockedPartitions) ?
    blockedPartitions :
    []) {
    if (!isRecord(blockedPartition)) {
      continue;
    }
    const partitionId = String(
      blockedPartition.partitionId ||
      blockedPartition.partition_id ||
      '',
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const spreadGap = normalizeNonNegativeInteger(
      blockedPartition.spreadGap ?? blockedPartition.spread_gap,
    );
    const requiredDistinctNodeCount = normalizeNonNegativeInteger(
      blockedPartition.requiredDistinctNodeCount ??
        blockedPartition.required_distinct_node_count,
    );
    const readyDistinctNodeCount = normalizeNonNegativeInteger(
      blockedPartition.readyDistinctNodeCount ??
        blockedPartition.ready_distinct_node_count,
    );
    normalizedBlockedPartitions.push(Object.freeze({
      partitionId,
      ...(spreadGap !== null ? {spreadGap} : {}),
      ...(requiredDistinctNodeCount !== null ? {requiredDistinctNodeCount} : {}),
      ...(readyDistinctNodeCount !== null ? {readyDistinctNodeCount} : {}),
      blockerReasonCodes: Object.freeze(
        normalizeDistinctStringArray(
          blockedPartition.blockerReasonCodes ||
            blockedPartition.reasonCodes ||
            blockedPartition.reasons,
        ),
      ),
    }));
  }
  return Object.freeze(normalizedBlockedPartitions);
}

function normalizePriorityPartitionSummary(summary = null) {
  if (!isRecord(summary)) {
    return null;
  }
  const blockedPartitions = normalizePriorityRecoveryBlockedPartitions(
    summary.blockedPartitions ?? summary.blocked_partitions,
  );
  const missingPartitionIds = normalizeDistinctStringArray(
    summary.missingPartitionIds ?? summary.missing_partition_ids,
  );
  const blockedPartitionCount = normalizeNonNegativeInteger(
    summary.blockedPartitionCount ?? summary.blocked_partition_count,
  );
  const totalSpreadGap = normalizeNonNegativeInteger(
    summary.totalSpreadGap ?? summary.total_spread_gap,
  );
  const largestSpreadGap = normalizeNonNegativeInteger(
    summary.largestSpreadGap ?? summary.largest_spread_gap,
  );
  const computedTotalSpreadGap = blockedPartitions.reduce((sum, partition) => {
    return sum + (partition?.spreadGap || NUM.ZERO);
  }, NUM.ZERO);
  const computedLargestSpreadGap = blockedPartitions.reduce((largest, partition) => {
    return Math.max(largest, partition?.spreadGap || NUM.ZERO);
  }, NUM.ZERO);
  const normalizedSummary = {
    ...(summary.satisfied === true ? {satisfied: true} : {}),
    ...(summary.satisfied === false ? {satisfied: false} : {}),
    ...(normalizeNonNegativeInteger(summary.requiredDistinctNodeCount) !== null ?
      {
        requiredDistinctNodeCount:
          normalizeNonNegativeInteger(summary.requiredDistinctNodeCount),
      } :
      {}),
    ...(normalizeNonNegativeInteger(summary.readyEligibleNodeCount) !== null ?
      {
        readyEligibleNodeCount:
          normalizeNonNegativeInteger(summary.readyEligibleNodeCount),
      } :
      {}),
    ...(normalizeNonNegativeInteger(summary.totalPriorityPartitionCount) !== null ?
      {
        totalPriorityPartitionCount:
          normalizeNonNegativeInteger(summary.totalPriorityPartitionCount),
      } :
      {}),
    ...(missingPartitionIds.length > NUM.ZERO ? {
      missingPartitionIds: Object.freeze([...missingPartitionIds]),
    } : {}),
    ...(blockedPartitions.length > NUM.ZERO ? {blockedPartitions} : {}),
    ...(blockedPartitionCount !== null ? {blockedPartitionCount} :
      blockedPartitions.length > NUM.ZERO ?
        {blockedPartitionCount: blockedPartitions.length} :
        {}),
    ...(largestSpreadGap !== null ? {largestSpreadGap} :
      blockedPartitions.length > NUM.ZERO ?
        {largestSpreadGap: computedLargestSpreadGap} :
        {}),
    ...(totalSpreadGap !== null ? {totalSpreadGap} :
      blockedPartitions.length > NUM.ZERO ?
        {totalSpreadGap: computedTotalSpreadGap} :
        {}),
  };
  return Object.freeze(normalizedSummary);
}

function normalizePriorityRecoveryInvariantSummary(value) {
  if (!isRecord(value)) {
    return null;
  }
  const invariants = [];
  const failingInvariantIds = [];
  for (const invariant of Array.isArray(value.invariants) ? value.invariants : []) {
    if (!isRecord(invariant)) {
      continue;
    }
    const invariantId = String(
      invariant.invariantId || invariant.id || '',
    ).trim();
    if (invariantId.length === NUM.ZERO) {
      continue;
    }
    const reasonCode = String(
      invariant.reasonCode || invariant.code || PRIORITY_RECOVERY_INVARIANT_FALLBACK,
    ).trim();
    const normalizedInvariant = Object.freeze({
      id: invariantId,
      invariantId,
      reasonCode: reasonCode.length > NUM.ZERO ?
        reasonCode :
        PRIORITY_RECOVERY_INVARIANT_FALLBACK,
      severity:
        typeof invariant.severity === TYPEOF.STRING ?
          invariant.severity :
          null,
      scope:
        typeof invariant.scope === TYPEOF.STRING ?
          invariant.scope :
          null,
      owningSubsystem:
        typeof invariant.owningSubsystem === TYPEOF.STRING ?
          invariant.owningSubsystem :
          null,
      passed: invariant.passed === true,
      details: isRecord(invariant.details) ? Object.freeze({...invariant.details}) : null,
    });
    invariants.push(normalizedInvariant);
    if (normalizedInvariant.passed !== true) {
      failingInvariantIds.push(normalizedInvariant.id);
    }
  }
  for (const invariantId of normalizeDistinctStringArray(value.failingInvariantIds)) {
    failingInvariantIds.push(invariantId);
  }
  const normalizedFailingInvariantIds =
    normalizeDistinctStringArray(failingInvariantIds);
  return Object.freeze({
    invariants: Object.freeze(
      invariants.sort((left, right) => left.id.localeCompare(right.id)),
    ),
    failingInvariantIds: Object.freeze(normalizedFailingInvariantIds),
    passed: normalizedFailingInvariantIds.length === NUM.ZERO,
  });
}

function initializePriorityRecoveryPartitionIndexes() {
  const partitionIdsByReason = {};
  const partitionIdsBySemanticState = {};
  for (const progressClassId of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    partitionIdsByReason[progressClassId] = new Set();
  }
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  return {
    partitionIdsByReason,
    partitionIdsBySemanticState,
    blockerReasonHistoryByPartitionId: {},
    semanticStateHistoryByPartitionId: {},
    decisionDimensions: new Set(),
  };
}

function collectPriorityRecoveryPartitionIndexes(
  snapshots = [],
  partitionIdsBySemanticState = null,
) {
  const indexes = initializePriorityRecoveryPartitionIndexes();
  const allowLegacySemanticStateInference =
    shouldAllowLegacyPriorityRecoverySemanticStateInference(
      partitionIdsBySemanticState,
    );
  const explicitSemanticStateByPartitionId =
    buildPriorityRecoveryExplicitSemanticStateByPartitionId(
      partitionIdsBySemanticState,
    );
  const snapshotsByPartitionId = new Map();
  for (const snapshot of snapshots) {
    if (!isRecord(snapshot)) {
      continue;
    }
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    if (!Array.isArray(snapshotsByPartitionId.get(partitionId))) {
      snapshotsByPartitionId.set(partitionId, []);
    }
    snapshotsByPartitionId.get(partitionId).push(snapshot);
    const blockerReasons = normalizeDistinctStringArray(snapshot.blockerReasons);
    if (!Array.isArray(indexes.blockerReasonHistoryByPartitionId[partitionId])) {
      indexes.blockerReasonHistoryByPartitionId[partitionId] = [];
    }
    for (const blockerReason of blockerReasons) {
      indexes.blockerReasonHistoryByPartitionId[partitionId].push(
        blockerReason,
      );
    }
    if (!Array.isArray(indexes.semanticStateHistoryByPartitionId[partitionId])) {
      indexes.semanticStateHistoryByPartitionId[partitionId] = [];
    }
    indexes.semanticStateHistoryByPartitionId[partitionId].push(
      resolvePriorityRecoverySnapshotSemanticState(
        snapshot,
        blockerReasons,
        explicitSemanticStateByPartitionId,
        allowLegacySemanticStateInference,
      ),
    );
  }
  for (const [partitionId, partitionSnapshots] of snapshotsByPartitionId.entries()) {
    const latestSnapshot = selectLatestPriorityRecoveryPartitionSnapshot(
      partitionSnapshots,
    );
    if (!isRecord(latestSnapshot)) {
      continue;
    }
    const blockerReasons = normalizeDistinctStringArray(
      latestSnapshot.blockerReasons,
    );
    for (const blockerReason of blockerReasons) {
      if (!(indexes.partitionIdsByReason[blockerReason] instanceof Set)) {
        indexes.partitionIdsByReason[blockerReason] = new Set();
      }
      indexes.partitionIdsByReason[blockerReason].add(partitionId);
    }
    const semanticState = resolvePriorityRecoverySnapshotSemanticState(
      latestSnapshot,
      blockerReasons,
      explicitSemanticStateByPartitionId,
      allowLegacySemanticStateInference,
    );
    if (!(indexes.partitionIdsBySemanticState[semanticState] instanceof Set)) {
      indexes.partitionIdsBySemanticState[semanticState] = new Set();
    }
    indexes.partitionIdsBySemanticState[semanticState].add(partitionId);
    collectPriorityRecoveryDecisionDimension(
      indexes.decisionDimensions,
      latestSnapshot,
    );
  }
  return indexes;
}

function resolvePriorityRecoverySnapshotSemanticState(
  snapshot,
  blockerReasons = [],
  explicitSemanticStateByPartitionId = null,
  allowLegacySemanticStateInference = false,
) {
  const explicitSemanticState = resolvePriorityRecoveryExplicitSemanticState(
    snapshot,
    explicitSemanticStateByPartitionId,
  );
  if (explicitSemanticState) {
    return explicitSemanticState;
  }
  return allowLegacySemanticStateInference === true ?
    inferPriorityRecoverySemanticState(snapshot, blockerReasons) :
    null;
}

function collectPriorityRecoveryDecisionDimension(
  decisionDimensions,
  snapshot,
) {
  const decisionDimension = String(
    snapshot?.admission?.decisionDimension || '',
  ).trim();
  if (decisionDimension.length > NUM.ZERO) {
    decisionDimensions.add(decisionDimension);
  }
}

function normalizePriorityRecoveryBlockedClassIds(partitionIdsByReason) {
  const blockerPartitionIdsByReason = {};
  const unresolvedClassIds = [];
  const blockedPartitionIds = new Set();
  for (const [blockerReason, partitionIds] of Object.entries(partitionIdsByReason)) {
    blockerPartitionIdsByReason[blockerReason] = Object.freeze(
      [...partitionIds].sort(),
    );
    if (partitionIds.size === NUM.ZERO) {
      continue;
    }
    unresolvedClassIds.push(blockerReason);
    for (const partitionId of partitionIds) {
      blockedPartitionIds.add(partitionId);
    }
  }
  return {
    blockerPartitionIdsByReason: Object.freeze(blockerPartitionIdsByReason),
    unresolvedClassIds: Object.freeze(unresolvedClassIds),
    blockedPartitionIds: Object.freeze([...blockedPartitionIds].sort()),
  };
}

function normalizePriorityRecoverySemanticStatePartitions(
  partitionIdsBySemanticState,
) {
  const normalizedPartitionIdsBySemanticState = {};
  for (const [semanticState, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    normalizedPartitionIdsBySemanticState[semanticState] = Object.freeze(
      [...partitionIds].sort(),
    );
  }
  const unresolvedSemanticStateIds = Object.freeze(
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter((semanticState) => {
      return normalizedPartitionIdsBySemanticState[semanticState]?.length >
        NUM.ZERO;
    }),
  );
  const blockedPartitionIds = new Set();
  for (const semanticState of unresolvedSemanticStateIds) {
    for (const partitionId of
      normalizedPartitionIdsBySemanticState[semanticState] || []) {
      blockedPartitionIds.add(partitionId);
    }
  }
  return {
    partitionIdsBySemanticState: Object.freeze(
      normalizedPartitionIdsBySemanticState,
    ),
    unresolvedSemanticStateIds,
    blockedPartitionIds: Object.freeze([...blockedPartitionIds].sort()),
  };
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
  if (unresolvedPartitionIds.length > NUM.ZERO) {
    return Object.freeze([...unresolvedPartitionIds]);
  }
  const fallbackWitnessPartitionIds = Array.isArray(
    blockedClassIds?.blockedPartitionIds,
  ) ?
    blockedClassIds.blockedPartitionIds :
    [];
  if (fallbackWitnessPartitionIds.length > NUM.ZERO) {
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
  if (nonBlockingInFlightWitnessPartitionIds.length > NUM.ZERO) {
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

function resolvePriorityRecoverySnapshotSortTimestamp(
  snapshot,
  decisionSnapshots,
) {
  return Number(
    snapshot?.coordinator?.operation?.updatedAtMs ??
      snapshot?.observation?.provenance?.capturedAt ??
      decisionSnapshots?.capturedAt ??
      NUM.ZERO,
  );
}

function selectLatestPriorityRecoveryPartitionSnapshot(
  partitionSnapshots = [],
  decisionSnapshots = null,
) {
  return partitionSnapshots
    .filter((snapshot) => isRecord(snapshot))
    .sort((left, right) => {
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
      const leftEpoch = Number.isFinite(left?.epoch) ? left.epoch : NUM.ZERO;
      const rightEpoch = Number.isFinite(right?.epoch) ? right.epoch : NUM.ZERO;
      if (leftEpoch !== rightEpoch) {
        return rightEpoch - leftEpoch;
      }
      return String(right?.correlationKey || '').localeCompare(
        String(left?.correlationKey || ''),
      );
    })[0] || null;
}

function collectPriorityRecoveryRelatedSnapshots(
  snapshots = [],
  partitionId,
) {
  return snapshots.filter((snapshot) => {
    return String(snapshot?.partitionId || '').trim() === partitionId;
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

function resolvePriorityRecoveryEligibleNodeIds(latestPartitionSnapshot) {
  const effectiveEligibleNodeIds = Array.isArray(
    latestPartitionSnapshot?.admission?.effectiveEligibleNodeIds,
  ) ?
    latestPartitionSnapshot.admission.effectiveEligibleNodeIds :
    [];
  return Object.freeze(
    normalizeDistinctStringArray(
      effectiveEligibleNodeIds.length > NUM.ZERO ?
        effectiveEligibleNodeIds :
        latestPartitionSnapshot?.admission?.eligibleNodeIds,
    ),
  );
}

function buildPriorityRecoveryPartitionSnapshot(
  partitionId,
  snapshots,
  decisionSnapshots,
  explicitSemanticStateByPartitionId = null,
  allowLegacySemanticStateInference = false,
) {
  const relatedSnapshots = collectPriorityRecoveryRelatedSnapshots(
    snapshots,
    partitionId,
  );
  const latestPartitionSnapshot = selectLatestPriorityRecoveryPartitionSnapshot(
    relatedSnapshots,
    decisionSnapshots,
  );
  const blockerReasonCodes = normalizeDistinctStringArray(
    latestPartitionSnapshot?.blockerReasons,
  );
  const operationIds = resolvePriorityRecoveryOperationIds(relatedSnapshots);
  const latestOperation = isRecord(latestPartitionSnapshot?.coordinator?.operation) ?
    latestPartitionSnapshot.coordinator.operation :
    null;
  const pressureConditions = buildPriorityRecoveryPressureConditions(
    latestPartitionSnapshot?.conditions?.pressure,
  );
  return Object.freeze({
    partitionId,
    semanticStateId: resolvePriorityRecoverySnapshotSemanticState(
      latestPartitionSnapshot,
      blockerReasonCodes,
      explicitSemanticStateByPartitionId,
      allowLegacySemanticStateInference,
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
      String(latestPartitionSnapshot?.observation?.visibilityState || '').trim() || null,
    removeSafetyState:
      String(latestPartitionSnapshot?.completion?.state || '').trim() || null,
    transportPressureState: null,
    witnessIds: Object.freeze(
      normalizeDistinctStringArray([
        latestPartitionSnapshot?.correlationKey,
        ...operationIds,
      ]),
    ),
    retryAfterMs: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.completion?.retryAfterMs,
    ),
    progressContractState:
      String(latestPartitionSnapshot?.progress?.contractState || '').trim() || null,
    progressNextAction:
      String(latestPartitionSnapshot?.progress?.nextAction || '').trim() || null,
    actuationState:
      String(latestPartitionSnapshot?.actuation?.state || '').trim() || null,
    actuationOwner:
      String(latestPartitionSnapshot?.actuation?.owner || '').trim() || null,
    currentOwner:
      String(latestPartitionSnapshot?.progress?.currentOwner || '').trim() || null,
    nextRequiredAction:
      String(latestPartitionSnapshot?.progress?.nextRequiredAction || '').trim() || null,
    blockingBoundary:
      String(latestPartitionSnapshot?.progress?.blockingBoundary || '').trim() || null,
    waitMode:
      String(latestPartitionSnapshot?.progress?.waitMode || '').trim() || null,
    workflowProgressPhaseId:
      String(latestPartitionSnapshot?.progress?.workflowProgressPhaseId || '').trim() || null,
    stepAgeMs: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.progress?.stepAgeMs,
    ),
    stepTimeoutMs: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.progress?.stepTimeoutMs,
    ),
    pressureState:
      String(pressureConditions?.pressureState || '').trim() || null,
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
    decisionDimension:
      String(latestPartitionSnapshot?.admission?.decisionDimension || '').trim() || null,
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
    completionState:
      String(latestPartitionSnapshot?.completion?.state || '').trim() || null,
    workflowState:
      String(latestPartitionSnapshot?.observation?.workflowState || '').trim() || null,
    visibilityState:
      String(latestPartitionSnapshot?.observation?.visibilityState || '').trim() || null,
    convergenceState:
      String(latestPartitionSnapshot?.observation?.convergenceState || '').trim() || null,
    workflowSource:
      String(
        latestPartitionSnapshot?.observation?.provenance?.workflowSource || '',
      ).trim() || null,
    snapshotCapturedAt: normalizeNonNegativeInteger(
      latestPartitionSnapshot?.observation?.provenance?.capturedAt ??
        decisionSnapshots?.capturedAt,
    ),
    latestOperationWorkflowStep:
      String(latestOperation?.workflowStep || '').trim() || null,
    latestOperationStatus:
      String(latestOperation?.status || '').trim() || null,
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
  const allowLegacySemanticStateInference =
    shouldAllowLegacyPriorityRecoverySemanticStateInference(
      decisionSnapshots?.partitionIdsBySemanticState,
    );
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
        allowLegacySemanticStateInference,
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
      'blockerReasonCodes',
    ),
    partitionSemanticStateHistory: buildPriorityRecoveryPartitionHistory(
      indexes.semanticStateHistoryByPartitionId,
      'semanticStateIds',
    ),
    partitionSnapshots,
    partitionWitnesses: partitionSnapshots,
    admissionDecisionDimensions: Object.freeze(
      [...indexes.decisionDimensions].sort(),
    ),
  });
}

function resolveProjectionDiagnostics(publicationConvergence = null) {
  const projectionDiagnostics =
    isRecord(publicationConvergence?.projectionDiagnostics) ?
      publicationConvergence.projectionDiagnostics :
      isRecord(publicationConvergence?.membershipLifecycleSummary?.projectionDiagnostics) ?
        publicationConvergence.membershipLifecycleSummary.projectionDiagnostics :
        null;
  if (!isRecord(projectionDiagnostics)) {
    return null;
  }
  return Object.freeze({
    readinessDecisionMode:
      typeof projectionDiagnostics.readinessDecisionMode === TYPEOF.STRING ?
        projectionDiagnostics.readinessDecisionMode :
        null,
    readinessDecisionDimensions: Object.freeze(
      normalizeDistinctStringArray(
        projectionDiagnostics.readinessDecisionDimensions,
      ),
    ),
    recoveryEligibleProjectionEnabled:
      projectionDiagnostics.recoveryEligibleProjectionEnabled === true,
    recoveryEligibleIncludedNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        projectionDiagnostics.recoveryEligibleIncludedNodeIds,
      ),
    ),
    readinessExcludedNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        projectionDiagnostics.readinessExcludedNodeIds,
      ),
    ),
    clusterMemberUnhealthyExcludedNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds,
      ),
    ),
  });
}

function resolvePriorityRecoveryReasonCodes(
  publicationConvergence = null,
  publicationConvergenceGate = null,
) {
  const reasonCodes = [
    ...normalizeDistinctStringArray(
      publicationConvergence?.priorityRecoveryReasonCodes ||
        publicationConvergence?.membershipLifecycleSummary?.priorityRecoveryReasonCodes,
    ),
    ...normalizeDistinctStringArray(
      publicationConvergenceGate?.reasonCodes ||
        publicationConvergenceGate?.reasons,
    ),
  ];
  return Object.freeze(normalizeDistinctStringArray(reasonCodes));
}

function shouldApplyObservationClosureWitness(
  priorityRecoveryClosureWitness = null,
) {
  return priorityRecoveryClosureWitness?.prioritySpreadPending === false;
}

function resolveObservationPublicationConvergenceGate(
  options = {},
  publicationConvergence = null,
  publicationConvergenceGate = null,
) {
  const providedPublicationConvergenceGate =
    isRecord(publicationConvergenceGate) ?
      publicationConvergenceGate :
      null;
  const priorityRecoveryClosureWitness =
    isRecord(options.priorityRecoveryClosureWitness) ?
      options.priorityRecoveryClosureWitness :
      isRecord(providedPublicationConvergenceGate?.priorityRecoveryClosureWitness) ?
        providedPublicationConvergenceGate.priorityRecoveryClosureWitness :
        isRecord(options.priorityRecoveryDecisionSnapshots?.closureWitness) ?
          options.priorityRecoveryDecisionSnapshots.closureWitness :
          isRecord(publicationConvergence?.priorityRecoveryClosureWitness) ?
            publicationConvergence.priorityRecoveryClosureWitness :
            null;
  const hasDecisionSnapshotContext = isRecord(
    options.priorityRecoveryDecisionSnapshots,
  );
  if (
    providedPublicationConvergenceGate &&
    !hasDecisionSnapshotContext &&
    !priorityRecoveryClosureWitness
  ) {
    return providedPublicationConvergenceGate;
  }
  if (
    !providedPublicationConvergenceGate &&
    !isRecord(publicationConvergence) &&
    !hasDecisionSnapshotContext
  ) {
    return null;
  }
  return buildPublicationRecoveryGateSnapshot({
    publicationEpoch:
      providedPublicationConvergenceGate?.publicationEpoch ??
      publicationConvergence?.publicationEpoch,
    publicationStatus:
      providedPublicationConvergenceGate?.publicationStatus ||
      publicationConvergence?.publicationStatus ||
      publicationConvergence?.status ||
      null,
    publicationObservationState:
      providedPublicationConvergenceGate?.publicationObservationState ||
      publicationConvergence?.publicationObservationState ||
      null,
    recoveryProtocolState:
      providedPublicationConvergenceGate?.recoveryProtocolState ||
      publicationConvergence?.recoveryProtocolState ||
      publicationConvergence?.membershipLifecycleSummary?.recoveryProtocolState,
    priorityRecoveryReasonCodes:
      providedPublicationConvergenceGate?.reasonCodes ||
      providedPublicationConvergenceGate?.reasons ||
      publicationConvergence?.priorityRecoveryReasonCodes ||
      publicationConvergence?.membershipLifecycleSummary?.priorityRecoveryReasonCodes,
    priorityPartitionSummary:
      providedPublicationConvergenceGate?.priorityPartitionSummary ||
      publicationConvergence?.priorityPartitionSummary,
    priorityRecoveryDecisionSnapshots:
      options.priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness:
      priorityRecoveryClosureWitness,
    pendingAckNodeIds:
      providedPublicationConvergenceGate?.pendingAckNodeIds ||
      publicationConvergence?.pendingAckNodeIds,
    missingPublishedNodeIds:
      providedPublicationConvergenceGate?.missingPublishedNodeIds ||
      publicationConvergence?.missingPublishedNodeIds ||
      publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
  });
}

function resolveObservationPriorityRecoveryClosureWitness(
  options = {},
  publicationConvergence = null,
  publicationConvergenceGate = null,
) {
  return isRecord(options.priorityRecoveryClosureWitness) ?
    options.priorityRecoveryClosureWitness :
    isRecord(options.priorityRecoveryDecisionSnapshots?.closureWitness) ?
      options.priorityRecoveryDecisionSnapshots.closureWitness :
      isRecord(publicationConvergence?.priorityRecoveryClosureWitness) ?
        publicationConvergence.priorityRecoveryClosureWitness :
        isRecord(publicationConvergenceGate?.priorityRecoveryClosureWitness) ?
          publicationConvergenceGate.priorityRecoveryClosureWitness :
          null;
}

function resolveObservationPriorityPartitionSummary(
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryClosureWitness = null,
) {
  const publicationSummary = normalizePriorityPartitionSummary(
    publicationConvergence?.priorityPartitionSummary,
  );
  const gateSummary = normalizePriorityPartitionSummary(
    publicationConvergenceGate?.priorityPartitionSummary,
  );
  const closureWitnessSummary = normalizePriorityPartitionSummary(
    priorityRecoveryClosureWitness?.refreshedPriorityPartitionSummary,
  );
  return shouldApplyObservationClosureWitness(priorityRecoveryClosureWitness) ?
    gateSummary || closureWitnessSummary || publicationSummary :
    publicationSummary || gateSummary || closureWitnessSummary;
}

function resolveObservationPriorityRecoveryReasonCodes(
  publicationConvergence = null,
  publicationConvergenceGate = null,
  priorityRecoveryClosureWitness = null,
) {
  if (shouldApplyObservationClosureWitness(priorityRecoveryClosureWitness)) {
    return Object.freeze(
      normalizeDistinctStringArray(
        publicationConvergenceGate?.reasonCodes ||
          publicationConvergenceGate?.reasons,
      ),
    );
  }
  return resolvePriorityRecoveryReasonCodes(
    publicationConvergence,
    publicationConvergenceGate,
  );
}

function resolveObservationPriorityRecoveryBlockedPartitionIds(
  priorityPartitionSummary = null,
  decisionSnapshotSummary = null,
) {
  const decisionBlockedPartitionIds = normalizeDistinctStringArray(
    decisionSnapshotSummary?.blockedPartitionIds,
  );
  if (decisionBlockedPartitionIds.length > NUM.ZERO) {
    return decisionBlockedPartitionIds;
  }
  const convergenceBlockedPartitionIds = Object.freeze(
    normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(priorityPartitionSummary?.missingPartitionIds),
      ...(Array.isArray(priorityPartitionSummary?.blockedPartitions) ?
        priorityPartitionSummary.blockedPartitions.map(
          (entry) => entry?.partitionId,
        ) :
        []),
    ]),
  );
  return convergenceBlockedPartitionIds.length > NUM.ZERO ?
    convergenceBlockedPartitionIds :
    decisionBlockedPartitionIds;
}

function resolveObservationActiveGateContext(options = {}) {
  const activeGateProgress = isRecord(options.activeGateProgress) ?
    options.activeGateProgress :
    null;
  const activeGateBestProgress = isRecord(options.activeGateBestProgress) ?
    options.activeGateBestProgress :
    null;
  const activeGateNoProgress = isRecord(options.activeGateNoProgress) ?
    options.activeGateNoProgress :
    null;
  const activeGateBlockerHistory = Array.isArray(options.activeGateBlockerHistory) ?
    Object.freeze([...options.activeGateBlockerHistory]) :
    null;
  return {
    activeGateProgress,
    activeGateBestProgress,
    activeGateNoProgress,
    activeGateBlockerHistory,
  };
}

function resolveObservationClosureField(
  options = {},
  fieldName = '',
  priorityRecoveryClosureWitness = null,
  activeGateContext = {},
) {
  return typeof options[fieldName] === TYPEOF.STRING ?
    options[fieldName] :
    priorityRecoveryClosureWitness?.[fieldName] ||
      activeGateContext.activeGateProgress?.[fieldName] ||
      activeGateContext.activeGateBestProgress?.[fieldName] ||
      activeGateContext.activeGateNoProgress?.[fieldName] ||
      null;
}

function buildPriorityRecoveryObservationSnapshot(options = {}) {
  const publicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const publicationConvergenceGate = resolveObservationPublicationConvergenceGate(
    options,
    publicationConvergence,
    options.publicationConvergenceGate,
  );
  const trackedPriorityRecoveryDecisionSnapshots =
    buildTrackedPriorityRecoveryDecisionSnapshots(
      options.priorityRecoveryDecisionSnapshots,
    );
  const priorityRecoveryCurrentSummary = Object.freeze({
    scope:
      PRIORITY_RECOVERY_CURRENT_SUMMARY_SCOPE.TRACKED_PRIORITY_PARTITIONS,
    ...buildPriorityRecoveryPartitionWitnesses(
      trackedPriorityRecoveryDecisionSnapshots,
    ),
  });
  const priorityRecoveryInvariants = normalizePriorityRecoveryInvariantSummary(
    options.priorityRecoveryInvariants,
  );
  const priorityRecoveryClosureWitness =
    resolveObservationPriorityRecoveryClosureWitness(
      options,
      publicationConvergence,
      publicationConvergenceGate,
    );
  const applyClosureWitness =
    shouldApplyObservationClosureWitness(priorityRecoveryClosureWitness);
  const priorityPartitionSummary = resolveObservationPriorityPartitionSummary(
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryClosureWitness,
  );
  const priorityRecoveryReasonCodes =
    resolveObservationPriorityRecoveryReasonCodes(
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryClosureWitness,
    );
  const activeGateContext = resolveObservationActiveGateContext(options);
  const priorityRecoveryUnresolvedPartitionIds =
    priorityRecoveryCurrentSummary.blockedPartitionIds;
  const priorityRecoveryBlockedPartitionIds =
    resolveObservationPriorityRecoveryBlockedPartitionIds(
      priorityPartitionSummary,
      priorityRecoveryCurrentSummary,
    );
  const observationPendingAckNodeIds =
    publicationConvergence?.pendingAckNodeIds ||
    publicationConvergenceGate?.pendingAckNodeIds;
  const observationPendingAckCount = Math.max(
    normalizeNonNegativeInteger(
      Array.isArray(observationPendingAckNodeIds) ?
        observationPendingAckNodeIds.length :
        publicationConvergenceGate?.pendingAckCount ?? NUM.ZERO,
    ) ?? NUM.ZERO,
    normalizeNonNegativeInteger(
      activeGateContext.activeGateProgress?.pendingAckCount,
    ) ?? NUM.ZERO,
    normalizeNonNegativeInteger(
      activeGateContext.activeGateBestProgress?.pendingAckCount,
    ) ?? NUM.ZERO,
  );
  const observationMissingPublishedNodeIds = Object.freeze(
    normalizeDistinctStringArray([
      ...normalizeDistinctStringArray(
        publicationConvergenceGate?.missingPublishedNodeIds,
      ),
      ...normalizeDistinctStringArray(
        publicationConvergence?.missingPublishedNodeIds,
      ),
      ...normalizeDistinctStringArray(
        publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
      ),
      ...normalizeDistinctStringArray(
        activeGateContext.activeGateProgress?.missingPublishedNodeIds,
      ),
      ...normalizeDistinctStringArray(
        activeGateContext.activeGateProgress?.selectedMissingPublishedNodeIds,
      ),
      ...normalizeDistinctStringArray(
        activeGateContext.activeGateBestProgress?.missingPublishedNodeIds,
      ),
      ...normalizeDistinctStringArray(
        activeGateContext.activeGateBestProgress
          ?.selectedMissingPublishedNodeIds,
      ),
    ]),
  );
  const observationMissingPublishedCount = Math.max(
    observationMissingPublishedNodeIds.length,
    normalizeNonNegativeInteger(
      publicationConvergenceGate?.missingPublishedCount,
    ) ?? NUM.ZERO,
    normalizeNonNegativeInteger(publicationConvergence?.missingPublishedCount) ??
      NUM.ZERO,
    normalizeNonNegativeInteger(
      activeGateContext.activeGateProgress?.missingPublishedCount,
    ) ?? NUM.ZERO,
    normalizeNonNegativeInteger(
      activeGateContext.activeGateBestProgress?.missingPublishedCount,
    ) ?? NUM.ZERO,
  );
  const pressureConditions = buildPriorityRecoveryPressureConditions(
    options.logsTable,
  );
  return Object.freeze({
    publicationEpoch:
      normalizeNonNegativeInteger(
        publicationConvergence?.publicationEpoch ??
          publicationConvergenceGate?.publicationEpoch,
      ),
    publicationStatus:
      publicationConvergence?.publicationStatus ||
      publicationConvergenceGate?.publicationStatus ||
      null,
    recoveryProtocolState:
      publicationConvergence?.recoveryProtocolState ||
      publicationConvergence?.membershipLifecycleSummary?.recoveryProtocolState ||
      publicationConvergenceGate?.recoveryProtocolState ||
      null,
    priorityRecoveryReasonCodes,
    publicationPending:
      publicationConvergenceGate?.publicationPending === true,
    prioritySpreadPending:
      publicationConvergenceGate?.prioritySpreadPending === true ||
      (
        applyClosureWitness !== true &&
        priorityPartitionSummary?.satisfied === false
      ),
    publishedActiveNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        publicationConvergence?.publishedActiveNodeIds,
      ),
    ),
    pendingAckNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        observationPendingAckNodeIds,
      ),
    ),
    pendingAckCount: observationPendingAckCount,
    missingPublishedNodeIds: observationMissingPublishedNodeIds,
    missingPublishedCount: observationMissingPublishedCount,
    publicationConvergenceGateReasons: Object.freeze(
      normalizeDistinctStringArray(
        publicationConvergenceGate?.reasonCodes ||
          publicationConvergenceGate?.reasons,
      ),
    ),
    closureRecordId: resolveObservationClosureField(
      options,
      PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD.RECORD_ID,
      priorityRecoveryClosureWitness,
      activeGateContext,
    ),
    closureWitnessClass: resolveObservationClosureField(
      options,
      PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD.WITNESS_CLASS,
      priorityRecoveryClosureWitness,
      activeGateContext,
    ),
    priorityRecoveryClosureState:
      typeof priorityRecoveryClosureWitness?.state === TYPEOF.STRING ?
        priorityRecoveryClosureWitness.state :
        null,
    ...(activeGateContext.activeGateProgress ?
      {activeGateProgress: activeGateContext.activeGateProgress} :
      {}),
    ...(activeGateContext.activeGateBestProgress ?
      {activeGateBestProgress: activeGateContext.activeGateBestProgress} :
      {}),
    ...(activeGateContext.activeGateNoProgress ?
      {activeGateNoProgress: activeGateContext.activeGateNoProgress} :
      {}),
    ...(activeGateContext.activeGateBlockerHistory ?
      {activeGateBlockerHistory: activeGateContext.activeGateBlockerHistory} :
      {}),
    pressureConditions,
    projectionDiagnostics: resolveProjectionDiagnostics(publicationConvergence),
    priorityPartitionSummary,
    priorityRecoveryCurrentSummary,
    priorityRecoveryProgressClassIds:
      priorityRecoveryCurrentSummary.unresolvedClassIds,
    priorityRecoveryProgressClassCount:
      priorityRecoveryCurrentSummary.unresolvedClassCount,
    priorityRecoverySemanticStateIds:
      priorityRecoveryCurrentSummary.unresolvedSemanticStateIds,
    priorityRecoverySemanticStateCount:
      priorityRecoveryCurrentSummary.unresolvedSemanticStateCount,
    priorityRecoveryBlockedPartitionIds: Object.freeze(
      [...priorityRecoveryBlockedPartitionIds],
    ),
    priorityRecoveryBlockedPartitionCount:
      priorityRecoveryBlockedPartitionIds.length,
    priorityRecoveryUnresolvedPartitionIds,
    priorityRecoveryUnresolvedPartitionCount:
      priorityRecoveryCurrentSummary.blockedPartitionCount,
    priorityRecoveryBlockerPartitionIdsByReason:
      priorityRecoveryCurrentSummary.blockerPartitionIdsByReason,
    priorityRecoveryPartitionIdsBySemanticState:
      priorityRecoveryCurrentSummary.partitionIdsBySemanticState,
    priorityRecoveryPartitionBlockerHistory:
      priorityRecoveryCurrentSummary.partitionBlockerHistory,
    priorityRecoveryPartitionSemanticStateHistory:
      priorityRecoveryCurrentSummary.partitionSemanticStateHistory,
    priorityRecoveryPartitionSnapshots:
      priorityRecoveryCurrentSummary.partitionSnapshots,
    priorityRecoveryPartitionWitnesses:
      priorityRecoveryCurrentSummary.partitionWitnesses,
    priorityRecoveryAdmissionDecisionDimensions:
      priorityRecoveryCurrentSummary.admissionDecisionDimensions,
    priorityRecoveryInvariantFailingIds: Object.freeze(
      priorityRecoveryInvariants?.failingInvariantIds || [],
    ),
    priorityRecoveryInvariantFailures: Object.freeze(
      priorityRecoveryInvariants?.invariants?.filter(
        (invariant) => invariant?.passed !== true,
      ) || [],
    ),
    priorityRecoveryInvariantCount:
      Array.isArray(priorityRecoveryInvariants?.invariants) ?
        priorityRecoveryInvariants.invariants.length :
        NUM.ZERO,
  });
}

const PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD = Object.freeze({
  RECORD_ID: 'closureRecordId',
  WITNESS_CLASS: 'closureWitnessClass',
});

export {
  buildPriorityRecoveryObservationSnapshot,
  buildPriorityRecoveryPartitionWitnesses,
};
