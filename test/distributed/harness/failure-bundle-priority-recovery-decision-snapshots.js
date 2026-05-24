import {buildPriorityRecoveryClosureWitness} from '../../../src/control-plane/priority-recovery-snapshot.js';
import {
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD,
  PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASONS,
  ZERO,
  cloneJsonValue,
  isRecord,
  normalizeDistinctStringArray,
} from './failure-bundle-artifact-foundation.js';

export function buildPriorityRecoveryCorrelationKey({
  partitionId,
  epoch = null,
  operationId = null,
  fallback = null,
}) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === ZERO) {
    return String(fallback || PRIORITY_RECOVERY_CORRELATION_KEY.UNKNOWN);
  }
  const normalizedEpoch = Number.isFinite(epoch) ?
    String(Math.floor(epoch)) :
    PRIORITY_RECOVERY_CORRELATION_KEY.EPOCH_UNKNOWN;
  const normalizedOperationId = String(operationId || '').trim();
  return [
    normalizedPartitionId,
    normalizedEpoch,
    normalizedOperationId.length > ZERO ?
      normalizedOperationId :
      PRIORITY_RECOVERY_CORRELATION_KEY.OPERATION_UNKNOWN,
  ].join(PRIORITY_RECOVERY_CORRELATION_KEY.SEPARATOR);
}

export function normalizePriorityRecoverySemanticStateId(semanticState) {
  const normalizedSemanticState = String(semanticState || '').trim();
  if (normalizedSemanticState.length === ZERO) {
    return null;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(normalizedSemanticState) ?
    normalizedSemanticState :
    null;
}

function normalizePriorityRecoveryDecisionSnapshotOperationIds(snapshot) {
  return normalizeDistinctStringArray([
    snapshot?.operationId,
    ...(Array.isArray(snapshot?.coordinator?.operationIds) ?
      snapshot.coordinator.operationIds :
      []),
    snapshot?.coordinator?.operation?.operationId,
  ]);
}

function hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) {
  return (
    normalizePriorityRecoveryDecisionSnapshotOperationIds(snapshot).length >
      ZERO ||
    Number(snapshot?.coordinator?.operationCount) > ZERO
  );
}

function isPriorityRecoverySyntheticNoOperationDecisionSnapshot(snapshot) {
  const semanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState) || null;
  const blockerReasons = normalizeDistinctStringArray(snapshot?.blockerReasons);
  const hasSyntheticNoOperationBlocker = blockerReasons.some((blockerReason) =>
    PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASONS.includes(
      blockerReason,
    ),
  );
  return (
    hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) !== true &&
    semanticState === PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION &&
    hasSyntheticNoOperationBlocker
  );
}

function hasPriorityRecoveryDecisionSnapshotProgress(snapshot) {
  if (hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) === true) {
    return true;
  }
  const semanticState =
    normalizePriorityRecoverySemanticStateId(snapshot?.semanticState) || null;
  const blockerReasons = normalizeDistinctStringArray(snapshot?.blockerReasons);
  const hasSyntheticNoOperationBlocker = blockerReasons.some((blockerReason) =>
    PRIORITY_RECOVERY_SYNTHETIC_NO_OPERATION_BLOCKER_REASONS.includes(
      blockerReason,
    ),
  );
  return (
    semanticState !== PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION ||
    !hasSyntheticNoOperationBlocker
  );
}

function resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot) {
  const operation = snapshot?.coordinator?.operation || {};
  const freshnessCandidates = [
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CAPTURED_AT],
    snapshot?.observation?.provenance?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CAPTURED_AT
    ],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.COMPLETED_AT_MS
    ],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.UPDATED_AT_MS
    ],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD
        .TARGET_SERVICE_PROGRESS_AT_MS
    ],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CREATED_AT_MS
    ],
  ].map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > ZERO);
  return freshnessCandidates.length > ZERO ?
    Math.max(...freshnessCandidates) :
    ZERO;
}

function shouldDropPriorityRecoverySyntheticNoOperationSnapshot({
  progressFreshnessMs,
  syntheticFreshnessMs,
}) {
  return (
    syntheticFreshnessMs === ZERO ||
    progressFreshnessMs === ZERO ||
    progressFreshnessMs >= syntheticFreshnessMs
  );
}

