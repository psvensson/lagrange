import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from './priority-recovery-diagnostics-constants.js';
import {
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  LOCAL_EMPTY_LIST,
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_STALE_OPERATION_BLOCKER_REASONS,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_SYNTHETIC_NO_OPERATION_BLOCKER_REASONS,
  PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_COMPLETION_STATES,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from './priority-recovery-snapshot-stage-shared.js';
import {normalizePriorityRecoveryDecisionSnapshotSemanticState, resolvePriorityRecoverySemanticState} from './priority-recovery-snapshot-stage-1.js';
import {isPriorityRecoveryOperationContextTerminal} from './priority-recovery-snapshot-stage-6.js';

function normalizePriorityRecoveryDecisionSnapshotOperationIds(snapshot) {
  return normalizePriorityRecoveryStringList([
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
      NUM.ZERO ||
    normalizePriorityRecoveryInteger(snapshot?.coordinator?.operationCount) >
      NUM.ZERO
  );
}

function resolvePriorityRecoveryDecisionSnapshotSemanticState(
  snapshot,
  blockerReasons = [],
) {
  const explicitSemanticState =
    normalizePriorityRecoveryDecisionSnapshotSemanticState(
      snapshot?.semanticState,
    ) ||
    normalizePriorityRecoveryDecisionSnapshotSemanticState(
      snapshot?.semanticStateId,
    );
  if (explicitSemanticState) {
    return explicitSemanticState;
  }
  return resolvePriorityRecoverySemanticState({
    blockerReasons,
    plannerReady: snapshot?.planner?.ready === true,
    hasActiveOperationContexts:
      hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot),
    spreadCompletion: snapshot?.spreadCompletion,
  });
}

function hasPriorityRecoverySyntheticNoOperationBlocker(blockerReasons) {
  return normalizePriorityRecoveryStringList(blockerReasons).some(
    (blockerReason) =>
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_SYNTHETIC_NO_OPERATION_BLOCKER_REASONS
        .includes(blockerReason),
  );
}

function isPriorityRecoverySyntheticNoOperationDecisionSnapshot(snapshot) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    snapshot?.blockerReasons,
  );
  return (
    hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) !== true &&
    resolvePriorityRecoveryDecisionSnapshotSemanticState(
      snapshot,
      blockerReasons,
    ) === PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION &&
    hasPriorityRecoverySyntheticNoOperationBlocker(blockerReasons)
  );
}

function hasPriorityRecoveryDecisionSnapshotProgress(snapshot) {
  if (hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) === true) {
    return true;
  }
  const blockerReasons = normalizePriorityRecoveryStringList(
    snapshot?.blockerReasons,
  );
  return (
    resolvePriorityRecoveryDecisionSnapshotSemanticState(
      snapshot,
      blockerReasons,
    ) !== PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION ||
    hasPriorityRecoverySyntheticNoOperationBlocker(blockerReasons) !== true
  );
}

function normalizePriorityRecoveryDecisionSnapshotFreshnessCandidates(
  values = [],
) {
  return values
    .map((value) => normalizePriorityRecoveryInteger(value))
    .filter((value) => Number.isFinite(value) && value > NUM.ZERO);
}

function resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot) {
  const operation = snapshot?.coordinator?.operation || {};
  const freshnessCandidates =
    normalizePriorityRecoveryDecisionSnapshotFreshnessCandidates([
      snapshot?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CAPTURED_AT
      ],
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
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROGRESS]?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.LAST_PROGRESS_AT_MS
      ],
    ]);
  return freshnessCandidates.length > NUM.ZERO ?
    Math.max(...freshnessCandidates) :
    NUM.ZERO;
}

function resolvePriorityRecoveryDecisionSnapshotProgressFreshnessMs(snapshot) {
  const operation =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION
    ] || {};
  const freshnessCandidates =
    normalizePriorityRecoveryDecisionSnapshotFreshnessCandidates([
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
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROGRESS]?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.LAST_PROGRESS_AT_MS
      ],
      operation[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CREATED_AT_MS
      ],
    ]);
  return freshnessCandidates.length > NUM.ZERO ?
    Math.max(...freshnessCandidates) :
    NUM.ZERO;
}

