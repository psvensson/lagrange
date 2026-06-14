import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
} from './priority-recovery-diagnostics-constants.js';
import {buildPriorityRecoveryCompletion} from './priority-recovery-completion.js';
import {normalizePriorityRecoveryStringList} from './priority-recovery-helpers.js';
import {
  LOCAL_EMPTY_LIST,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FRESHNESS_FIELD,
} from './priority-recovery-snapshot-contract.js';
import {resolvePriorityRecoverySemanticState} from './priority-recovery-snapshot-ingress.js';
import {buildReleasedPriorityRecoverySerialWaitAssessment, resolvePriorityRecoveryDecisionSnapshotAdmission, resolvePriorityRecoveryDecisionSnapshotCapturedAt, resolvePriorityRecoveryDecisionSnapshotOperationContexts} from './priority-recovery-snapshot-eligibility.js';
import {buildPriorityRecoveryConditionsContract} from './priority-recovery-snapshot-observation.js';
import {buildPriorityRecoveryActuationContract} from './priority-recovery-snapshot-actuation.js';
import {buildPriorityRecoveryPartitionObservation, buildPriorityRecoveryProgressContract} from './priority-recovery-snapshot-burndown.js';

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

export {
  buildPriorityRecoverySyntheticSerialWaitAssessment,
  buildPriorityRecoverySyntheticSerialWaitSnapshot,
  rebuildPriorityRecoveryDecisionSnapshot,
  releasePriorityRecoverySerialWaitSnapshot,
  resolvePriorityRecoveryDecisionSnapshotCoordinator,
};
