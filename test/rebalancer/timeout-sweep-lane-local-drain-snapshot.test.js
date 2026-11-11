/**
 * The timeout sweep decides an operation inside its single-flight lane. The
 * priority-recovery drain snapshot that decision reads depends on more than
 * the operation row (planning snapshot, source observations), so a snapshot
 * built before the lane wait is not evidence for a decision taken after it:
 * an unchanged operation row does not prove an unchanged world.
 *
 * The sweep builds a routing snapshot before the lane (wake a remote owner,
 * or take the lane) and exactly one decision snapshot inside it, and hands
 * that one down to reconcileTimeoutOperation.
 */
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationWorkflowRecoveryTimeout,
} from '../../src/rebalancer/operation-workflow-recovery-timeout.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';

const TEST_OPERATION_ID = 'op-timeout-sweep-lane-snapshot';
const TEST_OBSERVED_STATE = 'observed';
const TEST_EMPTY_QUERY_BACKOFF_MS = 60000;
const TEST_OWNER_ACTION = 'allow_reconcile';
const TEST_DRAIN_ACTION = 'fail_priority_recovery_superseded_target';
const TEST_WORLD = Object.freeze({
  BEFORE_LANE_WAIT: 'superseded_target_evidence',
  AFTER_LANE_WAIT: 'target_current_again',
});

function buildCreatingOperation() {
  return {
    operationId: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partitionId: 'replica_operations-p1',
    replicaId: 'replica_operations-p1-r4',
    targetNodeId: 'node-2',
    status: ReplicaStatus.CREATING,
    workflowStep: WORKFLOW_STEP.CREATING,
    createdAt: 1,
    updatedAt: 2,
    stepsHistory: [],
  };
}

// The world changes while the sweep waits for the operation's lane; the
// operation row (step, status, updatedAt) does not.
function buildSweepProbe() {
  const observed = {
    world: TEST_WORLD.BEFORE_LANE_WAIT,
    snapshotBuilds: [],
    routingSnapshots: [],
    reconciled: [],
    reservationSweeps: 0,
  };
  const probe = Object.create(OperationWorkflowRecoveryTimeout.prototype);
  Object.assign(probe, {
    lastEmptyIncompleteOperationQueryAtMs: 0,
    incompleteOperationQueryEmptyBackoffMs: TEST_EMPTY_QUERY_BACKOFF_MS,
    timeSource: null,
    logger: {warn() {}},
    repository: {
      hasReplicaOperationCacheObservationBoundary: () => false,
      getIncompleteOperationVisibilityObservation: async () => ({
        state: TEST_OBSERVED_STATE,
        operations: [buildCreatingOperation()],
      }),
      isOperationTerminal: () => false,
      isOperationLocallyOwned: () => true,
      getOperationByIdVisibilityObservation: async () => ({
        operation: buildCreatingOperation(),
      }),
    },
    clearEmptyIncompleteOperationQueryDelay() {},
    resolveTimeoutIncompleteVisibilitySupplementMode: () => 'none',
    getOperationOwnerSingleFlightKey: (operationId) => operationId,
    selectTimeoutReconcileOperation: (visibilityObservation) =>
      visibilityObservation.operation,
    async buildPriorityRecoveryOperationDrainSnapshot() {
      const snapshot = Object.freeze({
        ownerAction: TEST_OWNER_ACTION,
        action: TEST_DRAIN_ACTION,
        builtInWorld: observed.world,
        sequence: observed.snapshotBuilds.length + 1,
      });
      observed.snapshotBuilds.push(snapshot);
      return snapshot;
    },
    async wakePriorityRecoveryRemoteOwnerFromDrainSnapshot(_operation, snapshot) {
      observed.routingSnapshots.push(snapshot);
      return false;
    },
    shouldEnterOperationLifecycleFromDrainSnapshot: () => true,
    async operationWorkflowRunExclusive(_key, action) {
      observed.world = TEST_WORLD.AFTER_LANE_WAIT;
      return action();
    },
    async reconcileTimeoutOperation(operation, now, drainSnapshot) {
      observed.reconciled.push({operation, drainSnapshot});
    },
    async reconcileReservations() {
      observed.reservationSweeps += 1;
    },
  });
  Object.defineProperties(probe, {
    isShuttingDown: {value: false},
    isInitialized: {value: true},
  });
  return {probe, observed};
}

test('the timeout sweep decides on a drain snapshot built inside the lane',
  async (t) => {
    const {probe, observed} = buildSweepProbe();

    await probe.checkTimeouts();

    t.equal(observed.reconciled.length, 1,
      'the unchanged operation is reconciled once');
    const decisionSnapshot = observed.reconciled[0].drainSnapshot;
    t.equal(decisionSnapshot?.builtInWorld, TEST_WORLD.AFTER_LANE_WAIT,
      'the decision reads a snapshot built after the lane wait, although ' +
        'the operation row did not change while waiting');
    t.equal(
      observed.snapshotBuilds.filter((snapshot) =>
        snapshot.builtInWorld === TEST_WORLD.AFTER_LANE_WAIT).length,
      1,
      'exactly one snapshot is built inside the lane',
    );
    t.equal(decisionSnapshot, observed.snapshotBuilds.at(-1),
      'that one lane snapshot is the object handed down the reconcile chain');
    const preLaneRouting = observed.routingSnapshots[0];
    t.same(preLaneRouting, {ownerAction: TEST_OWNER_ACTION},
      'the pre-lane routing evidence carries the owner action only: it ' +
        'has no drain action, so it cannot decide inside the lane');
    t.equal(decisionSnapshot.action, TEST_DRAIN_ACTION,
      'the lane decision snapshot is the full drain snapshot');
    t.equal(observed.reservationSweeps, 1,
      'the reservation reconcile runs once on the tick, with no cadence ' +
        'borrowed from another concern');
  });

test('the reservation reconcile runs on every tick that reaches it',
  async (t) => {
    const {probe, observed} = buildSweepProbe();

    await probe.checkTimeouts();
    await probe.checkTimeouts();

    t.equal(observed.reservationSweeps, 2,
      'two ticks run two reservation sweeps: the empty-operation-query ' +
        'backoff of another concern does not throttle the reservation owner');
  });
