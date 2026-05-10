import {test} from '../../src/test-helpers/tap.js';
import {
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_COMMAND_STATE,
  OPERATION_WORKFLOW_DISPATCH_STATE,
  OPERATION_WORKFLOW_DURABLE_OPERATION_STATE,
  OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
  OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
  OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
  OPERATION_WORKFLOW_TERMINAL_STATE,
  OPERATION_WORKFLOW_TIMEOUT_STATE,
  OPERATION_WORKFLOW_TRANSITION_STATE,
  OPERATION_WORKFLOW_WAKE_STATE,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMANDS,
} from '../../src/rebalancer/operation-workflow-owner-effects.js';
import {
  createOperationWorkflowOwnerAdapter,
} from '../../src/rebalancer/operation-workflow-owner-adapter.js';
import {
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE,
  createOperationWorkflowOwnerPorts,
} from '../../src/rebalancer/operation-workflow-owner-ports.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';

const TEST_OPERATION_ID = 'adapter-operation';
const TEST_SOURCE_REVISION = 'adapter-source-revision';
const TEST_OWNER_NODE_KEY = 'adapter-owner-node';
const TEST_LEASE_TERM = 9;
const TEST_REQUIRED_REVISION = 'adapter-required-revision';
const TEST_PRIOR_OPERATION_ID = 'adapter-prior-operation';

function buildOperation(overrides = {}) {
  return Object.freeze({
    operationId: TEST_OPERATION_ID,
    ...overrides,
  });
}

function buildDurableOperation(overrides = {}) {
  return {
    recordState: OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.AVAILABLE,
    operationKey: TEST_OPERATION_ID,
    terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL,
    dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.OBSERVED,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  };
}

function buildWorkflowHistory(overrides = {}) {
  return {
    freshnessState: OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.CURRENT,
    terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL,
    transitionState: OPERATION_WORKFLOW_TRANSITION_STATE.BLOCKED,
    commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  };
}

function buildOwnerLease(overrides = {}) {
  return {
    authorityState:
      OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.LOCAL_AUTHORITATIVE,
    freshnessState: OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.CURRENT,
    ownerNodeKey: TEST_OWNER_NODE_KEY,
    leaseTerm: TEST_LEASE_TERM,
    ...overrides,
  };
}

function buildSerialDependency(overrides = {}) {
  return {
    dependencyState: OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.CLEAR,
    priorOperationKey:
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS
        .PRIOR_OPERATION_KEY_UNAVAILABLE,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  };
}

function buildTimeoutBudget(overrides = {}) {
  return {
    timeoutState: OPERATION_WORKFLOW_TIMEOUT_STATE.ACTIVE,
    staleProgressState:
      OPERATION_WORKFLOW_STALE_PROGRESS_STATE.NOT_OBSERVED,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  };
}

function buildPublicationFence(overrides = {}) {
  return {
    fenceState: OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.CURRENT,
    requiredRevision: TEST_REQUIRED_REVISION,
    observedRevision: TEST_REQUIRED_REVISION,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  };
}

function buildDispatchObservation(overrides = {}) {
  return {
    dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.OBSERVED,
    wakeState: OPERATION_WORKFLOW_WAKE_STATE.OBSERVED,
    commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  };
}

function buildEvidence(overrides = {}) {
  return {
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    operationKey: TEST_OPERATION_ID,
    correlationKey: TEST_OPERATION_ID,
    sourceRevision: TEST_SOURCE_REVISION,
    durableOperation: buildDurableOperation(),
    workflowHistory: buildWorkflowHistory(),
    ownerLease: buildOwnerLease(),
    serialDependency: buildSerialDependency(),
    timeoutBudget: buildTimeoutBudget(),
    publicationFence: buildPublicationFence(),
    dispatchObservation: buildDispatchObservation(),
    ...overrides,
  };
}

