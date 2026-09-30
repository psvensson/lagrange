import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from '../../src/transport/message-router-shared-vocabulary.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  buildTransportDeliveryOutcome,
  classifyTransportDeliveryOutcome,
} from '../../src/transport/transport-semantic-outcome.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

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

test('transport delivery outcome fails closed when ACK contradicts delivery metadata',
  async (t) => {
    const cases = [
      {
        label: 'explicit deferral',
        value: {acknowledged: true, deferRetry: true, retryAfterMs: 25},
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
      },
      {
        label: 'connection failure',
        value: {
          acknowledged: true,
          errorCode: 'ROUTER_CONNECTION_CLOSED',
        },
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
      },
      {
        label: 'no connection',
        value: {
          acknowledged: true,
          errorCode: ROUTER_NO_CONNECTION_ERROR_CODE,
        },
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
      },
      {
        label: 'queue backpressure',
        value: {
          acknowledged: true,
          errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
        },
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
      },
      {
        label: 'connect timeout',
        value: {
          acknowledged: true,
          errorCode: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
        },
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
      },
      {
        label: 'explicit failed delivery state',
        value: {acknowledged: true, deliveryState: 'failed'},
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
      },
      {
        label: 'completed response carrying a raw error',
        value: {
          acknowledged: true,
          status: 'completed',
          error: 'connection failed',
        },
        expectedState: TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
      },
    ];

    for (const {label, value, expectedState} of cases) {
      const outcome = classifyTransportDeliveryOutcome(value);
      t.equal(outcome.deliveryState, expectedState,
        `${label}: ACK cannot erase contradictory transport state`);
    }
    t.equal(classifyTransportDeliveryOutcome({
      acknowledged: true,
      status: 'error',
      error: 'application refused the request',
    }).deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED,
    'confirmed delivery preserves an application refusal for its caller');
  });

test('message router normalizes local delivery results onto the shared delivery grammar',
  async (t) => {
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: 'transport-delivery-test'});
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
