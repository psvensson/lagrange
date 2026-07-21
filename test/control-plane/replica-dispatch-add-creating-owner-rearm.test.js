import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_DEFAULT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  createMockControlPlaneReadinessService,
  createTestCoordinator,
} from '../rebalancer/test-helpers.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';
import {
  buildRuntimeReplicaOperationRow,
  createTimerCapture,
  drainOperationDispatchQueue,
  drainScheduledTimers,
} from './replica-dispatch-virtual-timer-test-support.js';

const SOURCE_NODE_ID = 'node-1';
const TARGET_NODE_ID = 'node-2';
const OPERATION_ID = 'runtime-service-add-creating-owner-rearm';
const SERVICE_ID = 'svc-movielens-topn';
const REPLICA_ID = `${SERVICE_ID}-r1`;
const DISPATCH_DEFER_RETRY_AFTER_MS = 250;
const CREATING_STEP_TIMEOUT_MS =
  REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS;
const ROW_IDENTITY = Object.freeze({
  operationId: OPERATION_ID,
  serviceId: SERVICE_ID,
  replicaId: REPLICA_ID,
  sourceNodeId: SOURCE_NODE_ID,
  targetNodeId: TARGET_NODE_ID,
});

function buildRuntimeOperationRow(overrides = {}) {
  return buildRuntimeReplicaOperationRow(ROW_IDENTITY, overrides);
}

/**
 * Build the stranded-ADD live scenario shared by every ordering in this
 * suite: a real source coordinator whose repository owns the durable CREATING
 * row and can prove the exact target services row ACTIVE, wired to a source
 * dispatch service whose replica_operations reads never converge (the live
 * CDC divergence), with the first owner dispatch deferring retryable on
 * visibility lag and the second succeeding while the target outcome handoff
 * is never delivered.
 */
function createStrandedAddScenario(operationId) {
  const durableCreatingRow = buildRuntimeOperationRow({
    operation_id: operationId,
    status: ReplicaStatus.CREATING,
    workflow_step: WORKFLOW_STEP.CREATING,
    updated_at: 1700000000500,
  });
  const activeServiceRow = {
    service_id: REPLICA_ID,
    service_type: 'runtime_service',
    node_id: TARGET_NODE_ID,
    status: ReplicaStatus.ACTIVE,
    created_at: 1700000000510,
    updated_at: 1700000000514,
  };
  const {scheduledTimers, captureTimer, releaseTimer} = createTimerCapture();
  const sourceCoordinator = createTestCoordinator({
    nodeId: SOURCE_NODE_ID,
    cacheData: {
      services: [activeServiceRow],
      replicaOperations: [durableCreatingRow],
    },
    cdcIntegrationService: {
      async insertSystemTableRow() {
        return {success: true};
      },
      async updateSystemTableRow() {
        return {success: true};
      },
      async refreshAuthoritativeCacheRow() {
        return true;
      },
    },
    sqlQueryResults: {
      'FROM services WHERE service_id = ?': {
        success: true,
        rows: [activeServiceRow],
      },
    },
    setTimeoutFn: captureTimer,
    clearTimeoutFn: releaseTimer,
  });
  const dispatchOperation =
    sourceCoordinator.dispatchOperation.bind(sourceCoordinator);
  const scenario = {
    dispatchCallCount: 0,
    scheduledTimers,
    sourceCoordinator,
  };
  sourceCoordinator.dispatchOperation = async (...args) => {
    scenario.dispatchCallCount += 1;
    if (scenario.dispatchCallCount === 1) {
      const retryableError =
        new Error('Cache update not observed for replica operation');
      retryableError.retryAfterMs = DISPATCH_DEFER_RETRY_AFTER_MS;
      throw retryableError;
    }
    if (scenario.dispatchCallCount === 2) {
      // The deferred-retry dispatch reaches the target and SUCCEEDS; the
      // durable row commits CREATING while the target's outcome handoff back
      // to the source is lost at its retry budget.
      return {success: true};
    }
    return dispatchOperation(...args);
  };
  scenario.sourceDispatch = createService({
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: sourceCoordinator,
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      defaultRepairEligible: true,
    }),
    setTimeoutFn: captureTimer,
    clearTimeoutFn: releaseTimer,
  });
  // The live divergence: the source's replica_operations CDC never emitted
  // the row, so neither the cache nor the authoritative fallback ever
  // observes it from the dispatch service. Only the coordinator's own
  // repository (which created the operation) can see it.
  scenario.sourceDispatch.replicaOperationsOwner = {
    async getReplicaOperationFromCache() {
      return null;
    },
  };
  scenario.sourceDispatch.getAuthoritativeReplicaOperationRow = async () =>
    null;
  return scenario;
}

/**
 * Drive one payload-row ordering through the shared strand scenario: ingress,
 * visibility-lag defer, deferred-retry success, lost target handoff, then two
 * full CREATING windows of armed source-side timers. Returns the durable
 * operation as the source owner repository sees it at the end.
 */