function filterPriorityRecoverySyntheticNoOperationConflicts(snapshots) {
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : [];
  const progressFreshnessByPartitionId = new Map();
  for (const snapshot of normalizedSnapshots) {
    if (hasPriorityRecoveryDecisionSnapshotProgress(snapshot) !== true) {
      continue;
    }
    const partitionId = String(snapshot?.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    progressFreshnessByPartitionId.set(
      partitionId,
      Math.max(
        progressFreshnessByPartitionId.get(partitionId) || ZERO,
        resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot),
      ),
    );
  }
  if (progressFreshnessByPartitionId.size === ZERO) {
    return normalizedSnapshots;
  }
  return normalizedSnapshots.filter((snapshot) => {
    const partitionId = String(snapshot?.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      return false;
    }
    const progressFreshnessMs = progressFreshnessByPartitionId.get(partitionId);
    if (
      progressFreshnessMs === undefined ||
      isPriorityRecoverySyntheticNoOperationDecisionSnapshot(snapshot) !== true
    ) {
      return true;
    }
    return !shouldDropPriorityRecoverySyntheticNoOperationSnapshot({
      progressFreshnessMs,
      syntheticFreshnessMs:
        resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot),
    });
  });
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

function resolvePriorityRecoveryDecisionSnapshotProgressSortTimestamp(
  snapshot,
) {
  const operation = snapshot?.coordinator?.operation || {};
  const progressTimestampCandidates = [
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.COMPLETED_AT_MS
    ],
    operation[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.UPDATED_AT_MS],
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD
        .TARGET_SERVICE_PROGRESS_AT_MS
    ],
    snapshot?.progress?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.LAST_PROGRESS_AT_MS
    ],
    operation[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CREATED_AT_MS],
  ]
    .map((candidate) => Number(candidate))
    .filter((candidate) => Number.isFinite(candidate) && candidate > ZERO);
  return progressTimestampCandidates.length > ZERO ?
    Math.max(...progressTimestampCandidates) :
    ZERO;
}

function resolvePriorityRecoveryDecisionSnapshotSortTimestamp(snapshot) {
  const progressTimestamp =
    resolvePriorityRecoveryDecisionSnapshotProgressSortTimestamp(snapshot);
  if (progressTimestamp > ZERO) {
    return progressTimestamp;
  }
  const updatedAtMs = Number(
    snapshot?.observation?.provenance?.capturedAt ??
      ZERO,
  );
  return Number.isFinite(updatedAtMs) ? updatedAtMs : ZERO;
}

function comparePriorityRecoveryDecisionSummarySnapshots(left, right) {
  const leftEpoch = Number.isFinite(left?.epoch) ? left.epoch : -1;
  const rightEpoch = Number.isFinite(right?.epoch) ? right.epoch : -1;
  if (leftEpoch !== rightEpoch) {
    return leftEpoch - rightEpoch;
  }
  const leftTimestamp = resolvePriorityRecoveryDecisionSnapshotSortTimestamp(
    left,
  );
  const rightTimestamp = resolvePriorityRecoveryDecisionSnapshotSortTimestamp(
    right,
  );
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  return String(left?.correlationKey || '').localeCompare(
    String(right?.correlationKey || ''),
  );
}

function selectPriorityRecoveryDecisionSummarySnapshots(snapshots) {
  const latestSnapshotByPartitionId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    if (!isRecord(snapshot)) {
      continue;
    }
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    const currentSnapshot = latestSnapshotByPartitionId.get(partitionId);
    if (
      !currentSnapshot ||
      comparePriorityRecoveryDecisionSummarySnapshots(
        currentSnapshot,
        snapshot,
      ) < ZERO
    ) {
      latestSnapshotByPartitionId.set(partitionId, snapshot);
    }
  }
  return [...latestSnapshotByPartitionId.values()].sort((left, right) =>
    String(left?.partitionId || '').localeCompare(
      String(right?.partitionId || ''),
    ),
  );
}

function initializePriorityRecoveryDecisionSummarySetMap(orderedIds) {
  return orderedIds.reduce((summarySetMap, orderedId) => {
    summarySetMap[orderedId] = new Set();
    return summarySetMap;
  }, {});
}

function normalizePriorityRecoveryDecisionSummarySetMap(summarySetMap) {
  return Object.fromEntries(
    Object.entries(summarySetMap).map(([summaryId, partitionIds]) => [
      summaryId,
      [...partitionIds].sort(),
    ]),
  );
}

