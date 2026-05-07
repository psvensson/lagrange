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
const WORKFLOW_TIMEOUT_SERIAL_WAIT_TEST_NAME =
  'workflow timeout outranks workflow-owned serial-wait waits';
const SAME_BOUNDARY_TEST_NAME =
  'same-boundary transition-deferred actuation outranks actionable scheduling';
const SAME_OPERATION_FRESHNESS_TEST_NAME =
  'same-operation retry handoff progress supersedes stale workflow timeout';
const SERIAL_WAIT_METADATA_TEST_NAME =
  'serial wait operation metadata survives progress summary normalization';
const SERIAL_WAIT_SOURCE_BLOCKER_TEST_NAME =
  'direct source blockers outrank supporting serial-wait carriers';
const TERMINAL_FOLLOW_UP_CARRIER_TEST_NAME =
  'direct workflow blockers outrank terminal rebalancer follow-up carriers';
const OPERATION_SCHEDULING_PARTITION_ID = 'replica_operations-p1';
const SERIAL_WAIT_PARTITION_ID = 'sql_transactions-p1';
const SERIAL_WAIT_BLOCKING_PARTITION_ID = 'sql_transaction_participants-p1';
const SERIAL_WAIT_SOURCE_BLOCKER_PARTITION_ID = 'sql_transactions-p3';
const SERIAL_WAIT_SUPPORTING_CARRIER_PARTITION_ID = 'sql_write_operations-p3';
const WORKFLOW_TIMEOUT_PARTITION_ID = 'sql_transactions-p2';
const SAME_BOUNDARY_DEFERRED_PARTITION_ID = 'replica_operations-p2';
const STALE_WORKFLOW_TIMEOUT_PARTITION_ID = 'sql_transactions-p1';
const TERMINAL_FOLLOW_UP_SOURCE_PARTITION_ID = 'sql_transactions-p1';
const TERMINAL_FOLLOW_UP_CARRIER_PARTITION_ID = 'sql_write_operations-p1';
const SERIAL_WAIT_BLOCKING_OPERATION_ID = 'op-serial-wait-owner';
const SERIAL_WAIT_SOURCE_BLOCKER_OPERATION_ID =
  'op-serial-wait-source-direct-blocker';
const SERIAL_WAIT_SUPPORTING_CARRIER_OPERATION_ID =
  'op-serial-wait-supporting-carrier';
const STALE_WORKFLOW_TIMEOUT_OPERATION_ID = 'op-retry-handoff';
const TERMINAL_FOLLOW_UP_SOURCE_OPERATION_ID =
  'op-terminal-follow-up-source-blocker';
const TERMINAL_FOLLOW_UP_CARRIER_OPERATION_ID =
  'op-terminal-follow-up-carrier';
const STALE_WORKFLOW_TIMEOUT_CORRELATION_KEY =
  'sql_transactions-p1|4|op-retry-handoff';
const SAMPLE_CAPTURED_AT_MS = 1777919035255;
const SERIAL_WAIT_SOURCE_BLOCKER_PROGRESS_AT_MS = SAMPLE_CAPTURED_AT_MS - 2000;
const SERIAL_WAIT_SUPPORTING_CARRIER_PROGRESS_AT_MS =
  SAMPLE_CAPTURED_AT_MS - 1000;
