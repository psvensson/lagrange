import {
  PLACEMENT_OWNER_INPUT,
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_REASON,
  PLACEMENT_OWNER_REINTERPRETATION,
  PLACEMENT_OWNER_TARGET_ACTION,
  PLACEMENT_OWNER_TARGET_STATE,
  TOPOLOGY_CONTROL_PLANE_OWNER,
  buildPlacementOwnerTargetOutcome,
} from './topology-owner-placement-constants.js';

const TOPOLOGY_OWNER_ABSENT_VALUE = 'absent';

const OPERATION_OWNER_INPUT = Object.freeze({
  OPERATION_RECORD: 'operation_record',
  EXECUTOR_OUTCOME: 'executor_outcome',
  READINESS_OUTCOME: 'readiness_outcome',
  REPLICA_STATUS: 'replica_status',
  RETRY_TIMER: 'retry_timer',
});

const OPERATION_OWNER_RETRY_KIND = Object.freeze({
  DISPATCH: 'dispatch',
  SAFETY: 'safety',
  TRANSITION: 'transition',
});

const OPERATION_OWNER_RETRY_STATE = Object.freeze({
  OPERATION_UNAVAILABLE: 'operation_unavailable',
  NOT_RETRYABLE: 'not_retryable',
  ATTEMPT_BOUND_REQUIRED: 'attempt_bound_required',
  ATTEMPTS_EXHAUSTED: 'attempts_exhausted',
  TIMER_ALREADY_SCHEDULED: 'timer_already_scheduled',
  SCHEDULE_RETRY: 'schedule_retry',
});

const OPERATION_OWNER_RETRY_ACTION = Object.freeze({
  REJECT: 'reject',
  REUSE_TIMER: 'reuse_timer',
  SCHEDULE_TIMER: 'schedule_timer',
  TERMINAL_DEGRADE: 'terminal_degrade',
});

const OPERATION_OWNER_RESUME_STATE = Object.freeze({
  OPERATION_UNAVAILABLE: 'operation_unavailable',
  TERMINAL_OPERATION: 'terminal_operation',
  REMOTE_OWNER: 'remote_owner',
  RETRY_BOUND_REQUIRED: 'retry_bound_required',
  DISPATCH_RESUME: 'dispatch_resume',
  TIMEOUT_RECONCILE: 'timeout_reconcile',
});

const OPERATION_OWNER_RESUME_ACTION = Object.freeze({
  CLEAR_RETRY: 'clear_retry',
  DISPATCH: 'dispatch',
  RECONCILE_TIMEOUT: 'reconcile_timeout',
  TERMINAL_DEGRADE: 'terminal_degrade',
});

const OPERATION_OWNER_TERMINAL_STATE = Object.freeze({
  NON_TERMINAL: 'non_terminal',
  TERMINAL_SUCCESS: 'terminal_success',
  TERMINAL_FAILURE: 'terminal_failure',
  TERMINAL_DEGRADED: 'terminal_degraded',
});

const OPERATION_OWNER_TERMINAL_REASON = Object.freeze({
  NONE: 'none',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRY_ATTEMPT_BOUND_REQUIRED: 'retry_attempt_bound_required',
  RETRY_ATTEMPTS_EXHAUSTED: 'retry_attempts_exhausted',
  TIMEOUT_RECONCILE_DUE: 'timeout_reconcile_due',
});

const OPERATION_OWNER_PROGRESS_STATE = Object.freeze({
  BOUNDED_RETRY: 'bounded_retry',
  TERMINAL: 'terminal',
  UNBOUNDED_RETRY: 'unbounded_retry',
});

const OPERATION_OWNER_REINTERPRETATION = Object.freeze({
  CACHE_VISIBILITY: 'cache_visibility',
  SERVICE_ROW_STATUS: 'service_row_status',
  TIMER_TEXT: 'timer_text',
  RESERVATION_PRESENCE: 'reservation_presence',
  WORKFLOW_TIMEOUT_TEXT: 'workflow_timeout_text',
});

