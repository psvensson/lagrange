import {
  NUM,
  TYPEOF,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from './priority-recovery-diagnostics-constants.js';
import {
  buildPriorityRecoveryCorrelationKey,
  normalizePriorityRecoveryInteger,
} from './priority-recovery-helpers.js';
import {normalizePriorityRecoverySnapshotFromOperationOwnerOutcome} from './priority-recovery-operation-owner-observation.js';
import {
  PRIORITY_RECOVERY_SNAPSHOT_LITERAL,
  PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from './priority-recovery-snapshot-stage-shared.js';
import {isPriorityRecoverySnapshotObject} from './priority-recovery-snapshot-stage-9.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_REASON_CODE_VALUES,
} from '../rebalancer/operation-workflow-owner-constants.js';

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE =
  Object.freeze({
    ABSENT: 'diagnostic_dispatch_pending_owner_absent',
    ADVANCE_EXISTING_OPERATION:
      'diagnostic_dispatch_pending_owner_advance_existing_operation',
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_WORKFLOW_STEPS =
  Object.freeze(new Set([WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_ACTUATION_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
    PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_PROGRESS_ACTIONS =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_EXCLUDED_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_STATE =
  Object.freeze({
    ALLOWED: 'diagnostic_dispatch_pending_owner_allowed',
    PENDING_COORDINATION_MISMATCH:
      'diagnostic_dispatch_pending_owner_pending_coordination_mismatch',
    EXCLUDED: 'diagnostic_dispatch_pending_owner_excluded',
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_STATE.ALLOWED,
    PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_STATE
      .PENDING_COORDINATION_MISMATCH,
  ]));

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_STATE
          .PENDING_COORDINATION_MISMATCH,
      matches: (evidence) =>
        evidence.semanticState ===
          PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH &&
        evidence.workflowStep === WORKFLOW_STEP.PENDING,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_STATE
          .EXCLUDED,
      matches: (evidence) =>
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_EXCLUDED_STATES
          .has(evidence.semanticState),
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_STATE
          .ALLOWED,
      matches: () => true,
    }),
  ]);

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE =
  Object.freeze({
    COMPATIBLE: 'diagnostic_dispatch_pending_target_compatible',
    MISMATCH: 'diagnostic_dispatch_pending_target_mismatch',
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.COMPATIBLE,
      matches: (evidence) => evidence.workflowStep === WORKFLOW_STEP.PENDING,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.COMPATIBLE,
      matches: (evidence) =>
        evidence.workflowStep === WORKFLOW_STEP.SENDING &&
        evidence.targetVisibilityState ===
          PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ABSENT,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.COMPATIBLE,
      matches: (evidence) =>
        evidence.workflowStep === WORKFLOW_STEP.SENDING &&
        evidence.targetVisibilityState ===
          PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.NON_ACTIVE &&
        evidence.targetServiceTerminalState !==
          PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.MISMATCH,
      matches: () => true,
    }),
  ]);

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ABSENT =
  Object.freeze({
    state: PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE.ABSENT,
  });

const PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE
          .ADVANCE_EXISTING_OPERATION,
      matches: (evidence) =>
        evidence.operationContextAvailable === true &&
        evidence.operationOwnerObservationAbsent === true &&
        evidence.ownerDiagnosticAllowed === true &&
        evidence.workflowStepDispatchPending === true &&
        evidence.operationStatusPending === true &&
        evidence.targetVisibilityDispatchPending === true &&
        evidence.actuationOwnerWorkflow === true &&
        evidence.actuationStateDispatchPending === true &&
        evidence.actuationPhaseDispatchPending === true &&
        evidence.progressOwnerWorkflow === true &&
        evidence.progressDispatchPendingAction === true &&
        evidence.progressBoundaryWorkflow === true &&
        evidence.progressWaitEventDriven === true &&
        evidence.progressPhaseDispatchPending === true,
      build: (evidence) => Object.freeze({
        owner: OPERATION_WORKFLOW_OWNER,
        boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
        state:
          PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE
            .ADVANCE_EXISTING_OPERATION,
        outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
        nextRequiredAction:
          OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
        effectCommand:
          OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
            .ADVANCE_EXISTING_OPERATION_COMMAND,
        reasons: Object.freeze([
          OPERATION_WORKFLOW_REASON_CODE_VALUES
            .WORKFLOW_TRANSITION_AVAILABLE,
        ]),
        correlationKey: evidence.correlationKey,
        sourceRevision: evidence.sourceRevision,
      }),
    }),
    Object.freeze({
      state: PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_STATE.ABSENT,
      matches: () => true,
      build: () => PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ABSENT,
    }),
  ]);

function normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
  snapshot = null,
  operationOwnerOutcome = null,
) {
  return normalizePriorityRecoverySnapshotFromOperationOwnerOutcome(
    snapshot,
    operationOwnerOutcome,
  );
}

function normalizePriorityRecoveryDiagnosticOwnerText(value, fallback) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    fallback;
}

function resolvePriorityRecoveryDispatchPendingDiagnosticTargetState(
  evidence,
) {
  return PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_TABLE
    .find((entry) => entry.matches(evidence)).state;
}

function resolvePriorityRecoveryDispatchPendingDiagnosticOwnerAllowedState(
  evidence,
) {
  return PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_TABLE
    .find((entry) => entry.matches(evidence)).state;
}

function resolvePriorityRecoveryDiagnosticOwnerRevision(
  snapshot,
  operationContext,
) {
  const revision = normalizePriorityRecoveryInteger(
    operationContext?.updatedAtMs ||
      operationContext?.createdAtMs ||
      snapshot?.capturedAt,
  );
  return Number.isFinite(revision) ?
    String(revision) :
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE;
}

function buildPriorityRecoveryDispatchPendingDiagnosticOwnerEvidence(
  snapshot,
  operationContext,
) {
  const workflowStep = String(
    operationContext?.workflowStep || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  ).toUpperCase();
  const operationStatus = String(
    operationContext?.status || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  ).toLowerCase();
  const targetVisibilityState = normalizePriorityRecoveryDiagnosticOwnerText(
    operationContext?.targetVisibilityState,
    PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  );
  const targetServiceTerminalState =
    normalizePriorityRecoveryDiagnosticOwnerText(
      operationContext?.targetServiceTerminalState,
      PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
    );
  const targetState =
    resolvePriorityRecoveryDispatchPendingDiagnosticTargetState(
      Object.freeze({
        workflowStep,
        targetVisibilityState,
        targetServiceTerminalState,
      }),
    );
  const ownerAllowedState =
    resolvePriorityRecoveryDispatchPendingDiagnosticOwnerAllowedState(
      Object.freeze({
        semanticState: snapshot?.semanticState,
        workflowStep,
      }),
    );
  return Object.freeze({
    operationContextAvailable:
      operationContext && typeof operationContext === TYPEOF.OBJECT,
    operationOwnerObservationAbsent:
      !isPriorityRecoverySnapshotObject(snapshot?.operationOwnerObservation),
    ownerDiagnosticAllowed:
      PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ALLOWED_STATES
        .has(ownerAllowedState),
    workflowStepDispatchPending:
      PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_WORKFLOW_STEPS.has(
        workflowStep,
      ),
    operationStatusPending: operationStatus === ReplicaStatus.PENDING,
    targetVisibilityDispatchPending:
      targetState ===
        PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_TARGET_STATE.COMPATIBLE,
    actuationOwnerWorkflow:
      snapshot?.actuation?.owner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    actuationStateDispatchPending:
      PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_ACTUATION_STATES.has(
        snapshot?.actuation?.state,
      ),
    actuationPhaseDispatchPending:
      snapshot?.actuation?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    progressOwnerWorkflow:
      snapshot?.progress?.currentOwner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    progressDispatchPendingAction:
      PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_PROGRESS_ACTIONS.has(
        snapshot?.progress?.nextRequiredAction,
      ),
    progressBoundaryWorkflow:
      snapshot?.progress?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
    progressWaitEventDriven:
      snapshot?.progress?.waitMode ===
        PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    progressPhaseDispatchPending:
      snapshot?.progress?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    correlationKey: normalizePriorityRecoveryDiagnosticOwnerText(
      snapshot?.correlationKey,
      buildPriorityRecoveryCorrelationKey(
        snapshot?.partitionId,
        snapshot?.publicationEpoch,
        operationContext?.operationId,
      ),
    ),
    sourceRevision: resolvePriorityRecoveryDiagnosticOwnerRevision(
      snapshot,
      operationContext,
    ),
  });
}

function buildPriorityRecoveryDispatchPendingDiagnosticOwnerOutcome(
  snapshot,
  operationContext,
) {
  const evidence =
    buildPriorityRecoveryDispatchPendingDiagnosticOwnerEvidence(
      snapshot,
      operationContext,
    );
  return (
    PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.build(evidence) ||
    PRIORITY_RECOVERY_DISPATCH_PENDING_DIAGNOSTIC_OWNER_ABSENT
  );
}

export {
  buildPriorityRecoveryDispatchPendingDiagnosticOwnerOutcome,
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
};
