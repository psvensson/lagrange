import {test} from '../../src/test-helpers/tap.js';
import {
  OPERATION_WORKFLOW_COMMAND_STATE,
  OPERATION_WORKFLOW_DISPATCH_STATE,
  OPERATION_WORKFLOW_DURABLE_OPERATION_STATE,
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_PROGRESS_STATE_VALUES,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
  OPERATION_WORKFLOW_RETRY_DEADLINE_STATE,
  OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
  OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
  OPERATION_WORKFLOW_TERMINAL_STATE,
  OPERATION_WORKFLOW_TIMEOUT_STATE,
  OPERATION_WORKFLOW_TRANSITION_STATE,
  OPERATION_WORKFLOW_WAKE_STATE,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {
  OPERATION_PROGRESS_RESOURCE,
  OPERATION_LIFECYCLE_EVENT_TYPE,
  OPERATION_LIFECYCLE_STATE,
  OPERATION_LIFECYCLE_TRANSITION_TABLE,
  advanceOperationLifecycle,
  decideOperationLifecycle,
  resolveOperationLifecycleEvent,
} from '../../src/rebalancer/operation-lifecycle.js';
import {
  decideOperationWorkflowProgress,
} from '../../src/rebalancer/operation-workflow-owner-decision.js';

const TEST_OPERATION_KEY = 'operation-progress-test';
const TEST_CORRELATION_KEY = 'operation-progress-correlation';
const TEST_SOURCE_REVISION = 'operation-progress-source-1';
const TEST_OWNER_NODE_KEY = 'node-owner-1';
const TEST_PUBLICATION_REVISION = 'publication-revision-1';

function buildEvidence(overrides = {}) {
  return {
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    operationKey: TEST_OPERATION_KEY,
    correlationKey: TEST_CORRELATION_KEY,
    sourceRevision: TEST_SOURCE_REVISION,
    durableOperation: {
      recordState: OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.AVAILABLE,
      operationKey: TEST_OPERATION_KEY,
      terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL,
      dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.OBSERVED,
      sourceRevision: TEST_SOURCE_REVISION,
    },
    workflowHistory: {
      freshnessState: OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.CURRENT,
      terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL,
      transitionState: OPERATION_WORKFLOW_TRANSITION_STATE.BLOCKED,
      commandState: OPERATION_WORKFLOW_COMMAND_STATE.IN_FLIGHT,
      sourceRevision: TEST_SOURCE_REVISION,
    },
    ownerLease: {
      authorityState:
        OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.LOCAL_AUTHORITATIVE,
      freshnessState: OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.CURRENT,
      ownerNodeKey: TEST_OWNER_NODE_KEY,
      leaseTerm: 7,
    },
    serialDependency: {
      dependencyState: OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.CLEAR,
      priorOperationKey:
        OPERATION_WORKFLOW_IDENTIFIER_VARIANTS
          .PRIOR_OPERATION_KEY_UNAVAILABLE,
      sourceRevision: TEST_SOURCE_REVISION,
    },
    retryBudget: {
      deadlineState: OPERATION_WORKFLOW_RETRY_DEADLINE_STATE.UNAVAILABLE,
      sourceRevision: TEST_SOURCE_REVISION,
    },
    timeoutBudget: {
      timeoutState: OPERATION_WORKFLOW_TIMEOUT_STATE.ACTIVE,
      staleProgressState:
        OPERATION_WORKFLOW_STALE_PROGRESS_STATE.NOT_OBSERVED,
      sourceRevision: TEST_SOURCE_REVISION,
    },
    publicationFence: {
      fenceState: OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.CURRENT,
      requiredRevision: TEST_PUBLICATION_REVISION,
      observedRevision: TEST_PUBLICATION_REVISION,
      sourceRevision: TEST_SOURCE_REVISION,
    },
    dispatchObservation: {
      dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.OBSERVED,
      wakeState: OPERATION_WORKFLOW_WAKE_STATE.OBSERVED,
      commandState: OPERATION_WORKFLOW_COMMAND_STATE.IN_FLIGHT,
      sourceRevision: TEST_SOURCE_REVISION,
    },
    ...overrides,
  };
}

function collectNullishPaths(value, path = 'root', paths = []) {
  if (value === null || value === undefined) {
    paths.push(path);
    return paths;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectNullishPaths(entry, `${path}[${index}]`, paths),
    );
    return paths;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) =>
      collectNullishPaths(entry, `${path}.${key}`, paths),
    );
  }
  return paths;
}

