/**
 * Property test for Local Delivery Equivalence.
 * Property 7: Local delivery produces equivalent results to handler invocation
 *
 * For any registered handler and message payload, a LOCAL delivery SHALL
 * resolve to the router's delivery envelope: the router's own transport
 * outcome of the delivery (its identity, acknowledged, DELIVERED) and, beside
 * it, the handler's answer with every own field it returned (including its
 * own `type`), never merged into the transport. A handler throw is the
 * router's FAILED/handler_failed with the thrown text and no answer.
 *
 * Validates: Requirements 4.3
 *
 * Feature: write-path-throughput, Property 7: Local delivery equivalence
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {deliveryTransportOf, isDeliveredTransportDeliveryOutcome,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE as REASON,
  TRANSPORT_DELIVERY_OUTCOME_STATE as STATE,
} from '../../src/transport/transport-semantic-outcome.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'local-delivery-test'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

async function deliverOnce(nodeId, address, handler, message) {
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId, inProcess: true});
  await router.initialize({startServer: false});
  try {
    router.register(address, handler);
    return await router.deliver(address, message);
  } finally {
    await router.shutdown();
  }
}

test('Property 7: Local delivery produces equivalent results ' +
  'to handler invocation', async (t) => {
  t.test('the handler answer travels beside the router transport, verbatim',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            customField: fc.string({minLength: 1, maxLength: 30}),
            status: fc.constantFrom('ok', 'done', 'processed'),
            count: fc.integer({min: 0, max: 1000}),
          }),
          fc.option(
            fc.string({minLength: 1, maxLength: 20}),
            {nil: undefined},
          ),
          async (responseFields, handlerType) => {
            const handlerResult = {...responseFields};
            if (handlerType) handlerResult.type = handlerType;
            const delivery = await deliverOnce('local-equiv-node',
              'local-equiv-node/partition/test-p1', () => handlerResult,
              {messageId: 'msg-1', data: 'test'});
            return delivery.transport.deliveryState === STATE.DELIVERED &&
              isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)) === true &&
              delivery.transport.messageId === 'msg-1' &&
              JSON.stringify(delivery.answer) === JSON.stringify(handlerResult);
          },
        ),
        {numRuns: 10},
      );
      t.pass('the handler answer travels beside the router transport, verbatim');
    });

  t.test('a handler throw is FAILED/handler_failed with no answer', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50})
          .filter((s) => s.trim().length > 0),
        fc.record({
          data: fc.string({maxLength: 30}),
        }),
        async (errorMsg, payload) => {
          const delivery = await deliverOnce('local-err-node',
            'local-err-node/partition/test-p2', () => {
              throw new Error(errorMsg);
            }, {...payload, messageId: 'msg-err'});
          return delivery.transport.deliveryState === STATE.FAILED &&
            delivery.transport.reasonCode === REASON.HANDLER_FAILED &&
            delivery.transport.error === errorMsg &&
            delivery.transport.messageId === 'msg-err' &&
            delivery.answer === null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('a handler throw is FAILED/handler_failed with no answer');
  });

  t.test('a non-object handler return is delivered as that answer', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.integer(),
          fc.string({maxLength: 20}),
          fc.boolean(),
        ),
        async (handlerReturn) => {
          const delivery = await deliverOnce('local-nonobj-node',
            'local-nonobj-node/partition/test-p3', () => handlerReturn,
            {messageId: 'msg-no', correlationId: 'corr-no'});
          return isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)) === true &&
            delivery.transport.messageId === 'msg-no' &&
            delivery.transport.correlationId === 'corr-no' &&
            delivery.answer === (handlerReturn ?? null);
        },
      ),
      {numRuns: 10},
    );
    t.pass('a non-object handler return is delivered as that answer');
  });
});
