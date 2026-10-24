/**
 * Property Test: Immediate ACK Before Handler Invocation
 * **Property 2: Immediate ACK before handler invocation**
 * **Validates: Requirements 2.1**
 *
 * Feature: transport-architecture-improvements,
 * Property 2: Immediate ACK before handler invocation
 *
 * *For any* SERVICE_MESSAGE received by the MessageRouter,
 * the ACK SHALL be sent to the sender before the registered handler
 * is invoked. Specifically, the sendRaw call for the ACK SHALL occur
 * before the handler function is called.
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
const sourceAddressArb = fc.stringMatching(/^[a-z][a-z0-9]{1,8}\/router$/);

/**
 * Arbitrary for a source node ID.
 */
const sourceNodeIdArb = fc.stringMatching(/^node-[a-z0-9]{1,6}$/);

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
 * Create a MessageRouter with an ordered event log
 * that tracks the sequence of sendRaw calls and handler
 * invocations.
 * @param {string} targetAddress - Address to register handler for.
 * @param {Function} handlerFn - Optional custom handler function.
 * @return {Object} Handler instance and event log.
 */
function createTrackedHandler(targetAddress, handlerFn) {
  const eventLog = [];

  const handler = handlerFn || ((_envelope) => {
    eventLog.push({event: 'handler_invoked'});
    return {ok: true};
  });

  const sendRaw = (_ws, msg) => {
    if (msg.type === ROUTER_MESSAGE_TYPE.ACK) {
      eventLog.push({event: 'ack_sent', messageId: msg.messageId});
    } else if (msg.type === ROUTER_MESSAGE_TYPE.SERVICE_RESPONSE) {
      eventLog.push({
        event: 'service_response_sent',
        messageId: msg.messageId,
      });
    }
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

  return {messageHandler, eventLog, mockWs};
}

test('Property 2: Immediate ACK before handler invocation',
  async (t) => {
    /**
     * Property: For any SERVICE_MESSAGE with a registered handler,
     * the ACK sendRaw call SHALL occur before the handler function
     * is invoked in the event log.
     */
    t.test('ACK is sent before handler runs for any message',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            targetAddressArb,
            messageIdArb,
            payloadArb,
            sourceAddressArb,
            sourceNodeIdArb,
            async (
              targetAddress, messageId, payload,
              sourceAddress, sourceNodeId,
            ) => {
              const {messageHandler, eventLog, mockWs} =
                createTrackedHandler(targetAddress);

              const message = buildServiceMessage(
                targetAddress, messageId, payload,
                sourceAddress, sourceNodeId,
              );

              messageHandler.handleServiceMessage(mockWs, message);

              // Allow the async handler promise to settle
              await Promise.resolve();

              // Event log must have at least 2 entries:
              // ack_sent, then handler_invoked
              if (eventLog.length < 2) return false;

              const ackIndex = eventLog.findIndex(
                (e) => e.event === 'ack_sent',
              );
              const handlerIndex = eventLog.findIndex(
                (e) => e.event === 'handler_invoked',
              );

              // ACK must exist
              if (ackIndex === -1) return false;
              // Handler must have been invoked
              if (handlerIndex === -1) return false;
              // ACK must come before handler
              if (ackIndex >= handlerIndex) return false;

              // ACK must reference the correct messageId
              if (eventLog[ackIndex].messageId !== messageId) {
                return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass('ACK is sent before handler runs for any message');
      });

    /**
     * Property: For any SERVICE_MESSAGE with a registered handler,
     * the full ordering shall be:
     * ACK → handler → SERVICE_RESPONSE.
     */
    t.test('full ordering: ACK, handler, SERVICE_RESPONSE',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            targetAddressArb,
            messageIdArb,
            payloadArb,
            sourceAddressArb,
            sourceNodeIdArb,
            async (
              targetAddress, messageId, payload,
              sourceAddress, sourceNodeId,
            ) => {
              const {messageHandler, eventLog, mockWs} =
                createTrackedHandler(targetAddress);

              const message = buildServiceMessage(
                targetAddress, messageId, payload,
                sourceAddress, sourceNodeId,
              );

              messageHandler.handleServiceMessage(mockWs, message);

              // Allow the async handler + response to settle
              await Promise.resolve();
              await Promise.resolve();

              // Must have all three events
              if (eventLog.length < 3) return false;

              const ackIdx = eventLog.findIndex(
                (e) => e.event === 'ack_sent',
              );
              const handlerIdx = eventLog.findIndex(
                (e) => e.event === 'handler_invoked',
              );
              const responseIdx = eventLog.findIndex(
                (e) => e.event === 'service_response_sent',
              );

              // All three must exist
              if (ackIdx === -1 || handlerIdx === -1 ||
                  responseIdx === -1) {
                return false;
              }

              // Strict ordering: ACK < handler < SERVICE_RESPONSE
              return ackIdx < handlerIdx &&
                     handlerIdx < responseIdx;
            },
          ),
          {numRuns: 10},
        );

        t.pass('full ordering: ACK, handler, SERVICE_RESPONSE');
      });
  });
