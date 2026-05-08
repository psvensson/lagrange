import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from './priority-recovery-diagnostics-constants.js';
import {PRIORITY_RECOVERY_COMPLETION_STATE_IDS} from './priority-recovery-completion.js';
import {
  inferPriorityRecoveryTableNameFromPartitionId,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
  PRIORITY_RECOVERY_CLOSURE_SATISFIED_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD,
  PRIORITY_RECOVERY_SNAPSHOT_LITERAL,
} from './priority-recovery-snapshot-stage-shared.js';
import {buildPriorityRecoveryDecisionPartitionIdSet, buildPriorityRecoverySemanticPartitionSetMap, filterPriorityRecoveryTrackedPartitionIds, hasPriorityRecoverySpreadGap, isPriorityRecoveryTrackedPartitionId, normalizePriorityRecoveryDecisionSnapshotSemanticState} from './priority-recovery-snapshot-stage-1.js';
import {resolvePriorityRecoveryDecisionSnapshotSemanticState} from './priority-recovery-snapshot-stage-2.js';
import {buildTrackedPriorityRecoveryDecisionSemanticStateMap, filterPriorityRecoveryDecisionSnapshotConflicts, isPriorityRecoverySourcePartitionStateMap, resolvePriorityRecoveryFilteredSnapshotBlockerReasons, resolvePriorityRecoverySourcePartitionStateIds, selectPriorityRecoveryDecisionSnapshotSummarySnapshots} from './priority-recovery-snapshot-stage-3.js';
import {buildPriorityRecoveryBlockerPartitionSetMap, buildPriorityRecoveryCompletionPartitionSetMap, normalizePriorityRecoveryBlockerPartitionIdsByReason, normalizePriorityRecoveryPartitionIdSetMap} from './priority-recovery-snapshot-stage-10.js';

const PRIORITY_RECOVERY_OPERATION_SPREAD_PROGRESS_SELECTION_OPTIONS =
  Object.freeze({
    prioritizeOperationSpreadProgress: true,
  });

function resolvePriorityRecoveryFilteredSnapshotSemanticStates(
  snapshot,
  partitionId,
  blockerReasons,
  sourceDecisionSnapshots = null,
) {
  const explicitSemanticState =
    normalizePriorityRecoveryDecisionSnapshotSemanticState(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SEMANTIC_STATE],
    ) ||
    normalizePriorityRecoveryDecisionSnapshotSemanticState(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SEMANTIC_STATE_ID],
    );
  if (explicitSemanticState) {
    return [explicitSemanticState];
  }
  const sourcePartitionIdsBySemanticState =
    sourceDecisionSnapshots?.partitionIdsBySemanticState;
  const sourceSemanticStates = resolvePriorityRecoverySourcePartitionStateIds(
    partitionId,
    sourcePartitionIdsBySemanticState,
    PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  );
  if (
    isPriorityRecoverySourcePartitionStateMap(
      sourcePartitionIdsBySemanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
    )
  ) {
    return sourceSemanticStates;
  }
  const inferredSemanticState =
    resolvePriorityRecoveryDecisionSnapshotSemanticState(
      snapshot,
      blockerReasons,
    );
  return inferredSemanticState ? [inferredSemanticState] : [];
}

function resolvePriorityRecoveryFilteredSnapshotCompletionStates(
  snapshot,
  partitionId,
  sourceDecisionSnapshots = null,
) {
  const completion = snapshot?.[
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COMPLETION
  ];
  const completionState = String(
    completion?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.STATE] ||
      LOCAL_STR_EMPTY,
  ).trim();
  if (PRIORITY_RECOVERY_COMPLETION_STATE_IDS.includes(completionState)) {
    return [completionState];
  }
  const sourcePartitionIdsByCompletionState =
    sourceDecisionSnapshots?.partitionIdsByCompletionState;
  if (
    isPriorityRecoverySourcePartitionStateMap(
      sourcePartitionIdsByCompletionState,
      PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
    ) !== true
  ) {
    return [];
  }
  return resolvePriorityRecoverySourcePartitionStateIds(
    partitionId,
    sourcePartitionIdsByCompletionState,
    PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
  );
}

