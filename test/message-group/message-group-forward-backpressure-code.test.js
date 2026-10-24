// C3 witness: the MG forwarder recognizes outbound-queue backpressure from the
// transport owner's error code, not from a stale copy of it or English text.
//
// The outcome is the router's own deferred delivery failure for a saturated
// outbound queue (the shape message-router-delivery-behaviors returns for
// OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE), normalized by the transport owner.
// Its error text is replaced by an opaque detail, so only the code can decide.
import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {normalizeDeliveryOutcome} from
  '../../src/transport/message-router-outbound-queue-admission.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
} from '../../src/transport/transport-semantic-outcome.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {createControllableMessageGroupService} from
  './message-group-service-test-support.js';

const NODE_ID = 'c3-forward-node';
const OPAQUE_DETAIL = 'peer refused the forward';

function routerDeferredFailure(router, errorCode) {
  return normalizeDeliveryOutcome({
    result: router.buildDeferredDeliveryFailure('c3-message', 'c3-message',
      OPAQUE_DETAIL, {errorCode, retryAfterMs: router.reconnectIntervalMs}),
    queueWaitMs: 0,
  }).result;
}

test('MG forwarder treats the transport owner backpressure code as backpressure',
  async (t) => {
    const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: NODE_ID});
    await router.initialize({startServer: false});
    t.teardown(() => router.shutdown());
    const mg = createControllableMessageGroupService({groupId: 'c3-forward-group',
      replicaId: 'c3-forward-r1', nodeId: NODE_ID, transport: router});

    const backpressured = routerDeferredFailure(router,
      OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE);
    t.same({deliveryState: backpressured.deliveryState,
      reasonCode: backpressured.reasonCode},
    {deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
      reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.OUTBOUND_QUEUE_BACKPRESSURED},
    'the transport owner classifies the router outcome as queue backpressure');
    t.equal(mg.isForwardTargetBackpressured(backpressured, backpressured.error), true,
      'the forwarder decides backpressure from the owner code');
    t.equal(mg.shouldSuppressForwardTarget(backpressured, backpressured.error), true,
      'a backpressured forward target is suppressed');

    const timedOut = routerDeferredFailure(router, ROUTER_MESSAGE_TIMEOUT_ERROR_CODE);
    t.equal(mg.isForwardTargetBackpressured(timedOut, timedOut.error), false,
      'another transport code with the same text is not backpressure');
  });
