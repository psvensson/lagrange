/**
 * Property Test: SERVICE_RESPONSE Correlation and Completeness
 * **Property 3: SERVICE_RESPONSE correlation and completeness**
 * **Validates: Requirements 2.2, 2.3**
 *
 * Feature: transport-architecture-improvements,
 * Property 3: SERVICE_RESPONSE correlation and completeness
 *
 * *For any* SERVICE_MESSAGE whose handler completes (either
 * successfully or with an error), the MessageRouter SHALL
 * send exactly one SERVICE_RESPONSE message with the same messageId
 * as the original SERVICE_MESSAGE, containing either the handler
 * result or the error message.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ROUTER_MESSAGE_TYPE} from '../../src/constants/transport.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

ConfigurationManager.resetInstance();
LoggingService.resetInstance();
ConfigurationManager.getInstance().initialize({node: {id: 'local-node'}});
LoggingService.getInstance().initialize({level: 'error'});

/**
 * Arbitrary for a target address string in the format
 * nodeId/entityType/entityId.
 */
const targetAddressArb = fc.tuple(
  fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/),
  fc.constantFrom('partition', 'service', 'lifecycle'),
  fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/),
).map(([node, entity, id]) => `${node}/${entity}/${id}`);

/**
 * Arbitrary for a message ID string.
 */
const messageIdArb = fc.stringMatching(/^msg-[a-z0-9]{1,12}$/);

/**
 * Arbitrary for a payload object with random keys/values.
 */
const payloadArb = fc.oneof(
  fc.record({
    action: fc.constantFrom('write', 'read', 'delete'),
    data: fc.string({maxLength: 20}),
  }),
  fc.constant({sql: 'SELECT 1'}),
  fc.record({value: fc.integer()}),
);

/**
 * Arbitrary for a source address string.
 */
const sourceAddressArb = fc.stringMatching(
  /^[a-z][a-z0-9]{1,8}\/router$/,
);

/**
 * Arbitrary for a source node ID.
 */
const sourceNodeIdArb = fc.stringMatching(/^node-[a-z0-9]{1,6}$/);

/**
 * Arbitrary for a handler result (success case).
 */
const handlerResultArb = fc.oneof(
  fc.record({status: fc.constantFrom('ok', 'created', 'updated')}),
  fc.record({rows: fc.array(fc.integer(), {maxLength: 5})}),
  fc.constant({acknowledged: true}),
  fc.record({count: fc.nat({max: 1000})}),
);

/**
 * Arbitrary for a handler error message (failure case).
 */
const handlerErrorMsgArb = fc.oneof(
  fc.constant('Table not found'),
  fc.constant('Permission denied'),
  fc.constant('Timeout exceeded'),
  fc.stringMatching(/^err-[a-z0-9]{1,20}$/),
);

/**
 * Arbitrary for handler outcome: either success with a result
 * or failure with an error message.
 */
const handlerOutcomeArb = fc.oneof(
  handlerResultArb.map((result) => ({type: 'success', result})),
  handlerErrorMsgArb.map((msg) => ({type: 'error', errorMsg: msg})),
);

/**
 * Build a SERVICE_MESSAGE from generated parts.
 * @param {string} targetAddress - Target address.
 * @param {string} messageId - Message ID.
 * @param {Object} payload - Message payload.
 * @param {string} sourceAddress - Source address.
 * @param {string} sourceNodeId - Source node ID.
 * @return {Object} A SERVICE_MESSAGE object.
 */
function buildServiceMessage(
  targetAddress, messageId, payload, sourceAddress, sourceNodeId,
) {
  return {
    type: ROUTER_MESSAGE_TYPE.SERVICE_MESSAGE,
    targetAddress,
    messageId,
    payload,
    sourceAddress,
    sourceNodeId,
    timestamp: Date.now(),
  };
}

/**
 * Create a MessageRouter with a mock sendRaw that captures
 * all sent messages, and a handler that produces the given outcome.
 * @param {string} targetAddress - Address to register handler for.
 * @param {Object} outcome - Handler outcome (success or error).
 * @return {Object} Handler instance, captured messages, and mock ws.
 */
function createHandlerWithOutcome(targetAddress, outcome) {
  const sentMessages = [];

  const handler = (_envelope) => {
    if (outcome.type === 'error') {
      throw new Error(outcome.errorMsg);
    }
    return outcome.result;
  };

  const sendRaw = (_ws, msg) => {
    sentMessages.push(msg);
  };

  // The real MessageRouter inbound dispatch, with only its socket write
  // captured: the router is never initialized, so it opens no server.
  const messageHandler = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'local-node'});
  messageHandler.logger = {debug: () => {}, warn: () => {}, error: () => {},
    info: () => {}};
  messageHandler.sendRaw = sendRaw;
  messageHandler.register(targetAddress, handler);

  const mockWs = {send: () => {}};

  return {messageHandler, sentMessages, mockWs};
}