function buildPriorityRecoveryFilteredDecisionSnapshotSummary(
  filteredSnapshots = [],
  sourceDecisionSnapshots = null,
) {
  const hasSourceBlockerPartitionMap =
    isPriorityRecoverySourcePartitionStateMap(
      sourceDecisionSnapshots?.blockerPartitionIdsByReason,
      PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
    );
  const hasSourceSemanticStateMap =
    isPriorityRecoverySourcePartitionStateMap(
      sourceDecisionSnapshots?.partitionIdsBySemanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
    );
  const hasSourceCompletionStateMap =
    isPriorityRecoverySourcePartitionStateMap(
      sourceDecisionSnapshots?.partitionIdsByCompletionState,
      PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
    );
  const blockerPartitionIdsByReason =
    buildPriorityRecoveryBlockerPartitionSetMap();
  const partitionIdsBySemanticState =
    buildPriorityRecoverySemanticPartitionSetMap();
  const partitionIdsByCompletionState =
    buildPriorityRecoveryCompletionPartitionSetMap();
  for (const snapshot of selectPriorityRecoveryDecisionSnapshotSummarySnapshots(
    filteredSnapshots,
    PRIORITY_RECOVERY_OPERATION_SPREAD_PROGRESS_SELECTION_OPTIONS,
  )) {
    const partitionId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const blockerReasons =
      resolvePriorityRecoveryFilteredSnapshotBlockerReasons(
        snapshot,
        partitionId,
        sourceDecisionSnapshots,
      );
    for (const blockerReason of blockerReasons) {
      if (blockerPartitionIdsByReason[blockerReason] instanceof Set) {
        blockerPartitionIdsByReason[blockerReason].add(partitionId);
      }
    }
    const semanticStates =
      resolvePriorityRecoveryFilteredSnapshotSemanticStates(
        snapshot,
        partitionId,
        blockerReasons,
        sourceDecisionSnapshots,
      );
    for (const semanticState of semanticStates) {
      if (partitionIdsBySemanticState[semanticState] instanceof Set) {
        partitionIdsBySemanticState[semanticState].add(partitionId);
      }
    }
    const completionStates =
      resolvePriorityRecoveryFilteredSnapshotCompletionStates(
        snapshot,
        partitionId,
        sourceDecisionSnapshots,
      );
    for (const completionState of completionStates) {
      if (partitionIdsByCompletionState[completionState] instanceof Set) {
        partitionIdsByCompletionState[completionState].add(partitionId);
      }
    }
  }
  const normalizedPartitionIdsBySemanticState =
    normalizePriorityRecoveryPartitionIdSetMap(
      partitionIdsBySemanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
    );
  const unresolvedSemanticStateIds =
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter(
      (semanticState) =>
        normalizedPartitionIdsBySemanticState[semanticState].length > NUM.ZERO,
    );
  const unresolvedSemanticBlockedPartitionIds =
    normalizePriorityRecoveryStringList(
      unresolvedSemanticStateIds.flatMap(
        (semanticState) =>
          normalizedPartitionIdsBySemanticState[semanticState],
      ),
    );
  return Object.freeze({
    hasBlockerPartitionIdsByReason: hasSourceBlockerPartitionMap,
    hasPartitionIdsBySemanticState: hasSourceSemanticStateMap,
    hasPartitionIdsByCompletionState: hasSourceCompletionStateMap,
    blockerPartitionIdsByReason:
      normalizePriorityRecoveryBlockerPartitionIdsByReason(
        blockerPartitionIdsByReason,
      ),
    partitionIdsBySemanticState: normalizedPartitionIdsBySemanticState,
    partitionIdsByCompletionState: normalizePriorityRecoveryPartitionIdSetMap(
      partitionIdsByCompletionState,
      PRIORITY_RECOVERY_COMPLETION_STATE_IDS,
    ),
    unresolvedSemanticStateIds,
    unresolvedSemanticStateCount: unresolvedSemanticStateIds.length,
    unresolvedSemanticBlockedPartitionIds,
    unresolvedSemanticBlockedPartitionCount:
      unresolvedSemanticBlockedPartitionIds.length,
  });
}

