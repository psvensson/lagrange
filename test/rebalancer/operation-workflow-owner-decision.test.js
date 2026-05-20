import {test} from '../../src/test-helpers/tap.js';
import {
  OPERATION_WORKFLOW_COMMAND_STATE,
  OPERATION_WORKFLOW_DISPATCH_STATE,
  OPERATION_WORKFLOW_DURABLE_OPERATION_STATE,
  OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE,
  OPERATION_WORKFLOW_FORBIDDEN_INPUT_FIELDS,
  OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
  OPERATION_WORKFLOW_RETRY_BUDGET_STATE,
  OPERATION_WORKFLOW_RETRY_DEADLINE_STATE,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
  OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
  OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
  OPERATION_WORKFLOW_TERMINAL_STATE,
  OPERATION_WORKFLOW_TIMEOUT_STATE,
  OPERATION_WORKFLOW_TRANSITION_STATE,
  OPERATION_WORKFLOW_WAKE_STATE,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {
  normalizeOperationWorkflowEvidence,
} from '../../src/rebalancer/operation-workflow-owner-evidence.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMANDS,
  buildOperationWorkflowEffectCommand,
} from '../../src/rebalancer/operation-workflow-owner-effects.js';
import {
  OPERATION_WORKFLOW_PROGRESS_STATES,
} from '../../src/rebalancer/operation-workflow-owner-state.js';
import {
  OPERATION_WORKFLOW_PROGRESS_DECISION_TABLE,
  OPERATION_WORKFLOW_PROGRESS_OUTCOMES,
  OPERATION_WORKFLOW_REASON_CODES,
  decideOperationWorkflowProgress,
} from '../../src/rebalancer/operation-workflow-owner-decision.js';

const TEST_OPERATION_KEY = 'operation-kernel-test';
const TEST_CORRELATION_KEY = 'operation-kernel-correlation';
const TEST_SOURCE_REVISION = 'workflow-revision-1';
const TEST_PUBLICATION_REVISION = 'publication-revision-1';
const TEST_OWNER_NODE_KEY = 'node-owner-1';
const TEST_REMOTE_OWNER_NODE_KEY = 'node-owner-2';
const TEST_LEASE_TERM = 7;
const TEST_PRIOR_OPERATION_KEY = 'operation-kernel-prior';
const TEST_FOREIGN_OWNER = 'priority_recovery_observation_owner';
const TEST_FORBIDDEN_INPUT_VALUE = 'workflow_timeout';
const TEST_FORBIDDEN_INPUT_FIELD = OPERATION_WORKFLOW_FORBIDDEN_INPUT_FIELDS[0];
const TEST_REBALANCER_HANDOFF_RETRY_STATE =
  'remote_owner_handoff_retry_scheduled';
const TEST_REBALANCER_HANDOFF_RETRY_OUTCOME =
  'wait_for_rebalancer_handoff_retry';
const TEST_REBALANCER_HANDOFF_RETRY_REASON =
  'remote_handoff_retry_scheduled';

const EXPECTED_DECISION_TABLE_STATES = Object.freeze([
  OPERATION_WORKFLOW_PROGRESS_STATES.OPERATION_INPUT_REJECTED,
  OPERATION_WORKFLOW_PROGRESS_STATES.TERMINAL_FAILURE_OBSERVED,
  OPERATION_WORKFLOW_PROGRESS_STATES.TERMINAL_SUCCESS_OBSERVED,
  OPERATION_WORKFLOW_PROGRESS_STATES.AUTHORITATIVE_VISIBILITY_DEFERRED,
  OPERATION_WORKFLOW_PROGRESS_STATES.STALE_PROGRESS_RECONCILE_REQUIRED,
  OPERATION_WORKFLOW_PROGRESS_STATES.SERIAL_DEPENDENCY_PENDING,
  OPERATION_WORKFLOW_PROGRESS_STATES.LOCAL_OWNER_DISPATCH_READY,
  TEST_REBALANCER_HANDOFF_RETRY_STATE,
  OPERATION_WORKFLOW_PROGRESS_STATES.REMOTE_OWNER_WAKE_REQUIRED,
  OPERATION_WORKFLOW_PROGRESS_STATES.EXISTING_OPERATION_ADVANCEMENT_READY,
  OPERATION_WORKFLOW_PROGRESS_STATES.OWNER_PROGRESS_WAIT_REQUIRED,
]);