function collectPriorityRecoveryDecisionSummarySets({
  snapshots = [],
  blockerPartitionIdsByReason: rawBlockerPartitionIdsByReason = null,
  partitionIdsBySemanticState: rawPartitionIdsBySemanticState = null,
  hasExplicitSemanticStateContract = false,
} = {}) {
  const blockerPartitionIdsByReason =
    initializePriorityRecoveryDecisionSummarySetMap(
      PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
    );
  const partitionIdsBySemanticState =
    initializePriorityRecoveryDecisionSummarySetMap(
      PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
    );
  const summarySnapshots =
    selectPriorityRecoveryDecisionSummarySnapshots(snapshots);
  const summaryPartitionIds = new Set(
    summarySnapshots.map((snapshot) => snapshot.partitionId),
  );
  const explicitSemanticStateByPartitionId =
    buildPriorityRecoveryExplicitSemanticStateByPartitionId(
      rawPartitionIdsBySemanticState,
    );

  for (const snapshot of summarySnapshots) {
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    const blockerReasons = normalizeDistinctStringArray(snapshot.blockerReasons);
    for (const blockerReason of blockerReasons) {
      if (!(blockerPartitionIdsByReason[blockerReason] instanceof Set)) {
        blockerPartitionIdsByReason[blockerReason] = new Set();
      }
      blockerPartitionIdsByReason[blockerReason].add(partitionId);
    }
    const semanticState =
      resolvePriorityRecoveryExplicitSemanticState(
        snapshot,
        explicitSemanticStateByPartitionId,
      );
    if (partitionIdsBySemanticState[semanticState] instanceof Set) {
      partitionIdsBySemanticState[semanticState].add(partitionId);
    }
  }

  if (isRecord(rawBlockerPartitionIdsByReason)) {
    for (const [blockerReason, partitionIds] of Object.entries(
      rawBlockerPartitionIdsByReason,
    )) {
      if (!(blockerPartitionIdsByReason[blockerReason] instanceof Set)) {
        blockerPartitionIdsByReason[blockerReason] = new Set();
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        if (summaryPartitionIds.has(partitionId)) {
          continue;
        }
        blockerPartitionIdsByReason[blockerReason].add(partitionId);
        summaryPartitionIds.add(partitionId);
      }
    }
  }

  if (isRecord(rawPartitionIdsBySemanticState)) {
    for (const [semanticState, partitionIds] of Object.entries(
      rawPartitionIdsBySemanticState,
    )) {
      const normalizedSemanticState =
        normalizePriorityRecoverySemanticStateId(semanticState);
      if (!normalizedSemanticState) {
        continue;
      }
      for (const partitionId of normalizeDistinctStringArray(partitionIds)) {
        if (summaryPartitionIds.has(partitionId)) {
          continue;
        }
        partitionIdsBySemanticState[normalizedSemanticState].add(partitionId);
        summaryPartitionIds.add(partitionId);
      }
    }
  }

  return {
    blockerPartitionIdsByReason,
    partitionIdsBySemanticState,
    partitionIds: summaryPartitionIds,
  };
}

