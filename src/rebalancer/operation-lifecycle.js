/**
 * Owned operation_progress lifecycle state machine.
 */

import {
  OPERATION_PROGRESS_EVENT_TYPE,
  createNextOperationProgressEvent,
} from './operation-progress-events.js';
import {
  createOperationLifecycleEventResolver,
} from './operation-lifecycle-event-resolution.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_PROGRESS_STATE_VALUES,
  OPERATION_WORKFLOW_REASON_CODE_VALUES,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
} from './operation-workflow-owner-constants.js';
import {
  normalizeOperationWorkflowEvidence,
} from './operation-workflow-owner-evidence.js';

const OPERATION_PROGRESS_RESOURCE = 'operation_progress';
const OPERATION_PROGRESS_SCHEMA_VERSION = 'operation_progress_schema_v1';
const OPERATION_PROGRESS_DECISION_SOURCE = 'operation_lifecycle';
const OPERATION_PROGRESS_OBSERVER_SOURCE = 'operation_progress_projection';
const OPERATION_PROGRESS_TYPEOF_NUMBER = 'number';
const OPERATION_PROGRESS_TYPEOF_OBJECT = 'object';
const OPERATION_PROGRESS_TYPEOF_STRING = 'string';
const OPERATION_PROGRESS_TEXT_EMPTY = '';
const OPERATION_PROGRESS_INITIAL_VERSION = 0;
const OPERATION_PROGRESS_VERSION_INCREMENT = 1;
const OPERATION_PROGRESS_INITIAL_STEP_COUNT = 0;
const OPERATION_PROGRESS_DEFAULT_STEP_BOUND = 8;
const OPERATION_PROGRESS_INITIAL_RETRY_ATTEMPT = 0;
const OPERATION_PROGRESS_NO_SIDE_EFFECT_INDEX = 0;

const OPERATION_PROGRESS_UNKNOWN = Object.freeze({
  EVENT_ID: 'event_id_unavailable',
  EPOCH: 'operation_epoch_unavailable',
  GENERATION: 'operation_generation_unavailable',
  OWNER_NODE_ID: 'owner_node_unavailable',
  PUBLICATION_EPOCH: 'publication_epoch_unavailable',
  PUBLICATION_ID: 'publication_id_unavailable',
  RETRY_AFTER_EVENT_ID: 'retry_after_event_unavailable',
  TERMINAL_REASON: 'terminal_reason_unavailable',
  TERM: 'operation_term_unavailable',
});

const OPERATION_LIFECYCLE_STATE = Object.freeze({
  UNKNOWN: 'operation_progress_unknown',
  PLANNED: 'operation_progress_planned',
  DISPATCH_PENDING: 'operation_progress_dispatch_pending',
  DISPATCHED: 'operation_progress_dispatched',
  PUBLICATION_PENDING_VISIBILITY:
    'operation_progress_publication_pending_visibility',
  VISIBLE: 'operation_progress_visible',
  RETRY_PENDING: 'operation_progress_retry_pending',
  RETAINED: 'operation_progress_retained',
  SUCCEEDED: 'operation_progress_succeeded',
  FAILED: 'operation_progress_failed',
});

const OPERATION_PROGRESS_TERMINAL_OUTCOME = Object.freeze({
  NOT_TERMINAL: 'terminal_outcome_not_terminal',
  RETAINED: 'terminal_outcome_retained',
  SUCCEEDED: 'terminal_outcome_succeeded',
  FAILED: 'terminal_outcome_failed',
});

const OPERATION_PROGRESS_RETRY_STATE = Object.freeze({
  NOT_REQUIRED: 'retry_not_required',
  RETAINED_FOR_RETRY: 'retained_for_retry',
  RETRY_REQUESTED: 'retry_requested',
  RETRY_EXHAUSTED: 'retry_exhausted',
});

const OPERATION_PROGRESS_RETENTION_STATE = Object.freeze({
  NOT_RETAINED: 'publication_not_retained',
  RETAINED_FOR_RETRY: 'publication_retained_for_retry',
});

const OPERATION_PROGRESS_VISIBILITY_STATE = Object.freeze({
  NOT_ACCEPTED: 'publication_not_accepted',
  PENDING_ACTIVE_GATE: 'publication_pending_active_gate',
  VISIBLE_AT_ACTIVE_GATE: 'publication_visible_at_active_gate',
});