function isPriorityRecoverySpreadProgressDecisionSnapshot(snapshot) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.BLOCKER_REASONS],
  );
  const semanticState =
    resolvePriorityRecoveryDecisionSnapshotSemanticState(
      snapshot,
      blockerReasons,
    );
  const operation =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION
    ] || {};
  return (
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SPREAD_COMPLETION]
      ?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SATISFIED] === true ||
    semanticState ===
      PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT ||
    semanticState === PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED ||
    operation[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.TARGET_VISIBILITY_STATE
    ] === PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL
  );
}

function isPriorityRecoveryStaleOperationDecisionSnapshot(snapshot) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.BLOCKER_REASONS],
  );
  const semanticState =
    resolvePriorityRecoveryDecisionSnapshotSemanticState(
      snapshot,
      blockerReasons,
    );
  return (
    semanticState === PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED ||
    blockerReasons.some((blockerReason) =>
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_STALE_OPERATION_BLOCKER_REASONS
        .includes(blockerReason),
    )
  );
}

function shouldDropPriorityRecoverySyntheticNoOperationSnapshot({
  progressFreshnessMs,
  syntheticFreshnessMs,
  progressSnapshot,
}) {
  return (
    syntheticFreshnessMs === NUM.ZERO ||
    progressFreshnessMs === NUM.ZERO ||
    progressFreshnessMs >= syntheticFreshnessMs ||
    isPriorityRecoveryWorkflowOwnerWaitWindowOpenSnapshot(
      progressSnapshot,
      syntheticFreshnessMs,
    )
  );
}

function shouldDropPriorityRecoveryStaleOperationSnapshot({
  progressFreshnessMs,
  staleOperationFreshnessMs,
}) {
  return (
    progressFreshnessMs > NUM.ZERO &&
    (
      staleOperationFreshnessMs === NUM.ZERO ||
      progressFreshnessMs > staleOperationFreshnessMs
    )
  );
}

function isPriorityRecoveryWorkflowOwnerWaitWindowOpenSnapshot(
  snapshot,
  comparedFreshnessMs,
) {
  if (hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) !== true) {
    return false;
  }
  const progress =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROGRESS] || {};
  if (
    String(
      progress[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.CURRENT_OWNER
      ] || LOCAL_STR_EMPTY,
    ).trim() !==
    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER
  ) {
    return false;
  }
  const lastProgressAtMs = normalizePriorityRecoveryInteger(
    progress[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.LAST_PROGRESS_AT_MS
    ],
  );
  const stepTimeoutMs = normalizePriorityRecoveryInteger(
    progress[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.STEP_TIMEOUT_MS],
  );
  const syntheticFreshnessMs =
    normalizePriorityRecoveryInteger(comparedFreshnessMs);
  if (
    !Number.isFinite(lastProgressAtMs) ||
    !Number.isFinite(stepTimeoutMs) ||
    !Number.isFinite(syntheticFreshnessMs) ||
    stepTimeoutMs <= NUM.ZERO
  ) {
    return false;
  }
  return syntheticFreshnessMs - lastProgressAtMs < stepTimeoutMs;
}

function filterPriorityRecoverySyntheticNoOperationConflicts(snapshots = []) {
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : [];
  const progressFreshnessByPartitionId = new Map();
  const progressSnapshotByPartitionId = new Map();
  for (const snapshot of normalizedSnapshots) {
    if (hasPriorityRecoveryDecisionSnapshotProgress(snapshot) !== true) {
      continue;
    }
    const partitionId = String(
      snapshot?.partitionId || LOCAL_STR_EMPTY,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const snapshotFreshnessMs =
      resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot);
    const currentFreshnessMs =
      progressFreshnessByPartitionId.get(partitionId) || NUM.ZERO;
    if (snapshotFreshnessMs >= currentFreshnessMs) {
      progressSnapshotByPartitionId.set(partitionId, snapshot);
    }
    progressFreshnessByPartitionId.set(
      partitionId,
      Math.max(
        currentFreshnessMs,
        snapshotFreshnessMs,
      ),
    );
  }
  if (progressFreshnessByPartitionId.size === NUM.ZERO) {
    return Array.isArray(snapshots) ? snapshots : [];
  }
  return normalizedSnapshots.filter((snapshot) => {
    const partitionId = String(snapshot?.partitionId || LOCAL_STR_EMPTY).trim();
    if (partitionId.length === NUM.ZERO) {
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
      progressSnapshot: progressSnapshotByPartitionId.get(partitionId),
    });
  });
}

