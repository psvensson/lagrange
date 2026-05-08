import {NUM} from '../constants/index.js';

const TOPOLOGY_CONTROL_PLANE_OWNER = 'topology_control_plane';
const TOPOLOGY_OWNER_EMPTY_STRING = '';

const PLACEMENT_OWNER_INPUT = Object.freeze({
  AVAILABLE_NODES: 'available_nodes',
  CURRENT_REPLICAS: 'current_replicas',
  POLICY: 'policy',
  TRANSITION_OPERATIONS: 'transition_operations',
});

const PLACEMENT_OWNER_POLICY = Object.freeze({
  MESSAGE_GROUP_LOCAL_ACCESS: 'message_group_local_access',
  PARTITION_SPREAD: 'partition_spread',
  RUNTIME_SERVICE_SPREAD: 'runtime_service_spread',
});

const PLACEMENT_OWNER_TARGET_STATE = Object.freeze({
  NO_TARGET_REQUESTED: 'no_target_requested',
  NO_CANDIDATES: 'no_candidates',
  TARGETS_SELECTED: 'targets_selected',
});

const PLACEMENT_OWNER_TARGET_ACTION = Object.freeze({
  SELECT_NONE: 'select_none',
  SELECT_TARGETS: 'select_targets',
});

const PLACEMENT_OWNER_REASON = Object.freeze({
  NONE: 'none',
  TARGET_COUNT_EMPTY: 'target_count_empty',
  CANDIDATE_SET_EMPTY: 'candidate_set_empty',
  TARGETS_SELECTED: 'targets_selected',
});

const PLACEMENT_OWNER_REINTERPRETATION = Object.freeze({
  CACHE_VISIBILITY: 'cache_visibility',
  SERVICE_ROW_STATUS: 'service_row_status',
  TIMER_AGE: 'timer_age',
  RESERVATION_PRESENCE: 'reservation_presence',
});

const PLACEMENT_OWNER_TARGET_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: PLACEMENT_OWNER_TARGET_STATE.NO_TARGET_REQUESTED,
    matches: (evidence) => evidence.targetCountAvailable !== true,
  }),
  Object.freeze({
    state: PLACEMENT_OWNER_TARGET_STATE.NO_CANDIDATES,
    matches: (evidence) => evidence.candidateNodesAvailable !== true,
  }),
  Object.freeze({
    state: PLACEMENT_OWNER_TARGET_STATE.TARGETS_SELECTED,
    matches: () => true,
  }),
]);

const PLACEMENT_OWNER_TARGET_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      PLACEMENT_OWNER_TARGET_STATE.NO_TARGET_REQUESTED,
      PLACEMENT_OWNER_TARGET_ACTION.SELECT_NONE,
    ],
    [
      PLACEMENT_OWNER_TARGET_STATE.NO_CANDIDATES,
      PLACEMENT_OWNER_TARGET_ACTION.SELECT_NONE,
    ],
    [
      PLACEMENT_OWNER_TARGET_STATE.TARGETS_SELECTED,
      PLACEMENT_OWNER_TARGET_ACTION.SELECT_TARGETS,
    ],
  ]),
);

const PLACEMENT_OWNER_REASON_BY_STATE = Object.freeze(
  new Map([
    [
      PLACEMENT_OWNER_TARGET_STATE.NO_TARGET_REQUESTED,
      PLACEMENT_OWNER_REASON.TARGET_COUNT_EMPTY,
    ],
    [
      PLACEMENT_OWNER_TARGET_STATE.NO_CANDIDATES,
      PLACEMENT_OWNER_REASON.CANDIDATE_SET_EMPTY,
    ],
    [
      PLACEMENT_OWNER_TARGET_STATE.TARGETS_SELECTED,
      PLACEMENT_OWNER_REASON.TARGETS_SELECTED,
    ],
  ]),
);

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
  TIMER_ALREADY_SCHEDULED: 'timer_already_scheduled',
  SCHEDULE_RETRY: 'schedule_retry',
});