function buildAdapterHarness() {
  const calls = [];
  const ports = {
    async readDurableOperation() {
      return buildOperation();
    },
    readWorkflowHistory() {
      return buildWorkflowHistory();
    },
    readOwnerLease() {
      return buildOwnerLease();
    },
    readSerialDependency() {
      return buildSerialDependency();
    },
    readTimeoutBudget() {
      return buildTimeoutBudget();
    },
    readPublicationFence() {
      return buildPublicationFence();
    },
    readDispatchObservation() {
      return buildDispatchObservation();
    },
    dispatchLocalOwner() {
      calls.push(OPERATION_WORKFLOW_EFFECT_COMMANDS
        .DISPATCH_LOCAL_OWNER_COMMAND);
      return true;
    },
    wakeRemoteOwner() {
      calls.push(OPERATION_WORKFLOW_EFFECT_COMMANDS
        .WAKE_REMOTE_OWNER_COMMAND);
      return true;
    },
    advanceExistingOperation() {
      calls.push(OPERATION_WORKFLOW_EFFECT_COMMANDS
        .ADVANCE_EXISTING_OPERATION_COMMAND);
      return true;
    },
    reconcileStaleProgress() {
      calls.push(OPERATION_WORKFLOW_EFFECT_COMMANDS
        .RECONCILE_STALE_PROGRESS_COMMAND);
      return true;
    },
    recordTerminalSuccess() {
      calls.push(OPERATION_WORKFLOW_EFFECT_COMMANDS
        .RECORD_TERMINAL_SUCCESS_COMMAND);
      return true;
    },
    recordTerminalFailure() {
      calls.push(OPERATION_WORKFLOW_EFFECT_COMMANDS
        .RECORD_TERMINAL_FAILURE_COMMAND);
      return true;
    },
    waitForOwnerProgress() {
      calls.push(OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT);
      return false;
    },
  };
  return {
    adapter: createOperationWorkflowOwnerAdapter({ports}),
    calls,
  };
}