function buildTrackedPriorityRecoveryDecisionSnapshots(
  decisionSnapshots = null,
) {
  if (!decisionSnapshots || typeof decisionSnapshots !== TYPEOF.OBJECT) {
    return null;
  }
  const trackedDecisionSnapshots = {
    ...decisionSnapshots,
  };
  const hasSnapshotList = Array.isArray(decisionSnapshots.snapshots);
  let filteredSummary = null;
  if (Array.isArray(decisionSnapshots.snapshots)) {
    const trackedSnapshots = decisionSnapshots.snapshots.filter((snapshot) =>
      isPriorityRecoveryTrackedPartitionId(snapshot?.partitionId),
    );
    const filteredSnapshots =
      filterPriorityRecoveryDecisionSnapshotConflicts(trackedSnapshots);
    filteredSummary =
      buildPriorityRecoveryFilteredDecisionSnapshotSummary(
        filteredSnapshots,
        decisionSnapshots,
      );
    trackedDecisionSnapshots.snapshots = Object.freeze(
      filteredSnapshots,
    );
    trackedDecisionSnapshots.snapshotCount = filteredSnapshots.length;
    trackedDecisionSnapshots.partitionCount = new Set(
      filteredSnapshots.map((snapshot) =>
        String(snapshot?.partitionId || LOCAL_STR_EMPTY).trim(),
      ).filter((partitionId) => partitionId.length > NUM.ZERO),
    ).size;
    if (filteredSummary.hasBlockerPartitionIdsByReason === true) {
      trackedDecisionSnapshots.blockerPartitionIdsByReason =
        filteredSummary.blockerPartitionIdsByReason;
    }
    if (filteredSummary.hasPartitionIdsByCompletionState === true) {
      trackedDecisionSnapshots.partitionIdsByCompletionState =
        filteredSummary.partitionIdsByCompletionState;
    }
    if (filteredSummary.hasPartitionIdsBySemanticState === true) {
      trackedDecisionSnapshots.unresolvedSemanticStateIds =
        filteredSummary.unresolvedSemanticStateIds;
      trackedDecisionSnapshots.unresolvedSemanticStateCount =
        filteredSummary.unresolvedSemanticStateCount;
      trackedDecisionSnapshots.unresolvedSemanticBlockedPartitionIds =
        filteredSummary.unresolvedSemanticBlockedPartitionIds;
      trackedDecisionSnapshots.unresolvedSemanticBlockedPartitionCount =
        filteredSummary.unresolvedSemanticBlockedPartitionCount;
    }
  }
  const trackedPartitionIdsBySemanticState =
    hasSnapshotList ?
      (filteredSummary?.hasPartitionIdsBySemanticState === true ?
        filteredSummary.partitionIdsBySemanticState :
        null) :
      buildTrackedPriorityRecoveryDecisionSemanticStateMap(
        decisionSnapshots.partitionIdsBySemanticState,
      );
  if (trackedPartitionIdsBySemanticState) {
    trackedDecisionSnapshots.partitionIdsBySemanticState =
      trackedPartitionIdsBySemanticState;
  }
  return Object.freeze(trackedDecisionSnapshots);
}

function resolvePriorityRecoveryDecisionSummaryPartitionIds(
  decisionSnapshots = null,
  semanticStateIds = [],
) {
  const normalizedSemanticStateIds =
    normalizePriorityRecoveryStringList(semanticStateIds);
  if (normalizedSemanticStateIds.length === NUM.ZERO) {
    return Object.freeze([]);
  }
  const partitionIdSet = new Set();
  const partitionIdsBySemanticState =
    decisionSnapshots?.partitionIdsBySemanticState &&
    typeof decisionSnapshots.partitionIdsBySemanticState === TYPEOF.OBJECT ?
      decisionSnapshots.partitionIdsBySemanticState :
      null;
  if (partitionIdsBySemanticState) {
    for (const semanticStateId of normalizedSemanticStateIds) {
      for (const partitionId of normalizePriorityRecoveryStringList(
        partitionIdsBySemanticState[semanticStateId],
      )) {
        partitionIdSet.add(partitionId);
      }
    }
  } else {
    for (const snapshot of Array.isArray(decisionSnapshots?.snapshots) ?
      decisionSnapshots.snapshots :
      []) {
      const partitionId = String(snapshot?.partitionId || '').trim();
      const semanticState = String(snapshot?.semanticState || '').trim();
      if (
        partitionId.length > NUM.ZERO &&
        normalizedSemanticStateIds.includes(semanticState)
      ) {
        partitionIdSet.add(partitionId);
      }
    }
  }
  return Object.freeze([...partitionIdSet].sort());
}

