import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {ReplicaStatus} = OPERATION_WORKFLOW_OWNER_SHARED;

const DISPATCH_WAKE_PROGRESS_PREEMPT_STATE = Object.freeze({
  OPERATION_UNAVAILABLE: 'operation_unavailable',
  NON_PROGRESS_WAKE_STEP: 'non_progress_wake_step',
  NON_WAKE_INPUT: 'non_wake_input',
  PROGRESS_RECONCILER_UNAVAILABLE: 'progress_reconciler_unavailable',
  TARGET_PROGRESS_NOT_OBSERVED: 'target_progress_not_observed',
  BOUNDED_PENDING_WAKE_RECONCILE: 'bounded_pending_wake_reconcile',
  PREEMPT_RECONCILE: 'preempt_reconcile',
});

const DISPATCH_WAKE_PROGRESS_PREEMPT_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.OPERATION_UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.NON_PROGRESS_WAKE_STEP,
    matches: (evidence) => evidence.progressWakeWorkflowStep !== true,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.NON_WAKE_INPUT,
    matches: (evidence) => evidence.dispatchWakeInput !== true,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.PROGRESS_RECONCILER_UNAVAILABLE,
    matches: (evidence) => evidence.progressReconcilerAvailable !== true,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.TARGET_PROGRESS_NOT_OBSERVED,
    matches: (evidence) =>
      evidence.observedPreemptStatus !== true &&
      evidence.boundedPendingWakeReconcile !== true,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.BOUNDED_PENDING_WAKE_RECONCILE,
    matches: (evidence) => evidence.boundedPendingWakeReconcile === true,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.PREEMPT_RECONCILE,
    matches: () => true,
  }),
]);

const DISPATCH_WAKE_PROGRESS_PREEMPT_ALLOWED_STATES = Object.freeze(
  new Set([
    DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.BOUNDED_PENDING_WAKE_RECONCILE,
    DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.PREEMPT_RECONCILE,
  ]),
);

const DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE = Object.freeze({
  OPERATION_UNAVAILABLE: 'operation_unavailable',
  NON_PENDING_STEP: 'non_pending_step',
  STATUS_RECONCILER_UNAVAILABLE: 'status_reconciler_unavailable',
  TARGET_PENDING: 'target_pending',
  TARGET_SYNCING: 'target_syncing',
  TARGET_ACTIVE: 'target_active',
  FALLBACK_RECONCILE: 'fallback_reconcile',
});

const DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.OPERATION_UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.NON_PENDING_STEP,
    matches: (evidence) => evidence.pendingWorkflowStep !== true,
  }),
  Object.freeze({
    state:
      DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.STATUS_RECONCILER_UNAVAILABLE,
    matches: (evidence) => evidence.statusReconcilerAvailable !== true,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.TARGET_PENDING,
    matches: (evidence) =>
      evidence.reconciledTargetStatus === ReplicaStatus.PENDING,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.TARGET_SYNCING,
    matches: (evidence) =>
      evidence.reconciledTargetStatus === ReplicaStatus.SYNCING,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.TARGET_ACTIVE,
    matches: (evidence) =>
      evidence.reconciledTargetStatus === ReplicaStatus.ACTIVE,
  }),
  Object.freeze({
    state: DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.FALLBACK_RECONCILE,
    matches: () => true,
  }),
]);

function resolveDispatchWakeProgressPreemptState(evidence) {
  return (
    DISPATCH_WAKE_PROGRESS_PREEMPT_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    DISPATCH_WAKE_PROGRESS_PREEMPT_STATE.TARGET_PROGRESS_NOT_OBSERVED
  );
}

function isDispatchWakeProgressPreemptStateAllowed(state) {
  return DISPATCH_WAKE_PROGRESS_PREEMPT_ALLOWED_STATES.has(state);
}

function resolveDispatchWakePendingTargetProgressState(evidence) {
  return (
    DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE.FALLBACK_RECONCILE
  );
}

export {
  DISPATCH_WAKE_PENDING_TARGET_PROGRESS_STATE,
  DISPATCH_WAKE_PROGRESS_PREEMPT_STATE,
  isDispatchWakeProgressPreemptStateAllowed,
  resolveDispatchWakePendingTargetProgressState,
  resolveDispatchWakeProgressPreemptState,
};