const OPERATION_LIFECYCLE_EVENT_TYPE = OPERATION_PROGRESS_EVENT_TYPE;

const OPERATION_PROGRESS_TERMINAL_STATES = Object.freeze(new Set([
  OPERATION_LIFECYCLE_STATE.RETAINED,
  OPERATION_LIFECYCLE_STATE.SUCCEEDED,
  OPERATION_LIFECYCLE_STATE.FAILED,
]));

const OPERATION_PROGRESS_ACTIVE_STATES = Object.freeze([
  OPERATION_LIFECYCLE_STATE.PLANNED,
  OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
  OPERATION_LIFECYCLE_STATE.DISPATCHED,
  OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY,
  OPERATION_LIFECYCLE_STATE.VISIBLE,
  OPERATION_LIFECYCLE_STATE.RETRY_PENDING,
]);

const OPERATION_PROGRESS_LEGACY_STATE_BY_EVENT = Object.freeze({
  [OPERATION_PROGRESS_EVENT_TYPE.ACTIVE_GATE_VISIBLE]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES
      .AUTHORITATIVE_VISIBILITY_DEFERRED,
  [OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_ACCEPTED]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES
      .EXISTING_OPERATION_ADVANCEMENT_READY,
  [OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_REQUESTED]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.LOCAL_OWNER_DISPATCH_READY,
  [OPERATION_PROGRESS_EVENT_TYPE.INVALID_TRANSITION_REJECTED]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.OWNER_PROGRESS_WAIT_REQUIRED,
  [OPERATION_PROGRESS_EVENT_TYPE.OPERATION_COMPLETE]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.TERMINAL_SUCCESS_OBSERVED,
  [OPERATION_PROGRESS_EVENT_TYPE.OPERATION_FAILED]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.TERMINAL_FAILURE_OBSERVED,
  [OPERATION_PROGRESS_EVENT_TYPE.OUT_OF_CONTRACT_EVIDENCE]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.OPERATION_INPUT_REJECTED,
  [OPERATION_PROGRESS_EVENT_TYPE.OWNER_PROGRESS_WAIT_REQUIRED]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.OWNER_PROGRESS_WAIT_REQUIRED,
  [OPERATION_PROGRESS_EVENT_TYPE.PUBLICATION_ACCEPTED]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES
      .AUTHORITATIVE_VISIBILITY_DEFERRED,
  [OPERATION_PROGRESS_EVENT_TYPE.REMOTE_OWNER_WAKE_REQUIRED]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.REMOTE_OWNER_WAKE_REQUIRED,
  [OPERATION_PROGRESS_EVENT_TYPE.RETAIN_PUBLICATION_FOR_RETRY]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES
      .STALE_PROGRESS_RECONCILE_REQUIRED,
  [OPERATION_PROGRESS_EVENT_TYPE.RETRY_EXHAUSTED]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.TERMINAL_FAILURE_OBSERVED,
  [OPERATION_PROGRESS_EVENT_TYPE.RETRY_REQUESTED]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES
      .REMOTE_OWNER_HANDOFF_RETRY_SCHEDULED,
  [OPERATION_PROGRESS_EVENT_TYPE.SERIAL_DEPENDENCY_PENDING]:
    OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.SERIAL_DEPENDENCY_PENDING,
});

