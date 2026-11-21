import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
  createObservationOnlyMutationPort,
} from './test-helpers.js';
import {advanceOperationFixture, buildCreatedOperationFixture} from './operation-outcome-fixture.js';

// A coordinator-created ADD of sql_write_operations-p1 its owner has claimed
// (SENDING): the created record (entity identity stamped) advanced one step.
function buildSendingAdd({operationId, replicaId, sourceNodeId}) {
  return Object.freeze(advanceOperationFixture(buildCreatedOperationFixture({
    operationId,
    type: OperationType.ADD,
    partitionId: 'sql_write_operations-p1',
    replicaId,
    sourceNodeId,
    targetNodeId: 'node-other',
    createdAt: Date.now(),
  }), WORKFLOW_STEP.SENDING));
}

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
      async executeAuthoritativeSystemTableRead() {
        return {success: true, rows: [], affectedRows: 0};
      },
    },
    controlPlaneSystemTableGateway: {
      submitMutation: createObservationOnlyMutationPort('self-owned handoff coordinator'),
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
        return {targetReplicaCount: 3, minReplicaCount: 1};
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
        return buildDeliveryEnvelope({acknowledged: true});
      },
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      defaultRepairEligible: true,
    }),
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
    const selfOwnedOperation = buildSendingAdd({
      operationId: 'op-self-1',
      replicaId: 'sql_write_operations-p1-r1',
      sourceNodeId: 'node-self',
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
    const remoteOwnedOperation = buildSendingAdd({
      operationId: 'op-remote-1',
      replicaId: 'sql_write_operations-p1-r2',
      sourceNodeId: 'node-remote',
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
