import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPriorityRecoveryProgressSummary,
} from '../priority-recovery-summary-normalization.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
} from '../../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  OWNER_CONTRACT_STATE,
} from '../../../../src/control-plane/owner-contract-outcome.js';

const TEST_NAME =
  'operation scheduling dominates workflow transition-deferred serial waits';
const WORKFLOW_TIMEOUT_TEST_NAME =
  'workflow timeout outranks actionable operation scheduling';
const SAME_BOUNDARY_TEST_NAME =
  'same-boundary transition-deferred actuation outranks actionable scheduling';
const SAME_OPERATION_FRESHNESS_TEST_NAME =
  'same-operation retry handoff progress supersedes stale workflow timeout';
const OPERATION_SCHEDULING_PARTITION_ID = 'replica_operations-p1';
const SERIAL_WAIT_PARTITION_ID = 'sql_transactions-p1';
const WORKFLOW_TIMEOUT_PARTITION_ID = 'sql_transactions-p2';
const SAME_BOUNDARY_DEFERRED_PARTITION_ID = 'replica_operations-p2';
const STALE_WORKFLOW_TIMEOUT_PARTITION_ID = 'sql_transactions-p1';
const STALE_WORKFLOW_TIMEOUT_OPERATION_ID = 'op-retry-handoff';
const STALE_WORKFLOW_TIMEOUT_CORRELATION_KEY =
  'sql_transactions-p1|4|op-retry-handoff';
const SAMPLE_CAPTURED_AT_MS = 1777919035255;
const STALE_WORKFLOW_TIMEOUT_PROGRESS_AT_MS = 1777922869705;
const RETRY_HANDOFF_PROGRESS_AT_MS = 1777922930548;
const RETRY_HANDOFF_DELAY_MS = 250;
const EXPECTED_PARTITION_COUNT = 2;
const WORKFLOW_STEP_PENDING = 'PENDING';
const WORKFLOW_STEP_SENDING = 'SENDING';
const OPERATION_STATUS_PENDING = 'pending';
const OPERATION_STATUS_RETRY_DEFERRED = 'retry_deferred';
const EXPECTED_OWNER_COUNTS = Object.freeze({
  [PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER]: 1,
  [PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER]: 1,
});
const EXPECTED_BOUNDARY_COUNTS = Object.freeze({
  [PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING]: 1,
  [PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS]: 1,
});
const EXPECTED_ACTUATION_COUNTS = Object.freeze({
  [PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED]: 1,
  [PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED]: 1,
});
const SERIAL_WAIT_WITNESS = Object.freeze({
  partitionId: SERIAL_WAIT_PARTITION_ID,
  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
  progressClassIds: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
  ]),
  blockerReasonCodes: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
  ]),
  progressContractState: OWNER_CONTRACT_STATE.PENDING,
  actuationState: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
  currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  nextRequiredAction:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  lastProgressAtMs: SAMPLE_CAPTURED_AT_MS,
});
const OPERATION_SCHEDULING_WITNESS = Object.freeze({
  partitionId: OPERATION_SCHEDULING_PARTITION_ID,
  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
  progressClassIds: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  ]),
  blockerReasonCodes: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  ]),
  progressContractState: OWNER_CONTRACT_STATE.PENDING,
  actuationState: PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
  currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  nextRequiredAction:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
  lastProgressAtMs: SAMPLE_CAPTURED_AT_MS,
});
const WORKFLOW_TIMEOUT_WITNESS = Object.freeze({
  partitionId: WORKFLOW_TIMEOUT_PARTITION_ID,
  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
  progressClassIds: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
  ]),
  blockerReasonCodes: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
  ]),
  progressContractState: OWNER_CONTRACT_STATE.PENDING,
  actuationState: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
  currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT,
  waitMode: PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
  nextRequiredAction:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.RECONCILE_STALE_OPERATION_PROGRESS,
  lastProgressAtMs: SAMPLE_CAPTURED_AT_MS,
});
const SAME_BOUNDARY_TRANSITION_DEFERRED_WITNESS = Object.freeze({
  partitionId: SAME_BOUNDARY_DEFERRED_PARTITION_ID,
  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
  progressClassIds: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  ]),
  blockerReasonCodes: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  ]),
  progressContractState: OWNER_CONTRACT_STATE.PENDING,
  actuationState: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
  currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  nextRequiredAction:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
  lastProgressAtMs: SAMPLE_CAPTURED_AT_MS,
});
const STALE_SELECTED_WORKFLOW_TIMEOUT_WITNESS = Object.freeze({
  partitionId: STALE_WORKFLOW_TIMEOUT_PARTITION_ID,
  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
  progressClassIds: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
  ]),
  blockerReasonCodes: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
  ]),
  progressContractState: OWNER_CONTRACT_STATE.PENDING,
  actuationState: PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
  currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  actuationOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT,
  waitMode: PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
  nextRequiredAction:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.RECONCILE_STALE_OPERATION_PROGRESS,
  operationIds: Object.freeze([STALE_WORKFLOW_TIMEOUT_OPERATION_ID]),
  witnessIds: Object.freeze([STALE_WORKFLOW_TIMEOUT_OPERATION_ID]),
  correlationKey: STALE_WORKFLOW_TIMEOUT_CORRELATION_KEY,
  lastProgressAtMs: STALE_WORKFLOW_TIMEOUT_PROGRESS_AT_MS,
  latestOperationWorkflowStep: WORKFLOW_STEP_PENDING,
  latestOperationStatus: OPERATION_STATUS_PENDING,
});
const LATER_RETRY_HANDOFF_WITNESS = Object.freeze({
  partitionId: STALE_WORKFLOW_TIMEOUT_PARTITION_ID,
  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
  progressContractState: OWNER_CONTRACT_STATE.DEFERRED,
  actuationState:
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
  currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  actuationOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
  waitMode: PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
  nextRequiredAction:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  operationIds: Object.freeze([STALE_WORKFLOW_TIMEOUT_OPERATION_ID]),
  witnessIds: Object.freeze([STALE_WORKFLOW_TIMEOUT_OPERATION_ID]),
  correlationKey: STALE_WORKFLOW_TIMEOUT_CORRELATION_KEY,
  retryAfterMs: RETRY_HANDOFF_DELAY_MS,
  lastProgressAtMs: RETRY_HANDOFF_PROGRESS_AT_MS,
  latestOperationWorkflowStep: WORKFLOW_STEP_SENDING,
  latestOperationStatus: OPERATION_STATUS_RETRY_DEFERRED,
});