const OPERATION_OWNER_RETRY_ACTION = Object.freeze({
  REJECT: 'reject',
  REUSE_TIMER: 'reuse_timer',
  SCHEDULE_TIMER: 'schedule_timer',
});

const OPERATION_OWNER_RESUME_STATE = Object.freeze({
  OPERATION_UNAVAILABLE: 'operation_unavailable',
  TERMINAL_OPERATION: 'terminal_operation',
  REMOTE_OWNER: 'remote_owner',
  DISPATCH_RESUME: 'dispatch_resume',
  TIMEOUT_RECONCILE: 'timeout_reconcile',
});

const OPERATION_OWNER_RESUME_ACTION = Object.freeze({
  CLEAR_RETRY: 'clear_retry',
  DISPATCH: 'dispatch',
  RECONCILE_TIMEOUT: 'reconcile_timeout',
});

const OPERATION_OWNER_TERMINAL_STATE = Object.freeze({
  NON_TERMINAL: 'non_terminal',
  TERMINAL_SUCCESS: 'terminal_success',
  TERMINAL_FAILURE: 'terminal_failure',
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
    state: OPERATION_OWNER_RESUME_STATE.DISPATCH_RESUME,
    matches: (evidence) =>
      evidence.dispatchRetryable === true &&
      (
        evidence.retryGraceActive === true ||
        evidence.stepTimedOut !== true
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
      OPERATION_OWNER_RESUME_STATE.DISPATCH_RESUME,
      OPERATION_OWNER_RESUME_ACTION.DISPATCH,
    ],
    [
      OPERATION_OWNER_RESUME_STATE.TIMEOUT_RECONCILE,
      OPERATION_OWNER_RESUME_ACTION.RECONCILE_TIMEOUT,
    ],
  ]),
);

function normalizePositiveInteger(value) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    NUM.ZERO;
}

function normalizeNodeIdArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value || TOPOLOGY_OWNER_EMPTY_STRING).trim())
    .filter((value) => value.length > NUM.ZERO);
}

function normalizeRankedNodeIds(sortedNodes) {
  if (!Array.isArray(sortedNodes)) {
    return [];
  }
  return normalizeNodeIdArray(sortedNodes.map((node) => node?.node_id));
}

function normalizeTransitionNodeSet(transitionSnapshot, fieldName) {
  const candidate = transitionSnapshot?.[fieldName];
  if (candidate instanceof Set) {
    return candidate;
  }
  return new Set();
}

function resolvePlacementOwnerTargetState(evidence) {
  return (
    PLACEMENT_OWNER_TARGET_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    PLACEMENT_OWNER_TARGET_STATE.NO_CANDIDATES
  );
}

function selectPlacementOwnerTargetNodeIds(evidence) {
  const selectedNodeIds = [...evidence.reservedNodeIds];
  for (const nodeId of evidence.rankedNodeIds) {
    if (selectedNodeIds.length >= evidence.targetCount) {
      break;
    }
    if (evidence.reservedNodeIdSet.has(nodeId)) {
      continue;
    }
    if (evidence.deferredNodeIdSet.has(nodeId)) {
      continue;
    }
    selectedNodeIds.push(nodeId);
  }
  for (const nodeId of evidence.deferredNodeIds) {
    if (selectedNodeIds.length >= evidence.targetCount) {
      break;
    }
    selectedNodeIds.push(nodeId);
  }
  const selectedNodeIdSet = new Set(selectedNodeIds);
  return evidence.rankedNodeIds
    .filter((nodeId) => selectedNodeIdSet.has(nodeId))
    .slice(NUM.ZERO, evidence.targetCount);
}

