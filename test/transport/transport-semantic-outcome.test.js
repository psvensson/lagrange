import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  buildTransportDeliveryOutcome,
  classifyTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';

test('transport delivery outcome grammar classifies deferred and failed deliveries',
  async (t) => {
    const deferred = buildTransportDeliveryOutcome({
      acknowledged: false,
      error: 'connection closed',
      errorCode: 'ROUTER_CONNECTION_CLOSED',
      retryAfterMs: 250,
    });
    const failed = classifyTransportDeliveryOutcome({
      acknowledged: false,
      error: 'handler missing',
      noHandler: true,
    });

    t.same(
      deferred,
      {
        acknowledged: false,
        error: 'connection closed',
        errorCode: 'ROUTER_CONNECTION_CLOSED',
        retryAfterMs: 250,
        deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
        deferRetry: true,
        noHandler: false,
        reasonCode:
          TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED,
      },
      'deferred delivery should expose one canonical deferred grammar',
    );
    t.equal(
      failed.deliveryState,
      TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
      'non-deferred delivery failures should stay failed',
    );
    t.equal(
      failed.reasonCode,
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER,
      'no-handler failures should classify to the shared no_handler reason',
    );
  });

test('message router normalizes local delivery results onto the shared delivery grammar',
  async (t) => {
    const router = new MessageRouter({nodeId: 'transport-delivery-test'});
    await router.initialize({startServer: false});

    router.register(
      'transport-delivery-test/service/test-service',
      () => ({success: true, rows: [{id: 'r1'}]}),
    );

    const result = await router.deliver(
      'transport-delivery-test/service/test-service',
      {type: 'TEST'},
    );

    t.equal(
      result.deliveryState,
      TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
      'delivered messages should expose the shared delivered state',
    );
    t.equal(result.acknowledged, true, 'delivery should remain acknowledged');
    t.equal(result.success, true, 'handler payload should still be preserved');
    t.same(result.rows, [{id: 'r1'}], 'handler payload should remain intact');

    await router.shutdown();
  });