test('Property 3: SERVICE_RESPONSE correlation and completeness',
  async (t) => {
    /**
     * Property: For any SERVICE_MESSAGE whose handler succeeds,
     * exactly one SERVICE_RESPONSE is sent with the same messageId
     * and the handler result.
     */
    t.test('success: SERVICE_RESPONSE has correct messageId and result',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            targetAddressArb,
            messageIdArb,
            payloadArb,
            sourceAddressArb,
            sourceNodeIdArb,
            handlerResultArb,
            async (
              targetAddress, messageId, payload,
              sourceAddress, sourceNodeId, result,
            ) => {
              const outcome = {type: 'success', result};
              const {messageHandler, sentMessages, mockWs} =
                createHandlerWithOutcome(targetAddress, outcome);

              const message = buildServiceMessage(
                targetAddress, messageId, payload,
                sourceAddress, sourceNodeId,
              );

              messageHandler.handleServiceMessage(mockWs, message);

              // Allow async handler + response to settle
              await new Promise((resolve) => setImmediate(resolve));

              // Filter to SERVICE_RESPONSE messages only
              const responses = sentMessages.filter(
                (m) => m.type ===
                  ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE,
              );

              // Exactly one SERVICE_RESPONSE must be sent
              if (responses.length !== 1) return false;

              const resp = responses[0];

              // messageId must match the original
              if (resp.messageId !== messageId) return false;

              // sourceAddress must match the original
              if (resp.sourceAddress !== sourceAddress) return false;

              // Must contain the handler result
              if (JSON.stringify(resp.result) !==
                  JSON.stringify(result)) {
                return false;
              }

              // Must NOT contain an error field
              if (resp.error !== undefined) return false;

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'success: SERVICE_RESPONSE has correct messageId and result',
        );
      });

    /**
     * Property: For any SERVICE_MESSAGE whose handler throws,
     * exactly one SERVICE_RESPONSE is sent with the same messageId
     * and the error message.
     */
    t.test('error: SERVICE_RESPONSE has correct messageId and error',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            targetAddressArb,
            messageIdArb,
            payloadArb,
            sourceAddressArb,
            sourceNodeIdArb,
            handlerErrorMsgArb,
            async (
              targetAddress, messageId, payload,
              sourceAddress, sourceNodeId, errorMsg,
            ) => {
              const outcome = {type: 'error', errorMsg};
              const {messageHandler, sentMessages, mockWs} =
                createHandlerWithOutcome(targetAddress, outcome);

              const message = buildServiceMessage(
                targetAddress, messageId, payload,
                sourceAddress, sourceNodeId,
              );

              messageHandler.handleServiceMessage(mockWs, message);

              // Allow async handler + error catch to settle
              await new Promise((resolve) => setImmediate(resolve));

              // Filter to SERVICE_RESPONSE messages only
              const responses = sentMessages.filter(
                (m) => m.type ===
                  ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE,
              );

              // Exactly one SERVICE_RESPONSE must be sent
              if (responses.length !== 1) return false;

              const resp = responses[0];

              // messageId must match the original
              if (resp.messageId !== messageId) return false;

              // sourceAddress must match the original
              if (resp.sourceAddress !== sourceAddress) return false;

              // Must contain the error message
              if (resp.error !== errorMsg) return false;

              // Must NOT contain a result field
              if (resp.result !== undefined) return false;

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'error: SERVICE_RESPONSE has correct messageId and error',
        );
      });

    /**
     * Property: For any handler outcome (success or error),
     * exactly one SERVICE_RESPONSE is sent with the correct
     * messageId and the appropriate outcome field.
     */
    t.test('any outcome: exactly one correlated SERVICE_RESPONSE',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            targetAddressArb,
            messageIdArb,
            payloadArb,
            sourceAddressArb,
            sourceNodeIdArb,
            handlerOutcomeArb,
            async (
              targetAddress, messageId, payload,
              sourceAddress, sourceNodeId, outcome,
            ) => {
              const {messageHandler, sentMessages, mockWs} =
                createHandlerWithOutcome(targetAddress, outcome);

              const message = buildServiceMessage(
                targetAddress, messageId, payload,
                sourceAddress, sourceNodeId,
              );

              messageHandler.handleServiceMessage(mockWs, message);

              // Allow async handler + response to settle
              await new Promise((resolve) => setImmediate(resolve));

              // Filter to SERVICE_RESPONSE messages only
              const responses = sentMessages.filter(
                (m) => m.type ===
                  ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE,
              );

              // Exactly one SERVICE_RESPONSE must be sent
              if (responses.length !== 1) return false;

              const resp = responses[0];

              // messageId must correlate with original
              if (resp.messageId !== messageId) return false;

              // sourceAddress must correlate with original
              if (resp.sourceAddress !== sourceAddress) return false;

              // Outcome must match handler behavior
              if (outcome.type === 'success') {
                if (JSON.stringify(resp.result) !==
                    JSON.stringify(outcome.result)) {
                  return false;
                }
                if (resp.error !== undefined) return false;
              } else {
                if (resp.error !== outcome.errorMsg) return false;
                if (resp.result !== undefined) return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass('any outcome: exactly one correlated SERVICE_RESPONSE');
      });
  });