const OPERATION_PROGRESS_OUTCOME_BY_EVENT = Object.freeze({
  [OPERATION_PROGRESS_EVENT_TYPE.ACTIVE_GATE_VISIBLE]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.DEFER_AUTHORITATIVE_VISIBILITY,
  [OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_ACCEPTED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
  [OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_REQUESTED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
  [OPERATION_PROGRESS_EVENT_TYPE.INVALID_TRANSITION_REJECTED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS,
  [OPERATION_PROGRESS_EVENT_TYPE.OPERATION_COMPLETE]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.TERMINAL_SUCCESS,
  [OPERATION_PROGRESS_EVENT_TYPE.OPERATION_FAILED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.TERMINAL_FAILURE,
  [OPERATION_PROGRESS_EVENT_TYPE.OUT_OF_CONTRACT_EVIDENCE]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.REJECT_OUT_OF_CONTRACT_EVIDENCE,
  [OPERATION_PROGRESS_EVENT_TYPE.OWNER_PROGRESS_WAIT_REQUIRED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS,
  [OPERATION_PROGRESS_EVENT_TYPE.PUBLICATION_ACCEPTED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.DEFER_AUTHORITATIVE_VISIBILITY,
  [OPERATION_PROGRESS_EVENT_TYPE.REMOTE_OWNER_WAKE_REQUIRED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAKE_REMOTE_OWNER,
  [OPERATION_PROGRESS_EVENT_TYPE.RETAIN_PUBLICATION_FOR_RETRY]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
  [OPERATION_PROGRESS_EVENT_TYPE.RETRY_EXHAUSTED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.TERMINAL_FAILURE,
  [OPERATION_PROGRESS_EVENT_TYPE.RETRY_REQUESTED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_REBALANCER_HANDOFF_RETRY,
  [OPERATION_PROGRESS_EVENT_TYPE.SERIAL_DEPENDENCY_PENDING]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_SERIAL_OPERATION,
});

const OPERATION_PROGRESS_EFFECT_BY_EVENT = Object.freeze({
  [OPERATION_PROGRESS_EVENT_TYPE.ACTIVE_GATE_VISIBLE]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.MARK_ACTIVE_GATE_VISIBLE_COMMAND,
  [OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_ACCEPTED]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.ADVANCE_EXISTING_OPERATION_COMMAND,
  [OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_REQUESTED]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.DISPATCH_LOCAL_OWNER_COMMAND,
  [OPERATION_PROGRESS_EVENT_TYPE.INVALID_TRANSITION_REJECTED]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
  [OPERATION_PROGRESS_EVENT_TYPE.OPERATION_COMPLETE]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.RECORD_TERMINAL_SUCCESS_COMMAND,
  [OPERATION_PROGRESS_EVENT_TYPE.OPERATION_FAILED]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.RECORD_TERMINAL_FAILURE_COMMAND,
  [OPERATION_PROGRESS_EVENT_TYPE.OUT_OF_CONTRACT_EVIDENCE]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
  [OPERATION_PROGRESS_EVENT_TYPE.OWNER_PROGRESS_WAIT_REQUIRED]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
  [OPERATION_PROGRESS_EVENT_TYPE.PUBLICATION_ACCEPTED]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
  [OPERATION_PROGRESS_EVENT_TYPE.REMOTE_OWNER_WAKE_REQUIRED]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.WAKE_REMOTE_OWNER_COMMAND,
  [OPERATION_PROGRESS_EVENT_TYPE.RETAIN_PUBLICATION_FOR_RETRY]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
      .RECONCILE_STALE_PROGRESS_COMMAND,
  [OPERATION_PROGRESS_EVENT_TYPE.RETRY_EXHAUSTED]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.RECORD_TERMINAL_FAILURE_COMMAND,
  [OPERATION_PROGRESS_EVENT_TYPE.RETRY_REQUESTED]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
  [OPERATION_PROGRESS_EVENT_TYPE.SERIAL_DEPENDENCY_PENDING]:
    OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
});

const OPERATION_PROGRESS_REASON_BY_EVENT = Object.freeze({
  [OPERATION_PROGRESS_EVENT_TYPE.ACTIVE_GATE_VISIBLE]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.PUBLICATION_FENCE_STALE,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_ACCEPTED]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.WORKFLOW_TRANSITION_AVAILABLE,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_REQUESTED]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.LOCAL_OWNER_AUTHORITATIVE,
    OPERATION_WORKFLOW_REASON_CODE_VALUES.DISPATCH_NOT_OBSERVED,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.INVALID_TRANSITION_REJECTED]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.INVALID_LIFECYCLE_TRANSITION,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.OPERATION_COMPLETE]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.DURABLE_SUCCESS_RECORDED,
    OPERATION_WORKFLOW_REASON_CODE_VALUES.WORKFLOW_HISTORY_TERMINAL,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.OPERATION_FAILED]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.DURABLE_FAILURE_RECORDED,
    OPERATION_WORKFLOW_REASON_CODE_VALUES.WORKFLOW_HISTORY_TERMINAL,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.OUT_OF_CONTRACT_EVIDENCE]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.OUTSIDE_CONTRACT_EVIDENCE,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.OWNER_PROGRESS_WAIT_REQUIRED]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.OWNER_PROGRESS_IN_FLIGHT,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.PUBLICATION_ACCEPTED]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.PUBLICATION_FENCE_STALE,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.REMOTE_OWNER_WAKE_REQUIRED]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.REMOTE_OWNER_AUTHORITATIVE,
    OPERATION_WORKFLOW_REASON_CODE_VALUES.WAKE_REQUIRED,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.RETAIN_PUBLICATION_FOR_RETRY]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.TIMEOUT_BUDGET_EXPIRED,
    OPERATION_WORKFLOW_REASON_CODE_VALUES.WORKFLOW_HISTORY_STALE,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.RETRY_EXHAUSTED]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.RETRY_BUDGET_EXHAUSTED,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.RETRY_REQUESTED]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.REMOTE_OWNER_AUTHORITATIVE,
    OPERATION_WORKFLOW_REASON_CODE_VALUES.REMOTE_HANDOFF_RETRY_SCHEDULED,
  ]),
  [OPERATION_PROGRESS_EVENT_TYPE.SERIAL_DEPENDENCY_PENDING]: Object.freeze([
    OPERATION_WORKFLOW_REASON_CODE_VALUES.SERIAL_DEPENDENCY_PENDING,
  ]),
});