function buildPlacementOwnerTargetEvidence(options = {}) {
  const rankedNodeIds = normalizeRankedNodeIds(options.sortedNodes);
  const targetCount = normalizePositiveInteger(options.targetCount);
  const reservedTransitionNodeSet = normalizeTransitionNodeSet(
    options.transitionSnapshot,
    'nodesWithEntityAddTransitional',
  );
  const globalSystemTransitionNodeSet =
    options.includeGlobalSystemDeferral === true ?
      normalizeTransitionNodeSet(
        options.transitionSnapshot,
        'nodesWithGlobalSystemAddTransitional',
      ) :
      new Set();
  const reservedNodeIds = rankedNodeIds
    .filter((nodeId) => reservedTransitionNodeSet.has(nodeId))
    .slice(NUM.ZERO, targetCount);
  const reservedNodeIdSet = new Set(reservedNodeIds);
  const deferredNodeIds = rankedNodeIds
    .filter(
      (nodeId) =>
        globalSystemTransitionNodeSet.has(nodeId) &&
        !reservedNodeIdSet.has(nodeId),
    )
    .slice(NUM.ZERO, targetCount);
  const deferredNodeIdSet = new Set(deferredNodeIds);
  return Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    inputs: PLACEMENT_OWNER_INPUT,
    policy: options.policy || PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
    rankedNodeIds,
    targetCount,
    reservedNodeIds,
    deferredNodeIds,
    reservedNodeIdSet,
    deferredNodeIdSet,
    targetCountAvailable: targetCount > NUM.ZERO,
    candidateNodesAvailable: rankedNodeIds.length > NUM.ZERO,
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

function buildPlacementOwnerTargetOutcome(options = {}) {
  const evidence = buildPlacementOwnerTargetEvidence(options);
  const state = resolvePlacementOwnerTargetState(evidence);
  const action =
    PLACEMENT_OWNER_TARGET_ACTION_BY_STATE.get(state) ||
    PLACEMENT_OWNER_TARGET_ACTION.SELECT_NONE;
  const targetNodeIds =
    action === PLACEMENT_OWNER_TARGET_ACTION.SELECT_TARGETS ?
      selectPlacementOwnerTargetNodeIds(evidence) :
      [];
  return Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    state,
    action,
    reason:
      PLACEMENT_OWNER_REASON_BY_STATE.get(state) ||
      PLACEMENT_OWNER_REASON.NONE,
    targetNodeIds,
    reservedNodeIds: evidence.reservedNodeIds,
    deferredNodeIds: evidence.deferredNodeIds,
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

function buildOperationOwnerRetryOutcome(options = {}) {
  const retryAfterMs = normalizePositiveInteger(options.retryAfterMs);
  const fallbackDelayMs = normalizePositiveInteger(options.fallbackDelayMs);
  const evidence = Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    inputs: OPERATION_OWNER_INPUT,
    retryKind: options.retryKind || OPERATION_OWNER_RETRY_KIND.TRANSITION,
    operationAvailable:
      typeof options.operationId === 'string' &&
      options.operationId.length > NUM.ZERO,
    retryable: options.retryable === true,
    timerActive: options.timerActive === true,
    retryAfterMs,
    fallbackDelayMs,
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
    delayMs: retryAfterMs > NUM.ZERO ? retryAfterMs : fallbackDelayMs,
    forbiddenReinterpretations: OPERATION_OWNER_REINTERPRETATION,
  });
}

function buildOperationOwnerResumeOutcome(options = {}) {
  const evidence = Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    inputs: OPERATION_OWNER_INPUT,
    operationAvailable: options.operationAvailable === true,
    terminalOperation: options.terminalOperation === true,
    locallyOwned: options.locallyOwned === true,
    dispatchRetryable: options.dispatchRetryable === true,
    retryGraceActive: options.retryGraceActive === true,
    stepTimedOut: options.stepTimedOut === true,
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
    terminalState:
      evidence.terminalOperation === true ?
        OPERATION_OWNER_TERMINAL_STATE.TERMINAL_SUCCESS :
        OPERATION_OWNER_TERMINAL_STATE.NON_TERMINAL,
    forbiddenReinterpretations: OPERATION_OWNER_REINTERPRETATION,
  });
}

export {
  OPERATION_OWNER_INPUT,
  OPERATION_OWNER_REINTERPRETATION,
  OPERATION_OWNER_RESUME_ACTION,
  OPERATION_OWNER_RESUME_STATE,
  OPERATION_OWNER_RETRY_ACTION,
  OPERATION_OWNER_RETRY_KIND,
  OPERATION_OWNER_RETRY_STATE,
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