function filterPriorityRecoveryStaleOperationProgressConflicts(snapshots = []) {
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : [];
  const progressFreshnessByPartitionId = new Map();
  for (const snapshot of normalizedSnapshots) {
    if (isPriorityRecoverySpreadProgressDecisionSnapshot(snapshot) !== true) {
      continue;
    }
    const partitionId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    progressFreshnessByPartitionId.set(
      partitionId,
      Math.max(
        progressFreshnessByPartitionId.get(partitionId) || NUM.ZERO,
        resolvePriorityRecoveryDecisionSnapshotProgressFreshnessMs(snapshot),
      ),
    );
  }
  if (progressFreshnessByPartitionId.size === NUM.ZERO) {
    return normalizedSnapshots;
  }
  return normalizedSnapshots.filter((snapshot) => {
    const partitionId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      return false;
    }
    const progressFreshnessMs = progressFreshnessByPartitionId.get(partitionId);
    if (
      progressFreshnessMs === undefined ||
      isPriorityRecoveryStaleOperationDecisionSnapshot(snapshot) !== true
    ) {
      return true;
    }
    return !shouldDropPriorityRecoveryStaleOperationSnapshot({
      progressFreshnessMs,
      staleOperationFreshnessMs:
        resolvePriorityRecoveryDecisionSnapshotProgressFreshnessMs(snapshot),
    });
  });
}

function resolvePriorityRecoveryDecisionSnapshotOperation(snapshot) {
  return snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION
  ] || null;
}

function resolvePriorityRecoveryOperationContextId(operationContext) {
  return String(
    operationContext?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION_ID
    ] || LOCAL_STR_EMPTY,
  ).trim();
}

function hasPriorityRecoveryReleasedSerialWaitCompletion(snapshot) {
  const completionState = String(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COMPLETION]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.STATE
    ] || LOCAL_STR_EMPTY,
  ).trim();
  return (
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SPREAD_COMPLETION]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SATISFIED
    ] === true ||
    PRIORITY_RECOVERY_RELEASED_SERIAL_WAIT_COMPLETION_STATES.has(
      completionState,
    )
  );
}

function isPriorityRecoveryReleasedSerialWaitSourceSnapshot(
  snapshot,
  operationId,
) {
  const normalizedOperationId = String(operationId || LOCAL_STR_EMPTY).trim();
  const operation = resolvePriorityRecoveryDecisionSnapshotOperation(snapshot);
  return (
    normalizedOperationId.length > NUM.ZERO &&
    resolvePriorityRecoveryOperationContextId(operation) ===
      normalizedOperationId &&
    isPriorityRecoveryOperationContextTerminal(operation) === true &&
    hasPriorityRecoveryReleasedSerialWaitCompletion(snapshot) === true
  );
}

function buildPriorityRecoveryReleasedSerialWaitFreshnessByOperationId(
  snapshots = [],
) {
  const releasedFreshnessByOperationId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const operationId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION
      ]?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    if (
      operationId.length === NUM.ZERO ||
      isPriorityRecoveryReleasedSerialWaitSourceSnapshot(
        snapshot,
        operationId,
      ) !== true
    ) {
      continue;
    }
    const releasedFreshnessMs =
      resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot);
    if (releasedFreshnessMs === NUM.ZERO) {
      continue;
    }
    releasedFreshnessByOperationId.set(
      operationId,
      Math.max(
        releasedFreshnessByOperationId.get(operationId) || NUM.ZERO,
        releasedFreshnessMs,
      ),
    );
  }
  return releasedFreshnessByOperationId;
}

function shouldReleasePriorityRecoverySerialWaitSnapshot(
  snapshot,
  releasedFreshnessByOperationId,
) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.BLOCKER_REASONS],
  );
  const serialWaitOnly =
    blockerReasons.length === NUM.ONE &&
    blockerReasons[NUM.ZERO] ===
      PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT;
  if (
    serialWaitOnly !== true ||
    hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) === true
  ) {
    return false;
  }
  const serialWaitOperationIds = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SERIAL_WAIT_OPERATION_IDS
    ],
  );
  const snapshotFreshnessMs =
    resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot);
  if (
    serialWaitOperationIds.length === NUM.ZERO ||
    snapshotFreshnessMs === NUM.ZERO
  ) {
    return false;
  }
  return serialWaitOperationIds.every((operationId) => {
    return (
      (releasedFreshnessByOperationId.get(operationId) || NUM.ZERO) >
      snapshotFreshnessMs
    );
  });
}

