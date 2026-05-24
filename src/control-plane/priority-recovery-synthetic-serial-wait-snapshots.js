import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
} from './priority-recovery-diagnostics-constants.js';
import {
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD,
} from './priority-recovery-snapshot-stage-shared.js';
import {
  buildPriorityRecoveryReleasedSerialWaitFreshnessByOperationId,
  filterPriorityRecoveryStaleOperationProgressConflicts,
  filterPriorityRecoverySyntheticNoOperationConflicts,
  hasPriorityRecoveryDecisionSnapshotOperationEvidence,
  isPriorityRecoverySpreadProgressDecisionSnapshot,
  isPriorityRecoverySyntheticNoOperationDecisionSnapshot,
  shouldReleasePriorityRecoverySerialWaitSnapshot,
} from './priority-recovery-snapshot-stage-2.js';
import {
  buildPriorityRecoverySyntheticSerialWaitSnapshot,
  releasePriorityRecoverySerialWaitSnapshot,
} from './priority-recovery-decision-snapshot-rebuild.js';
import {
  buildPriorityRecoveryDecisionSnapshotOperationSnapshotsByPartitionId,
  selectPriorityRecoveryDecisionSnapshotSummarySnapshots,
} from './priority-recovery-decision-snapshot-summary.js';
import {
  buildPriorityRecoverySerialWaitOperationContexts,
  isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext,
} from './priority-recovery-serial-wait-operation-contexts.js';

const PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_FIELD = Object.freeze({
  LATEST_OPERATION_ID: 'latestOperationId',
  LATEST_OPERATION_STATUS: 'latestOperationStatus',
  LATEST_OPERATION_WORKFLOW_STEP: 'latestOperationWorkflowStep',
});

const PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_MODE = Object.freeze({
  COORDINATOR_OPERATION: 'coordinator_operation',
  WORKFLOW_SUMMARY_SIBLING: 'workflow_summary_sibling',
  WORKFLOW_SUMMARY_OVERLAY: 'workflow_summary_overlay',
  NONE: 'none',
});

const PRIORITY_RECOVERY_WORKFLOW_PROGRESS_IN_FLIGHT_ACTIONS =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  ]));

function buildPriorityRecoverySyntheticSerialWaitSourceEvidence(snapshot) {
  const progress =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROGRESS] &&
    typeof snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROGRESS] ===
      TYPEOF.OBJECT ?
      snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROGRESS] :
      null;
  const conditions =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.CONDITIONS] &&
    typeof snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.CONDITIONS] ===
      TYPEOF.OBJECT ?
      snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.CONDITIONS] :
      null;
  const actuation =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ACTUATION] &&
    typeof snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ACTUATION] ===
      TYPEOF.OBJECT ?
      snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ACTUATION] :
      null;
  const coordinatorOperation =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION
    ] &&
    typeof snapshot[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR
    ]?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION] ===
      TYPEOF.OBJECT ?
      snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR][
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION
      ] :
      null;
  return Object.freeze({
    coordinatorOperation,
    operationIds: normalizePriorityRecoveryStringList(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]
        ?.operationIds,
    ),
    partitionId: String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim(),
    progressOwner: String(
      progress?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.CURRENT_OWNER] ||
        LOCAL_STR_EMPTY,
    ).trim(),
    lastProgressAtMs: normalizePriorityRecoveryInteger(
      progress?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.LAST_PROGRESS_AT_MS],
    ),
    latestOperationId: String(
      actuation?.[
        PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_FIELD
          .LATEST_OPERATION_ID
      ] || LOCAL_STR_EMPTY,
    ).trim(),
    latestOperationStatus: String(
      conditions?.[
        PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_FIELD
          .LATEST_OPERATION_STATUS
      ] || LOCAL_STR_EMPTY,
    ).trim(),
    latestOperationWorkflowStep: String(
      conditions?.[
        PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_FIELD
          .LATEST_OPERATION_WORKFLOW_STEP
      ] || LOCAL_STR_EMPTY,
    ).trim(),
    stepTimeoutMs: normalizePriorityRecoveryInteger(
      actuation?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.STEP_TIMEOUT_MS],
    ),
  });
}

function hasPriorityRecoverySyntheticSerialWaitWorkflowSummarySource(
  sourceEvidence,
) {
  return (
    sourceEvidence &&
    sourceEvidence.progressOwner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
    sourceEvidence.latestOperationId.length > NUM.ZERO &&
    sourceEvidence.operationIds.includes(sourceEvidence.latestOperationId) ===
      true
  );
}

