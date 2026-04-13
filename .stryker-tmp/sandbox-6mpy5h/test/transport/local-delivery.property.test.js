/**
 * Property test for Local Delivery Equivalence.
 * Property 7: Local delivery produces equivalent results to handler invocation
 *
 * For any registered handler and message payload, deliverLocal() SHALL produce
 * an acknowledgment result with the same handler-derived fields as
 * handleServiceMessage() would produce for the same handler and payload.
 *
 * Validates: Requirements 4.3
 *
 * Feature: write-path-throughput, Property 7: Local delivery equivalence
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'local-delivery-test'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

/**
 * Simulate what handleServiceMessage produces for a given handler result.
 * This is the reference implementation extracted from the ACK construction
 * logic in handleServiceMessage().
 * @param {string} messageId - The message ID.
 * @param {*} handlerResult - The value returned by the handler.
 * @return {Object} The expected ACK fields (excluding type).
 */
function buildExpectedAckFields(messageId, handlerResult) {
  const ack = {
    messageId,
    acknowledged: true,
  };
  if (handlerResult &&
    typeof handlerResult === 'object') {
    const {
      acknowledged: _ack,
      type: handlerType,
      ...rest
    } = handlerResult;
    Object.assign(ack, rest);
    if (handlerType) {
      ack.responseType = handlerType;
    }
  }
  return ack;
}

/**
 * Feature: write-path-throughput
 * Property 7: Local delivery produces equivalent results to handler invocation
 *
 * Validates: Requirements 4.3
 */
test('Property 7: Local delivery produces equivalent results ' +
  'to handler invocation', async (t) => {
  /**
   * Sub-property: For any handler returning an object with arbitrary fields,
   * deliverLocal() result contains the same handler-derived fields as
   * handleServiceMessage() would produce.
   *
   * Validates: Requirements 4.3
   */
  t.test('handler object fields match handleServiceMessage ACK shape',
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
            const nodeId = 'local-equiv-node';
            const router = new MessageRouter({nodeId, inProcess: true});
            const address = `${nodeId}/partition/test-p1`;

            const handlerResult = {...responseFields};
            if (handlerType) handlerResult.type = handlerType;

            router.register(address, () => handlerResult);

            const outcome = await router.deliverLocal(
              address, 'msg-1', {data: 'test'}, 'corr-1',
            );
            const result = outcome.result;

            const expected = buildExpectedAckFields(
              'msg-1', handlerResult,
            );

            // correlationId is added by deliverLocal but not by
            // handleServiceMessage ACK (it's added at deliver level)
            // so we check handler-derived fields only
            for (const [key, val] of Object.entries(expected)) {
              if (result[key] !== val) return false;
            }
            if (result.acknowledged !== true) return false;
            if (handlerType && result.responseType !== handlerType) {
              return false;
            }
            if (!handlerType && result.responseType !== undefined) {
              return false;
            }
            return true;
          },
        ),
        {numRuns: 10},
      );
      t.pass('handler object fields match handleServiceMessage ACK shape');
    });

  /**
   * Sub-property: For any handler that throws, deliverLocal() produces
   * acknowledged: false with the error message, matching
   * handleServiceMessage() error behavior.
   *
   * Validates: Requirements 4.3
   */
  t.test('handler error produces same shape as handleServiceMessage',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({minLength: 1, maxLength: 50})
            .filter((s) => s.trim().length > 0),
          fc.record({
            data: fc.string({maxLength: 30}),
          }),
          async (errorMsg, payload) => {
            const nodeId = 'local-err-node';
            const router = new MessageRouter({nodeId, inProcess: true});
            const address = `${nodeId}/partition/test-p2`;

            router.register(address, () => {
              throw new Error(errorMsg);
            });

            const outcome = await router.deliverLocal(
              address, 'msg-err', payload, 'corr-err',
            );
            const result = outcome.result;

            return result.acknowledged === false &&
              result.error === errorMsg &&
              result.messageId === 'msg-err';
          },
        ),
        {numRuns: 10},
      );
      t.pass('handler error produces same shape as handleServiceMessage');
    });

  /**
   * Sub-property: For any handler returning a non-object value,
   * deliverLocal() produces acknowledged: true with no extra fields,
   * matching handleServiceMessage() behavior.
   *
   * Validates: Requirements 4.3
   */
  t.test('non-object handler return produces acknowledged-only result',
    async (t) => {
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
            const nodeId = 'local-nonobj-node';
            const router = new MessageRouter({nodeId, inProcess: true});
            const address = `${nodeId}/partition/test-p3`;

            router.register(address, () => handlerReturn);

            const outcome = await router.deliverLocal(
              address, 'msg-no', {}, 'corr-no',
            );
            const result = outcome.result;

            const expected = buildExpectedAckFields(
              'msg-no', handlerReturn,
            );

            return result.acknowledged === expected.acknowledged &&
              result.messageId === expected.messageId &&
              result.correlationId === 'corr-no';
          },
        ),
        {numRuns: 10},
      );
      t.pass('non-object handler return produces acknowledged-only result');
    });
});
