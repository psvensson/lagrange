/**
 * Coverage pin for the lever-(a) executor-outcome extension (quest
 * formation-ledger-self-move-blocks-cluster-ops).
 *
 * Lever (a) (applyLocalPriorityOperationProgressRow, commit 64a18b76) lets a
 * priority operation advance LOCALLY when its durable distributed write defers
 * under control-plane pressure, superseded later via the CDC round-trip. Its
 * deferred-local-progress gate `shouldUsePriorityDispatchDeferredLocalProgress`
 * originally engaged ONLY for `step === CREATING`. During cold formation the
 * un-covered transitions are the binding stall: a ledger self-move REPLACE
 * completes its physical work in seconds but its SYNCING→ACTIVE and terminal
 * REMOVED persists write into the very ledger being reconfigured, burning
 * minutes of sql-routed retry cycles while the self-move interlock freezes all
 * other admission (probe-local-run-2026-07-13T0512: leg-2 ACTIVE persist
 * ground for ~54s; demo runs left 5-8 REPLACEs never terminalizing).
 *
 * The extension covers the executor-outcome-backed ACTIVE transition of a
 * priority control-plane REPLACE, scoped to retryable errors. Terminal steps
 * stay uncovered on purpose: REMOVED flows exclusively through
 * completeOperation, which owns durable terminal convergence. An earlier
 * flag-gated form (LAGRANGE_PR_DRAIN_LOCAL_PROGRESS, bb2a6ca2) was deleted in
 * the dfde5bf2 flag sweep after measuring zero engagements in the
 * rolling-restart vehicle, where an upstream mask blocked its precondition;
 * the formation vehicle exercises the precondition constantly, so the
 * coverage is now unconditional.
 *
 * RED-ON-REVERT: the coverage tests fail on the CREATING-only predicate.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  OperationWorkflowTransitionOrchestration,
} from '../../src/rebalancer/operation-workflow-transition-orchestration.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

// Real prototype so the outcome-step helper + module predicates run; only the
// CREATING budget gate is stubbed true (it is exercised separately elsewhere).
function buildOrchestrationProbe() {
  const probe = Object.create(
    OperationWorkflowTransitionOrchestration.prototype,
  );
  probe.shouldUsePriorityDispatchTransitionMutationBudget = () => true;
  return probe;
}

function shouldUse(probe, operation, step, errorLike) {
  return OperationWorkflowTransitionOrchestration.prototype
    .shouldUsePriorityDispatchDeferredLocalProgress
    .call(probe, operation, step, errorLike);
}

function buildRetryableLedgerDefer() {
  const error = new Error(
    'Distributed operation failed due to participant failures',
  );
  error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
  error.retryAfterMs = 100;
  return error;
}

const LEDGER_SELF_MOVE_OP = {
  operationId: 'ledger-self-move-op',
  partitionId: 'replica_operations-p1',
  type: OperationType.REPLACE,
};

test('CREATING dispatch defer absorption is unchanged', (t) => {
  t.equal(
    shouldUse(
      buildOrchestrationProbe(),
      LEDGER_SELF_MOVE_OP,
      WORKFLOW_STEP.CREATING,
      buildRetryableLedgerDefer(),
    ),
    true,
    'SENDING→CREATING coverage is preserved',
  );
  t.end();
});

test(
  'the executor-outcome ACTIVE transition of a priority REPLACE is absorbed',
  (t) => {
    const probe = buildOrchestrationProbe();
    t.equal(
      shouldUse(
        probe,
        LEDGER_SELF_MOVE_OP,
        WORKFLOW_STEP.ACTIVE,
        buildRetryableLedgerDefer(),
      ),
      true,
      'REPLACE ACTIVE (replacement promoted) advances owner-locally and ' +
        're-arms the durable write',
    );
    t.end();
  },
);

test(
  'the executor-outcome STOPPING transition is absorbed for priority ' +
    'REPLACE and REMOVE (its producing dispatch-response branch)',
  (t) => {
    const probe = buildOrchestrationProbe();
    t.equal(
      shouldUse(
        probe,
        LEDGER_SELF_MOVE_OP,
        WORKFLOW_STEP.STOPPING,
        buildRetryableLedgerDefer(),
      ),
      true,
      'REPLACE remove-phase STOPPING (removal dispatched and acknowledged) ' +
        'advances owner-locally',
    );
    const removeOp = {...LEDGER_SELF_MOVE_OP, type: OperationType.REMOVE};
    t.equal(
      shouldUse(
        probe,
        removeOp,
        WORKFLOW_STEP.STOPPING,
        buildRetryableLedgerDefer(),
      ),
      true,
      'REMOVE STOPPING advances owner-locally',
    );
    const addOp = {...LEDGER_SELF_MOVE_OP, type: OperationType.ADD};
    t.equal(
      shouldUse(
        probe,
        addOp,
        WORKFLOW_STEP.STOPPING,
        buildRetryableLedgerDefer(),
      ),
      false,
      'an ADD never reaches a remove-phase STOPPING — not covered',
    );
    t.end();
  },
);

test(
  'terminal REMOVED is deliberately NOT absorbed — completeOperation owns ' +
    'durable terminal convergence',
  (t) => {
    const probe = buildOrchestrationProbe();
    t.equal(
      shouldUse(
        probe,
        LEDGER_SELF_MOVE_OP,
        WORKFLOW_STEP.REMOVED,
        buildRetryableLedgerDefer(),
      ),
      false,
      'a deferred-local terminal would clear the transition retry without ' +
        're-driving the durable persist; completeOperation has its own ' +
        'retry owners (executor-outcome retry + terminal-transition repair)',
    );
    t.end();
  },
);

test(
  'safety scopes: non-REPLACE ACTIVE, non-priority partition, and ' +
    'non-retryable errors stay uncovered',
  (t) => {
    const probe = buildOrchestrationProbe();

    // ACTIVE is covered ONLY for REPLACE (an ADD's ACTIVE terminal must not
    // be locally re-driven here).
    const addOp = {...LEDGER_SELF_MOVE_OP, type: OperationType.ADD};
    t.equal(
      shouldUse(
        probe,
        addOp,
        WORKFLOW_STEP.ACTIVE,
        buildRetryableLedgerDefer(),
      ),
      false,
      'ADD ACTIVE terminal is not an outcome-backed REPLACE transition',
    );

    // Coverage is scoped to priority control-plane partitions only.
    const nonPriorityOp = {
      ...LEDGER_SELF_MOVE_OP,
      partitionId: 'user_data-p7',
    };
    t.equal(
      shouldUse(
        probe,
        nonPriorityOp,
        WORKFLOW_STEP.REMOVED,
        buildRetryableLedgerDefer(),
      ),
      false,
      'a non-priority partition REMOVED is not covered',
    );

    // Intermediate non-outcome steps are never absorbed.
    t.equal(
      shouldUse(
        probe,
        LEDGER_SELF_MOVE_OP,
        WORKFLOW_STEP.SYNCING,
        buildRetryableLedgerDefer(),
      ),
      false,
      'SYNCING is not an executor-outcome transition',
    );

    // A permanent error never triggers local-commit at any step.
    const permanent = new Error('replica operation rejected: schema invalid');
    for (const step of [
      WORKFLOW_STEP.CREATING,
      WORKFLOW_STEP.ACTIVE,
      WORKFLOW_STEP.REMOVED,
    ]) {
      t.equal(
        shouldUse(probe, LEDGER_SELF_MOVE_OP, step, permanent),
        false,
        `permanent error never triggers local-commit (step=${step})`,
      );
    }
    t.end();
  },
);