const OPERATION_OWNER_RETRY_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: OPERATION_OWNER_RETRY_STATE.OPERATION_UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RETRY_STATE.NOT_RETRYABLE,
    matches: (evidence) => evidence.retryable !== true,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RETRY_STATE.ATTEMPT_BOUND_REQUIRED,
    matches: (evidence) =>
      evidence.criticalWorkflow === true &&
      evidence.attemptBounded !== true,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RETRY_STATE.ATTEMPTS_EXHAUSTED,
    matches: (evidence) =>
      evidence.attemptBounded === true &&
      evidence.attempt >= evidence.maxAttempts,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RETRY_STATE.TIMER_ALREADY_SCHEDULED,
    matches: (evidence) => evidence.timerActive === true,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RETRY_STATE.SCHEDULE_RETRY,
    matches: () => true,
  }),
]);

const OPERATION_OWNER_RETRY_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      OPERATION_OWNER_RETRY_STATE.OPERATION_UNAVAILABLE,
      OPERATION_OWNER_RETRY_ACTION.REJECT,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.NOT_RETRYABLE,
      OPERATION_OWNER_RETRY_ACTION.REJECT,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.ATTEMPT_BOUND_REQUIRED,
      OPERATION_OWNER_RETRY_ACTION.TERMINAL_DEGRADE,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.ATTEMPTS_EXHAUSTED,
      OPERATION_OWNER_RETRY_ACTION.TERMINAL_DEGRADE,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.TIMER_ALREADY_SCHEDULED,
      OPERATION_OWNER_RETRY_ACTION.REUSE_TIMER,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.SCHEDULE_RETRY,
      OPERATION_OWNER_RETRY_ACTION.SCHEDULE_TIMER,
    ],
  ]),
);

const OPERATION_OWNER_RESUME_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: OPERATION_OWNER_RESUME_STATE.OPERATION_UNAVAILABLE,
    matches: (evidence) => evidence.operationAvailable !== true,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RESUME_STATE.TERMINAL_OPERATION,
    matches: (evidence) => evidence.terminalOperation === true,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RESUME_STATE.REMOTE_OWNER,
    matches: (evidence) => evidence.locallyOwned !== true,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RESUME_STATE.TIMEOUT_RECONCILE,
    matches: (evidence) => evidence.timeoutReconcileDue === true,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RESUME_STATE.RETRY_BOUND_REQUIRED,
    matches: (evidence) =>
      evidence.criticalWorkflow === true &&
      evidence.dispatchRetryable === true &&
      evidence.boundedRetryWindowActive !== true,
  }),
  Object.freeze({
    state: OPERATION_OWNER_RESUME_STATE.DISPATCH_RESUME,
    matches: (evidence) =>
      evidence.dispatchRetryable === true &&
      (
        evidence.criticalWorkflow !== true ||
        evidence.boundedRetryWindowActive === true
      ),
  }),
  Object.freeze({
    state: OPERATION_OWNER_RESUME_STATE.TIMEOUT_RECONCILE,
    matches: () => true,
  }),
]);

const OPERATION_OWNER_RESUME_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      OPERATION_OWNER_RESUME_STATE.OPERATION_UNAVAILABLE,
      OPERATION_OWNER_RESUME_ACTION.CLEAR_RETRY,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.TERMINAL_OPERATION,
      OPERATION_OWNER_RESUME_ACTION.CLEAR_RETRY,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.REMOTE_OWNER,
      OPERATION_OWNER_RESUME_ACTION.CLEAR_RETRY,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.RETRY_BOUND_REQUIRED,
      OPERATION_OWNER_RESUME_ACTION.TERMINAL_DEGRADE,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.DISPATCH_RESUME,
      OPERATION_OWNER_RESUME_ACTION.DISPATCH,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.TIMEOUT_RECONCILE,
      OPERATION_OWNER_RESUME_ACTION.RECONCILE_TIMEOUT,
    ],
  ]),
);

