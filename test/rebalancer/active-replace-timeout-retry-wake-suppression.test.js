/**
 * A REPLACE at ACTIVE is exempt from the step time budget, so a timeout tick
 * that returns without executing it and without arming a retry is a wait
 * with no reachable release. The tick may stand down ONLY for a retry timer
 * that will itself re-enter the owner (safety, dispatch, ACTIVE-REPLACE
 * resume, transition). "Should not resume" is not such evidence: it is also
 * the answer for a committed STOPPING mark, a not-locally-owned operation
 * and a non-remove phase, none of which has a wake behind it.
 */
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationWorkflowRecoveryStatusReconcile,
} from '../../src/rebalancer/operation-workflow-recovery-status-reconcile.js';
import {
  buildCreateSatisfiedReplaceResumeDecision,
} from '../../src/rebalancer/operation-workflow-dispatch-response-reconcile.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../src/rebalancer/operation-workflow-owner-shared.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';

const {
  OPERATION_LIFECYCLE_ACTION,
  OPERATION_WORKFLOW_OWNER_LITERAL,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const TEST_OPERATION_ID = 'op-active-replace-timeout';
const TEST_DRAIN_SNAPSHOT = Object.freeze({action: 'noop'});
const TEST_RETRY_TIMER_FIELDS = Object.freeze([
  'safetyDeferredRetryTimerByOperationId',
  'dispatchRetryTimerByOperationId',
  'priorityActiveReplaceRetryTimerByOperationId',
  'transitionRetryTimerByOperationId',
]);

function buildActiveReplace() {
  return {
    operationId: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    entityType: 'partition',
    partitionId: 'replica_operations-p1',
    replicaId: 'replica_operations-p1-r4',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    status: ReplicaStatus.ACTIVE,
    workflowStep: WORKFLOW_STEP.ACTIVE,
    stepsHistory: [],
  };
}

// stoppingCommitted makes the resume decision answer shouldResume=false
// although no retry is armed: the reviewer's "wait with no release" shape.
function buildReconcileProbe({transitionGraceActive = false} = {}) {
  const observed = {executions: 0, retryArmRequests: 0};
  const probe = Object.create(
    OperationWorkflowRecoveryStatusReconcile.prototype,
  );
  Object.assign(probe, {
    safetyDeferredRetryTimerByOperationId: new Map(),
    dispatchRetryTimerByOperationId: new Map(),
    priorityActiveReplaceRetryTimerByOperationId: new Map(),
    transitionRetryTimerByOperationId: new Map(),
    hasActiveTransitionRetryGrace: () => transitionGraceActive,
    operationWorkflowCoordinator: {isTransitionIdempotent: () => true},
    repository: {
      isReplaceRemovePhase: () => true,
      isOperationLocallyOwned: () => true,
      getReplaceSourceReplicaId: () => 'replica_operations-p1-r1',
      getObservedReplicaStatusFromCache: () => ReplicaStatus.ACTIVE,
    },
    buildCreateSatisfiedReplaceResumeDecision,
    reconcilePriorityRecoveryOperationDrain: async () => false,
    shouldEnterOperationLifecycleFromDrainSnapshot: () => true,
    resolveOperationLifecycleAction: () =>
      OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE,
    reconcileActiveReplaceSourceRemovalProgress: async () => false,
    async executeOperationFromReconcilePath() {
      observed.executions += 1;
      return {success: false, skipped: true};
    },
    ensurePriorityActiveReplaceRetryArmed() {
      observed.retryArmRequests += 1;
    },
  });
  return {probe, observed};
}

function reconcile(probe, cause) {
  return probe.reconcileOperationLifecycle(buildActiveReplace(), {
    cause,
    priorityRecoveryDrainSnapshot: TEST_DRAIN_SNAPSHOT,
  });
}

test('a timeout tick re-drives an ACTIVE REPLACE that has no retry armed, ' +
  'whatever its resume decision says', async (t) => {
  const {probe, observed} = buildReconcileProbe();
  t.equal(
    probe.buildCreateSatisfiedReplaceResumeDecision(buildActiveReplace())
      .shouldResume,
    false,
    'fixture: the resume decision is false for a reason other than a retry',
  );

  await reconcile(probe, OPERATION_WORKFLOW_OWNER_LITERAL.TIMEOUT);

  t.equal(observed.executions, 1,
    'the tick executes the time-exempt operation: nothing else would');
  t.equal(observed.retryArmRequests, 1,
    'a skipped execution asks the ACTIVE-REPLACE retry owner for a wake');
});

for (const timerField of TEST_RETRY_TIMER_FIELDS) {
  test(`a timeout tick stands down while ${timerField} holds a timer`,
    async (t) => {
      const {probe, observed} = buildReconcileProbe();
      probe[timerField].set(TEST_OPERATION_ID, {armed: true});

      const handled = await reconcile(
        probe,
        OPERATION_WORKFLOW_OWNER_LITERAL.TIMEOUT,
      );

      t.equal(handled, true, 'the armed retry owns the next wake');
      t.equal(observed.executions, 0,
        'the tick does not execute beside the armed retry');
    });
}

test('a transition-retry grace without a timer is a deadline, not a wake',
  async (t) => {
    const {probe, observed} = buildReconcileProbe({
      transitionGraceActive: true,
    });
    const armed = probe.readOperationRetryArmedState(TEST_OPERATION_ID);
    t.equal(armed.transitionRetryArmed, true,
      'the grace still counts as a pending transition retry');
    t.equal(armed.retryWakeArmed, false,
      'but no timer will re-enter the owner');

    await reconcile(probe, OPERATION_WORKFLOW_OWNER_LITERAL.TIMEOUT);

    t.equal(observed.executions, 1,
      'so the tick does not stand down for it');
  });

test('a non-timeout reconcile executes the ACTIVE REPLACE beside an armed ' +
  'retry, as before', async (t) => {
  const {probe, observed} = buildReconcileProbe();
  probe.dispatchRetryTimerByOperationId.set(TEST_OPERATION_ID, {armed: true});

  await reconcile(probe, OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS);

  t.equal(observed.executions, 1,
    'only the timeout tick stands down for an armed retry');
});