export function normalizePriorityRecoveryDecisionSnapshots(value) {
  if (!isRecord(value)) {
    return null;
  }
  const snapshots = [];
  const partitionIdSet = new Set();
  const hasExplicitSemanticStateContract = isRecord(
    value.partitionIdsBySemanticState,
  );

  for (const snapshot of Array.isArray(value.snapshots) ?
    value.snapshots :
    []) {
    if (!isRecord(snapshot)) {
      continue;
    }
    const partitionId = String(snapshot.partitionId || '').trim();
    if (partitionId.length === ZERO) {
      continue;
    }
    partitionIdSet.add(partitionId);
    const epoch = Number.isFinite(snapshot.epoch) ?
      Math.floor(snapshot.epoch) :
      null;
    const operationId = String(snapshot.operationId || '').trim() || null;
    const blockerReasons = normalizeDistinctStringArray(
      snapshot.blockerReasons,
    );
    snapshots.push({
      partitionId,
      epoch,
      operationId,
      correlationKey: buildPriorityRecoveryCorrelationKey({
        partitionId,
        epoch,
        operationId,
        fallback: snapshot.correlationKey,
      }),
      planner: isRecord(snapshot.planner) ?
        cloneJsonValue(snapshot.planner) :
        null,
      spreadCompletion: isRecord(snapshot.spreadCompletion) ?
        cloneJsonValue(snapshot.spreadCompletion) :
        null,
      completion: isRecord(snapshot.completion) ?
        cloneJsonValue(snapshot.completion) :
        null,
      observation: isRecord(snapshot.observation) ?
        cloneJsonValue(snapshot.observation) :
        null,
      conditions: isRecord(snapshot.conditions) ?
        cloneJsonValue(snapshot.conditions) :
        null,
      actuation: isRecord(snapshot.actuation) ?
        cloneJsonValue(snapshot.actuation) :
        null,
      progress: isRecord(snapshot.progress) ?
        cloneJsonValue(snapshot.progress) :
        null,
      admission: isRecord(snapshot.admission) ?
        cloneJsonValue(snapshot.admission) :
        null,
      coordinator: isRecord(snapshot.coordinator) ?
        cloneJsonValue(snapshot.coordinator) :
        null,
      publication: isRecord(snapshot.publication) ?
        cloneJsonValue(snapshot.publication) :
        null,
      readiness: isRecord(snapshot.readiness) ?
        cloneJsonValue(snapshot.readiness) :
        null,
      blockerReasons,
      semanticState:
        normalizePriorityRecoverySemanticStateId(snapshot.semanticState) ||
        normalizePriorityRecoverySemanticStateId(snapshot.semanticStateId),
    });
  }

  const summarySets = collectPriorityRecoveryDecisionSummarySets({
    snapshots,
    blockerPartitionIdsByReason: value.blockerPartitionIdsByReason,
    partitionIdsBySemanticState: value.partitionIdsBySemanticState,
    hasExplicitSemanticStateContract,
  });
  for (const partitionId of summarySets.partitionIds) {
    partitionIdSet.add(partitionId);
  }
  const normalizedBlockerPartitionIdsByReason =
    normalizePriorityRecoveryDecisionSummarySetMap(
      summarySets.blockerPartitionIdsByReason,
    );
  const normalizedPartitionIdsBySemanticState =
    normalizePriorityRecoveryDecisionSummarySetMap(
      summarySets.partitionIdsBySemanticState,
    );
  const publicationEpoch = Number.isFinite(value.publicationEpoch) ?
    Math.floor(value.publicationEpoch) :
    null;
  const priorityPartitionSummary = isRecord(
    value.priorityPartitionSummary ?? value.priority_partition_summary,
  ) ?
    cloneJsonValue(
      value.priorityPartitionSummary ?? value.priority_partition_summary,
    ) :
    null;
  const normalizedDecisionSnapshots = {
    schemaVersion: Number.isFinite(value.schemaVersion) ?
      Math.floor(value.schemaVersion) :
      null,
    capturedAt: value.capturedAt || null,
    publicationEpoch,
    snapshots: snapshots.sort((left, right) => {
      const partitionDelta = left.partitionId.localeCompare(right.partitionId);
      if (partitionDelta !== ZERO) {
        return partitionDelta;
      }
      const leftEpoch = Number.isFinite(left.epoch) ? left.epoch : -1;
      const rightEpoch = Number.isFinite(right.epoch) ? right.epoch : -1;
      if (leftEpoch !== rightEpoch) {
        return leftEpoch - rightEpoch;
      }
      return left.correlationKey.localeCompare(right.correlationKey);
    }),
    snapshotCount: snapshots.length,
    partitionCount: partitionIdSet.size,
    blockerPartitionIdsByReason: normalizedBlockerPartitionIdsByReason,
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    priorityPartitionSummary,
    hasExplicitSemanticStateContract,
  };
  return {
    ...normalizedDecisionSnapshots,
    closureWitness:
      isRecord(value.closureWitness) ?
        cloneJsonValue(value.closureWitness) :
        buildPriorityRecoveryClosureWitness({
          decisionSnapshots: normalizedDecisionSnapshots,
          priorityPartitionSummary,
        }),
  };
}

