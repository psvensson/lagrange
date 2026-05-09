import {test} from '../../src/test-helpers/tap.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  OPERATION_WORKFLOW_REASON_CODE_VALUES,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';

const TEST_PARTITION_ID = 'priority-recovery-owner-contract-p1';
const TEST_OPERATION_ID = 'priority-recovery-owner-contract-op';
const TEST_CORRELATION_KEY = 'priority-recovery-owner-contract-correlation';
const TEST_SOURCE_REVISION = 'priority-recovery-owner-contract-revision';
const TEST_OWNER_STATE = 'priority_recovery_owner_contract_state';
const TEST_OPERATION_OWNER_OBSERVATION_STATE_OBSERVED =
  'operation_owner_outcome_observed';
const TEST_OPERATION_OWNER_EFFECT_EXECUTION_NOT_EXECUTED = 'not_executed';

function buildPriorityRecoveryOwnerConsumerSnapshot(overrides = {}) {
  return Object.freeze({
    partitionId: TEST_PARTITION_ID,
    operationId: TEST_OPERATION_ID,
    blockerReasons: Object.freeze([]),
    semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
    actuation: Object.freeze({
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state:
        PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    progress: Object.freeze({
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
      workflowProgressPhaseId:
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    }),
    ...overrides,
  });
}

function buildOperationOwnerOutcome(overrides = {}) {
  const outcome =
    overrides.outcome ||
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS;
  return Object.freeze({
    owner: OPERATION_WORKFLOW_OWNER,
    boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
    state: TEST_OWNER_STATE,
    outcome,
    nextRequiredAction: outcome,
    effectCommand: OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
    reasons: Object.freeze([]),
    correlationKey: TEST_CORRELATION_KEY,
    sourceRevision: TEST_SOURCE_REVISION,
    ...overrides,
  });
}

function assertOperationOwnerObservation(t, normalizedSnapshot, expected) {
  t.match(
    normalizedSnapshot.operationOwnerObservation,
    {
      state: TEST_OPERATION_OWNER_OBSERVATION_STATE_OBSERVED,
      owner: OPERATION_WORKFLOW_OWNER,
      boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
      outcome: expected.outcome,
      nextRequiredAction: expected.outcome,
      effectCommand: expected.effectCommand,
      effectExecution: TEST_OPERATION_OWNER_EFFECT_EXECUTION_NOT_EXECUTED,
      requestedOwnerAction: expected.requestedOwnerAction,
      correlationKey: TEST_CORRELATION_KEY,
      sourceRevision: TEST_SOURCE_REVISION,
    },
    expected.message,
  );
}

test('priority recovery consumes serial wait operation-owner outcome',
  async (t) => {
    const ownerOutcome = buildOperationOwnerOutcome({
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_SERIAL_OPERATION,
      reasons: Object.freeze([
        OPERATION_WORKFLOW_REASON_CODE_VALUES.SERIAL_DEPENDENCY_PENDING,
      ]),
    });
    const normalizedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        buildPriorityRecoveryOwnerConsumerSnapshot(),
        ownerOutcome,
      );

    t.same(
      normalizedSnapshot.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT],
    );
    t.equal(
      normalizedSnapshot.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
    );
    t.match(normalizedSnapshot.actuation, {
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      state: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
    });
    t.match(normalizedSnapshot.progress, {
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    });
    assertOperationOwnerObservation(t, normalizedSnapshot, {
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_SERIAL_OPERATION,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
      requestedOwnerAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      message: 'serial wait should be an inert owner observation',
    });
  });

test('priority recovery maps persisted-not-dispatched dispatch outcome',
  async (t) => {
    const ownerOutcome = buildOperationOwnerOutcome({
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.DISPATCH_LOCAL_OWNER_COMMAND,
      reasons: Object.freeze([
        OPERATION_WORKFLOW_REASON_CODE_VALUES.LOCAL_OWNER_AUTHORITATIVE,
        OPERATION_WORKFLOW_REASON_CODE_VALUES.DISPATCH_NOT_OBSERVED,
      ]),
    });
    const normalizedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        buildPriorityRecoveryOwnerConsumerSnapshot({
          actuation: Object.freeze({
            owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
            state:
              PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
            workflowProgressPhaseId:
              PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
          }),
        }),
        ownerOutcome,
      );

    t.match(normalizedSnapshot.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    });
    t.match(normalizedSnapshot.progress, {
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    });
    assertOperationOwnerObservation(t, normalizedSnapshot, {
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.DISPATCH_LOCAL_OWNER_COMMAND,
      requestedOwnerAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      message: 'dispatch command should remain a requested owner action only',
    });
  });

test('priority recovery maps stale timeout progress owner outcome',
  async (t) => {
    const ownerOutcome = buildOperationOwnerOutcome({
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
          .RECONCILE_STALE_PROGRESS_COMMAND,
      reasons: Object.freeze([
        OPERATION_WORKFLOW_REASON_CODE_VALUES.TIMEOUT_BUDGET_EXPIRED,
        OPERATION_WORKFLOW_REASON_CODE_VALUES.WORKFLOW_HISTORY_STALE,
      ]),
    });
    const normalizedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        buildPriorityRecoveryOwnerConsumerSnapshot(),
        ownerOutcome,
      );

    t.same(
      normalizedSnapshot.blockerReasons,
      [PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS],
    );
    t.equal(
      normalizedSnapshot.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
    );
    t.match(normalizedSnapshot.actuation, {
      state: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
    });
    t.match(normalizedSnapshot.progress, {
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
          .RECONCILE_STALE_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
    });
    assertOperationOwnerObservation(t, normalizedSnapshot, {
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.RECONCILE_STALE_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES
          .RECONCILE_STALE_PROGRESS_COMMAND,
      requestedOwnerAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
          .RECONCILE_STALE_OPERATION_PROGRESS,
      message: 'stale reconcile should remain a requested owner action only',
    });
  });

test('priority recovery records wait/no-op owner outcome without effects',
  async (t) => {
    const ownerOutcome = buildOperationOwnerOutcome({
      reasons: Object.freeze([
        OPERATION_WORKFLOW_REASON_CODE_VALUES.OWNER_PROGRESS_IN_FLIGHT,
      ]),
    });
    const normalizedSnapshot =
      normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
        buildPriorityRecoveryOwnerConsumerSnapshot(),
        ownerOutcome,
      );

    t.same(normalizedSnapshot.blockerReasons, []);
    t.match(normalizedSnapshot.progress, {
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      nextRequiredAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    });
    assertOperationOwnerObservation(t, normalizedSnapshot, {
      outcome: OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS,
      effectCommand:
        OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.NO_OPERATION_EFFECT,
      requestedOwnerAction:
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
      message: 'wait/no-op should be observed without executing effects',
    });
  });