function buildPriorityRecoverySyntheticSerialWaitWorkflowOwnedOperationContext(
  sourceEvidence,
  baseOperationContext,
  options = {},
) {
  if (
    hasPriorityRecoverySyntheticSerialWaitWorkflowSummarySource(
      sourceEvidence,
    ) !== true ||
    !baseOperationContext ||
    typeof baseOperationContext !== TYPEOF.OBJECT
  ) {
    return null;
  }
  const baseOperationId = String(
    baseOperationContext.operationId || LOCAL_STR_EMPTY,
  ).trim();
  if (baseOperationId.length === NUM.ZERO) {
    return null;
  }
  if (
    options.allowMatchingOperationId !== true &&
    baseOperationId === sourceEvidence.latestOperationId
  ) {
    return null;
  }
  const summaryOperationContext = {
    ...baseOperationContext,
  };
  delete summaryOperationContext.ageMs;
  delete summaryOperationContext.completedAtMs;
  delete summaryOperationContext.latestTimelineStep;
  return {
    ...summaryOperationContext,
    operationId: sourceEvidence.latestOperationId,
    partitionId:
      String(
        baseOperationContext.partitionId ||
          sourceEvidence.partitionId ||
          LOCAL_STR_EMPTY,
      ).trim(),
    status:
      sourceEvidence.latestOperationStatus.length > NUM.ZERO ?
        sourceEvidence.latestOperationStatus :
        baseOperationContext.status,
    workflowStep:
      sourceEvidence.latestOperationWorkflowStep.length > NUM.ZERO ?
        sourceEvidence.latestOperationWorkflowStep :
        baseOperationContext.workflowStep,
    ...(sourceEvidence.latestOperationWorkflowStep.length > NUM.ZERO ?
      {latestTimelineStep: sourceEvidence.latestOperationWorkflowStep} :
      {}),
    ...(Number.isFinite(sourceEvidence.lastProgressAtMs) &&
    sourceEvidence.lastProgressAtMs > NUM.ZERO ?
      {updatedAtMs: sourceEvidence.lastProgressAtMs} :
      {}),
    ...(Number.isFinite(sourceEvidence.stepTimeoutMs) &&
    sourceEvidence.stepTimeoutMs > NUM.ZERO ?
      {stepTimeoutMs: sourceEvidence.stepTimeoutMs} :
      {}),
    latestTimelineInFlight: true,
  };
}

function buildPriorityRecoverySyntheticSerialWaitWorkflowSummaryOperation(
  sourceEvidence,
) {
  return buildPriorityRecoverySyntheticSerialWaitWorkflowOwnedOperationContext(
    sourceEvidence,
    sourceEvidence?.coordinatorOperation,
  );
}

function resolvePriorityRecoverySyntheticSerialWaitSiblingOperationContext(
  sourceEvidence,
  operationSnapshotsByPartitionId = new Map(),
) {
  if (
    hasPriorityRecoverySyntheticSerialWaitWorkflowSummarySource(
      sourceEvidence,
    ) !== true ||
    !(operationSnapshotsByPartitionId instanceof Map)
  ) {
    return null;
  }
  const coordinatorOperationId = String(
    sourceEvidence?.coordinatorOperation?.operationId || LOCAL_STR_EMPTY,
  ).trim();
  if (coordinatorOperationId === sourceEvidence.latestOperationId) {
    return null;
  }
  const partitionOperationSnapshots =
    operationSnapshotsByPartitionId.get(sourceEvidence.partitionId);
  if (!(partitionOperationSnapshots instanceof Map)) {
    return null;
  }
  const siblingSnapshot = partitionOperationSnapshots.get(
    sourceEvidence.latestOperationId,
  );
  const siblingOperationContext =
    siblingSnapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION
    ];
  if (
    !siblingOperationContext ||
    typeof siblingOperationContext !== TYPEOF.OBJECT
  ) {
    return null;
  }
  return String(
    siblingOperationContext.operationId || LOCAL_STR_EMPTY,
  ).trim() === sourceEvidence.latestOperationId ?
    siblingOperationContext :
    null;
}

function buildPriorityRecoverySyntheticSerialWaitWorkflowSiblingOperation(
  sourceEvidence,
  operationSnapshotsByPartitionId = new Map(),
) {
  const siblingOperationContext =
    resolvePriorityRecoverySyntheticSerialWaitSiblingOperationContext(
      sourceEvidence,
      operationSnapshotsByPartitionId,
    );
  return buildPriorityRecoverySyntheticSerialWaitWorkflowOwnedOperationContext(
    sourceEvidence,
    siblingOperationContext,
    {
      allowMatchingOperationId: true,
    },
  );
}