export function mergePriorityRecoveryDecisionSnapshots(primary, fallback) {
  const normalizedPrimary = normalizePriorityRecoveryDecisionSnapshots(primary);
  const normalizedFallback =
    normalizePriorityRecoveryDecisionSnapshots(fallback);
  if (!normalizedPrimary && !normalizedFallback) {
    return null;
  }
  if (!normalizedPrimary) {
    return normalizedFallback;
  }
  if (!normalizedFallback) {
    return normalizedPrimary;
  }

  const snapshotsByCorrelationKey = new Map();
  for (const source of [normalizedFallback, normalizedPrimary]) {
    for (const snapshot of source.snapshots) {
      const correlationKey = buildPriorityRecoveryCorrelationKey({
        partitionId: snapshot.partitionId,
        epoch: snapshot.epoch,
        operationId: snapshot.operationId,
        fallback: snapshot.correlationKey,
      });
      const currentSnapshot = snapshotsByCorrelationKey.get(correlationKey);
      if (
        !currentSnapshot ||
        comparePriorityRecoveryDecisionSummarySnapshots(
          currentSnapshot,
          snapshot,
        ) < ZERO
      ) {
        snapshotsByCorrelationKey.set(correlationKey, snapshot);
      }
    }
  }

  const hasExplicitSemanticStateContract =
    normalizedFallback.hasExplicitSemanticStateContract === true ||
    normalizedPrimary.hasExplicitSemanticStateContract === true;
  const mergedSnapshots = filterPriorityRecoverySyntheticNoOperationConflicts(
    [...snapshotsByCorrelationKey.values()],
  ).sort((left, right) => {
    const partitionDelta = String(left.partitionId || '').localeCompare(
      String(right.partitionId || ''),
    );
    if (partitionDelta !== ZERO) {
      return partitionDelta;
    }
    const leftEpoch = Number.isFinite(left.epoch) ? left.epoch : -1;
    const rightEpoch = Number.isFinite(right.epoch) ? right.epoch : -1;
    if (leftEpoch !== rightEpoch) {
      return leftEpoch - rightEpoch;
    }
    return String(left.correlationKey || '').localeCompare(
      String(right.correlationKey || ''),
    );
  });
  const mergedPartitionIdSet = new Set(
    mergedSnapshots.map((snapshot) => snapshot.partitionId),
  );
  const mergedBlockerPartitionIdsByReason = {};
  const mergedPartitionIdsBySemanticState = {};
  for (const progressClassId of PRIORITY_RECOVERY_PROGRESS_CLASS_IDS) {
    mergedBlockerPartitionIdsByReason[progressClassId] =
      normalizeDistinctStringArray([
        ...(normalizedFallback.blockerPartitionIdsByReason?.[progressClassId] ||
          []),
        ...(normalizedPrimary.blockerPartitionIdsByReason?.[progressClassId] ||
          []),
      ]);
  }
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    mergedPartitionIdsBySemanticState[semanticState] =
      normalizeDistinctStringArray([
        ...(normalizedFallback.partitionIdsBySemanticState?.[semanticState] ||
          []),
        ...(normalizedPrimary.partitionIdsBySemanticState?.[semanticState] ||
          []),
      ]);
  }
  const mergedSummarySets = collectPriorityRecoveryDecisionSummarySets({
    snapshots: mergedSnapshots,
    blockerPartitionIdsByReason: mergedBlockerPartitionIdsByReason,
    partitionIdsBySemanticState: mergedPartitionIdsBySemanticState,
    hasExplicitSemanticStateContract,
  });
  for (const partitionId of mergedSummarySets.partitionIds) {
    mergedPartitionIdSet.add(partitionId);
  }
  const normalizedBlockerPartitionIdsByReason =
    normalizePriorityRecoveryDecisionSummarySetMap(
      mergedSummarySets.blockerPartitionIdsByReason,
    );
  const normalizedPartitionIdsBySemanticState =
    normalizePriorityRecoveryDecisionSummarySetMap(
      mergedSummarySets.partitionIdsBySemanticState,
    );
  const priorityPartitionSummary =
    normalizedPrimary.priorityPartitionSummary ||
    normalizedFallback.priorityPartitionSummary ||
    null;
  const mergedDecisionSnapshots = {
    schemaVersion:
      normalizedPrimary.schemaVersion ??
      normalizedFallback.schemaVersion ??
      null,
    capturedAt:
      normalizedPrimary.capturedAt || normalizedFallback.capturedAt || null,
    publicationEpoch:
      normalizedPrimary.publicationEpoch ??
      normalizedFallback.publicationEpoch ??
      null,
    snapshots: mergedSnapshots,
    snapshotCount: mergedSnapshots.length,
    partitionCount: mergedPartitionIdSet.size,
    blockerPartitionIdsByReason: normalizedBlockerPartitionIdsByReason,
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    priorityPartitionSummary,
    hasExplicitSemanticStateContract,
  };
  return {
    ...mergedDecisionSnapshots,
    closureWitness:
      buildPriorityRecoveryClosureWitness({
        decisionSnapshots: mergedDecisionSnapshots,
        priorityPartitionSummary,
      }) ||
      normalizedPrimary.closureWitness ||
      normalizedFallback.closureWitness ||
      null,
  };
}