const OPERATION_PROGRESS_EXPLICIT_TRANSITIONS = Object.freeze([
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PLANNED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.OUT_OF_CONTRACT_EVIDENCE,
    toState: OPERATION_LIFECYCLE_STATE.FAILED,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PLANNED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.SERIAL_DEPENDENCY_PENDING,
    toState: OPERATION_LIFECYCLE_STATE.PLANNED,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PLANNED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_REQUESTED,
    toState: OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PLANNED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_ACCEPTED,
    toState: OPERATION_LIFECYCLE_STATE.DISPATCHED,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_ACCEPTED,
    toState: OPERATION_LIFECYCLE_STATE.DISPATCHED,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PLANNED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.PUBLICATION_ACCEPTED,
    toState: OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.DISPATCHED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.PUBLICATION_ACCEPTED,
    toState: OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.ACTIVE_GATE_VISIBLE,
    toState: OPERATION_LIFECYCLE_STATE.VISIBLE,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.VISIBLE,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.OPERATION_COMPLETE,
    toState: OPERATION_LIFECYCLE_STATE.SUCCEEDED,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PLANNED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.REMOTE_OWNER_WAKE_REQUIRED,
    toState: OPERATION_LIFECYCLE_STATE.PLANNED,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PLANNED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.RETRY_REQUESTED,
    toState: OPERATION_LIFECYCLE_STATE.RETRY_PENDING,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.REMOTE_OWNER_WAKE_REQUIRED,
    toState: OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.RETRY_REQUESTED,
    toState: OPERATION_LIFECYCLE_STATE.RETRY_PENDING,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.RETRY_PENDING,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_REQUESTED,
    toState: OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PLANNED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.RETAIN_PUBLICATION_FOR_RETRY,
    toState: OPERATION_LIFECYCLE_STATE.RETAINED,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.DISPATCHED,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.RETAIN_PUBLICATION_FOR_RETRY,
    toState: OPERATION_LIFECYCLE_STATE.RETAINED,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.RETAIN_PUBLICATION_FOR_RETRY,
    toState: OPERATION_LIFECYCLE_STATE.RETAINED,
  }),
  Object.freeze({
    fromState: OPERATION_LIFECYCLE_STATE.RETRY_PENDING,
    eventType: OPERATION_PROGRESS_EVENT_TYPE.RETRY_EXHAUSTED,
    toState: OPERATION_LIFECYCLE_STATE.FAILED,
  }),
]);

function buildActiveFailureTransitions() {
  return OPERATION_PROGRESS_ACTIVE_STATES.flatMap((fromState) => [
    Object.freeze({
      fromState,
      eventType: OPERATION_PROGRESS_EVENT_TYPE.OPERATION_COMPLETE,
      toState: OPERATION_LIFECYCLE_STATE.SUCCEEDED,
    }),
    Object.freeze({
      fromState,
      eventType: OPERATION_PROGRESS_EVENT_TYPE.OPERATION_FAILED,
      toState: OPERATION_LIFECYCLE_STATE.FAILED,
    }),
    Object.freeze({
      fromState,
      eventType: OPERATION_PROGRESS_EVENT_TYPE.OWNER_PROGRESS_WAIT_REQUIRED,
      toState: fromState,
    }),
  ]);
}