const OPERATION_OWNER_RETRY_PROGRESS_BY_STATE = Object.freeze(
  new Map([
    [
      OPERATION_OWNER_RETRY_STATE.OPERATION_UNAVAILABLE,
      OPERATION_OWNER_PROGRESS_STATE.TERMINAL,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.NOT_RETRYABLE,
      OPERATION_OWNER_PROGRESS_STATE.TERMINAL,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.ATTEMPT_BOUND_REQUIRED,
      OPERATION_OWNER_PROGRESS_STATE.UNBOUNDED_RETRY,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.ATTEMPTS_EXHAUSTED,
      OPERATION_OWNER_PROGRESS_STATE.TERMINAL,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.TIMER_ALREADY_SCHEDULED,
      OPERATION_OWNER_PROGRESS_STATE.BOUNDED_RETRY,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.SCHEDULE_RETRY,
      OPERATION_OWNER_PROGRESS_STATE.BOUNDED_RETRY,
    ],
  ]),
);

const OPERATION_OWNER_RETRY_TERMINAL_STATE_BY_STATE = Object.freeze(
  new Map([
    [
      OPERATION_OWNER_RETRY_STATE.OPERATION_UNAVAILABLE,
      OPERATION_OWNER_TERMINAL_STATE.TERMINAL_FAILURE,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.NOT_RETRYABLE,
      OPERATION_OWNER_TERMINAL_STATE.TERMINAL_FAILURE,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.ATTEMPT_BOUND_REQUIRED,
      OPERATION_OWNER_TERMINAL_STATE.TERMINAL_DEGRADED,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.ATTEMPTS_EXHAUSTED,
      OPERATION_OWNER_TERMINAL_STATE.TERMINAL_DEGRADED,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.TIMER_ALREADY_SCHEDULED,
      OPERATION_OWNER_TERMINAL_STATE.NON_TERMINAL,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.SCHEDULE_RETRY,
      OPERATION_OWNER_TERMINAL_STATE.NON_TERMINAL,
    ],
  ]),
);

const OPERATION_OWNER_RETRY_TERMINAL_REASON_BY_STATE = Object.freeze(
  new Map([
    [
      OPERATION_OWNER_RETRY_STATE.OPERATION_UNAVAILABLE,
      OPERATION_OWNER_TERMINAL_REASON.FAILED,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.NOT_RETRYABLE,
      OPERATION_OWNER_TERMINAL_REASON.FAILED,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.ATTEMPT_BOUND_REQUIRED,
      OPERATION_OWNER_TERMINAL_REASON.RETRY_ATTEMPT_BOUND_REQUIRED,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.ATTEMPTS_EXHAUSTED,
      OPERATION_OWNER_TERMINAL_REASON.RETRY_ATTEMPTS_EXHAUSTED,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.TIMER_ALREADY_SCHEDULED,
      OPERATION_OWNER_TERMINAL_REASON.NONE,
    ],
    [
      OPERATION_OWNER_RETRY_STATE.SCHEDULE_RETRY,
      OPERATION_OWNER_TERMINAL_REASON.NONE,
    ],
  ]),
);

const OPERATION_OWNER_RESUME_PROGRESS_BY_STATE = Object.freeze(
  new Map([
    [
      OPERATION_OWNER_RESUME_STATE.OPERATION_UNAVAILABLE,
      OPERATION_OWNER_PROGRESS_STATE.TERMINAL,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.TERMINAL_OPERATION,
      OPERATION_OWNER_PROGRESS_STATE.TERMINAL,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.REMOTE_OWNER,
      OPERATION_OWNER_PROGRESS_STATE.TERMINAL,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.RETRY_BOUND_REQUIRED,
      OPERATION_OWNER_PROGRESS_STATE.UNBOUNDED_RETRY,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.DISPATCH_RESUME,
      OPERATION_OWNER_PROGRESS_STATE.BOUNDED_RETRY,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.TIMEOUT_RECONCILE,
      OPERATION_OWNER_PROGRESS_STATE.TERMINAL,
    ],
  ]),
);

