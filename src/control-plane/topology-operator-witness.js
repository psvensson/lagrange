import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from './priority-recovery-diagnostics-constants.js';
import {OPERATION_WORKFLOW_OWNER} from '../rebalancer/operation-workflow-owner-constants.js';

const TOPOLOGY_OPERATOR_WITNESS_LITERAL = Object.freeze({
  EMPTY: '',
  DEFAULT_KIND: 'workflow_progress',
  BOUNDARY_UNAVAILABLE: 'topology_operator_witness_boundary_unavailable',
  DEADLINE_UNAVAILABLE: 'deadline_unavailable',
  LAST_OBSERVED_UNAVAILABLE: 'last_observed_unavailable',
  OPERATOR_UNAVAILABLE: 'operator_unavailable',
  PARTITION_UNAVAILABLE: 'partition_unavailable',
  STEP_UNAVAILABLE: 'step_unavailable',
  TARGET_UNAVAILABLE: 'target_unavailable',
});

const TOPOLOGY_OPERATOR_WITNESS_FIELD = Object.freeze({
  OPERATOR_ID: 'operatorId',
  OWNER: 'owner',
  BOUNDARY: 'boundary',
  KIND: 'kind',
  PARTITION_ID: 'partitionId',
  TARGET_NODE_ID: 'targetNodeId',
  STEPS: 'steps',
  CURRENT_STEP_ID: 'currentStepId',
  CURRENT_STEP_STATE: 'currentStepState',
  NEXT_ACTION: 'nextAction',
  DEADLINE_MS: 'deadlineMs',
  LAST_OBSERVED_AT_MS: 'lastObservedAtMs',
});

const TOPOLOGY_OPERATOR_WITNESS_STEP_FIELD = Object.freeze({
  STEP_ID: 'stepId',
  STATE: 'state',
  CURRENT: 'current',
});

const TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE = Object.freeze({
  PLANNED: 'planned',
  DISPATCHED: 'dispatched',
  OBSERVED: 'observed',
  RETRY_SCHEDULED: 'retry_scheduled',
  BLOCKED: 'blocked',
  TERMINAL: 'terminal',
});

const TOPOLOGY_OPERATOR_WITNESS_PROGRESS_STEP_IDS = Object.freeze([
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_SYNC,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.SOURCE_REMOVAL,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL,
]);

const TOPOLOGY_OPERATOR_WITNESS_ACTUATION_STATE_TO_STEP_STATE =
  Object.freeze(new Map([
    [
      PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
      TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.PLANNED,
    ],
    [
      PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
      TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.PLANNED,
    ],
    [
      PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.DISPATCHED,
    ],
    [
      PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
      TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.RETRY_SCHEDULED,
    ],
    [
      PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_COMPLETED,
      TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.TERMINAL,
    ],
    [
      PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_FAILED,
      TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.TERMINAL,
    ],
  ]));

const TOPOLOGY_OPERATOR_WITNESS_STEP_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.TERMINAL,
    matches: (evidence) =>
      evidence.currentStepId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TERMINAL,
  }),
  Object.freeze({
    state: TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.RETRY_SCHEDULED,
    matches: (evidence) =>
      evidence.waitMode === PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED ||
      evidence.actuationStepState ===
        TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.RETRY_SCHEDULED,
  }),
  Object.freeze({
    state: TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.BLOCKED,
    matches: (evidence) =>
      evidence.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT &&
      evidence.waitMode === PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
  }),
  Object.freeze({
    state: TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.DISPATCHED,
    matches: (evidence) =>
      evidence.actuationStepState ===
        TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.DISPATCHED ||
      evidence.nextAction ===
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  }),
  Object.freeze({
    state: TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.PLANNED,
    matches: (evidence) =>
      evidence.actuationStepState ===
        TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.PLANNED ||
      evidence.nextAction ===
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
  }),
  Object.freeze({
    state: TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.OBSERVED,
    matches: () => true,
  }),
]);

function normalizeTopologyOperatorWitnessText(value, fallback) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    fallback;
}

function normalizeTopologyOperatorWitnessTimestamp(value, fallback) {
  return Number.isFinite(value) && value >= NUM.ZERO ? value : fallback;
}

function resolveTopologyOperatorWitnessOperation(snapshot, options) {
  if (options.operation && typeof options.operation === TYPEOF.OBJECT) {
    return options.operation;
  }
  if (
    snapshot?.coordinator?.operation &&
    typeof snapshot.coordinator.operation === TYPEOF.OBJECT
  ) {
    return snapshot.coordinator.operation;
  }
  return {};
}

function resolveTopologyOperatorWitnessCurrentStepId(snapshot, options) {
  return normalizeTopologyOperatorWitnessText(
    options.currentStepId || snapshot?.progress?.workflowProgressPhaseId,
    TOPOLOGY_OPERATOR_WITNESS_LITERAL.STEP_UNAVAILABLE,
  );
}

function resolveTopologyOperatorWitnessActuationStepState(snapshot) {
  return (
    TOPOLOGY_OPERATOR_WITNESS_ACTUATION_STATE_TO_STEP_STATE.get(
      snapshot?.actuation?.state,
    ) ||
    TOPOLOGY_OPERATOR_WITNESS_LITERAL.EMPTY
  );
}

