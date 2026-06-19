import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

// A self-owned coordinator-created handoff must dispatch in-process on the
// owner's own lane instead of delivering to its own `/service/replica-dispatch`
// transport ingress. During restart re-init the recovery timer starts before
// the dispatch-service ingress handler registers, so a self-targeted transport
// deliver falls through to a websocket self-send that fails
// ROUTER_CONNECTION_CLOSED and re-drives forever.
function buildCoordinatorWithDeliverySpy(nodeId) {
  const deliveries = [];
  const noopQuery = async () => ({success: true, rows: [], affectedRows: 0});
  const coordinator = new RebalanceCoordinator({
    nodeId,
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
      async executeAuthoritativeSystemTableRead() {
        return {success: true, rows: [], affectedRows: 0};
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows() {
        return {success: true, rows: [], affectedRows: 0};
      },
      async readAuthoritativeRows() {
        return {success: true, rows: [], affectedRows: 0};
      },
      executeQuery: noopQuery,
    },
    sqlQueryEngine: {executeQuery: noopQuery},
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 1024;
      },
    },
    messageRouter: {
      async deliver(target, payload, options) {
        deliveries.push({target, payload, options});
        return {acknowledged: true};
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    setTimeoutFn() {
      return {};
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.initialize();
  return {coordinator, deliveries};
}

test('self-owned coordinator-created handoff dispatches in-process instead ' +
  'of delivering to its own replica-dispatch transport ingress', async (t) => {
  const {coordinator, deliveries} = buildCoordinatorWithDeliverySpy('node-self');
  const dispatchCalls = [];
  coordinator.workflowOwner.dispatchOperationInternal = async (operation) => {
    dispatchCalls.push(operation);
    return {success: true};
  };

  try {
    // owner = sourceNodeId for a non-REPLACE op → 'node-self' is self-owned.
    const selfOwnedOperation = Object.freeze({
      operationId: 'op-self-1',
      type: OperationType.ADD,
      partitionId: 'sql_write_operations-p1',
      replicaId: 'sql_write_operations-p1-r1',
      sourceNodeId: 'node-self',
      targetNodeId: 'node-other',
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.SENDING,
      stepsHistory: [],
    });

    const woken =
      await coordinator.workflowOwner.wakeCoordinatorCreatedRemoteOwner(
        selfOwnedOperation,
      );

    t.equal(
      deliveries.length,
      0,
      'a self-owned handoff must NOT be delivered to its own transport ingress',
    );
    t.equal(
      dispatchCalls.length,
      1,
      'a self-owned handoff must dispatch in-process on the owner lane',
    );
    t.equal(
      dispatchCalls[0]?.operationId,
      'op-self-1',
      'the in-process dispatch receives the same operation',
    );
    t.equal(woken, true, 'a successful in-process dispatch reports woken=true');
  } finally {
    await coordinator.shutdown();
  }
});

test('remote-owned coordinator-created handoff still delivers through the ' +
  'remote replica-dispatch transport ingress', async (t) => {
  const {coordinator, deliveries} =
    buildCoordinatorWithDeliverySpy('node-self');
  const dispatchCalls = [];
  coordinator.workflowOwner.dispatchOperationInternal = async (operation) => {
    dispatchCalls.push(operation);
    return {success: true};
  };

  try {
    // owner = sourceNodeId 'node-remote' → not self-owned on 'node-self'.
    const remoteOwnedOperation = Object.freeze({
      operationId: 'op-remote-1',
      type: OperationType.ADD,
      partitionId: 'sql_write_operations-p1',
      replicaId: 'sql_write_operations-p1-r2',
      sourceNodeId: 'node-remote',
      targetNodeId: 'node-other',
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.SENDING,
      stepsHistory: [],
    });

    await coordinator.workflowOwner.wakeCoordinatorCreatedRemoteOwner(
      remoteOwnedOperation,
    );

    t.equal(
      deliveries.length,
      1,
      'a remote-owned handoff still wakes the remote owner over transport',
    );
    t.equal(
      deliveries[0]?.target,
      'node-remote/service/replica-dispatch',
      'the remote handoff targets the remote replica-dispatch ingress',
    );
    t.equal(
      dispatchCalls.length,
      0,
      'a remote-owned handoff must NOT dispatch on the local owner lane',
    );
  } finally {
    await coordinator.shutdown();
  }
});
