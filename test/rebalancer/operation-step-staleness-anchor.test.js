// CL-044 consistency sweep — staleness/timeout decisions about a replica
// operation must measure TIME-IN-CURRENT-STEP, not time-since-updatedAt. A
// wedged op (e.g. SYNCING toward a down node) keeps re-stamping updatedAt via
// its ~1s dispatch-retry loop, so an updatedAt-anchored clock reads it as
// perpetually young and never ages it past its step timeout. The step-entry
// anchor (newest stepsHistory entry for the current workflowStep) is appended
// only on a real transition, so it is immune to that churn.
//
// This guards two consumers migrated alongside the CL-044 gate fix:
//   M1: replica-operation-liveness isReplicaOperationStale (topology-settling /
//       follow-up-planning staleness).
//   M3: the workflow owner's isOperationStepTimedOut reaper predicate.

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  isReplicaOperationStale,
  normalizeReplicaOperationRecord,
} from '../../src/rebalancer/replica-operation-liveness.js';
import {createTestCoordinator} from './test-helpers.js';

const PARTITION_ID = 'replica_operations-p1';
const PAST_ANY_STEP_TIMEOUT_MS = 12 * 60 * 1000; // 12m — exceeds any step timeout.
const FRESH_IN_STEP_MS = 10 * 1000; // 10s — within any step timeout.
const CHURNED_UPDATED_AGO_MS = 1000; // updatedAt re-stamped 1s ago by the retry loop.

function withConfig(fn) {
  return async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
    try {
      await fn(t);
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  };
}

// --- M1: liveness staleness ----------------------------------------------

function buildLivenessRecord({stepEnteredAgoMs, nowMs}) {
  return normalizeReplicaOperationRecord(
    {
      operation_id: 'wedged-syncing-liveness',
      type: 'REPLACE',
      replica_id: `${PARTITION_ID}-r9`,
      source_node_id: 'node-a',
      target_node_id: 'down-node',
      status: 'syncing',
      workflow_step: WORKFLOW_STEP.SYNCING,
      updated_at: nowMs - CHURNED_UPDATED_AGO_MS,
      created_at: nowMs - stepEnteredAgoMs,
      steps_history: JSON.stringify([
        {step: WORKFLOW_STEP.SYNCING, timestamp: nowMs - stepEnteredAgoMs},
      ]),
    },
    {nowMs},
  );
}

test('M1 — a SYNCING op wedged in-step past its timeout is stale despite a fresh (churned) updatedAt',
  withConfig(async (t) => {
    const nowMs = 10_000_000_000;
    const record = buildLivenessRecord({
      stepEnteredAgoMs: PAST_ANY_STEP_TIMEOUT_MS,
      nowMs,
    });
    t.equal(
      isReplicaOperationStale(record, {nowMs}),
      true,
      'time-in-step age (not updatedAt) must classify the wedged op stale',
    );
  }));

test('M1 — a SYNCING op recently in-step is NOT stale (genuine in-flight preserved)',
  withConfig(async (t) => {
    const nowMs = 10_000_000_000;
    const record = buildLivenessRecord({
      stepEnteredAgoMs: FRESH_IN_STEP_MS,
      nowMs,
    });
    t.equal(
      isReplicaOperationStale(record, {nowMs}),
      false,
      'an op that recently entered its step must remain non-stale',
    );
  }));

// --- M3: reaper step-timeout predicate -----------------------------------

function buildWedgedOp({stepEnteredAgoMs, nowMs}) {
  return {
    operationId: 'wedged-syncing-reaper',
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    replicaId: `${PARTITION_ID}-r9`,
    targetNodeId: 'down-node',
    status: 'syncing',
    workflowStep: WORKFLOW_STEP.SYNCING,
    updatedAt: nowMs - CHURNED_UPDATED_AGO_MS,
    createdAt: nowMs - stepEnteredAgoMs,
    stepsHistory: [
      {step: WORKFLOW_STEP.SYNCING, timestamp: nowMs - stepEnteredAgoMs},
    ],
  };
}

test('M3 — isOperationStepTimedOut reaps a wedged in-step op despite a fresh (churned) updatedAt',
  withConfig(async (t) => {
    const coordinator = createTestCoordinator({nodeId: 'seed-node', enableTimeouts: false});
    coordinator.initialize();
    try {
      const nowMs = 10_000_000_000;
      t.equal(
        coordinator.workflowOwner.isOperationStepTimedOut(
          buildWedgedOp({stepEnteredAgoMs: PAST_ANY_STEP_TIMEOUT_MS, nowMs}),
          nowMs,
        ),
        true,
        'time-in-step age must drive the reaper past the step timeout',
      );
    } finally {
      await coordinator.shutdown();
    }
  }));

test('M3 — isOperationStepTimedOut does NOT reap an op recently in-step (no premature reap)',
  withConfig(async (t) => {
    const coordinator = createTestCoordinator({nodeId: 'seed-node', enableTimeouts: false});
    coordinator.initialize();
    try {
      const nowMs = 10_000_000_000;
      t.equal(
        coordinator.workflowOwner.isOperationStepTimedOut(
          buildWedgedOp({stepEnteredAgoMs: FRESH_IN_STEP_MS, nowMs}),
          nowMs,
        ),
        false,
        'an op recently in its step must not be reaped',
      );
    } finally {
      await coordinator.shutdown();
    }
  }));

// --- D1: add-budget workflow timeout -------------------------------------

// isAddBudgetOperationPastWorkflowTimeout reads coordinator.nowFn() internally
// (real Date.now()), so anchor the op timestamps to real wall-clock; the
// 12m/10s margins dwarf the few-ms drift between building the op and the call.
test('D1 — add-budget timeout releases a wedged in-step op despite a fresh (churned) updatedAt',
  withConfig(async (t) => {
    const coordinator = createTestCoordinator({nodeId: 'seed-node', enableTimeouts: false});
    coordinator.initialize();
    try {
      t.equal(
        coordinator.isAddBudgetOperationPastWorkflowTimeout(
          buildWedgedOp({stepEnteredAgoMs: PAST_ANY_STEP_TIMEOUT_MS, nowMs: Date.now()}),
        ),
        true,
        'a wedged add-budget op must read as past its workflow timeout so it ' +
          'stops starving other partitions of concurrent-add budget',
      );
    } finally {
      await coordinator.shutdown();
    }
  }));

test('D1 — add-budget timeout keeps a recently in-step op active (no premature release)',
  withConfig(async (t) => {
    const coordinator = createTestCoordinator({nodeId: 'seed-node', enableTimeouts: false});
    coordinator.initialize();
    try {
      t.equal(
        coordinator.isAddBudgetOperationPastWorkflowTimeout(
          buildWedgedOp({stepEnteredAgoMs: FRESH_IN_STEP_MS, nowMs: Date.now()}),
        ),
        false,
        'an op recently in its step must still hold its add-budget slot',
      );
    } finally {
      await coordinator.shutdown();
    }
  }));
