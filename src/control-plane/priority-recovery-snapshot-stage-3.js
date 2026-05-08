import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
} from './priority-recovery-diagnostics-constants.js';
import {buildPriorityRecoveryCompletion} from './priority-recovery-completion.js';
import {isPriorityRecoveryEmergencyPartition} from './priority-recovery-admission-constants.js';
import {
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {
  OperationType,
  isReplaceRemoveDispatchPhase,
} from '../rebalancer/replica-status.js';
import {
  LOCAL_EMPTY_LIST,
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD,
} from './priority-recovery-snapshot-stage-shared.js';
import {filterPriorityRecoveryTrackedPartitionIds, isPriorityRecoverySpreadSatisfyingOperationContext, isPriorityRecoveryTrackedPartitionId, resolvePriorityRecoverySemanticState} from './priority-recovery-snapshot-stage-1.js';
import {buildPriorityRecoveryReleasedSerialWaitFreshnessByOperationId, buildReleasedPriorityRecoverySerialWaitAssessment, filterPriorityRecoveryStaleOperationProgressConflicts, filterPriorityRecoverySyntheticNoOperationConflicts, hasPriorityRecoveryDecisionSnapshotOperationEvidence, isPriorityRecoverySpreadProgressDecisionSnapshot, isPriorityRecoverySyntheticNoOperationDecisionSnapshot, resolvePriorityRecoveryDecisionSnapshotAdmission, resolvePriorityRecoveryDecisionSnapshotCapturedAt, resolvePriorityRecoveryDecisionSnapshotFreshnessMs, resolvePriorityRecoveryDecisionSnapshotOperationContexts, resolvePriorityRecoveryDecisionSnapshotProgressFreshnessMs, shouldReleasePriorityRecoverySerialWaitSnapshot} from './priority-recovery-snapshot-stage-2.js';
import {isPriorityRecoveryOperationContextTerminal} from './priority-recovery-snapshot-stage-6.js';
import {buildPriorityRecoveryConditionsContract} from './priority-recovery-snapshot-stage-7.js';
import {buildPriorityRecoveryActuationContract} from './priority-recovery-snapshot-stage-8.js';
import {buildPriorityRecoveryPartitionObservation, buildPriorityRecoveryProgressContract} from './priority-recovery-snapshot-stage-9.js';

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

function resolvePriorityRecoveryDecisionSnapshotCoordinator(
  snapshot,
  options = {},
) {
  return {
    ...(snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR] ||
      {}),
    ...(options.coordinator && typeof options.coordinator === TYPEOF.OBJECT ?
      options.coordinator :
      {}),
  };
}

function rebuildPriorityRecoveryDecisionSnapshot(
  snapshot,
  assessment,
  options = {},
) {
  const operationContexts =
    resolvePriorityRecoveryDecisionSnapshotOperationContexts(options);
  const admission = resolvePriorityRecoveryDecisionSnapshotAdmission(snapshot);
  const capturedAt = resolvePriorityRecoveryDecisionSnapshotCapturedAt(snapshot);
  const completion = buildPriorityRecoveryCompletion({
    assessment,
    authoritativeOperationReadDeferred: false,
  });
  const observation = buildPriorityRecoveryPartitionObservation({
    capturedAt,
    assessment,
    completion,
    operationContexts,
    authoritativeOperationReadDeferred: false,
  });
  const conditions = buildPriorityRecoveryConditionsContract({
    observation,
    assessment,
    admission,
    latestOperationContext: null,
    logsTable: null,
    authoritativeOperationReadDeferred: false,
  });
  const actuation = buildPriorityRecoveryActuationContract({
    completion,
    observation,
    assessment,
    admission,
    conditions,
    operationContexts,
    latestOperationContext: null,
    logsTable: null,
    nowMs:
      observation?.provenance?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CAPTURED_AT
      ],
    authoritativeOperationReadDeferred: false,
  });
  const progress = buildPriorityRecoveryProgressContract({
    completion,
    observation,
    assessment,
    admission,
    conditions,
    actuation,
    operationContexts,
    latestOperationContext: null,
    logsTable: null,
    nowMs:
      observation?.provenance?.[
        PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD.CAPTURED_AT
      ],
    authoritativeOperationReadDeferred: false,
  });
  return {
    ...snapshot,
    semanticState: assessment.semanticState,
    blockerReasons: assessment.blockerReasons,
    completion,
    observation,
    conditions,
    actuation,
    progress,
    coordinator: resolvePriorityRecoveryDecisionSnapshotCoordinator(
      snapshot,
      options,
    ),
  };
}

