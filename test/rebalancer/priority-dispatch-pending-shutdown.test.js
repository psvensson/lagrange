import assert from 'node:assert/strict';
import {setImmediate as nextTurn, setTimeout as nextTimer} from 'node:timers/promises';
import {test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE, PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION, PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE, PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-operation-progress.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createTestCoordinator} from './test-helpers.js';

const PARTITION_ID = 'sql_write_operations-p1';
const OPERATION_ID = 'priority-dispatch-pending-shutdown';
const TARGET_NODE_ID = 'node-target';

function makePriorityDispatchPendingFixture() {
  const now = Date.now();
  const row = {
    operation_id: OPERATION_ID,
    partition_id: PARTITION_ID,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: PARTITION_ID,
    replica_id: `${PARTITION_ID}-r4`,
    source_node_id: 'node-source',
    target_node_id: TARGET_NODE_ID,
    type: OperationType.REPLACE,
    status: ReplicaStatus.PENDING,
    workflow_step: WORKFLOW_STEP.SENDING,
    steps_history: JSON.stringify([{step: WORKFLOW_STEP.SENDING, timestamp: now}]),
    created_at: now,
    updated_at: now,
    completed_at: null,
  };
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: 'node-observer',
    cacheData: {replicaOperations: [row]},
    messageRouter: {async deliver(address, message) {
      deliveries.push({address, message});
      return buildDeliveryEnvelope({acknowledged: true});
    }},
  });
  const owner = coordinator.workflowOwner;
  const operation = owner.repository.rowToOperation(row);
  const snapshot = {
    partitionId: PARTITION_ID,
    coordinator: {operation},
    actuation: {
      state: PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
      owner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      workflowProgressPhaseId: PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    },
    progress: {
      currentOwner: PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
      workflowProgressPhaseId: PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
      blockingBoundary: PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
      nextRequiredAction: PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION,
      waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
    },
  };
  const heldAnswer = Promise.withResolvers();
  const authorityRead = Promise.withResolvers();
  const progressSettled = Promise.withResolvers();
  let reads = 0;
  const read = owner.repository.queryAuthoritativeOperationVisibilityObservation
    .bind(owner.repository);
  owner.repository.queryAuthoritativeOperationVisibilityObservation =
    async (operationId, options) => {
      const answer = await read(operationId, options);
      if (operationId === OPERATION_ID) {
        reads++;
        authorityRead.resolve(answer);
        await heldAnswer.promise;
      }
      return answer;
    };
  const progress = owner.applyPriorityRecoveryDispatchPendingOwnerProgress.bind(owner);
  owner.applyPriorityRecoveryDispatchPendingOwnerProgress = (...args) =>
    progress(...args).finally(progressSettled.resolve);
  return {
    coordinator, owner, operation, deliveries, heldAnswer, authorityRead, progressSettled,
    get readCount() {
      return reads;
    },
    schedule() {
      return owner.schedulePriorityRecoveryDispatchPendingReentry(snapshot, [operation]);
    },
  };
}

test('priority dispatch-pending ARM_NOW wakes the exact remote owner once',
  {timeout: 5000}, async () => {
    const run = makePriorityDispatchPendingFixture();
    try {
      assert.equal(run.schedule(), true);
      const observed = await run.authorityRead.promise;
      assert.equal(observed.operation?.operationId, OPERATION_ID);
      assert.equal(observed.operation?.replicaId, run.operation.replicaId);
      run.heldAnswer.resolve();
      await run.progressSettled.promise;
      assert.equal(run.readCount, 1);
      assert.equal(run.deliveries.length, 1);
      assert.equal(run.deliveries[0].address, `${TARGET_NODE_ID}/service/replica-dispatch`);
    } finally {
      run.heldAnswer.resolve();
      await run.coordinator.shutdown();
    }
  });

test('coordinator shutdown joins admitted ARM_NOW and fences its late authority answer',
  {timeout: 5000}, async () => {
    const run = makePriorityDispatchPendingFixture();
    let shutdown;
    try {
      assert.equal(run.schedule(), true);
      const observed = await run.authorityRead.promise;
      assert.equal(observed.operation?.operationId, OPERATION_ID);
      const joined = Promise.withResolvers();
      const join = run.owner.joinInFlightOwnerLanes.bind(run.owner);
      run.owner.joinInFlightOwnerLanes = (options) => {
        joined.resolve();
        return join(options);
      };
      let shutdownSettled = false;
      run.coordinator.once(REBALANCE_COORDINATOR_EVENT.SHUTDOWN, () => {
        shutdownSettled = true;
      });
      shutdown = run.coordinator.shutdown();
      try {
        await joined.promise;
        await nextTurn();
        assert.equal(shutdownSettled, false, 'resource shutdown awaits the accepted continuation');
        assert.equal(run.schedule(), false, 'the closing owner refuses new reentry');
      } finally {
        run.heldAnswer.resolve();
        await run.progressSettled.promise;
        await shutdown;
      }
      assert.equal(shutdownSettled, true);
      assert.equal(run.readCount, 1);
      assert.deepEqual(run.deliveries, [], 'the late answer cannot wake a remote owner');
    } finally {
      run.heldAnswer.resolve();
      await (shutdown ?? run.coordinator.shutdown());
    }
  });

test('coordinator shutdown closes queued ARM_NOW before its first authority read',
  {timeout: 5000}, async () => {
    const run = makePriorityDispatchPendingFixture();
    try {
      assert.equal(run.schedule(), true);
      run.heldAnswer.resolve();
      await run.coordinator.shutdown();
      await nextTimer(0);
      assert.equal(run.readCount, 0);
      assert.deepEqual(run.deliveries, []);
    } finally {
      run.heldAnswer.resolve();
      await run.coordinator.shutdown();
    }
  });