const OPERATION_OWNER_RESUME_TERMINAL_REASON_BY_STATE = Object.freeze(
  new Map([
    [
      OPERATION_OWNER_RESUME_STATE.OPERATION_UNAVAILABLE,
      OPERATION_OWNER_TERMINAL_REASON.FAILED,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.TERMINAL_OPERATION,
      OPERATION_OWNER_TERMINAL_REASON.COMPLETED,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.REMOTE_OWNER,
      OPERATION_OWNER_TERMINAL_REASON.NONE,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.RETRY_BOUND_REQUIRED,
      OPERATION_OWNER_TERMINAL_REASON.RETRY_ATTEMPT_BOUND_REQUIRED,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.DISPATCH_RESUME,
      OPERATION_OWNER_TERMINAL_REASON.NONE,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.TIMEOUT_RECONCILE,
      OPERATION_OWNER_TERMINAL_REASON.TIMEOUT_RECONCILE_DUE,
    ],
  ]),
);

function normalizePositiveInteger(value) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    0;
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    0;
}

function buildOperationOwnerRetryOutcome(options = {}) {
  const retryAfterMs = normalizePositiveInteger(options.retryAfterMs);
  const fallbackDelayMs = normalizePositiveInteger(options.fallbackDelayMs);
  const attempt = normalizeNonNegativeInteger(options.attempt);
  const maxAttempts = normalizePositiveInteger(options.maxAttempts);
  const delayMs = retryAfterMs > 0 ? retryAfterMs : fallbackDelayMs;
  const evidence = Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    inputs: OPERATION_OWNER_INPUT,
    retryKind: options.retryKind || OPERATION_OWNER_RETRY_KIND.TRANSITION,
    operationAvailable:
      typeof options.operationId === 'string' &&
      options.operationId.length > 0,
    retryable: options.retryable === true,
    timerActive: options.timerActive === true,
    criticalWorkflow: options.criticalWorkflow === true,
    attempt,
    maxAttempts,
    attemptBounded: maxAttempts > 0,
    retryAfterMs,
    fallbackDelayMs,
    delayMs,
    currentTimeMs: normalizeNonNegativeInteger(options.currentTimeMs),
    forbiddenReinterpretations: OPERATION_OWNER_REINTERPRETATION,
  });
  const state =
    OPERATION_OWNER_RETRY_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    OPERATION_OWNER_RETRY_STATE.NOT_RETRYABLE;
  return Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    retryKind: evidence.retryKind,
    state,
    action:
      OPERATION_OWNER_RETRY_ACTION_BY_STATE.get(state) ||
      OPERATION_OWNER_RETRY_ACTION.REJECT,
    attempt: evidence.attempt,
    maxAttempts: resolveOperationOwnerRetryMaxAttempts(evidence),
    attemptsRemaining: resolveOperationOwnerRetryAttemptsRemaining(evidence),
    delayMs,
    nextAttemptAtMs: resolveOperationOwnerNextAttemptAtMs({
      action: OPERATION_OWNER_RETRY_ACTION_BY_STATE.get(state),
      currentTimeMs: evidence.currentTimeMs,
      delayMs,
    }),
    progressState:
      OPERATION_OWNER_RETRY_PROGRESS_BY_STATE.get(state) ||
      OPERATION_OWNER_PROGRESS_STATE.TERMINAL,
    terminalState:
      OPERATION_OWNER_RETRY_TERMINAL_STATE_BY_STATE.get(state) ||
      OPERATION_OWNER_TERMINAL_STATE.TERMINAL_FAILURE,
    terminalReason:
      OPERATION_OWNER_RETRY_TERMINAL_REASON_BY_STATE.get(state) ||
      OPERATION_OWNER_TERMINAL_REASON.FAILED,
    forbiddenReinterpretations: OPERATION_OWNER_REINTERPRETATION,
  });
}