async function runStrandedAddOrdering(t, scenario, operationId, payloadRow) {
  const {scheduledTimers, sourceCoordinator, sourceDispatch} = scenario;
  await sourceDispatch.handleReplicaOperationDispatch({
    type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
    [ControlPlaneField.OPERATION_ID]: operationId,
    [ControlPlaneField.OPERATION_ROW]: payloadRow,
  });
  await drainOperationDispatchQueue(sourceDispatch);

  t.equal(
    scenario.dispatchCallCount,
    1,
    'the initial source dispatch pass should reach the owner once',
  );
  const deferredRetry =
    sourceDispatch.operationDispatchDeferredRetries.get(operationId);
  t.ok(
    deferredRetry,
    'the visibility-lag failure should arm the existing deferred retry',
  );

  deferredRetry.timeoutHandle.fired = true;
  await deferredRetry.timeoutHandle.callback();
  await drainOperationDispatchQueue(sourceDispatch);

  t.equal(
    scenario.dispatchCallCount,
    2,
    'the deferred-retry dispatch should succeed and clear its slot',
  );

  // The target handoff wake is never delivered and no readiness transition
  // occurs. Fire every armed source-side timer through two full CREATING
  // windows.
  await drainScheduledTimers(
    scheduledTimers,
    sourceDispatch,
    CREATING_STEP_TIMEOUT_MS * 2,
  );

  return sourceCoordinator.repository.queryOperationById(operationId);
}

// Quest runtime-service-add-creating-owner-rearm. Live ordering from the
// 2026-07-21T13:35 MovieLens run (report movielens-lagrange-service-affinity-
// live-2026-07-21T13-35-45-939Z, ADD bd00c558): the source-owned non-system
// runtime ADD dispatch deferred once on replica-operation visibility lag
// ("Cache update not observed"), the deferred retry dispatched successfully,
// the durable row committed CREATING, the target created the replica, and the
// target's outcome handoff back to the source stopped at its operation budget
// without ever landing. The source's replica_operations CDC never emitted the
// row ("No row found for CDC update"), so the source cache/authoritative
// reads never converged. Nothing rearmed the operation before the
// initial-placement timeout, and the stranded non-terminal row held the
// rebalancer in-flight budget (second ADD skipped budget_exceeded).
//
// The two orderings below discriminate the two silent source-side dead ends
// consistent with that log evidence; they differ only in the workflow step
// the retained OPERATION_ROW payload carries. The terminal assertion is the
// sealed result: the canonical source owner re-enters the exact parked
// operation and drives it to terminal ACTIVE from exact-target ACTIVE
// services proof, releasing the budget slot.
test(
  'a stranded CREATING ADD whose row visibility never converges is still ' +
  're-entered through the canonical source owner to terminal ACTIVE',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-unreadable-row-owner-rearm`;
    const scenario = createStrandedAddScenario(operationId);

    try {
      const progressedOperation = await runStrandedAddOrdering(
        t,
        scenario,
        operationId,
        buildRuntimeOperationRow({operation_id: operationId}),
      );
      t.equal(
        progressedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the source-owned ADD must reach ACTIVE through the canonical owner ' +
        'even though the dispatch-service row reads never converge, because ' +
        'the owner repository and the exact-target ACTIVE services proof ' +
        'are both available',
      );
      t.equal(
        progressedOperation?.status,
        ReplicaStatus.ACTIVE,
        'the durable operation must reach its terminal state so the ' +
        'stranded row stops consuming the rebalancer in-flight budget',
      );
    } finally {
      scenario.sourceDispatch.stop();
      await scenario.sourceCoordinator.shutdown();
    }
  },
);

test(
  'a dispatch success observed with a pre-transition PENDING payload row ' +
  'still retains the target-progress verification re-entry',
  async (t) => {
    initEnv();

    const operationId = `${OPERATION_ID}-pending-payload-retention`;
    const scenario = createStrandedAddScenario(operationId);

    try {
      // The coordinator builds its dispatch request row from the in-memory
      // operation before the dispatch path claims SENDING, so the payload
      // the dispatch service retains across the deferred retry can still say
      // PENDING while the durable row has already advanced.
      const progressedOperation = await runStrandedAddOrdering(
        t,
        scenario,
        operationId,
        buildRuntimeOperationRow({
          operation_id: operationId,
          workflow_step: WORKFLOW_STEP.PENDING,
        }),
      );
      t.equal(
        progressedOperation?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'a stale pre-transition PENDING payload must not silently drop the ' +
        'retained verification re-entry: the owner must still drive the ' +
        'durable CREATING row to ACTIVE from exact-target ACTIVE proof',
      );
      t.equal(
        progressedOperation?.status,
        ReplicaStatus.ACTIVE,
        'the durable operation must reach its terminal state instead of ' +
        'stranding CREATING with the budget slot held',
      );
    } finally {
      scenario.sourceDispatch.stop();
      await scenario.sourceCoordinator.shutdown();
    }
  },
);