test(TEST_NAME, () => {
  const progressSummary = buildPriorityRecoveryProgressSummary({
    priorityRecoveryPartitionWitnesses: Object.freeze([
      SERIAL_WAIT_WITNESS,
      OPERATION_SCHEDULING_WITNESS,
    ]),
  });

  assert.equal(progressSummary.partitionCount, EXPECTED_PARTITION_COUNT);
  assert.deepEqual(progressSummary.currentOwnerCounts, EXPECTED_OWNER_COUNTS);
  assert.deepEqual(
    progressSummary.blockingBoundaryCounts,
    EXPECTED_BOUNDARY_COUNTS,
  );
  assert.deepEqual(
    progressSummary.actuationStateCounts,
    EXPECTED_ACTUATION_COUNTS,
  );
  assert.equal(
    progressSummary.dominantWitness.partitionId,
    OPERATION_SCHEDULING_PARTITION_ID,
  );
  assert.equal(
    progressSummary.dominantWitness.currentOwner,
    PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
  );
  assert.equal(
    progressSummary.dominantWitness.blockingBoundary,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
  );
  assert.equal(
    progressSummary.dominantWitness.nextRequiredAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
  );
});

test(WORKFLOW_TIMEOUT_TEST_NAME, () => {
  const progressSummary = buildPriorityRecoveryProgressSummary({
    priorityRecoveryPartitionWitnesses: Object.freeze([
      OPERATION_SCHEDULING_WITNESS,
      WORKFLOW_TIMEOUT_WITNESS,
    ]),
  });

  assert.equal(
    progressSummary.dominantWitness.partitionId,
    WORKFLOW_TIMEOUT_PARTITION_ID,
  );
  assert.equal(
    progressSummary.dominantWitness.blockingBoundary,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT,
  );
  assert.equal(
    progressSummary.dominantWitness.waitMode,
    PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
  );
  assert.equal(
    progressSummary.dominantWitness.nextRequiredAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.RECONCILE_STALE_OPERATION_PROGRESS,
  );
});

test(SAME_BOUNDARY_TEST_NAME, () => {
  const progressSummary = buildPriorityRecoveryProgressSummary({
    priorityRecoveryPartitionWitnesses: Object.freeze([
      OPERATION_SCHEDULING_WITNESS,
      SAME_BOUNDARY_TRANSITION_DEFERRED_WITNESS,
    ]),
  });

  assert.equal(
    progressSummary.dominantWitness.partitionId,
    SAME_BOUNDARY_DEFERRED_PARTITION_ID,
  );
  assert.equal(
    progressSummary.dominantWitness.blockingBoundary,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.OPERATION_SCHEDULING,
  );
  assert.equal(
    progressSummary.dominantWitness.actuationState,
    PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
  );
});

test(SAME_OPERATION_FRESHNESS_TEST_NAME, () => {
  const progressSummary = buildPriorityRecoveryProgressSummary({
    priorityRecoveryPartitionWitnesses: Object.freeze([
      STALE_SELECTED_WORKFLOW_TIMEOUT_WITNESS,
      LATER_RETRY_HANDOFF_WITNESS,
    ]),
  });

  assert.equal(
    progressSummary.dominantWitness.partitionId,
    STALE_WORKFLOW_TIMEOUT_PARTITION_ID,
  );
  assert.equal(
    progressSummary.dominantWitness.blockingBoundary,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
  );
  assert.equal(
    progressSummary.dominantWitness.waitMode,
    PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
  );
  assert.equal(
    progressSummary.dominantWitness.nextRequiredAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  );
  assert.equal(
    progressSummary.dominantWitness.latestOperationWorkflowStep,
    WORKFLOW_STEP_SENDING,
  );
  assert.equal(
    progressSummary.dominantWitness.latestOperationStatus,
    OPERATION_STATUS_RETRY_DEFERRED,
  );
});