function resolvePriorityRecoverySyntheticSerialWaitSourceMode(
  snapshot,
  operationSnapshotsByPartitionId = new Map(),
) {
  const sourceEvidence =
    buildPriorityRecoverySyntheticSerialWaitSourceEvidence(snapshot);
  if (
    isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
      sourceEvidence.coordinatorOperation,
    ) === true
  ) {
    return PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_MODE
      .COORDINATOR_OPERATION;
  }
  if (
    isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
      buildPriorityRecoverySyntheticSerialWaitWorkflowSiblingOperation(
        sourceEvidence,
        operationSnapshotsByPartitionId,
      ),
    ) === true
  ) {
    return PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_MODE
      .WORKFLOW_SUMMARY_SIBLING;
  }
  if (
    isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
      buildPriorityRecoverySyntheticSerialWaitWorkflowSummaryOperation(
        sourceEvidence,
      ),
    ) === true
  ) {
    return PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_MODE
      .WORKFLOW_SUMMARY_OVERLAY;
  }
  return PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_MODE.NONE;
}

function resolvePriorityRecoverySyntheticSerialWaitSourceContext(
  snapshot,
  operationSnapshotsByPartitionId = new Map(),
) {
  const sourceEvidence =
    buildPriorityRecoverySyntheticSerialWaitSourceEvidence(snapshot);
  const sourceMode =
    resolvePriorityRecoverySyntheticSerialWaitSourceMode(
      snapshot,
      operationSnapshotsByPartitionId,
    );
  if (
    sourceMode ===
    PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_MODE.COORDINATOR_OPERATION
  ) {
    return sourceEvidence.coordinatorOperation;
  }
  if (
    sourceMode ===
    PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_MODE
      .WORKFLOW_SUMMARY_SIBLING
  ) {
    return buildPriorityRecoverySyntheticSerialWaitWorkflowSiblingOperation(
      sourceEvidence,
      operationSnapshotsByPartitionId,
    );
  }
  if (
    sourceMode ===
    PRIORITY_RECOVERY_SYNTHETIC_SERIAL_WAIT_SOURCE_MODE
      .WORKFLOW_SUMMARY_OVERLAY
  ) {
    return buildPriorityRecoverySyntheticSerialWaitWorkflowSummaryOperation(
      sourceEvidence,
    );
  }
  return null;
}

function buildPriorityRecoverySubordinatedSerialWaitSourcePartitionIdSet(
  snapshots = [],
) {
  const subordinatedPartitionIds = new Set();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    if (isPriorityRecoverySpreadProgressDecisionSnapshot(snapshot) !== true) {
      continue;
    }
    const partitionId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    for (const sourcePartitionId of normalizePriorityRecoveryStringList(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SERIAL_WAIT_PARTITION_IDS
      ],
    )) {
      if (
        sourcePartitionId.length > NUM.ZERO &&
        sourcePartitionId !== partitionId
      ) {
        subordinatedPartitionIds.add(sourcePartitionId);
      }
    }
  }
  return subordinatedPartitionIds;
}

function buildPriorityRecoverySyntheticSerialWaitSourceContexts(
  snapshots = [],
  options = {},
) {
  const operationSnapshotsByPartitionId =
    buildPriorityRecoveryDecisionSnapshotOperationSnapshotsByPartitionId(
      snapshots,
    );
  const latestSnapshots = selectPriorityRecoveryDecisionSnapshotSummarySnapshots(
    snapshots,
  );
  const subordinatedSourcePartitionIds =
    buildPriorityRecoverySubordinatedSerialWaitSourcePartitionIdSet(
      latestSnapshots,
    );
  const suppressSubordinatedSources =
    options?.allowSubordinatedSourcePartitions !== true;
  const serialWaitOperationContexts = [];
  for (const snapshot of latestSnapshots) {
    const partitionId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    if (
      suppressSubordinatedSources === true &&
      subordinatedSourcePartitionIds.has(partitionId)
    ) {
      continue;
    }
    const operationContext =
      resolvePriorityRecoverySyntheticSerialWaitSourceContext(
        snapshot,
        operationSnapshotsByPartitionId,
      );
    if (!operationContext) {
      continue;
    }
    serialWaitOperationContexts.push(operationContext);
  }
  return serialWaitOperationContexts;
}