function freezeTransition(entry) {
  const legacyState =
    OPERATION_PROGRESS_LEGACY_STATE_BY_EVENT[entry.eventType];
  const outcome = OPERATION_PROGRESS_OUTCOME_BY_EVENT[entry.eventType];
  const effectCommand = OPERATION_PROGRESS_EFFECT_BY_EVENT[entry.eventType];
  return Object.freeze({
    fromState: entry.fromState,
    eventType: entry.eventType,
    toState: entry.toState,
    state: legacyState,
    outcome,
    nextRequiredAction: outcome,
    effectCommand,
    reasons: OPERATION_PROGRESS_REASON_BY_EVENT[entry.eventType],
    matches: entry.matches,
  });
}

const OPERATION_LIFECYCLE_TRANSITION_TABLE = Object.freeze([
  ...OPERATION_PROGRESS_EXPLICIT_TRANSITIONS,
  ...buildActiveFailureTransitions(),
].map(freezeTransition));

const resolveOperationLifecycleEvent = createOperationLifecycleEventResolver({
  outcomeByEvent: OPERATION_PROGRESS_OUTCOME_BY_EVENT,
});

function isOperationProgressRecord(value) {
  return Boolean(value) &&
    typeof value === OPERATION_PROGRESS_TYPEOF_OBJECT &&
    !Array.isArray(value);
}

