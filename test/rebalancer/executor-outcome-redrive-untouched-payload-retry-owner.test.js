/**
 * CL-029 (quest formation-ledger-self-move-blocks-cluster-ops): the re-drive
 * loop's retained-and-untouched exit must arm the timed retry.
 *
 * `redriveExecutorOutcomeReconcile` exits when a reconcile ran but left the
 * retained payload untouched (not-yet-applicable / raced by the dispatch
 * step-walk). The unfixed exit returned bare — payload retained, NO timer,
 * no re-drive consumer: the 2026-07-13 08:44 formation run left three ADD
 * operations silent for ~178s with their replicas already created, exactly
 * the recorded CL-029 invariant ("target-completion evidence must retain a
 * retry owner until applied to the durable workflow row").
 *
 * RED-ON-REVERT: the first case asserts a retry timer is armed after the
 * untouched exit; on the unfixed loop no timer exists.
 */

import {test} from '../../src/test-helpers/tap.js';
import {applyOperationWorkflowExecutorOutcomeReconcileMethods} from
  '../../src/rebalancer/operation-workflow-executor-outcome-reconcile-methods.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';

const TEST_OPERATION_ID = 'op-redrive-untouched';

function buildOutcome() {
  return {
    operationId: TEST_OPERATION_ID,
    outcomeType: EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
    workflowStep: WORKFLOW_STEP.ACTIVE,
    partitionId: 'tbl-test-p1',
    replicaId: 'tbl-test-p1-r1',
  };
}

function buildHost({reconcile}) {
  class Host {}
  applyOperationWorkflowExecutorOutcomeReconcileMethods(Host);
  const host = new Host();
  host.isShuttingDown = false;
  host.isInitialized = true;
  host.executorOutcomeRedriveInFlightByOperationId = new Set();
  host.executorOutcomeRetryPayloadByOperationId = new Map();
  host.executorOutcomeRetryTimerByOperationId = new Map();
  host.executorOutcomeRetryDelayMsByOperationId = new Map();
  host.operationWorkflowRunExclusive = async (_key, factory) => factory();
  host.getOperationOwnerSingleFlightKey = (operationId) => operationId;
  host.reconcileExecutorOutcome = reconcile;
  host.setTimeoutFn = (fn, delayMs) => ({fn, delayMs});
  host.logger = {
    warn: () => {},
    info: () => {},
    error: () => {},
    debug: () => {},
  };
  return host;
}

test(
  'a reconcile that leaves the retained payload untouched arms the timed ' +
    'retry (the evidence always keeps an owner)',
  async (t) => {
    const host = buildHost({
      // Runs, but neither consumes nor replaces the payload — the raced /
      // not-yet-applicable shape.
      reconcile: async () => {},
    });
    host.handleExecutorOutcome(buildOutcome());
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      host.executorOutcomeRetryPayloadByOperationId.has(TEST_OPERATION_ID),
      true,
      'the evidence stays retained',
    );
    t.equal(
      host.executorOutcomeRetryTimerByOperationId.has(TEST_OPERATION_ID),
      true,
      'a timed retry owner is armed for the untouched payload',
    );
    t.end();
  },
);

test(
  'a reconcile that consumes the payload exits without arming a timer',
  async (t) => {
    const host = buildHost({
      reconcile: async () => {
        host.executorOutcomeRetryPayloadByOperationId.delete(
          TEST_OPERATION_ID,
        );
      },
    });
    host.handleExecutorOutcome(buildOutcome());
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      host.executorOutcomeRetryPayloadByOperationId.has(TEST_OPERATION_ID),
      false,
      'the evidence was consumed',
    );
    t.equal(
      host.executorOutcomeRetryTimerByOperationId.has(TEST_OPERATION_ID),
      false,
      'no timer for consumed evidence',
    );
    t.end();
  },
);