const STALE_WORKFLOW_TIMEOUT_PROGRESS_AT_MS = 1777922869705;
const RETRY_HANDOFF_PROGRESS_AT_MS = 1777922930548;
const RETRY_HANDOFF_DELAY_MS = 250;
const TERMINAL_FOLLOW_UP_SOURCE_PROGRESS_AT_MS = SAMPLE_CAPTURED_AT_MS - 3000;
const TERMINAL_FOLLOW_UP_CARRIER_PROGRESS_AT_MS = SAMPLE_CAPTURED_AT_MS - 1000;
const EXPECTED_PARTITION_COUNT = 2;
const EXPECTED_FRESHENED_PARTITION_COUNT = 1;
const EXPECTED_EMPTY_OPERATION_IDS = Object.freeze([]);
const WORKFLOW_STEP_PENDING = 'PENDING';
const WORKFLOW_STEP_SENDING = 'SENDING';
const OPERATION_STATUS_PENDING = 'pending';
const OPERATION_STATUS_RETRY_DEFERRED = 'retry_deferred';
const OPERATION_STATUS_ACTIVE = 'active';
const OPERATION_STATUS_REMOVED = 'removed';
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
  serialWaitOperationIds: Object.freeze([SERIAL_WAIT_BLOCKING_OPERATION_ID]),
  serialWaitPartitionIds: Object.freeze([SERIAL_WAIT_BLOCKING_PARTITION_ID]),
  lastProgressAtMs: SAMPLE_CAPTURED_AT_MS,
});
const SERIAL_WAIT_SOURCE_DIRECT_BLOCKER_WITNESS = Object.freeze({
  partitionId: SERIAL_WAIT_SOURCE_BLOCKER_PARTITION_ID,
  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
  progressClassIds: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
  ]),
  blockerReasonCodes: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
  ]),
  progressContractState: OWNER_CONTRACT_STATE.PENDING,
  actuationState:
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
  currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  nextRequiredAction:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  operationIds: Object.freeze([SERIAL_WAIT_SOURCE_BLOCKER_OPERATION_ID]),
  witnessIds: Object.freeze([SERIAL_WAIT_SOURCE_BLOCKER_OPERATION_ID]),
  correlationKey:
    SERIAL_WAIT_SOURCE_BLOCKER_PARTITION_ID + '|4|' +
    SERIAL_WAIT_SOURCE_BLOCKER_OPERATION_ID,
  lastProgressAtMs: SERIAL_WAIT_SOURCE_BLOCKER_PROGRESS_AT_MS,
  latestOperationWorkflowStep: WORKFLOW_STEP_SENDING,
  latestOperationStatus: OPERATION_STATUS_PENDING,
});
const SERIAL_WAIT_SUPPORTING_CARRIER_WITNESS = Object.freeze({
  partitionId: SERIAL_WAIT_SUPPORTING_CARRIER_PARTITION_ID,
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
  serialWaitOperationIds: Object.freeze([SERIAL_WAIT_SOURCE_BLOCKER_OPERATION_ID]),
  serialWaitPartitionIds: Object.freeze([SERIAL_WAIT_SOURCE_BLOCKER_PARTITION_ID]),
  operationIds: Object.freeze([SERIAL_WAIT_SUPPORTING_CARRIER_OPERATION_ID]),
  witnessIds: Object.freeze([
    SERIAL_WAIT_SUPPORTING_CARRIER_OPERATION_ID,
    SERIAL_WAIT_SOURCE_BLOCKER_OPERATION_ID,
  ]),
  correlationKey:
    SERIAL_WAIT_SUPPORTING_CARRIER_PARTITION_ID + '|4|' +
    SERIAL_WAIT_SUPPORTING_CARRIER_OPERATION_ID,
  lastProgressAtMs: SERIAL_WAIT_SUPPORTING_CARRIER_PROGRESS_AT_MS,
  latestOperationWorkflowStep: 'REMOVED',
  latestOperationStatus: 'removed',
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
const TERMINAL_FOLLOW_UP_SOURCE_BLOCKER_WITNESS = Object.freeze({
  partitionId: TERMINAL_FOLLOW_UP_SOURCE_PARTITION_ID,
  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH,
  progressClassIds: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
  ]),
  blockerReasonCodes: Object.freeze([
    PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
    PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
  ]),
  progressContractState: OWNER_CONTRACT_STATE.PENDING,
  actuationState:
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
  currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  actuationOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
  nextRequiredAction:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  operationIds: Object.freeze([TERMINAL_FOLLOW_UP_SOURCE_OPERATION_ID]),
  witnessIds: Object.freeze([TERMINAL_FOLLOW_UP_SOURCE_OPERATION_ID]),
  correlationKey:
    TERMINAL_FOLLOW_UP_SOURCE_PARTITION_ID + '|2|' +
    TERMINAL_FOLLOW_UP_SOURCE_OPERATION_ID,
  lastProgressAtMs: TERMINAL_FOLLOW_UP_SOURCE_PROGRESS_AT_MS,
  latestOperationWorkflowStep: 'ACTIVE',
  latestOperationStatus: OPERATION_STATUS_ACTIVE,
});
const TERMINAL_FOLLOW_UP_CARRIER_WITNESS = Object.freeze({
  partitionId: TERMINAL_FOLLOW_UP_CARRIER_PARTITION_ID,
  semanticStateId: PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED,
  progressContractState: OWNER_CONTRACT_STATE.BLOCKED,
  actuationState: PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_COMPLETED,
  currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
  actuationOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.REBALANCER_LEADER,
  blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
  waitMode: PRIORITY_RECOVERY_WAIT_MODE.STALLED,
  nextRequiredAction:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.SCHEDULE_FOLLOWUP_REBALANCE,
  operationIds: Object.freeze([TERMINAL_FOLLOW_UP_CARRIER_OPERATION_ID]),
  witnessIds: Object.freeze([TERMINAL_FOLLOW_UP_CARRIER_OPERATION_ID]),
  correlationKey:
    TERMINAL_FOLLOW_UP_CARRIER_PARTITION_ID + '|2|' +
    TERMINAL_FOLLOW_UP_CARRIER_OPERATION_ID,
  lastProgressAtMs: TERMINAL_FOLLOW_UP_CARRIER_PROGRESS_AT_MS,
  latestOperationWorkflowStep: 'REMOVED',
  latestOperationStatus: OPERATION_STATUS_REMOVED,
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

test(SERIAL_WAIT_METADATA_TEST_NAME, () => {
  const progressSummary = buildPriorityRecoveryProgressSummary({
    priorityRecoveryPartitionWitnesses: Object.freeze([
      SERIAL_WAIT_WITNESS,
    ]),
  });
  const dominantWitness = progressSummary.dominantWitness;

  assert.equal(
    progressSummary.partitionCount,
    EXPECTED_FRESHENED_PARTITION_COUNT,
  );
  assert.deepEqual(
    dominantWitness.operationIds,
    EXPECTED_EMPTY_OPERATION_IDS,
  );
  assert.deepEqual(
    dominantWitness.serialWaitOperationIds,
    [SERIAL_WAIT_BLOCKING_OPERATION_ID],
  );
  assert.deepEqual(
    dominantWitness.serialWaitPartitionIds,
    [SERIAL_WAIT_BLOCKING_PARTITION_ID],
  );
});

test(SERIAL_WAIT_SOURCE_BLOCKER_TEST_NAME, () => {
  const progressSummary = buildPriorityRecoveryProgressSummary({
    priorityRecoveryPartitionWitnesses: Object.freeze([
      SERIAL_WAIT_SOURCE_DIRECT_BLOCKER_WITNESS,
      SERIAL_WAIT_SUPPORTING_CARRIER_WITNESS,
    ]),
  });
  const dominantWitness = progressSummary.dominantWitness;

  assert.equal(progressSummary.partitionCount, EXPECTED_PARTITION_COUNT);
  assert.equal(
    dominantWitness.partitionId,
    SERIAL_WAIT_SOURCE_BLOCKER_PARTITION_ID,
  );
  assert.deepEqual(
    dominantWitness.blockerReasonCodes,
    [PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED],
  );
  assert.deepEqual(
    dominantWitness.operationIds,
    [SERIAL_WAIT_SOURCE_BLOCKER_OPERATION_ID],
  );
  assert.deepEqual(dominantWitness.serialWaitPartitionIds, []);
  assert.equal(
    dominantWitness.latestOperationWorkflowStep,
    WORKFLOW_STEP_SENDING,
  );
  assert.equal(
    dominantWitness.latestOperationStatus,
    OPERATION_STATUS_PENDING,
  );
});

test(TERMINAL_FOLLOW_UP_CARRIER_TEST_NAME, () => {
  const progressSummary = buildPriorityRecoveryProgressSummary({
    priorityRecoveryPartitionWitnesses: Object.freeze([
      TERMINAL_FOLLOW_UP_SOURCE_BLOCKER_WITNESS,
      TERMINAL_FOLLOW_UP_CARRIER_WITNESS,
    ]),
  });
  const dominantWitness = progressSummary.dominantWitness;

  assert.equal(progressSummary.partitionCount, EXPECTED_PARTITION_COUNT);
  assert.equal(
    dominantWitness.partitionId,
    TERMINAL_FOLLOW_UP_SOURCE_PARTITION_ID,
  );
  assert.deepEqual(
    dominantWitness.blockerReasonCodes,
    [
      PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS,
      PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED,
    ],
  );
  assert.equal(
    dominantWitness.currentOwner,
    PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
  );
  assert.equal(
    dominantWitness.blockingBoundary,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
  );
  assert.equal(
    dominantWitness.nextRequiredAction,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS,
  );
  assert.equal(
    dominantWitness.latestOperationWorkflowStep,
    'ACTIVE',
  );
  assert.equal(
    dominantWitness.latestOperationStatus,
    OPERATION_STATUS_ACTIVE,
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

test(WORKFLOW_TIMEOUT_SERIAL_WAIT_TEST_NAME, () => {
  const progressSummary = buildPriorityRecoveryProgressSummary({
    priorityRecoveryPartitionWitnesses: Object.freeze([
      SERIAL_WAIT_WITNESS,
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
    progressSummary.partitionCount,
    EXPECTED_FRESHENED_PARTITION_COUNT,
  );
  assert.deepEqual(progressSummary.blockingBoundaryCounts, {
    [PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF]:
      EXPECTED_FRESHENED_PARTITION_COUNT,
  });
  assert.deepEqual(progressSummary.waitModeCounts, {
    [PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED]:
      EXPECTED_FRESHENED_PARTITION_COUNT,
  });
  assert.deepEqual(progressSummary.nextRequiredActionCounts, {
    [PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS]:
      EXPECTED_FRESHENED_PARTITION_COUNT,
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