function buildOperationOwnerResumeOutcome(options = {}) {
  const retryAfterMs = normalizePositiveInteger(options.retryAfterMs);
  const boundedRetryWindowActive =
    options.boundedRetryWindowActive === true ||
    options.retryGraceActive === true ||
    retryAfterMs > 0;
  const evidence = Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    inputs: OPERATION_OWNER_INPUT,
    operationAvailable: options.operationAvailable === true,
    terminalOperation: options.terminalOperation === true,
    terminalFailed: options.terminalFailed === true,
    terminalDegraded: options.terminalDegraded === true,
    locallyOwned: options.locallyOwned === true,
    dispatchRetryable: options.dispatchRetryable === true,
    criticalWorkflow: options.criticalWorkflow === true,
    retryGraceActive: options.retryGraceActive === true,
    boundedRetryWindowActive,
    stepTimedOut: options.stepTimedOut === true,
    timeoutReconcileDue:
      options.timeoutReconcileDue === true ||
      options.stepTimedOut === true,
    retryAfterMs,
    currentTimeMs: normalizeNonNegativeInteger(options.currentTimeMs),
    forbiddenReinterpretations: OPERATION_OWNER_REINTERPRETATION,
  });
  const state =
    OPERATION_OWNER_RESUME_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    OPERATION_OWNER_RESUME_STATE.OPERATION_UNAVAILABLE;
  return Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    state,
    action:
      OPERATION_OWNER_RESUME_ACTION_BY_STATE.get(state) ||
      OPERATION_OWNER_RESUME_ACTION.CLEAR_RETRY,
    retryAfterMs,
    nextAttemptAtMs: resolveOperationOwnerNextAttemptAtMs({
      action: OPERATION_OWNER_RESUME_ACTION_BY_STATE.get(state),
      currentTimeMs: evidence.currentTimeMs,
      delayMs: retryAfterMs,
    }),
    progressState:
      OPERATION_OWNER_RESUME_PROGRESS_BY_STATE.get(state) ||
      OPERATION_OWNER_PROGRESS_STATE.TERMINAL,
    terminalState: resolveOperationOwnerResumeTerminalState(evidence, state),
    terminalReason: resolveOperationOwnerResumeTerminalReason(evidence, state),
    forbiddenReinterpretations: OPERATION_OWNER_REINTERPRETATION,
  });
}

function resolveOperationOwnerRetryMaxAttempts(evidence) {
  return evidence.attemptBounded === true ?
    evidence.maxAttempts :
    TOPOLOGY_OWNER_ABSENT_VALUE;
}

function resolveOperationOwnerRetryAttemptsRemaining(evidence) {
  return evidence.attemptBounded === true ?
    Math.max(evidence.maxAttempts - evidence.attempt, 0) :
    TOPOLOGY_OWNER_ABSENT_VALUE;
}

function resolveOperationOwnerNextAttemptAtMs({action, currentTimeMs, delayMs}) {
  const scheduleAction =
    action === OPERATION_OWNER_RETRY_ACTION.SCHEDULE_TIMER ||
    action === OPERATION_OWNER_RESUME_ACTION.DISPATCH;
  return scheduleAction === true && currentTimeMs > 0 ?
    currentTimeMs + delayMs :
    TOPOLOGY_OWNER_ABSENT_VALUE;
}

function resolveOperationOwnerResumeTerminalState(evidence, state) {
  const selectedRule = OPERATION_OWNER_RESUME_TERMINAL_STATE_RULES.find((rule) =>
    rule.matches({evidence, state}),
  );
  return selectedRule.terminalState;
}