function normalizeOperationProgressText(value, fallback) {
  if (typeof value !== OPERATION_PROGRESS_TYPEOF_STRING) {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > OPERATION_PROGRESS_TEXT_EMPTY.length ?
    normalized :
    fallback;
}

function normalizeOperationProgressNumber(value, fallback) {
  return typeof value === OPERATION_PROGRESS_TYPEOF_NUMBER &&
    Number.isFinite(value) ?
    Math.floor(value) :
    fallback;
}

function resolveOperationProgressIdentity(options = {}) {
  const evidence = options.evidence || {};
  const currentProgress = options.currentProgress || {};
  return Object.freeze({
    operationId: normalizeOperationProgressText(
      options.operationId ||
        currentProgress.operationId ||
        evidence.operationKey ||
        evidence.durableOperation?.operationKey,
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
    ),
    ownerId: normalizeOperationProgressText(
      options.ownerId || currentProgress.ownerId || evidence.owner,
      OPERATION_WORKFLOW_OWNER,
    ),
    ownerNodeId: normalizeOperationProgressText(
      options.ownerNodeId ||
        currentProgress.ownerNodeId ||
        evidence.ownerLease?.ownerNodeKey,
      OPERATION_PROGRESS_UNKNOWN.OWNER_NODE_ID,
    ),
    epoch: normalizeOperationProgressText(
      options.epoch || currentProgress.epoch || evidence.sourceRevision,
      OPERATION_PROGRESS_UNKNOWN.EPOCH,
    ),
    term: normalizeOperationProgressText(
      options.term || currentProgress.term || evidence.ownerLease?.leaseTerm,
      OPERATION_PROGRESS_UNKNOWN.TERM,
    ),
    generation: normalizeOperationProgressText(
      options.generation ||
        currentProgress.generation ||
        evidence.sourceRevision,
      OPERATION_PROGRESS_UNKNOWN.GENERATION,
    ),
  });
}

function createInitialOperationProgress(options = {}) {
  const identity = resolveOperationProgressIdentity(options);
  return Object.freeze({
    resource: OPERATION_PROGRESS_RESOURCE,
    schemaVersion: OPERATION_PROGRESS_SCHEMA_VERSION,
    operationId: identity.operationId,
    operationKey: identity.operationId,
    correlationKey: normalizeOperationProgressText(
      options.correlationKey || options.evidence?.correlationKey,
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.CORRELATION_KEY_UNAVAILABLE,
    ),
    ownerId: identity.ownerId,
    ownerNodeId: identity.ownerNodeId,
    epoch: identity.epoch,
    term: identity.term,
    generation: identity.generation,
    state: OPERATION_LIFECYCLE_STATE.PLANNED,
    version: OPERATION_PROGRESS_INITIAL_VERSION,
    sequence: OPERATION_PROGRESS_INITIAL_VERSION,
    lastAcceptedEventId: OPERATION_PROGRESS_UNKNOWN.EVENT_ID,
    terminalOutcome: OPERATION_PROGRESS_TERMINAL_OUTCOME.NOT_TERMINAL,
    terminalReason: OPERATION_PROGRESS_UNKNOWN.TERMINAL_REASON,
    retryState: OPERATION_PROGRESS_RETRY_STATE.NOT_REQUIRED,
    retryAttempt: OPERATION_PROGRESS_INITIAL_RETRY_ATTEMPT,
    retryAfterEventId: OPERATION_PROGRESS_UNKNOWN.RETRY_AFTER_EVENT_ID,
    retentionState: OPERATION_PROGRESS_RETENTION_STATE.NOT_RETAINED,
    retainedPublicationId: OPERATION_PROGRESS_UNKNOWN.PUBLICATION_ID,
    publicationId: OPERATION_PROGRESS_UNKNOWN.PUBLICATION_ID,
    publicationEpoch: OPERATION_PROGRESS_UNKNOWN.PUBLICATION_EPOCH,
    visibilityState: OPERATION_PROGRESS_VISIBILITY_STATE.NOT_ACCEPTED,
    dispatched: false,
    terminal: false,
    stepCount: OPERATION_PROGRESS_INITIAL_STEP_COUNT,
    maxStepBound: OPERATION_PROGRESS_DEFAULT_STEP_BOUND,
    createdAt: OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    updatedAt: OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
}

function normalizeOperationProgressRecord(value, evidence = {}) {
  if (!isOperationProgressRecord(value)) {
    return createInitialOperationProgress({evidence});
  }
  const identity = resolveOperationProgressIdentity({
    currentProgress: value,
    evidence,
  });
  return Object.freeze({
    ...createInitialOperationProgress({currentProgress: value, evidence}),
    ...value,
    operationId: identity.operationId,
    ownerId: identity.ownerId,
    ownerNodeId: identity.ownerNodeId,
    epoch: identity.epoch,
    term: identity.term,
    generation: identity.generation,
    version: normalizeOperationProgressNumber(
      value.version,
      OPERATION_PROGRESS_INITIAL_VERSION,
    ),
    sequence: normalizeOperationProgressNumber(
      value.sequence,
      OPERATION_PROGRESS_INITIAL_VERSION,
    ),
    stepCount: normalizeOperationProgressNumber(
      value.stepCount,
      OPERATION_PROGRESS_INITIAL_STEP_COUNT,
    ),
    maxStepBound: normalizeOperationProgressNumber(
      value.maxStepBound,
      OPERATION_PROGRESS_DEFAULT_STEP_BOUND,
    ),
    retryAttempt: normalizeOperationProgressNumber(
      value.retryAttempt,
      OPERATION_PROGRESS_INITIAL_RETRY_ATTEMPT,
    ),
  });
}

function selectInitialStateForEvent(eventType) {
  const transition = OPERATION_LIFECYCLE_TRANSITION_TABLE.find((entry) =>
    entry.eventType === eventType &&
    !OPERATION_PROGRESS_TERMINAL_STATES.has(entry.fromState),
  );
  return transition?.fromState || OPERATION_LIFECYCLE_STATE.PLANNED;
}

function findOperationLifecycleTransition(currentState, eventType) {
  return OPERATION_LIFECYCLE_TRANSITION_TABLE.find((entry) =>
    entry.fromState === currentState &&
      entry.eventType === eventType);
}

function buildInvalidOperationLifecycleTransition(currentState, event) {
  return Object.freeze({
    fromState: currentState,
    eventType: event.type,
    toState: currentState,
    state:
      OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.OWNER_PROGRESS_WAIT_REQUIRED,
    outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS,
    nextRequiredAction:
      OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS,
    effectCommand: OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
    reasons: OPERATION_PROGRESS_REASON_BY_EVENT[
      OPERATION_PROGRESS_EVENT_TYPE.INVALID_TRANSITION_REJECTED
    ],
  });
}

function resolveTerminalOutcome(transition) {
  if (transition.toState === OPERATION_LIFECYCLE_STATE.SUCCEEDED) {
    return OPERATION_PROGRESS_TERMINAL_OUTCOME.SUCCEEDED;
  }
  if (transition.toState === OPERATION_LIFECYCLE_STATE.FAILED) {
    return OPERATION_PROGRESS_TERMINAL_OUTCOME.FAILED;
  }
  if (transition.toState === OPERATION_LIFECYCLE_STATE.RETAINED) {
    return OPERATION_PROGRESS_TERMINAL_OUTCOME.RETAINED;
  }
  return OPERATION_PROGRESS_TERMINAL_OUTCOME.NOT_TERMINAL;
}

function buildOperationLifecycleSideEffects(effectCommand) {
  if (effectCommand === OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT) {
    return Object.freeze([]);
  }
  return Object.freeze([effectCommand]);
}

function buildOperationProgressRecord(currentProgress, transition, event) {
  const progress = normalizeOperationProgressRecord(
    currentProgress,
    event.evidence,
  );
  const nextVersion = progress.version + OPERATION_PROGRESS_VERSION_INCREMENT;
  const terminalOutcome = resolveTerminalOutcome(transition);
  const terminal = terminalOutcome !==
    OPERATION_PROGRESS_TERMINAL_OUTCOME.NOT_TERMINAL;
  const publicationId = normalizeOperationProgressText(
    event.payload?.publicationId || progress.publicationId,
    OPERATION_PROGRESS_UNKNOWN.PUBLICATION_ID,
  );
  return Object.freeze({
    ...progress,
    state: transition.toState,
    version: nextVersion,
    sequence: nextVersion,
    lastAcceptedEventId: normalizeOperationProgressText(
      event.eventId,
      OPERATION_PROGRESS_UNKNOWN.EVENT_ID,
    ),
    terminalOutcome,
    terminalReason: terminal === true ?
      transition.reasons.join(OPERATION_PROGRESS_TEXT_EMPTY) :
      OPERATION_PROGRESS_UNKNOWN.TERMINAL_REASON,
    retryState: transition.toState === OPERATION_LIFECYCLE_STATE.RETRY_PENDING ?
      OPERATION_PROGRESS_RETRY_STATE.RETRY_REQUESTED :
      transition.toState === OPERATION_LIFECYCLE_STATE.RETAINED ?
        OPERATION_PROGRESS_RETRY_STATE.RETAINED_FOR_RETRY :
        progress.retryState,
    retryAttempt: transition.toState === OPERATION_LIFECYCLE_STATE.RETRY_PENDING ?
      progress.retryAttempt + OPERATION_PROGRESS_VERSION_INCREMENT :
      progress.retryAttempt,
    retryAfterEventId:
      transition.toState === OPERATION_LIFECYCLE_STATE.RETAINED ?
        normalizeOperationProgressText(
          event.eventId,
          OPERATION_PROGRESS_UNKNOWN.RETRY_AFTER_EVENT_ID,
        ) :
        progress.retryAfterEventId,
    retentionState: transition.toState === OPERATION_LIFECYCLE_STATE.RETAINED ?
      OPERATION_PROGRESS_RETENTION_STATE.RETAINED_FOR_RETRY :
      progress.retentionState,
    retainedPublicationId:
      transition.toState === OPERATION_LIFECYCLE_STATE.RETAINED ?
        publicationId :
        progress.retainedPublicationId,
    publicationId,
    publicationEpoch: normalizeOperationProgressText(
      event.payload?.publicationEpoch || progress.publicationEpoch,
      OPERATION_PROGRESS_UNKNOWN.PUBLICATION_EPOCH,
    ),
    visibilityState:
      transition.toState ===
        OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY ?
        OPERATION_PROGRESS_VISIBILITY_STATE.PENDING_ACTIVE_GATE :
        transition.toState === OPERATION_LIFECYCLE_STATE.VISIBLE ||
          transition.toState === OPERATION_LIFECYCLE_STATE.SUCCEEDED ?
          OPERATION_PROGRESS_VISIBILITY_STATE.VISIBLE_AT_ACTIVE_GATE :
          progress.visibilityState,
    dispatched:
      progress.dispatched === true ||
      transition.toState === OPERATION_LIFECYCLE_STATE.DISPATCHED ||
      transition.toState ===
        OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY ||
      transition.toState === OPERATION_LIFECYCLE_STATE.VISIBLE ||
      transition.toState === OPERATION_LIFECYCLE_STATE.SUCCEEDED,
    terminal,
    stepCount: progress.stepCount + OPERATION_PROGRESS_VERSION_INCREMENT,
    updatedAt: normalizeOperationProgressText(
      event.sourceRevision,
      progress.updatedAt,
    ),
  });
}

function advanceOperationLifecycle(currentProgressOrState, eventInput) {
  const event = resolveOperationLifecycleEvent(eventInput);
  const currentProgress = typeof currentProgressOrState ===
      OPERATION_PROGRESS_TYPEOF_STRING ?
      createInitialOperationProgress({
        ...event,
        evidence: event.evidence,
        operationId: event.operationId,
      }) :
      normalizeOperationProgressRecord(currentProgressOrState, event.evidence);
  const currentState = typeof currentProgressOrState ===
      OPERATION_PROGRESS_TYPEOF_STRING ?
      currentProgressOrState :
      currentProgress.state;
  const transition =
    findOperationLifecycleTransition(currentState, event.type) ||
    buildInvalidOperationLifecycleTransition(currentState, event);
  const operationProgress = buildOperationProgressRecord(
    {...currentProgress, state: currentState},
    transition,
    event,
  );
  const emittedEvent = createNextOperationProgressEvent({
    currentSequence: currentProgress.sequence,
    type: event.type,
    operationId: operationProgress.operationId,
    ownerId: operationProgress.ownerId,
    epoch: operationProgress.epoch,
    term: operationProgress.term,
    generation: operationProgress.generation,
    sourceRevision: event.sourceRevision,
    payload: {
      operationProgress,
      transition: {
        fromState: currentState,
        toState: transition.toState,
        eventType: event.type,
      },
    },
  });
  return Object.freeze({
    state: transition.toState,
    sideEffects: buildOperationLifecycleSideEffects(
      transition.effectCommand,
    ),
    reasons: Object.freeze([...transition.reasons]),
    emittedEvents: Object.freeze([emittedEvent]),
    operationProgress,
    transition,
  });
}

function buildOperationLifecycleOutcome(transition, lifecycleResult, event) {
  const evidence = event.evidence || {};
  return Object.freeze({
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    resource: OPERATION_PROGRESS_RESOURCE,
    decisionSource: OPERATION_PROGRESS_DECISION_SOURCE,
    eventType: event.type,
    state: transition.state,
    lifecycleState: lifecycleResult.state,
    outcome: transition.outcome,
    nextRequiredAction: transition.nextRequiredAction,
    effectCommand: transition.effectCommand,
    sideEffects: lifecycleResult.sideEffects,
    reasons: lifecycleResult.reasons,
    emittedEvents: lifecycleResult.emittedEvents,
    operationProgress: lifecycleResult.operationProgress,
    correlationKey: normalizeOperationProgressText(
      evidence.correlationKey,
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.CORRELATION_KEY_UNAVAILABLE,
    ),
    sourceRevision: normalizeOperationProgressText(
      evidence.sourceRevision,
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
  });
}

function decideOperationLifecycle(rawEvidence, currentProgressInput) {
  const evidence = normalizeOperationWorkflowEvidence(rawEvidence);
  const event = resolveOperationLifecycleEvent(evidence);
  const currentProgress = isOperationProgressRecord(currentProgressInput) ?
    normalizeOperationProgressRecord(currentProgressInput, evidence) :
    createInitialOperationProgress({
      evidence,
      operationId: evidence.operationKey,
    });
  const selectedProgress = isOperationProgressRecord(currentProgressInput) ?
    currentProgress :
    Object.freeze({
      ...currentProgress,
      state: selectInitialStateForEvent(event.type),
    });
  const lifecycleResult = advanceOperationLifecycle(selectedProgress, event);
  return buildOperationLifecycleOutcome(
    lifecycleResult.transition,
    lifecycleResult,
    event,
  );
}

function isOperationProgressTerminalState(state) {
  return OPERATION_PROGRESS_TERMINAL_STATES.has(state);
}

export {
  OPERATION_LIFECYCLE_EVENT_TYPE,
  OPERATION_LIFECYCLE_STATE,
  OPERATION_LIFECYCLE_TRANSITION_TABLE,
  OPERATION_PROGRESS_DECISION_SOURCE,
  OPERATION_PROGRESS_OBSERVER_SOURCE,
  OPERATION_PROGRESS_RESOURCE,
  OPERATION_PROGRESS_RETENTION_STATE,
  OPERATION_PROGRESS_RETRY_STATE,
  OPERATION_PROGRESS_SCHEMA_VERSION,
  OPERATION_PROGRESS_TERMINAL_OUTCOME,
  OPERATION_PROGRESS_UNKNOWN,
  OPERATION_PROGRESS_VISIBILITY_STATE,
  advanceOperationLifecycle,
  createInitialOperationProgress,
  decideOperationLifecycle,
  isOperationProgressTerminalState,
  normalizeOperationProgressRecord,
  resolveOperationLifecycleEvent,
};