test('operation lifecycle exposes explicit from-event-to transition rows',
  (t) => {
    const transitionRows = OPERATION_LIFECYCLE_TRANSITION_TABLE.map((entry) =>
      `${entry.fromState}|${entry.eventType}|${entry.toState}`);

    t.ok(transitionRows.includes([
      OPERATION_LIFECYCLE_STATE.PLANNED,
      OPERATION_LIFECYCLE_EVENT_TYPE.DISPATCH_REQUESTED,
      OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
    ].join('|')));
    t.ok(transitionRows.includes([
      OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
      OPERATION_LIFECYCLE_EVENT_TYPE.DISPATCH_ACCEPTED,
      OPERATION_LIFECYCLE_STATE.DISPATCHED,
    ].join('|')));
    t.ok(transitionRows.includes([
      OPERATION_LIFECYCLE_STATE.DISPATCHED,
      OPERATION_LIFECYCLE_EVENT_TYPE.PUBLICATION_ACCEPTED,
      OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY,
    ].join('|')));
    t.ok(transitionRows.includes([
      OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY,
      OPERATION_LIFECYCLE_EVENT_TYPE.ACTIVE_GATE_VISIBLE,
      OPERATION_LIFECYCLE_STATE.VISIBLE,
    ].join('|')));
    t.end();
  });

test('operation lifecycle resolves and advances local dispatch readiness',
  (t) => {
    const evidence = buildEvidence({
      durableOperation: {
        ...buildEvidence().durableOperation,
        dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
      },
      workflowHistory: {
        ...buildEvidence().workflowHistory,
        commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
      },
      dispatchObservation: {
        ...buildEvidence().dispatchObservation,
        dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
        commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
      },
    });
    const event = resolveOperationLifecycleEvent(evidence);
    const advanced = advanceOperationLifecycle(
      OPERATION_LIFECYCLE_STATE.OBSERVING,
      event,
    );
    const outcome = decideOperationLifecycle(evidence);

    t.equal(
      event.type,
      OPERATION_LIFECYCLE_EVENT_TYPE.DISPATCH_REQUESTED,
    );
    t.equal(
      advanced.state,
      OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING,
    );
    t.same(
      advanced.sideEffects,
      [OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.DISPATCH_LOCAL_OWNER_COMMAND],
    );
    t.equal(outcome.resource, OPERATION_PROGRESS_RESOURCE);
    t.equal(outcome.operationProgress.resource, OPERATION_PROGRESS_RESOURCE);
    t.equal(outcome.operationProgress.state, advanced.state);
    t.equal(outcome.operationProgress.correlationKey, TEST_CORRELATION_KEY);
    t.same(collectNullishPaths(outcome), []);
    t.end();
  });

test('operation lifecycle records terminal failure as terminal progress',
  (t) => {
    const outcome = decideOperationLifecycle(buildEvidence({
      durableOperation: {
        ...buildEvidence().durableOperation,
        terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.FAILURE,
      },
      workflowHistory: {
        ...buildEvidence().workflowHistory,
        terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.FAILURE,
      },
    }));

    t.equal(
      outcome.state,
      OPERATION_WORKFLOW_PROGRESS_STATE_VALUES.TERMINAL_FAILURE_OBSERVED,
    );
    t.equal(outcome.operationProgress.state, OPERATION_LIFECYCLE_STATE.FAILED);
    t.same(
      outcome.sideEffects,
      [
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
          .RECORD_TERMINAL_FAILURE_COMMAND,
      ],
    );
    t.same(collectNullishPaths(outcome), []);
    t.end();
  });

test('workflow decision facade consumes the owned lifecycle outcome', (t) => {
  const evidence = buildEvidence({
    workflowHistory: {
      ...buildEvidence().workflowHistory,
      transitionState: OPERATION_WORKFLOW_TRANSITION_STATE.AVAILABLE,
      commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
    },
  });
  const lifecycleOutcome = decideOperationLifecycle(evidence);
  const workflowOutcome = decideOperationWorkflowProgress(evidence);

  t.equal(workflowOutcome.resource, OPERATION_PROGRESS_RESOURCE);
  t.same(workflowOutcome, lifecycleOutcome);
  t.end();
});
