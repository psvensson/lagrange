import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const HANDOFF_SOURCE = 'coordinator_created_remote_handoff';
const DEFERRED_DELIVERY = 'deferred_delivery';
const LATE_RESPONSE_HONORED = 'lateResponseHonored';

// A late dispatch SERVICE_RESPONSE whose pending waiter was already retired
// (deferred / ack-timeout) still proves the target received the dispatch. The
// transport surfaces it as a LATE_RESPONSE_HONORED event carrying the opaque
// responseContext, and the rebalancer stops re-driving a duplicate dispatch.

test('transport emits late-response-honored for a non-error response whose ' +
  'handoff waiter was retired, carrying the response context', async (t) => {
  let nowMs = 1000;
  const router = new MessageRouter({
    nodeId: 'late-honor-emit-test',
    nowFn: () => nowMs,
    unmatchedServiceResponseWarnIntervalMs: 5000,
  });
  await router.initialize({startServer: false});
  router.logger = {info() {}, error() {}, warn() {}, debug() {}};

  const honored = [];
  router.on(LATE_RESPONSE_HONORED, (event) => honored.push(event));

  try {
    // Honored: handoff delivery, retired deferred, late non-error response.
    router.registerPendingResponse('msg-honor', 'node-remote', {
      deliverySource: HANDOFF_SOURCE,
      responseContext: 'op-honor',
    });
    router.cancelPendingResponse('msg-honor', {
      ignoreLateResponse: true,
      retiredReason: DEFERRED_DELIVERY,
    });
    nowMs = 1200;
    router.handleServiceResponse({
      messageId: 'msg-honor',
      result: {acknowledged: true},
    });

    t.equal(honored.length, 1, 'a late non-error handoff response is honored');
    t.equal(honored[0]?.responseContext, 'op-honor', 'carries the op context');
    t.equal(honored[0]?.deliverySource, HANDOFF_SOURCE, 'carries the source');
    t.equal(honored[0]?.retiredReason, DEFERRED_DELIVERY, 'carries the reason');

    // Not honored: an ERROR late response is a genuine failure, not delivery.
    router.registerPendingResponse('msg-error', 'node-remote', {
      deliverySource: HANDOFF_SOURCE,
      responseContext: 'op-error',
    });
    router.cancelPendingResponse('msg-error', {
      ignoreLateResponse: true,
      retiredReason: DEFERRED_DELIVERY,
    });
    router.handleServiceResponse({
      messageId: 'msg-error',
      error: 'handler failed',
    });
    t.equal(honored.length, 1, 'an error late response is NOT honored');

    // Not honored: no responseContext means nothing to correlate.
    router.registerPendingResponse('msg-plain', 'node-remote', {
      deliverySource: 'query:insert:sql_write_operations',
    });
    router.cancelPendingResponse('msg-plain', {ignoreLateResponse: true});
    router.handleServiceResponse({
      messageId: 'msg-plain',
      result: {ok: true},
    });
    t.equal(honored.length, 1, 'a response without responseContext is ignored');
  } finally {
    await router.shutdown();
  }
});

function buildCoordinator(nodeId) {
  const noopQuery = async () => ({success: true, rows: [], affectedRows: 0});
  const coordinator = new RebalanceCoordinator({
    nodeId,
    systemTableCache: {get() {
      return null;
    }, getAll() {
      return [];
    }, filter() {
      return [];
    }},
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
    tablePolicyService: {async getPolicyForPartition() {
      return {minReplicaCount: 1};
    }},
    storageAccountingService: {estimateReplicaBytes() {
      return 1024;
    }},
    messageRouter: {async deliver() {
      return {acknowledged: true};
    }, on() {}, removeListener() {}},
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    setTimeoutFn() {
      return {};
    },
    clearTimeoutFn() {},
    enableTimeouts: false,
  });
  coordinator.initialize();
  return coordinator;
}

test('owner honoring a late delivery stops the duplicate-dispatch re-drive ' +
  'and falls back to the verification follow-up', async (t) => {
  const coordinator = buildCoordinator('node-self');
  const owner = coordinator.workflowOwner;

  try {
    const followUps = [];
    owner.scheduleCoordinatorCreatedRemoteHandoffFollowUp = (op, delay, opts) => {
      followUps.push({op, delay, opts});
      return true;
    };
    owner.getDeferredDispatchRetryOperation = async () => ({
      operationId: 'op-1',
      type: OperationType.ADD,
      partitionId: 'sql_write_operations-p1',
      sourceNodeId: 'node-remote',
      targetNodeId: 'node-other',
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.SENDING,
    });

    // A duplicate-dispatch retry timer is armed for the operation.
    owner.createdOperationHandoffRetryTimerByOperationId.set('op-1', {});

    await owner.onLateDispatchDeliveryHonored({
      deliverySource: HANDOFF_SOURCE,
      responseContext: 'op-1',
    });

    t.equal(
      followUps.length,
      1,
      'a honored late delivery reschedules the gentler verification follow-up',
    );
    t.equal(followUps[0]?.op?.operationId, 'op-1', 'for the honored operation');

    // An unrelated delivery source is ignored.
    owner.createdOperationHandoffRetryTimerByOperationId.set('op-2', {});
    await owner.onLateDispatchDeliveryHonored({
      deliverySource: 'query:insert:sql_write_operations',
      responseContext: 'op-2',
    });
    t.equal(followUps.length, 1, 'a non-handoff delivery source is ignored');

    // With no armed retry timer, there is nothing to reconcile.
    await owner.onLateDispatchDeliveryHonored({
      deliverySource: HANDOFF_SOURCE,
      responseContext: 'op-unknown',
    });
    t.equal(followUps.length, 1, 'an operation with no armed retry is ignored');
  } finally {
    await coordinator.shutdown();
  }
});