function resolvePriorityRecoveryClosureReadyEligibleNodeCount(
  decisionSnapshots = null,
  priorityPartitionSummary = null,
) {
  const summaryReadyEligibleNodeCount = normalizePriorityRecoveryInteger(
    priorityPartitionSummary?.readyEligibleNodeCount,
  );
  if (summaryReadyEligibleNodeCount !== null) {
    return summaryReadyEligibleNodeCount;
  }
  const snapshotReadyEligibleNodeCounts = (
    Array.isArray(decisionSnapshots?.snapshots) ?
      decisionSnapshots.snapshots :
      []
  )
    .map((snapshot) =>
      Array.isArray(snapshot?.publication?.concreteEligibleNodeIds) ?
        snapshot.publication.concreteEligibleNodeIds.length :
        null,
    )
    .filter((value) => Number.isInteger(value) && value >= NUM.ZERO);
  if (snapshotReadyEligibleNodeCounts.length === NUM.ZERO) {
    return null;
  }
  return Math.max(...snapshotReadyEligibleNodeCounts);
}

function buildPriorityRecoveryClosureSatisfiedPriorityPartitionSummary(
  decisionSnapshots = null,
  priorityPartitionSummary = null,
) {
  const requiredDistinctNodeCount = normalizePriorityRecoveryInteger(
    priorityPartitionSummary?.requiredDistinctNodeCount,
  );
  const readyEligibleNodeCount =
    resolvePriorityRecoveryClosureReadyEligibleNodeCount(
      decisionSnapshots,
      priorityPartitionSummary,
    );
  const totalPriorityPartitionCount =
    normalizePriorityRecoveryInteger(
      priorityPartitionSummary?.totalPriorityPartitionCount,
    ) ||
    buildPriorityRecoveryDecisionPartitionIdSet(decisionSnapshots).size ||
    null;
  return Object.freeze({
    satisfied: true,
    ...(requiredDistinctNodeCount !== null ? {requiredDistinctNodeCount} : {}),
    ...(readyEligibleNodeCount !== null ? {readyEligibleNodeCount} : {}),
    ...(totalPriorityPartitionCount !== null ?
      {totalPriorityPartitionCount} :
      {}),
    missingPartitionIds: Object.freeze([]),
    blockedPartitions: Object.freeze([]),
    blockedPartitionCount: NUM.ZERO,
    largestSpreadGap: NUM.ZERO,
    totalSpreadGap: NUM.ZERO,
  });
}