function releasePriorityRecoverySerialWaitSnapshot(snapshot) {
  const assessment =
    buildReleasedPriorityRecoverySerialWaitAssessment(snapshot);
  return rebuildPriorityRecoveryDecisionSnapshot(snapshot, assessment, {
    coordinator: {
      serialWaitOperationCount: NUM.ZERO,
      serialWaitOperationIds: LOCAL_EMPTY_LIST,
      serialWaitPartitionIds: LOCAL_EMPTY_LIST,
    },
  });
}

function buildPriorityRecoverySyntheticSerialWaitAssessment(
  snapshot,
  serialWaitOperationContexts,
) {
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
    PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
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
    serialWaitOperationContexts,
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

function buildPriorityRecoverySyntheticSerialWaitSnapshot(
  snapshot,
  serialWaitOperationContexts,
) {
  const assessment =
    buildPriorityRecoverySyntheticSerialWaitAssessment(
      snapshot,
      serialWaitOperationContexts,
    );
  return rebuildPriorityRecoveryDecisionSnapshot(snapshot, assessment, {
    coordinator: {
      serialWaitOperationCount: serialWaitOperationContexts.length,
      serialWaitOperationIds:
        serialWaitOperationContexts.map(
          (context) => context.operationId,
        ),
      serialWaitPartitionIds: normalizePriorityRecoveryStringList(
        serialWaitOperationContexts.map(
          (context) => context.partitionId,
        ),
      ),
    },
  });
}

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

function buildPriorityRecoveryDecisionSnapshotOperationSnapshotsByPartitionId(
  snapshots = [],
) {
  const latestSnapshotByPartitionId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const partitionId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    const operationId = String(
      snapshot?.operationId || LOCAL_STR_EMPTY,
    ).trim();
    if (
      partitionId.length === NUM.ZERO ||
      operationId.length === NUM.ZERO
    ) {
      continue;
    }
    const snapshotByOperationId =
      latestSnapshotByPartitionId.get(partitionId) || new Map();
    const currentSnapshot = snapshotByOperationId.get(operationId);
    if (
      !currentSnapshot ||
      comparePriorityRecoveryDecisionSnapshotSummarySnapshots(
        currentSnapshot,
        snapshot,
      ) < NUM.ZERO
    ) {
      snapshotByOperationId.set(operationId, snapshot);
    }
    if (!latestSnapshotByPartitionId.has(partitionId)) {
      latestSnapshotByPartitionId.set(partitionId, snapshotByOperationId);
    }
  }
  return latestSnapshotByPartitionId;
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

function resolvePriorityRecoveryDecisionSnapshotSummarySortTimestamp(snapshot) {
  const progressFreshnessMs =
    resolvePriorityRecoveryDecisionSnapshotProgressFreshnessMs(snapshot);
  return progressFreshnessMs > NUM.ZERO ?
    progressFreshnessMs :
    resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot);
}

function resolvePriorityRecoveryDecisionSnapshotSummaryEvidenceRank(snapshot) {
  if (
    isPriorityRecoverySpreadProgressDecisionSnapshot(snapshot) === true &&
    hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) === true
  ) {
    return NUM.TWO;
  }
  return hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) ===
    true ?
    NUM.ONE :
    NUM.ZERO;
}

function comparePriorityRecoveryDecisionSnapshotSummarySnapshots(
  left,
  right,
  options = {},
) {
  const leftEpoch = normalizePriorityRecoveryInteger(left?.epoch) ??
    NUM.NEGATIVE_ONE;
  const rightEpoch = normalizePriorityRecoveryInteger(right?.epoch) ??
    NUM.NEGATIVE_ONE;
  if (leftEpoch !== rightEpoch) {
    return leftEpoch - rightEpoch;
  }
  if (options.prioritizeOperationSpreadProgress === true) {
    const leftEvidenceRank =
      resolvePriorityRecoveryDecisionSnapshotSummaryEvidenceRank(left);
    const rightEvidenceRank =
      resolvePriorityRecoveryDecisionSnapshotSummaryEvidenceRank(right);
    if (leftEvidenceRank !== rightEvidenceRank) {
      return leftEvidenceRank - rightEvidenceRank;
    }
  }
  const leftTimestamp =
    resolvePriorityRecoveryDecisionSnapshotSummarySortTimestamp(left);
  const rightTimestamp =
    resolvePriorityRecoveryDecisionSnapshotSummarySortTimestamp(right);
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  return String(left?.correlationKey || LOCAL_STR_EMPTY).localeCompare(
    String(right?.correlationKey || LOCAL_STR_EMPTY),
  );
}

