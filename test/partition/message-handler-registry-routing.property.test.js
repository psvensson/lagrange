/**
 * Property Test: Message Handler Registry Routing
 * **Property 1: Message Handler Registry Routing**
 * **Validates: Requirements 2.1, 2.2**
 *
 * Feature: code-clarity-maintainability, Property 1: Message Handler Registry Routing
 *
 * *For any* registered message type and corresponding handler, when a message
 * of that type is received, the registry SHALL invoke the correct handler and
 * return its result.
 *
 * This property test verifies:
 * 1. Registered handlers are invoked correctly for their message types
 * 2. The handler receives the full message object
 * 3. The handler's return value is returned by handle()
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageHandlerRegistry} from '../../src/partition/message-handler-registry.js';

/**
 * Generator for valid message type strings.
 * Message types are non-empty strings that identify the type of message.
 */
const messageTypeArb = fc.string({minLength: 1, maxLength: 50}).filter((s) => s.trim().length > 0);

/**
 * Generator for arbitrary handler return values.
 * Handlers can return any object with various properties.
 */
const handlerResultArb = fc.record({
  acknowledged: fc.boolean(),
  result: fc.anything(),
  data: fc.option(fc.anything()),
});

/**
 * Generator for arbitrary message payload data.
 */
const payloadDataArb = fc.anything();

/**
 * Generator for multiple unique message types.
 * @param {number} count - Number of unique types to generate.
 * @return {fc.Arbitrary} Arbitrary for array of unique message types.
 */
function uniqueMessageTypesArb(count) {
  return fc.uniqueArray(messageTypeArb, {minLength: count, maxLength: count});
}