function buildPriorityRecoveryClosureWitness(options = {}) {
  const rawDecisionSnapshots =
    options.decisionSnapshots &&
    typeof options.decisionSnapshots === TYPEOF.OBJECT ?
      options.decisionSnapshots :
      null;
  const decisionSnapshots =
    buildTrackedPriorityRecoveryDecisionSnapshots(rawDecisionSnapshots);
  if (!decisionSnapshots) {
    return null;
  }
  const priorityPartitionSummary =
    options.priorityPartitionSummary &&
    typeof options.priorityPartitionSummary === TYPEOF.OBJECT ?
      options.priorityPartitionSummary :
      decisionSnapshots.priorityPartitionSummary &&
          typeof decisionSnapshots.priorityPartitionSummary === TYPEOF.OBJECT ?
        decisionSnapshots.priorityPartitionSummary :
        null;
  const unresolvedSemanticStateIds =
    PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.filter(
      (semanticStateId) =>
        filterPriorityRecoveryTrackedPartitionIds(
          resolvePriorityRecoveryDecisionSummaryPartitionIds(
            decisionSnapshots,
            [semanticStateId],
          ),
        ).length > NUM.ZERO,
    );
  const blockedPartitionIds = filterPriorityRecoveryTrackedPartitionIds(
    unresolvedSemanticStateIds.flatMap((semanticStateId) =>
      resolvePriorityRecoveryDecisionSummaryPartitionIds(decisionSnapshots, [
        semanticStateId,
      ]),
    ),
  );
  const satisfiedPartitionIds = filterPriorityRecoveryTrackedPartitionIds(
    resolvePriorityRecoveryDecisionSummaryPartitionIds(
      decisionSnapshots,
      PRIORITY_RECOVERY_CLOSURE_SATISFIED_SEMANTIC_STATE_IDS,
    ),
  );
  const decisionPartitionIds = filterPriorityRecoveryTrackedPartitionIds([
    ...buildPriorityRecoveryDecisionPartitionIdSet(decisionSnapshots),
  ]);
  if (
    blockedPartitionIds.length === NUM.ZERO &&
    satisfiedPartitionIds.length === NUM.ZERO &&
    decisionPartitionIds.length === NUM.ZERO
  ) {
    return null;
  }
  const summarySpreadPending = hasPriorityRecoverySpreadGap(
    priorityPartitionSummary,
  );
  if (blockedPartitionIds.length > NUM.ZERO) {
    return Object.freeze({
      state: PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.PENDING,
      prioritySpreadPending: true,
      publicationRefreshRequired: false,
      closureRecordId: null,
      closureWitnessClass: null,
      blockedPartitionIds: Object.freeze([...blockedPartitionIds]),
      blockedPartitionCount: blockedPartitionIds.length,
      unresolvedSemanticStateIds: Object.freeze([
        ...unresolvedSemanticStateIds,
      ]),
      satisfiedPartitionIds,
      decisionPartitionIds,
      refreshedPriorityPartitionSummary: null,
      summarySpreadPending,
      publicationEpoch: normalizePriorityRecoveryInteger(
        decisionSnapshots.publicationEpoch,
      ),
    });
  }
  const state =
    summarySpreadPending === true ?
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION :
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_FRESH;
  return Object.freeze({
    state,
    prioritySpreadPending: false,
    publicationRefreshRequired:
      state ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION,
    closureRecordId:
      state ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION ?
        PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD :
        null,
    closureWitnessClass:
      state ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION ?
        PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS.PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING :
        null,
    blockedPartitionIds: Object.freeze([]),
    blockedPartitionCount: NUM.ZERO,
    unresolvedSemanticStateIds: Object.freeze([...unresolvedSemanticStateIds]),
    satisfiedPartitionIds,
    decisionPartitionIds,
    refreshedPriorityPartitionSummary:
      buildPriorityRecoveryClosureSatisfiedPriorityPartitionSummary(
        decisionSnapshots,
        priorityPartitionSummary,
      ),
    summarySpreadPending,
    publicationEpoch: normalizePriorityRecoveryInteger(
      decisionSnapshots.publicationEpoch,
    ),
  });
}

function resolvePriorityPartitionSummaryFromPublication(publicationRow = null) {
  if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
    return null;
  }
  const summary =
    publicationRow.priorityPartitionSummary ??
    publicationRow.priority_partition_summary ??
    null;
  return summary && typeof summary === TYPEOF.OBJECT ? summary : null;
}

function resolvePriorityRecoveryEmergencyBudgetOwnerId(partitionId) {
  const normalizedPartitionId = String(
    partitionId || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  ).trim();
  if (normalizedPartitionId.length === NUM.ZERO) {
    return PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE;
  }
  const tableId = inferPriorityRecoveryTableNameFromPartitionId(
    normalizedPartitionId,
  );
  return typeof tableId === TYPEOF.STRING && tableId.length > NUM.ZERO ?
    tableId :
    normalizedPartitionId;
}

function buildPriorityRecoveryEmergencyBudgetOwnerIds(partitionIds = []) {
  const ownerIds = new Set();
  for (const partitionId of normalizePriorityRecoveryStringList(partitionIds)) {
    const ownerId = resolvePriorityRecoveryEmergencyBudgetOwnerId(partitionId);
    if (ownerId.length > NUM.ZERO) {
      ownerIds.add(ownerId);
    }
  }
  return ownerIds;
}

export {
  buildPriorityRecoveryClosureSatisfiedPriorityPartitionSummary,
  buildPriorityRecoveryClosureWitness,
  buildPriorityRecoveryEmergencyBudgetOwnerIds,
  buildPriorityRecoveryFilteredDecisionSnapshotSummary,
  buildTrackedPriorityRecoveryDecisionSnapshots,
  resolvePriorityPartitionSummaryFromPublication,
  resolvePriorityRecoveryClosureReadyEligibleNodeCount,
  resolvePriorityRecoveryDecisionSummaryPartitionIds,
  resolvePriorityRecoveryEmergencyBudgetOwnerId,
  resolvePriorityRecoveryFilteredSnapshotCompletionStates,
  resolvePriorityRecoveryFilteredSnapshotSemanticStates,
};