function isPriorityRecoveryOperationWorkflowProgressAdvancementSnapshot(
  snapshot,
) {
  const progress =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROGRESS] &&
    typeof snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROGRESS] ===
      TYPEOF.OBJECT ?
      snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PROGRESS] :
      null;
  const actuation =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ACTUATION] &&
    typeof snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ACTUATION] ===
      TYPEOF.OBJECT ?
      snapshot[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ACTUATION] :
      null;
  return (
    progress?.currentOwner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
    actuation?.owner ===
      PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_IN_FLIGHT_ACTIONS.has(
      progress?.nextRequiredAction,
    ) &&
    progress?.blockingBoundary ===
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
    progress?.waitMode === PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN
  );
}

function isPriorityRecoveryRetainedSerialWaitCarrierDecisionSnapshot(
  snapshot,
) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.BLOCKER_REASONS],
  );
  const serialWaitPartitionIds = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SERIAL_WAIT_PARTITION_IDS
    ],
  );
  const serialWaitOperationIds = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SERIAL_WAIT_OPERATION_IDS
    ],
  );
  return (
    blockerReasons.length === NUM.ZERO &&
    hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) === true &&
    isPriorityRecoveryOperationWorkflowProgressAdvancementSnapshot(snapshot) !==
      true &&
    (
      serialWaitPartitionIds.length > NUM.ZERO ||
      serialWaitOperationIds.length > NUM.ZERO
    )
  );
}

function isPriorityRecoverySyntheticSerialWaitOnlyDecisionSnapshot(
  snapshot,
) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.BLOCKER_REASONS],
  );
  return (
    blockerReasons.length === NUM.ONE &&
    blockerReasons[NUM.ZERO] ===
      PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT &&
    hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) !== true
  );
}

function hasPriorityRecoverySerialWaitSourceReferences(snapshot) {
  const serialWaitPartitionIds = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SERIAL_WAIT_PARTITION_IDS
    ],
  );
  const serialWaitOperationIds = normalizePriorityRecoveryStringList(
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SERIAL_WAIT_OPERATION_IDS
    ],
  );
  return (
    serialWaitPartitionIds.length > NUM.ZERO ||
    serialWaitOperationIds.length > NUM.ZERO
  );
}

function hasPriorityRecoveryLiveSerialWaitSourcePartition(
  snapshot,
  latestSnapshots = [],
  operationSnapshotsByPartitionId = new Map(),
) {
  const sourceOperationIdSet = new Set(
    normalizePriorityRecoveryStringList(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SERIAL_WAIT_OPERATION_IDS
      ],
    ),
  );
  const sourcePartitionIdSet = new Set(
    normalizePriorityRecoveryStringList(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.SERIAL_WAIT_PARTITION_IDS
      ],
    ),
  );
  if (sourcePartitionIdSet.size === NUM.ZERO) {
    return false;
  }
  for (const latestSnapshot of Array.isArray(latestSnapshots) ?
    latestSnapshots :
    []) {
    const partitionId = String(
      latestSnapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    if (
      partitionId.length === NUM.ZERO ||
      !sourcePartitionIdSet.has(partitionId) ||
      isPriorityRecoverySpreadProgressDecisionSnapshot(latestSnapshot) === true
    ) {
      continue;
    }
    const sourceContext =
      resolvePriorityRecoverySyntheticSerialWaitSourceContext(
        latestSnapshot,
        operationSnapshotsByPartitionId,
      );
    const sourceOperationId = String(
      sourceContext?.operationId || LOCAL_STR_EMPTY,
    ).trim();
    if (
      isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
        sourceContext,
      ) &&
      sourceOperationId.length > NUM.ZERO &&
      sourceOperationIdSet.has(sourceOperationId)
    ) {
      return true;
    }
  }
  return false;
}