function resolveTopologyOperatorWitnessCurrentStepState(
  snapshot,
  options,
  currentStepId,
) {
  const explicitStepState = normalizeTopologyOperatorWitnessText(
    options.currentStepState,
    TOPOLOGY_OPERATOR_WITNESS_LITERAL.EMPTY,
  );
  if (explicitStepState.length > NUM.ZERO) {
    return explicitStepState;
  }
  const evidence = Object.freeze({
    currentStepId,
    actuationStepState: resolveTopologyOperatorWitnessActuationStepState(
      snapshot,
    ),
    waitMode: snapshot?.progress?.waitMode,
    blockingBoundary: snapshot?.progress?.blockingBoundary,
    nextAction: snapshot?.progress?.nextRequiredAction,
  });
  return (
    TOPOLOGY_OPERATOR_WITNESS_STEP_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.OBSERVED
  );
}

function buildTopologyOperatorWitnessSteps(currentStepId, currentStepState) {
  const configuredStepIds =
    currentStepId === TOPOLOGY_OPERATOR_WITNESS_LITERAL.STEP_UNAVAILABLE ?
      [currentStepId] :
      TOPOLOGY_OPERATOR_WITNESS_PROGRESS_STEP_IDS;
  const stepIds = configuredStepIds.includes(currentStepId) ?
    configuredStepIds :
    [...configuredStepIds, currentStepId];
  return Object.freeze(stepIds.map((stepId) => {
    const current = stepId === currentStepId;
    return Object.freeze({
      [TOPOLOGY_OPERATOR_WITNESS_STEP_FIELD.STEP_ID]: stepId,
      [TOPOLOGY_OPERATOR_WITNESS_STEP_FIELD.STATE]: current ?
        currentStepState :
        TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE.PLANNED,
      [TOPOLOGY_OPERATOR_WITNESS_STEP_FIELD.CURRENT]: current,
    });
  }));
}

function buildTopologyOperatorWitnessFromWorkflowProgress(
  snapshot = {},
  options = {},
) {
  const operation = resolveTopologyOperatorWitnessOperation(snapshot, options);
  const currentStepId =
    resolveTopologyOperatorWitnessCurrentStepId(snapshot, options);
  const currentStepState =
    resolveTopologyOperatorWitnessCurrentStepState(
      snapshot,
      options,
      currentStepId,
    );
  const operationId = normalizeTopologyOperatorWitnessText(
    options.operatorId || snapshot?.operationId || operation.operationId,
    TOPOLOGY_OPERATOR_WITNESS_LITERAL.OPERATOR_UNAVAILABLE,
  );
  const owner = normalizeTopologyOperatorWitnessText(
    options.owner || snapshot?.progress?.currentOwner,
    OPERATION_WORKFLOW_OWNER,
  );
  const boundary = normalizeTopologyOperatorWitnessText(
    options.boundary || snapshot?.progress?.blockingBoundary,
    TOPOLOGY_OPERATOR_WITNESS_LITERAL.BOUNDARY_UNAVAILABLE,
  );
  const nextAction = normalizeTopologyOperatorWitnessText(
    options.nextAction || snapshot?.progress?.nextRequiredAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.NONE,
  );
  const deadlineMs = normalizeTopologyOperatorWitnessTimestamp(
    options.deadlineMs,
    normalizeTopologyOperatorWitnessTimestamp(
      Number(operation.updatedAtMs || operation.updatedAt) +
        Number(snapshot?.progress?.stepTimeoutMs || NUM.ZERO),
      TOPOLOGY_OPERATOR_WITNESS_LITERAL.DEADLINE_UNAVAILABLE,
    ),
  );
  const lastObservedAtMs = normalizeTopologyOperatorWitnessTimestamp(
    options.lastObservedAtMs,
    normalizeTopologyOperatorWitnessTimestamp(
      snapshot?.progress?.lastProgressAtMs ||
        operation.updatedAtMs ||
        operation.updatedAt ||
        snapshot?.capturedAt,
      TOPOLOGY_OPERATOR_WITNESS_LITERAL.LAST_OBSERVED_UNAVAILABLE,
    ),
  );

  return Object.freeze({
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.OPERATOR_ID]: operationId,
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.OWNER]: owner,
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.BOUNDARY]: boundary,
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.KIND]:
      normalizeTopologyOperatorWitnessText(
        options.kind || operation.type,
        TOPOLOGY_OPERATOR_WITNESS_LITERAL.DEFAULT_KIND,
      ),
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.PARTITION_ID]:
      normalizeTopologyOperatorWitnessText(
        options.partitionId || snapshot?.partitionId || operation.partitionId,
        TOPOLOGY_OPERATOR_WITNESS_LITERAL.PARTITION_UNAVAILABLE,
      ),
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.TARGET_NODE_ID]:
      normalizeTopologyOperatorWitnessText(
        options.targetNodeId || operation.targetNodeId,
        TOPOLOGY_OPERATOR_WITNESS_LITERAL.TARGET_UNAVAILABLE,
      ),
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.STEPS]:
      buildTopologyOperatorWitnessSteps(currentStepId, currentStepState),
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.CURRENT_STEP_ID]: currentStepId,
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.CURRENT_STEP_STATE]: currentStepState,
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.NEXT_ACTION]: nextAction,
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.DEADLINE_MS]: deadlineMs,
    [TOPOLOGY_OPERATOR_WITNESS_FIELD.LAST_OBSERVED_AT_MS]: lastObservedAtMs,
  });
}

export {
  TOPOLOGY_OPERATOR_WITNESS_CURRENT_STEP_STATE,
  TOPOLOGY_OPERATOR_WITNESS_FIELD,
  TOPOLOGY_OPERATOR_WITNESS_STEP_FIELD,
  buildTopologyOperatorWitnessFromWorkflowProgress,
};
