// The direct remote wake-up decides on the transport owner's delivery state.
// Its configured retry delay is advice for a deferral only: under a positive
// operationDispatchRetryAfterMs a delivered router outcome takes the
// verification path, and a deferred one is deferred at that delay. The
// transport owner attaches no default hint, so the dispatch owner's own
// fallback supplies the delay for a null or non-positive hint. A dispatch
// owner's own refusal answer over a delivered transport defers through the
// dispatch owner (design Q5), never as a woken owner.
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {buildDeliveryEnvelope, buildTransportDeliveryOutcome} from
  '../../src/transport/transport-semantic-outcome.js';
import {createService, initEnv} from './replica-dispatch-node-state-update-test-support.js';

const RETRY_AFTER_MS = 23;
const OUTCOMES = Object.freeze({
  DELIVERED: buildDeliveryEnvelope({acknowledged: true}, {}),
  DEFERRED: buildDeliveryEnvelope({acknowledged: false, deferRetry: true}),
  DEFERRED_ZERO_HINT: buildDeliveryEnvelope({acknowledged: false, deferRetry: true,
    retryAfterMs: 0}),
  REFUSED: buildDeliveryEnvelope({acknowledged: true},
    {success: false, error: 'dispatch refused', retryAfterMs: 7}),
});

async function wake(outcome, operationId) {
  initEnv();
  const branches = {verified: 0, deferred: [], delays: []};
  const service = createService({
    operationDispatchRetryAfterMs: RETRY_AFTER_MS,
    messageRouter: {deliver: async () => outcome},
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    rebalanceCoordinator: {
      async dispatchOperation() {},
      isOperationLocallyOwned: () => false,
    },
    setTimeoutFn: (callback, delayMs) => ({callback, delayMs}),
    clearTimeoutFn: () => {},
  });
  service.scheduleRemoteDispatchWakeupVerification = () => {
    branches.verified += 1;
    return true;
  };
  service.deferOperationDispatchRetry = (_id, errorLike) => {
    branches.deferred.push(errorLike?.retryAfterMs ?? null);
    branches.delays.push(service.resolveOperationDispatchRetryAfterMs(errorLike));
    return true;
  };
  try {
    await service.handleCoordinatorOperationCreated({
      operationId, partitionId: 'control_plane_publications-p1',
      replicaId: 'control_plane_publications-p1-r4', type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.PENDING, sourceNodeId: 'node-1',
      targetNodeId: 'node-2', createdAt: 1700000000000, updatedAt: 1700000000100,
      stepsHistory: [],
    });
  } finally {
    service.stop();
  }
  return branches;
}

test('direct remote wake-up verifies a delivered outcome and defers a deferred one',
  async (t) => {
    t.same(await wake(OUTCOMES.DELIVERED, 'op-direct-wake-delivered'),
      {verified: 1, deferred: [], delays: []},
      'a delivered outcome takes the verification path under a positive retry delay');
    t.same(await wake(OUTCOMES.DEFERRED, 'op-direct-wake-deferred'),
      {verified: 0, deferred: [null], delays: [RETRY_AFTER_MS]},
      'a router deferral (its retryAfterMs computed, so own) is deferred at the ' +
      'dispatch owner\'s delay');
    t.same(await wake(OUTCOMES.DEFERRED_ZERO_HINT, 'op-direct-wake-deferred-zero'),
      {verified: 0, deferred: [0], delays: [RETRY_AFTER_MS]},
      'a deferral keeps its own zero hint and the dispatch owner falls back to its delay');
    t.same(await wake(OUTCOMES.REFUSED, 'op-direct-wake-refused'),
      {verified: 0, deferred: [7], delays: [7]},
      'a delivered dispatch refusal defers through the dispatch owner with its own hint');
    t.equal(buildTransportDeliveryOutcome({acknowledged: false, deferRetry: true})
      .retryAfterMs, null,
    'the transport owner attaches no caller default hint; the delay is the caller\'s');
  });