function buildReleasedPriorityRecoverySerialWaitAssessment(snapshot) {
  const planner =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PLANNER] &&
    typeof snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PLANNER] ===
      TYPEOF.OBJECT ?
      snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PLANNER] :
      {};
  const spreadCompletion =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SPREAD_COMPLETION] &&
    typeof snapshot[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SPREAD_COMPLETION
    ] === TYPEOF.OBJECT ?
      snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SPREAD_COMPLETION] :
      {};
  const blockerReasons = Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  ]);
  return {
    planner,
    spreadCompletion,
    blockerReasons,
    semanticState: resolvePriorityRecoverySemanticState({
      blockerReasons,
      plannerReady: planner.ready === true,
      hasActiveOperationContexts: false,
      spreadCompletion,
    }),
    activeOperationContexts: LOCAL_EMPTY_LIST,
    serialWaitOperationContexts: LOCAL_EMPTY_LIST,
    ineligibleNodeIds: normalizePriorityRecoveryStringList(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ADMISSION]?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.INELIGIBLE_NODE_IDS
      ],
    ),
    recoveryEligibleExcludedNodeIds: normalizePriorityRecoveryStringList(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ADMISSION]?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD
          .RECOVERY_ELIGIBLE_EXCLUDED_NODE_IDS
      ],
    ),
    publicationRecoveryEligibleButCoordinatorExcludesNode: false,
  };
}

function resolvePriorityRecoveryDecisionSnapshotOperationContexts(options = {}) {
  return Array.isArray(options.operationContexts) ?
    options.operationContexts :
    LOCAL_EMPTY_LIST;
}

function resolvePriorityRecoveryDecisionSnapshotAdmission(snapshot) {
  return snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ADMISSION];
}

function resolvePriorityRecoveryDecisionSnapshotCapturedAt(snapshot) {
  return snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OBSERVATION]?.[
    PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROVENANCE
  ]?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CAPTURED_AT];
}

export {
  buildPriorityRecoveryReleasedSerialWaitFreshnessByOperationId,
  buildReleasedPriorityRecoverySerialWaitAssessment,
  filterPriorityRecoveryStaleOperationProgressConflicts,
  filterPriorityRecoverySyntheticNoOperationConflicts,
  hasPriorityRecoveryDecisionSnapshotOperationEvidence,
  hasPriorityRecoveryDecisionSnapshotProgress,
  hasPriorityRecoveryReleasedSerialWaitCompletion,
  hasPriorityRecoverySyntheticNoOperationBlocker,
  isPriorityRecoveryReleasedSerialWaitSourceSnapshot,
  isPriorityRecoverySpreadProgressDecisionSnapshot,
  isPriorityRecoveryStaleOperationDecisionSnapshot,
  isPriorityRecoverySyntheticNoOperationDecisionSnapshot,
  isPriorityRecoveryWorkflowOwnerWaitWindowOpenSnapshot,
  normalizePriorityRecoveryDecisionSnapshotFreshnessCandidates,
  normalizePriorityRecoveryDecisionSnapshotOperationIds,
  resolvePriorityRecoveryDecisionSnapshotAdmission,
  resolvePriorityRecoveryDecisionSnapshotCapturedAt,
  resolvePriorityRecoveryDecisionSnapshotFreshnessMs,
  resolvePriorityRecoveryDecisionSnapshotOperation,
  resolvePriorityRecoveryDecisionSnapshotOperationContexts,
  resolvePriorityRecoveryDecisionSnapshotProgressFreshnessMs,
  resolvePriorityRecoveryDecisionSnapshotSemanticState,
  resolvePriorityRecoveryOperationContextId,
  shouldDropPriorityRecoveryStaleOperationSnapshot,
  shouldDropPriorityRecoverySyntheticNoOperationSnapshot,
  shouldReleasePriorityRecoverySerialWaitSnapshot,
};