test('Property 1: Message Handler Registry Routing', async (t) => {
  /**
   * Property: For any registered message type and handler, when a message of
   * that type is received, the registry SHALL invoke the handler.
   *
   * Validates: Requirement 2.1 - WHEN PartitionService handles application
   * messages THEN the system SHALL use a Map-based handler registry.
   */
  t.test('registered handlers are invoked for their message types', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        messageTypeArb,
        handlerResultArb,
        payloadDataArb,
        async (messageType, expectedResult, payloadData) => {
          const registry = new MessageHandlerRegistry();
          let handlerInvoked = false;

          registry.register(messageType, async () => {
            handlerInvoked = true;
            return expectedResult;
          });

          const message = {
            payload: {type: messageType, data: payloadData},
          };

          await registry.handle(message);

          // Handler must be invoked
          return handlerInvoked === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('registered handlers are invoked for their message types');
  });

  /**
   * Property: For any registered handler, when invoked, it SHALL receive
   * the full message object as its argument.
   *
   * Validates: Requirement 2.2 - THE Message_Handler_Registry SHALL map
   * message types to bound handler functions.
   */
  t.test('handlers receive the full message object', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        messageTypeArb,
        payloadDataArb,
        fc.option(fc.uuid()),
        fc.option(fc.integer({min: 0})),
        async (messageType, payloadData, correlationId, timestamp) => {
          const registry = new MessageHandlerRegistry();
          let receivedMessage = null;

          registry.register(messageType, async (msg) => {
            receivedMessage = msg;
            return {acknowledged: true};
          });

          const message = {
            payload: {type: messageType, data: payloadData},
          };
          if (correlationId !== null) {
            message.correlationId = correlationId;
          }
          if (timestamp !== null) {
            message.timestamp = timestamp;
          }

          await registry.handle(message);

          // Handler must receive the exact message object
          if (receivedMessage === null) {
            return false;
          }

          // Verify payload is passed correctly
          if (receivedMessage.payload?.type !== messageType) {
            return false;
          }

          // Verify the message reference is the same
          return receivedMessage === message;
        },
      ),
      {numRuns: 10},
    );

    t.pass('handlers receive the full message object');
  });

  /**
   * Property: For any registered handler, the return value from the handler
   * SHALL be returned by handle().
   *
   * Validates: Requirement 2.1, 2.2 - The registry routes messages to handlers
   * and returns their results.
   */
  t.test('handler return values are returned by handle()', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        messageTypeArb,
        handlerResultArb,
        async (messageType, expectedResult) => {
          const registry = new MessageHandlerRegistry();

          registry.register(messageType, async () => {
            return expectedResult;
          });

          const message = {
            payload: {type: messageType},
          };

          const result = await registry.handle(message);

          // Result must match the handler's return value
          return (
            result.acknowledged === expectedResult.acknowledged &&
            result.result === expectedResult.result
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('handler return values are returned by handle()');
  });

  /**
   * Property: For any set of registered handlers, each message type SHALL
   * route to its specific handler and not to others.
   *
   * Validates: Requirement 2.1, 2.2 - The registry correctly maps message
   * types to their bound handler functions.
   */
  t.test('each message type routes to its specific handler', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        uniqueMessageTypesArb(3),
        async (messageTypes) => {
          const registry = new MessageHandlerRegistry();
          const invocationCounts = new Map();

          // Register handlers for each type
          for (const type of messageTypes) {
            invocationCounts.set(type, 0);
            registry.register(type, async () => {
              invocationCounts.set(type, invocationCounts.get(type) + 1);
              return {acknowledged: true, type};
            });
          }

          // Send a message for the first type
          const targetType = messageTypes[0];
          const message = {
            payload: {type: targetType},
          };

          await registry.handle(message);

          // Only the target handler should be invoked
          if (invocationCounts.get(targetType) !== 1) {
            return false;
          }

          // Other handlers should not be invoked
          for (const type of messageTypes.slice(1)) {
            if (invocationCounts.get(type) !== 0) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('each message type routes to its specific handler');
  });

  /**
   * Property: For any registered handler that returns a complex result,
   * the full result object SHALL be returned by handle().
   *
   * Validates: Requirement 2.1, 2.2 - Handler results are correctly returned.
   */
  t.test('complex handler results are fully returned', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        messageTypeArb,
        fc.record({
          acknowledged: fc.boolean(),
          result: fc.string(),
          metadata: fc.record({
            timestamp: fc.integer(),
            source: fc.string(),
          }),
          items: fc.array(fc.integer()),
        }),
        async (messageType, complexResult) => {
          const registry = new MessageHandlerRegistry();

          registry.register(messageType, async () => {
            return complexResult;
          });

          const message = {
            payload: {type: messageType},
          };

          const result = await registry.handle(message);

          // Verify all properties are returned
          if (result.acknowledged !== complexResult.acknowledged) {
            return false;
          }
          if (result.result !== complexResult.result) {
            return false;
          }
          if (result.metadata?.timestamp !== complexResult.metadata?.timestamp) {
            return false;
          }
          if (result.metadata?.source !== complexResult.metadata?.source) {
            return false;
          }
          if (result.items?.length !== complexResult.items?.length) {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('complex handler results are fully returned');
  });

  /**
   * Property: For any sequence of messages to the same registered handler,
   * each message SHALL be handled independently and correctly.
   *
   * Validates: Requirement 2.1, 2.2 - Handlers work correctly for multiple
   * invocations.
   */
  t.test('handlers work correctly for multiple invocations', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        messageTypeArb,
        fc.array(payloadDataArb, {minLength: 1, maxLength: 5}),
        async (messageType, payloadDataArray) => {
          const registry = new MessageHandlerRegistry();
          const receivedPayloads = [];

          registry.register(messageType, async (msg) => {
            receivedPayloads.push(msg.payload.data);
            return {acknowledged: true, index: receivedPayloads.length - 1};
          });

          // Send multiple messages
          for (let i = 0; i < payloadDataArray.length; i++) {
            const message = {
              payload: {type: messageType, data: payloadDataArray[i]},
            };
            const result = await registry.handle(message);

            // Each result should have the correct index
            if (result.index !== i) {
              return false;
            }
          }

          // All payloads should be received
          if (receivedPayloads.length !== payloadDataArray.length) {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('handlers work correctly for multiple invocations');
  });
});