function selectPriorityRecoveryDecisionSnapshotSummarySnapshots(
  snapshots = [],
  options = {},
) {
  const latestSnapshotByPartitionId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const partitionId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const currentSnapshot = latestSnapshotByPartitionId.get(partitionId);
    if (
      !currentSnapshot ||
      comparePriorityRecoveryDecisionSnapshotSummarySnapshots(
        currentSnapshot,
        snapshot,
        options,
      ) < NUM.ZERO
    ) {
      latestSnapshotByPartitionId.set(partitionId, snapshot);
    }
  }
  return [...latestSnapshotByPartitionId.values()].sort((left, right) =>
    String(
      left?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).localeCompare(
      String(
        right?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
          LOCAL_STR_EMPTY,
      ),
    ),
  );
}

function isPriorityRecoveryOrdinarySerialLanePartitionId(partitionId) {
  return (
    isPriorityRecoveryTrackedPartitionId(partitionId) &&
    isPriorityRecoveryEmergencyPartition(partitionId) !== true
  );
}

function isPriorityRecoveryOrdinarySerialLaneOperationContext(
  operationContext,
) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return false;
  }
  const partitionId = String(operationContext.partitionId || '').trim();
  if (!isPriorityRecoveryOrdinarySerialLanePartitionId(partitionId)) {
    return false;
  }
  if (isPriorityRecoveryOperationContextTerminal(operationContext)) {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  if (operationType === OperationType.ADD) {
    return true;
  }
  return (
    operationType === OperationType.REPLACE &&
    isReplaceRemoveDispatchPhase(operationContext) !== true
  );
}

function isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
  operationContext,
) {
  if (!operationContext || typeof operationContext !== TYPEOF.OBJECT) {
    return false;
  }
  const partitionId = String(operationContext.partitionId || '').trim();
  if (
    !isPriorityRecoveryTrackedPartitionId(partitionId) ||
    isPriorityRecoveryOperationContextTerminal(operationContext)
  ) {
    return false;
  }
  const operationType = String(operationContext.type || '').toUpperCase();
  if (operationType === OperationType.ADD) {
    return true;
  }
  return (
    operationType === OperationType.REPLACE &&
    isReplaceRemoveDispatchPhase(operationContext) !== true
  );
}

function buildPriorityRecoveryOrdinarySerialLaneOperationContexts(
  replicaOperationContexts,
) {
  const byPartitionId =
    replicaOperationContexts?.byPartitionId &&
    typeof replicaOperationContexts.byPartitionId === TYPEOF.OBJECT ?
      replicaOperationContexts.byPartitionId :
      {};
  return Object.values(byPartitionId)
    .flatMap((operationContexts) =>
      Array.isArray(operationContexts) ? operationContexts : [],
    )
    .filter((operationContext) =>
      isPriorityRecoveryOrdinarySerialLaneOperationContext(operationContext),
    )
    .sort((left, right) =>
      String(left.operationId || LOCAL_STR_EMPTY).localeCompare(
        String(right.operationId || LOCAL_STR_EMPTY),
      ),
    );
}

function buildPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContexts(
  replicaOperationContexts,
) {
  const byPartitionId =
    replicaOperationContexts?.byPartitionId &&
    typeof replicaOperationContexts.byPartitionId === TYPEOF.OBJECT ?
      replicaOperationContexts.byPartitionId :
      {};
  return Object.values(byPartitionId)
    .flatMap((operationContexts) =>
      Array.isArray(operationContexts) ? operationContexts : [],
    )
    .filter((operationContext) =>
      isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
        operationContext,
      ),
    )
    .sort((left, right) =>
      String(left.operationId || LOCAL_STR_EMPTY).localeCompare(
        String(right.operationId || LOCAL_STR_EMPTY),
      ),
    );
}

function buildPriorityRecoverySerialWaitOperationContexts(options = {}) {
  const partitionId = String(options.partitionId || LOCAL_STR_EMPTY).trim();
  if (!isPriorityRecoveryOrdinarySerialLanePartitionId(partitionId)) {
    return [];
  }
  const eligibleTargetNodeIds = normalizePriorityRecoveryStringList(
    options.eligibleTargetNodeIds,
  );
  return (Array.isArray(options.serialLaneOperationContexts) ?
    options.serialLaneOperationContexts :
    []).filter((operationContext) =>
    isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext(
      operationContext,
    ) &&
      isPriorityRecoverySpreadSatisfyingOperationContext(operationContext, {
        eligibleTargetNodeIds,
      }) !== true &&
      String(operationContext.partitionId || LOCAL_STR_EMPTY).trim() !==
        partitionId,
  );
}