const OPERATION_OWNER_RESUME_TERMINAL_STATE_RULES = Object.freeze([
  Object.freeze({
    terminalState: OPERATION_OWNER_TERMINAL_STATE.TERMINAL_DEGRADED,
    matches: (snapshot) =>
      snapshot.evidence.terminalDegraded === true ||
      snapshot.state === OPERATION_OWNER_RESUME_STATE.TIMEOUT_RECONCILE ||
      snapshot.state === OPERATION_OWNER_RESUME_STATE.RETRY_BOUND_REQUIRED,
  }),
  Object.freeze({
    terminalState: OPERATION_OWNER_TERMINAL_STATE.TERMINAL_FAILURE,
    matches: (snapshot) =>
      snapshot.evidence.terminalFailed === true ||
      snapshot.state === OPERATION_OWNER_RESUME_STATE.OPERATION_UNAVAILABLE,
  }),
  Object.freeze({
    terminalState: OPERATION_OWNER_TERMINAL_STATE.TERMINAL_SUCCESS,
    matches: (snapshot) =>
      snapshot.state === OPERATION_OWNER_RESUME_STATE.TERMINAL_OPERATION,
  }),
  Object.freeze({
    terminalState: OPERATION_OWNER_TERMINAL_STATE.NON_TERMINAL,
    matches: () => true,
  }),
]);

function resolveOperationOwnerResumeTerminalReason(evidence, state) {
  const selectedRule = OPERATION_OWNER_RESUME_TERMINAL_REASON_RULES.find((rule) =>
    rule.matches({evidence, state}),
  );
  return selectedRule.terminalReason;
}

const OPERATION_OWNER_RESUME_TERMINAL_REASON_RULES = Object.freeze([
  Object.freeze({
    terminalReason: OPERATION_OWNER_TERMINAL_REASON.TIMEOUT_RECONCILE_DUE,
    matches: (snapshot) =>
      snapshot.state === OPERATION_OWNER_RESUME_STATE.TIMEOUT_RECONCILE,
  }),
  Object.freeze({
    terminalReason: OPERATION_OWNER_TERMINAL_REASON.RETRY_ATTEMPT_BOUND_REQUIRED,
    matches: (snapshot) =>
      snapshot.state === OPERATION_OWNER_RESUME_STATE.RETRY_BOUND_REQUIRED,
  }),
  Object.freeze({
    terminalReason: OPERATION_OWNER_TERMINAL_REASON.FAILED,
    matches: (snapshot) =>
      snapshot.evidence.terminalFailed === true ||
      snapshot.state === OPERATION_OWNER_RESUME_STATE.OPERATION_UNAVAILABLE,
  }),
  Object.freeze({
    terminalReason: OPERATION_OWNER_TERMINAL_REASON.COMPLETED,
    matches: (snapshot) =>
      snapshot.state === OPERATION_OWNER_RESUME_STATE.TERMINAL_OPERATION,
  }),
  Object.freeze({
    terminalReason:
      OPERATION_OWNER_RESUME_TERMINAL_REASON_BY_STATE.get(
        OPERATION_OWNER_RESUME_STATE.REMOTE_OWNER,
      ),
    matches: (snapshot) =>
      snapshot.state === OPERATION_OWNER_RESUME_STATE.REMOTE_OWNER,
  }),
  Object.freeze({
    terminalReason: OPERATION_OWNER_TERMINAL_REASON.NONE,
    matches: () => true,
  }),
]);

export {
  OPERATION_OWNER_INPUT,
  OPERATION_OWNER_PROGRESS_STATE,
  OPERATION_OWNER_REINTERPRETATION,
  OPERATION_OWNER_RESUME_ACTION,
  OPERATION_OWNER_RESUME_STATE,
  OPERATION_OWNER_RETRY_ACTION,
  OPERATION_OWNER_RETRY_KIND,
  OPERATION_OWNER_RETRY_STATE,
  OPERATION_OWNER_TERMINAL_REASON,
  OPERATION_OWNER_TERMINAL_STATE,
  PLACEMENT_OWNER_INPUT,
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_REASON,
  PLACEMENT_OWNER_REINTERPRETATION,
  PLACEMENT_OWNER_TARGET_ACTION,
  PLACEMENT_OWNER_TARGET_STATE,
  TOPOLOGY_CONTROL_PLANE_OWNER,
  buildOperationOwnerResumeOutcome,
  buildOperationOwnerRetryOutcome,
  buildPlacementOwnerTargetOutcome,
};
