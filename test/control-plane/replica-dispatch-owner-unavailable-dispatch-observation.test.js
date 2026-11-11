/**
 * A dispatch reconcile whose row is not in the cache reads the
 * replica_operations owner by id through the one typed read (PRESENT /
 * ABSENT / UNAVAILABLE). An UNAVAILABLE answer was read as "no row": the
 * reconcile cleared the operation's deferred dispatch retry and returned,
 * so the dispatch was dropped on an unanswered read. Now it holds on the
 * named visibility-lag retry and dispatches when the owner answers.
 *
 * Driven from the production entry (reconcileOperationDispatch, then the
 * armed retry), faults injected at the owner by-id read port.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {SERVICE_STATUS, STATE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  buildPresentOperationVisibility,
  buildUnavailableOperationVisibility,
  isOperationVisibilityUnavailableError,
} from '../../src/rebalancer/replica-operation-repository-operation-visibility.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';

const OPERATION_ID = 'remove-op-owner-unavailable-1';
const PARTITION_ID = 'sql_transactions-p1';

function durableOperation(updatedAt) {
  return {
    operationId: OPERATION_ID,
    type: OperationType.REMOVE,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    replicaId: `${PARTITION_ID}-r3`,
    sourceNodeId: 'node-1',
    targetNodeId: 'node-1',
    workflowStep: WORKFLOW_STEP.SENDING,
    stepsHistory: [],
    createdAt: updatedAt - 1000,
    updatedAt,
  };
}

async function settle(predicate) {
  for (let turn = 0; turn < 200 && !predicate(); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('an unanswered owner read holds the dispatch on its named retry; the ' +
  'same dispatch proceeds once the owner answers', async (t) => {
  initEnv();
  const now = Date.now();
  const timers = [];
  const dispatched = [];
  const port = {answer: 'unavailable', reads: 0};
  const operation = durableOperation(now - 500);
  const service = createService({
    cacheNodes: [{node_id: 'node-1', node_address: 'localhost:8081',
      status: SERVICE_STATUS.ACTIVE, connection_state: STATE.READY,
      capabilities: '[]', last_heartbeat: now,
      ready_lease_expires_at: now + 30000, created_at: now - 5000}],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync: () => ({dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      }}),
    },
    setTimeoutFn(callback, delayMs) {
      const timer = {callback, delayMs};
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn(timer) {
      if (timer) timer.cleared = true;
    },
    rebalanceCoordinator: {
      repository: {
        async getOperationByIdVisibilityObservation() {
          port.reads += 1;
          return port.answer === 'unavailable' ?
            buildUnavailableOperationVisibility({
              reasonCode: 'authoritative_read_unavailable',
              retryable: true,
              retryAfterMs: 250,
            }) :
            buildPresentOperationVisibility(operation);
        },
      },
      async dispatchOperation(dispatchedOperation) {
        dispatched.push(dispatchedOperation.operationId);
        return {success: true};
      },
      isOperationLocallyOwned: () => true,
    },
  });
  try {
    // (a) The owner cannot answer.
    const outcome = await service.reconcileOperationDispatch(OPERATION_ID, {})
      .then((value) => ({value}), (error) => ({error}));
    t.equal(port.reads, 1, 'the owner was asked once');
    t.equal(isOperationVisibilityUnavailableError(outcome.error), true,
      'the pass ends with the typed unavailability, not "no row"');
    t.same(dispatched, [], 'nothing is dispatched on the unanswered read');
    t.equal(service.operationDispatchDeferredRetries.has(OPERATION_ID), true,
      'the dispatch is held on its named retry, not dropped');
    const retry = timers.find((timer) => !timer.cleared && timer.delayMs === 250);
    t.ok(retry, 'the retry waits for the owner\'s retry-after');

    // (b) The owner answers; the held retry fires and the same dispatch runs.
    port.answer = 'present';
    retry.callback();
    await settle(() => dispatched.length > 0);
    t.same(dispatched, [OPERATION_ID], 'the dispatch proceeds exactly once');
    t.equal(port.reads, 2, 'on the owner\'s answer');
  } finally {
    service.stop();
  }
});