function buildDurableOperation(overrides = {}) {
  return {
    recordState: OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.AVAILABLE,
    operationKey: TEST_OPERATION_KEY,
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
    commandState: OPERATION_WORKFLOW_COMMAND_STATE.IN_FLIGHT,
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

function buildRetryBudget(overrides = {}) {
  return {
    budgetState: OPERATION_WORKFLOW_RETRY_BUDGET_STATE.AVAILABLE,
    deadlineState: OPERATION_WORKFLOW_RETRY_DEADLINE_STATE.ACTIVE,
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
    requiredRevision: TEST_PUBLICATION_REVISION,
    observedRevision: TEST_PUBLICATION_REVISION,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  };
}

function buildDispatchObservation(overrides = {}) {
  return {
    dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.OBSERVED,
    wakeState: OPERATION_WORKFLOW_WAKE_STATE.OBSERVED,
    commandState: OPERATION_WORKFLOW_COMMAND_STATE.IN_FLIGHT,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  };
}

function buildEvidence(overrides = {}) {
  return {
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    operationKey: TEST_OPERATION_KEY,
    correlationKey: TEST_CORRELATION_KEY,
    sourceRevision: TEST_SOURCE_REVISION,
    durableOperation: buildDurableOperation(),
    workflowHistory: buildWorkflowHistory(),
    ownerLease: buildOwnerLease(),
    serialDependency: buildSerialDependency(),
    retryBudget: buildRetryBudget(),
    timeoutBudget: buildTimeoutBudget(),
    publicationFence: buildPublicationFence(),
    dispatchObservation: buildDispatchObservation(),
    ...overrides,
  };
}

function assertOutcome(t, input, expected) {
  const outcome = decideOperationWorkflowProgress(input);
  t.equal(outcome.owner, OPERATION_WORKFLOW_OWNER, expected.name);
  t.equal(
    outcome.boundary,
    OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    expected.name,
  );
  t.equal(outcome.state, expected.state, expected.name);
  t.equal(outcome.outcome, expected.outcome, expected.name);
  t.equal(
    outcome.nextRequiredAction,
    expected.nextRequiredAction,
    expected.name,
  );
  t.equal(outcome.effectCommand, expected.effectCommand, expected.name);
  t.same(outcome.reasons, expected.reasons, expected.name);
  t.equal(outcome.correlationKey, TEST_CORRELATION_KEY, expected.name);
  t.equal(outcome.sourceRevision, TEST_SOURCE_REVISION, expected.name);
  t.equal(Object.isFrozen(outcome), true, expected.name);
  return outcome;
}

test('operation workflow decision table covers frozen state vocabulary', (t) => {
  t.same(
    OPERATION_WORKFLOW_PROGRESS_DECISION_TABLE.map((entry) => entry.state),
    EXPECTED_DECISION_TABLE_STATES,
  );
  t.end();
});

test('operation workflow normalizer emits explicit absence variants', (t) => {
  const evidence = normalizeOperationWorkflowEvidence({
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    operationKey: TEST_OPERATION_KEY,
    correlationKey: TEST_CORRELATION_KEY,
    sourceRevision: TEST_SOURCE_REVISION,
  });

  t.equal(
    evidence.contractState,
    OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.INSIDE_CONTRACT,
  );
  t.equal(
    evidence.durableOperation.recordState,
    OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.UNAVAILABLE,
  );
  t.equal(
    evidence.serialDependency.dependencyState,
    OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.CLEAR,
  );
  t.equal(
    evidence.ownerLease.authorityState,
    OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.UNAVAILABLE,
  );
  t.equal(
    evidence.sourceRevision,
    TEST_SOURCE_REVISION,
  );
  t.equal(Object.isFrozen(evidence), true);
  t.equal(Object.isFrozen(evidence.durableOperation), true);
  t.end();
});

test('operation workflow decisions map representative blocker states', (t) => {
  const scenarios = [
    {
      name: 'forbidden priority recovery evidence is rejected',
      input: buildEvidence({
        [TEST_FORBIDDEN_INPUT_FIELD]: TEST_FORBIDDEN_INPUT_VALUE,
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.OPERATION_INPUT_REJECTED,
      outcome:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES
          .REJECT_OUT_OF_CONTRACT_EVIDENCE,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES
          .REJECT_OUT_OF_CONTRACT_EVIDENCE,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.OUTSIDE_CONTRACT_EVIDENCE,
      ],
    },
    {
      name: 'missing canonical owner is rejected',
      input: buildEvidence({
        owner: TEST_FOREIGN_OWNER,
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.OPERATION_INPUT_REJECTED,
      outcome:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES
          .REJECT_OUT_OF_CONTRACT_EVIDENCE,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES
          .REJECT_OUT_OF_CONTRACT_EVIDENCE,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.OUTSIDE_CONTRACT_EVIDENCE,
      ],
    },
    {
      name: 'terminal failure is recorded',
      input: buildEvidence({
        durableOperation: buildDurableOperation({
          terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.FAILURE,
        }),
        workflowHistory: buildWorkflowHistory({
          terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.FAILURE,
        }),
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.TERMINAL_FAILURE_OBSERVED,
      outcome: OPERATION_WORKFLOW_PROGRESS_OUTCOMES.TERMINAL_FAILURE,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.TERMINAL_FAILURE,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.RECORD_TERMINAL_FAILURE_COMMAND,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.DURABLE_FAILURE_RECORDED,
        OPERATION_WORKFLOW_REASON_CODES.WORKFLOW_HISTORY_TERMINAL,
      ],
    },
    {
      name: 'terminal success is recorded',
      input: buildEvidence({
        durableOperation: buildDurableOperation({
          terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.SUCCESS,
        }),
        workflowHistory: buildWorkflowHistory({
          terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.SUCCESS,
        }),
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.TERMINAL_SUCCESS_OBSERVED,
      outcome: OPERATION_WORKFLOW_PROGRESS_OUTCOMES.TERMINAL_SUCCESS,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.TERMINAL_SUCCESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.RECORD_TERMINAL_SUCCESS_COMMAND,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.DURABLE_SUCCESS_RECORDED,
        OPERATION_WORKFLOW_REASON_CODES.WORKFLOW_HISTORY_TERMINAL,
      ],
    },
    {
      name: 'authoritative visibility defers progress',
      input: buildEvidence({
        publicationFence: buildPublicationFence({
          fenceState: OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.STALE,
        }),
      }),
      state:
        OPERATION_WORKFLOW_PROGRESS_STATES
          .AUTHORITATIVE_VISIBILITY_DEFERRED,
      outcome:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES
          .DEFER_AUTHORITATIVE_VISIBILITY,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES
          .DEFER_AUTHORITATIVE_VISIBILITY,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.PUBLICATION_FENCE_STALE,
      ],
    },
    {
      name: 'stale timeout progress reconciles through owner',
      input: buildEvidence({
        workflowHistory: buildWorkflowHistory({
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
          freshnessState: OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.STALE,
        }),
        dispatchObservation: buildDispatchObservation({
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
        }),
        timeoutBudget: buildTimeoutBudget({
          timeoutState: OPERATION_WORKFLOW_TIMEOUT_STATE.EXPIRED,
          staleProgressState:
            OPERATION_WORKFLOW_STALE_PROGRESS_STATE.PROVEN,
        }),
      }),
      state:
        OPERATION_WORKFLOW_PROGRESS_STATES
          .STALE_PROGRESS_RECONCILE_REQUIRED,
      outcome:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.RECONCILE_STALE_PROGRESS,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.RECONCILE_STALE_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS
          .RETAIN_PUBLICATION_FOR_RETRY_COMMAND,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.TIMEOUT_BUDGET_EXPIRED,
        OPERATION_WORKFLOW_REASON_CODES.WORKFLOW_HISTORY_STALE,
      ],
    },
    {
      name: 'in-flight workflow command blocks stale progress reconcile',
      input: buildEvidence({
        workflowHistory: buildWorkflowHistory({
          freshnessState: OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.STALE,
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IN_FLIGHT,
        }),
        dispatchObservation: buildDispatchObservation({
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
        }),
        timeoutBudget: buildTimeoutBudget({
          timeoutState: OPERATION_WORKFLOW_TIMEOUT_STATE.EXPIRED,
          staleProgressState:
            OPERATION_WORKFLOW_STALE_PROGRESS_STATE.PROVEN,
        }),
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.OWNER_PROGRESS_WAIT_REQUIRED,
      outcome: OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.OWNER_PROGRESS_IN_FLIGHT,
      ],
    },
    {
      name: 'in-flight dispatch command blocks stale progress reconcile',
      input: buildEvidence({
        workflowHistory: buildWorkflowHistory({
          freshnessState: OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.STALE,
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
        }),
        dispatchObservation: buildDispatchObservation({
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IN_FLIGHT,
        }),
        timeoutBudget: buildTimeoutBudget({
          timeoutState: OPERATION_WORKFLOW_TIMEOUT_STATE.EXPIRED,
          staleProgressState:
            OPERATION_WORKFLOW_STALE_PROGRESS_STATE.PROVEN,
        }),
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.OWNER_PROGRESS_WAIT_REQUIRED,
      outcome: OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.OWNER_PROGRESS_IN_FLIGHT,
      ],
    },
    {
      name: 'serial dependency waits without an effect',
      input: buildEvidence({
        serialDependency: buildSerialDependency({
          dependencyState:
            OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.PENDING,
          priorOperationKey: TEST_PRIOR_OPERATION_KEY,
        }),
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.SERIAL_DEPENDENCY_PENDING,
      outcome:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_SERIAL_OPERATION,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_SERIAL_OPERATION,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.SERIAL_DEPENDENCY_PENDING,
      ],
    },
    {
      name: 'persisted not-dispatched local owner dispatches',
      input: buildEvidence({
        durableOperation: buildDurableOperation({
          dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
        }),
        workflowHistory: buildWorkflowHistory({
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
        }),
        dispatchObservation: buildDispatchObservation({
          dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
        }),
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.LOCAL_OWNER_DISPATCH_READY,
      outcome: OPERATION_WORKFLOW_PROGRESS_OUTCOMES.DISPATCH_LOCAL_OWNER,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.DISPATCH_LOCAL_OWNER,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.DISPATCH_LOCAL_OWNER_COMMAND,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.LOCAL_OWNER_AUTHORITATIVE,
        OPERATION_WORKFLOW_REASON_CODES.DISPATCH_NOT_OBSERVED,
      ],
    },
    {
      name: 'remote owner handoff waits on the scheduled retry path',
      input: buildEvidence({
        ownerLease: buildOwnerLease({
          authorityState:
            OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.REMOTE_AUTHORITATIVE,
          ownerNodeKey: TEST_REMOTE_OWNER_NODE_KEY,
        }),
        dispatchObservation: buildDispatchObservation({
          wakeState: OPERATION_WORKFLOW_WAKE_STATE.REQUIRED,
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
        }),
        retryBudget: buildRetryBudget({
          deadlineState: OPERATION_WORKFLOW_RETRY_DEADLINE_STATE.ACTIVE,
        }),
      }),
      state: TEST_REBALANCER_HANDOFF_RETRY_STATE,
      outcome: TEST_REBALANCER_HANDOFF_RETRY_OUTCOME,
      nextRequiredAction: TEST_REBALANCER_HANDOFF_RETRY_OUTCOME,
      effectCommand: OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.REMOTE_OWNER_AUTHORITATIVE,
        TEST_REBALANCER_HANDOFF_RETRY_REASON,
      ],
    },
    {
      name: 'remote owner wake emits wake command',
      input: buildEvidence({
        ownerLease: buildOwnerLease({
          authorityState:
            OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.REMOTE_AUTHORITATIVE,
          ownerNodeKey: TEST_REMOTE_OWNER_NODE_KEY,
        }),
        dispatchObservation: buildDispatchObservation({
          wakeState: OPERATION_WORKFLOW_WAKE_STATE.REQUIRED,
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
        }),
        retryBudget: buildRetryBudget({
          deadlineState: OPERATION_WORKFLOW_RETRY_DEADLINE_STATE.UNAVAILABLE,
        }),
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.REMOTE_OWNER_WAKE_REQUIRED,
      outcome: OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAKE_REMOTE_OWNER,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAKE_REMOTE_OWNER,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.WAKE_REMOTE_OWNER_COMMAND,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.REMOTE_OWNER_AUTHORITATIVE,
        OPERATION_WORKFLOW_REASON_CODES.WAKE_REQUIRED,
      ],
    },
    {
      name: 'existing workflow transition advances',
      input: buildEvidence({
        workflowHistory: buildWorkflowHistory({
          transitionState: OPERATION_WORKFLOW_TRANSITION_STATE.AVAILABLE,
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
        }),
      }),
      state:
        OPERATION_WORKFLOW_PROGRESS_STATES
          .EXISTING_OPERATION_ADVANCEMENT_READY,
      outcome:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.ADVANCE_EXISTING_OPERATION,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.ADVANCE_EXISTING_OPERATION,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS
          .ADVANCE_EXISTING_OPERATION_COMMAND,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.WORKFLOW_TRANSITION_AVAILABLE,
      ],
    },
    {
      name: 'in-flight command blocks local dispatch',
      input: buildEvidence({
        durableOperation: buildDurableOperation({
          dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
        }),
        dispatchObservation: buildDispatchObservation({
          dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IN_FLIGHT,
        }),
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.OWNER_PROGRESS_WAIT_REQUIRED,
      outcome: OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      effectCommand: OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.OWNER_PROGRESS_IN_FLIGHT,
      ],
    },
    {
      name: 'in-flight command blocks transition advancement',
      input: buildEvidence({
        workflowHistory: buildWorkflowHistory({
          transitionState: OPERATION_WORKFLOW_TRANSITION_STATE.AVAILABLE,
          commandState: OPERATION_WORKFLOW_COMMAND_STATE.IN_FLIGHT,
        }),
      }),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.OWNER_PROGRESS_WAIT_REQUIRED,
      outcome: OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      effectCommand: OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.OWNER_PROGRESS_IN_FLIGHT,
      ],
    },
    {
      name: 'valid in-flight owner progress waits',
      input: buildEvidence(),
      state: OPERATION_WORKFLOW_PROGRESS_STATES.OWNER_PROGRESS_WAIT_REQUIRED,
      outcome: OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      nextRequiredAction:
        OPERATION_WORKFLOW_PROGRESS_OUTCOMES.WAIT_FOR_OWNER_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
      reasons: [
        OPERATION_WORKFLOW_REASON_CODES.OWNER_PROGRESS_IN_FLIGHT,
      ],
    },
  ];

  for (const scenario of scenarios) {
    assertOutcome(t, scenario.input, scenario);
  }
  t.end();
});

test('operation workflow effect command shape is explicit and inert', (t) => {
  const outcome = decideOperationWorkflowProgress(buildEvidence({
    durableOperation: buildDurableOperation({
      dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
    }),
    workflowHistory: buildWorkflowHistory({
      commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
    }),
    dispatchObservation: buildDispatchObservation({
      dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
      commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
    }),
  }));
  const command = buildOperationWorkflowEffectCommand(outcome);

  t.same(command, {
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    effectCommand:
      OPERATION_WORKFLOW_EFFECT_COMMANDS.DISPATCH_LOCAL_OWNER_COMMAND,
    correlationKey: TEST_CORRELATION_KEY,
    sourceRevision: TEST_SOURCE_REVISION,
  });
  t.same(buildOperationWorkflowEffectCommand(), {
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    effectCommand: OPERATION_WORKFLOW_EFFECT_COMMANDS.NO_OPERATION_EFFECT,
    correlationKey:
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.CORRELATION_KEY_UNAVAILABLE,
    sourceRevision:
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
  t.equal(Object.isFrozen(command), true);
  t.end();
});