function normalizePriorityRecoverySyntheticSerialWaitSnapshots(snapshots = []) {
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : [];
  const latestSnapshots =
    selectPriorityRecoveryDecisionSnapshotSummarySnapshots(
      normalizedSnapshots,
    );
  const operationSnapshotsByPartitionId =
    buildPriorityRecoveryDecisionSnapshotOperationSnapshotsByPartitionId(
      normalizedSnapshots,
    );
  const syntheticSerialWaitSourceContexts =
    buildPriorityRecoverySyntheticSerialWaitSourceContexts(
      normalizedSnapshots,
    );
  const retainedSerialWaitSourceContexts =
    buildPriorityRecoverySyntheticSerialWaitSourceContexts(
      normalizedSnapshots,
      {
        allowSubordinatedSourcePartitions: true,
      },
    );
  if (
    syntheticSerialWaitSourceContexts.length === NUM.ZERO &&
    retainedSerialWaitSourceContexts.length === NUM.ZERO
  ) {
    return normalizedSnapshots;
  }
  return normalizedSnapshots.map((snapshot) => {
    const syntheticNoOperationSnapshot =
      isPriorityRecoverySyntheticNoOperationDecisionSnapshot(snapshot) ===
      true;
    const preservedSyntheticSerialWaitSnapshot =
      isPriorityRecoverySyntheticSerialWaitOnlyDecisionSnapshot(snapshot) ===
        true &&
      hasPriorityRecoverySerialWaitSourceReferences(snapshot) === true &&
      hasPriorityRecoveryLiveSerialWaitSourcePartition(
        snapshot,
        latestSnapshots,
        operationSnapshotsByPartitionId,
      ) === true;
    const retainedSerialWaitCarrierSnapshot =
      isPriorityRecoveryRetainedSerialWaitCarrierDecisionSnapshot(snapshot) ===
        true &&
      isPriorityRecoverySpreadProgressDecisionSnapshot(snapshot) !== true;
    if (
      syntheticNoOperationSnapshot !== true &&
      retainedSerialWaitCarrierSnapshot !== true
    ) {
      return snapshot;
    }
    const serialWaitSourceContexts =
      retainedSerialWaitCarrierSnapshot === true ||
        preservedSyntheticSerialWaitSnapshot === true ?
        retainedSerialWaitSourceContexts :
        syntheticSerialWaitSourceContexts;
    const serialWaitOperationContexts =
      buildPriorityRecoverySerialWaitOperationContexts({
        partitionId:
          snapshot?.[
            PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID
          ],
        serialLaneOperationContexts: serialWaitSourceContexts,
        eligibleTargetNodeIds:
          snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.ADMISSION]
            ?.effectiveEligibleNodeIds,
      });
    if (serialWaitOperationContexts.length === NUM.ZERO) {
      return isPriorityRecoverySyntheticSerialWaitOnlyDecisionSnapshot(
        snapshot,
      ) ?
        releasePriorityRecoverySerialWaitSnapshot(snapshot) :
        snapshot;
    }
    return buildPriorityRecoverySyntheticSerialWaitSnapshot(
      snapshot,
      serialWaitOperationContexts,
    );
  });
}

function normalizePriorityRecoveryReleasedSerialWaitSnapshots(snapshots = []) {
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : [];
  const releasedFreshnessByOperationId =
    buildPriorityRecoveryReleasedSerialWaitFreshnessByOperationId(
      normalizedSnapshots,
    );
  if (releasedFreshnessByOperationId.size === NUM.ZERO) {
    return normalizedSnapshots;
  }
  return normalizedSnapshots.map((snapshot) => {
    return shouldReleasePriorityRecoverySerialWaitSnapshot(
      snapshot,
      releasedFreshnessByOperationId,
    ) ?
      releasePriorityRecoverySerialWaitSnapshot(snapshot) :
      snapshot;
  });
}

const PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE_TABLE = Object.freeze([
  Object.freeze({
    stage:
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE.SYNTHETIC_NO_OPERATION,
    normalize: filterPriorityRecoverySyntheticNoOperationConflicts,
  }),
  Object.freeze({
    stage:
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE
        .STALE_OPERATION_PROGRESS,
    normalize: filterPriorityRecoveryStaleOperationProgressConflicts,
  }),
  Object.freeze({
    stage:
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE.SYNTHETIC_SERIAL_WAIT,
    normalize: normalizePriorityRecoverySyntheticSerialWaitSnapshots,
  }),
  Object.freeze({
    stage:
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE.RELEASED_SERIAL_WAIT,
    normalize: normalizePriorityRecoveryReleasedSerialWaitSnapshots,
  }),
]);

function filterPriorityRecoveryDecisionSnapshotConflicts(snapshots = []) {
  return PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE_TABLE.reduce(
    (normalizedSnapshots, stage) => stage.normalize(normalizedSnapshots),
    snapshots,
  );
}

export {
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE_TABLE,
  buildPriorityRecoverySyntheticSerialWaitSourceContexts,
  filterPriorityRecoveryDecisionSnapshotConflicts,
  normalizePriorityRecoveryReleasedSerialWaitSnapshots,
  normalizePriorityRecoverySyntheticSerialWaitSnapshots,
};