function buildOwnerPortHarness() {
  const calls = [];
  const owner = {
    nodeId: TEST_OWNER_NODE_KEY,
    repository: {
      isOperationTerminal() {
        return false;
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    resolveCoordinatorCreatedOperationOwnerNodeId() {
      return TEST_OWNER_NODE_KEY;
    },
    isDispatchRetryableWorkflowStep() {
      return false;
    },
    clearCreatedOperationHandoffRetry() {},
    async dispatchOperationInternal() {
      calls.push(
        OPERATION_WORKFLOW_EFFECT_COMMANDS.DISPATCH_LOCAL_OWNER_COMMAND,
      );
      return {success: true};
    },
    reconcileOperationLifecycle() {
      calls.push(
        OPERATION_WORKFLOW_EFFECT_COMMANDS
          .ADVANCE_EXISTING_OPERATION_COMMAND,
      );
      return true;
    },
  };
  return {
    adapter: createOperationWorkflowOwnerAdapter({
      ports: createOperationWorkflowOwnerPorts(owner),
    }),
    calls,
  };
}

test('operation workflow adapter executes canonical effect commands', async (t) => {
  const scenarios = [
    {
      name: 'local dispatch',
      evidence: buildEvidence({
        durableOperation: buildDurableOperation({
          dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
        }),
        dispatchObservation: buildDispatchObservation({
          dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
        }),
      }),
      command:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.DISPATCH_LOCAL_OWNER_COMMAND,
      applied: true,
    },
    {
      name: 'remote wake',
      evidence: buildEvidence({
        ownerLease: buildOwnerLease({
          authorityState:
            OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.REMOTE_AUTHORITATIVE,
        }),
        dispatchObservation: buildDispatchObservation({
          wakeState: OPERATION_WORKFLOW_WAKE_STATE.REQUIRED,
        }),
      }),
      command: OPERATION_WORKFLOW_EFFECT_COMMANDS.WAKE_REMOTE_OWNER_COMMAND,
      applied: true,
    },
    {
      name: 'stale progress reconcile',
      evidence: buildEvidence({
        workflowHistory: buildWorkflowHistory({
          freshnessState: OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.STALE,
        }),
        timeoutBudget: buildTimeoutBudget({
          timeoutState: OPERATION_WORKFLOW_TIMEOUT_STATE.EXPIRED,
          staleProgressState:
            OPERATION_WORKFLOW_STALE_PROGRESS_STATE.PROVEN,
        }),
      }),
      command:
        OPERATION_WORKFLOW_EFFECT_COMMANDS
          .RECONCILE_STALE_PROGRESS_COMMAND,
      applied: true,
    },
    {
      name: 'existing transition advancement',
      evidence: buildEvidence({
        workflowHistory: buildWorkflowHistory({
          transitionState: OPERATION_WORKFLOW_TRANSITION_STATE.AVAILABLE,
        }),
      }),
      command:
        OPERATION_WORKFLOW_EFFECT_COMMANDS
          .ADVANCE_EXISTING_OPERATION_COMMAND,
      applied: true,
    },
    {
      name: 'terminal success record',
      evidence: buildEvidence({
        durableOperation: buildDurableOperation({
          terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.SUCCESS,
        }),
        workflowHistory: buildWorkflowHistory({
          terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.SUCCESS,
        }),
      }),
      command:
        OPERATION_WORKFLOW_EFFECT_COMMANDS
          .RECORD_TERMINAL_SUCCESS_COMMAND,
      applied: true,
    },
    {
      name: 'terminal failure record',
      evidence: buildEvidence({
        durableOperation: buildDurableOperation({
          terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.FAILURE,
        }),
        workflowHistory: buildWorkflowHistory({
          terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.FAILURE,
        }),
      }),
      command:
        OPERATION_WORKFLOW_EFFECT_COMMANDS
          .RECORD_TERMINAL_FAILURE_COMMAND,
      applied: true,
    },
    {
      name: 'serial wait no-op',
      evidence: buildEvidence({
        serialDependency: buildSerialDependency({
          dependencyState:
            OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.PENDING,
          priorOperationKey: TEST_PRIOR_OPERATION_ID,
        }),
      }),
      command: OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      applied: false,
    },
  ];

  for (const scenario of scenarios) {
    const harness = buildAdapterHarness();
    const result = await harness.adapter.run(buildOperation(), {
      evidence: scenario.evidence,
    });
    t.equal(result.command.effectCommand, scenario.command, scenario.name);
    t.equal(result.applied, scenario.applied, scenario.name);
    t.same(harness.calls, [scenario.command], scenario.name);
    t.equal(
      result.commandResultEvidence.effectCommand,
      scenario.command,
      scenario.name,
    );
  }
});

test('operation workflow owner reconcile routes stale sending pending ' +
  'dispatch through the dispatch owner path', async (t) => {
  const harness = buildOwnerPortHarness();
  const result = await harness.adapter.run(
    buildOperation({
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.SENDING,
      updatedAt: TEST_SOURCE_REVISION,
    }),
    {
      mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE,
    },
  );

  t.equal(
    result.outcome.outcome,
    OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
    'stale SENDING/pending owner reconcile should re-enter dispatch',
  );
  t.equal(
    result.command.effectCommand,
    OPERATION_WORKFLOW_EFFECT_COMMANDS.DISPATCH_LOCAL_OWNER_COMMAND,
    'dispatch re-entry should use the canonical local owner command',
  );
  t.same(
    harness.calls,
    [OPERATION_WORKFLOW_EFFECT_COMMANDS.DISPATCH_LOCAL_OWNER_COMMAND],
    'dispatch re-entry should not fall through to transition advancement',
  );
});

test('operation workflow owner reconcile routes persisted pending ' +
  'dispatch through the dispatch owner path', async (t) => {
  const harness = buildOwnerPortHarness();
  const result = await harness.adapter.run(
    buildOperation({
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.PENDING,
      updatedAt: TEST_SOURCE_REVISION,
    }),
    {
      mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE,
    },
  );

  t.equal(
    result.outcome.outcome,
    OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
    'persisted PENDING/pending owner reconcile should re-enter dispatch',
  );
  t.equal(
    result.command.effectCommand,
    OPERATION_WORKFLOW_EFFECT_COMMANDS.DISPATCH_LOCAL_OWNER_COMMAND,
    'persisted PENDING re-entry should use the canonical local owner command',
  );
  t.same(
    harness.calls,
    [OPERATION_WORKFLOW_EFFECT_COMMANDS.DISPATCH_LOCAL_OWNER_COMMAND],
    'persisted PENDING re-entry should not fall through to transition advancement',
  );
});