function buildTrackedPriorityRecoveryDecisionSemanticStateMap(
  partitionIdsBySemanticState = null,
) {
  if (
    !partitionIdsBySemanticState ||
    typeof partitionIdsBySemanticState !== TYPEOF.OBJECT
  ) {
    return null;
  }
  const trackedPartitionIdsBySemanticState = {};
  for (const [semanticStateId, partitionIds] of Object.entries(
    partitionIdsBySemanticState,
  )) {
    trackedPartitionIdsBySemanticState[semanticStateId] =
      filterPriorityRecoveryTrackedPartitionIds(partitionIds);
  }
  return Object.freeze(trackedPartitionIdsBySemanticState);
}

function hasPriorityRecoveryDecisionSnapshotOwnField(snapshot, fieldName) {
  return (
    snapshot &&
    typeof snapshot === TYPEOF.OBJECT &&
    Object.prototype.hasOwnProperty.call(snapshot, fieldName)
  );
}

function resolvePriorityRecoverySourcePartitionStateIds(
  partitionId,
  partitionIdsByState = null,
  orderedStateIds = [],
) {
  const normalizedPartitionId = String(partitionId || LOCAL_STR_EMPTY).trim();
  if (
    normalizedPartitionId.length === NUM.ZERO ||
    !partitionIdsByState ||
    typeof partitionIdsByState !== TYPEOF.OBJECT
  ) {
    return [];
  }
  return orderedStateIds.filter((stateId) =>
    normalizePriorityRecoveryStringList(
      partitionIdsByState[stateId],
    ).includes(normalizedPartitionId),
  );
}

function isPriorityRecoverySourcePartitionStateMap(
  partitionIdsByState = null,
  orderedStateIds = [],
) {
  if (!partitionIdsByState || typeof partitionIdsByState !== TYPEOF.OBJECT) {
    return false;
  }
  return orderedStateIds.some((stateId) =>
    Object.prototype.hasOwnProperty.call(partitionIdsByState, stateId),
  );
}

function resolvePriorityRecoveryFilteredSnapshotBlockerReasons(
  snapshot,
  partitionId,
  sourceDecisionSnapshots = null,
) {
  if (
    hasPriorityRecoveryDecisionSnapshotOwnField(
      snapshot,
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.BLOCKER_REASONS,
    )
  ) {
    return normalizePriorityRecoveryStringList(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.BLOCKER_REASONS],
    );
  }
  const sourceBlockerPartitionIdsByReason =
    sourceDecisionSnapshots?.blockerPartitionIdsByReason;
  if (
    isPriorityRecoverySourcePartitionStateMap(
      sourceBlockerPartitionIdsByReason,
      PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
    ) !== true
  ) {
    return [];
  }
  return resolvePriorityRecoverySourcePartitionStateIds(
    partitionId,
    sourceBlockerPartitionIdsByReason,
    PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  );
}

export {
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_CONFLICT_STAGE_TABLE,
  buildPriorityRecoveryOrdinarySerialLaneOperationContexts,
  buildPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContexts,
  buildPriorityRecoverySerialWaitOperationContexts,
  buildPriorityRecoverySyntheticSerialWaitAssessment,
  buildPriorityRecoverySyntheticSerialWaitSnapshot,
  buildPriorityRecoverySyntheticSerialWaitSourceContexts,
  buildTrackedPriorityRecoveryDecisionSemanticStateMap,
  comparePriorityRecoveryDecisionSnapshotSummarySnapshots,
  filterPriorityRecoveryDecisionSnapshotConflicts,
  hasPriorityRecoveryDecisionSnapshotOwnField,
  isPriorityRecoveryOrdinarySerialLaneOperationContext,
  isPriorityRecoveryOrdinarySerialLanePartitionId,
  isPriorityRecoveryWorkflowProgressSerialWaitSourceOperationContext,
  isPriorityRecoverySourcePartitionStateMap,
  normalizePriorityRecoveryReleasedSerialWaitSnapshots,
  normalizePriorityRecoverySyntheticSerialWaitSnapshots,
  rebuildPriorityRecoveryDecisionSnapshot,
  releasePriorityRecoverySerialWaitSnapshot,
  resolvePriorityRecoveryDecisionSnapshotCoordinator,
  resolvePriorityRecoveryDecisionSnapshotSummarySortTimestamp,
  resolvePriorityRecoveryFilteredSnapshotBlockerReasons,
  resolvePriorityRecoverySourcePartitionStateIds,
  selectPriorityRecoveryDecisionSnapshotSummarySnapshots,
};
