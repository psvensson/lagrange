/**
 * Property test for Routing Correctness.
 * Property 4: For any message sent to a registered address, the MessageRouter
 * SHALL invoke the correct handler. The handler invoked SHALL be the one
 * registered for that exact address.
 *
 * Validates: Requirements 5.1, 5.2, 5.3
 *
 * Feature: unified-remote-transport
 * Property 4: Routing Correctness
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

// Valid entity types as defined in the design
const VALID_ENTITY_TYPES = ['message-group', 'partition', 'lifecycle', 'service'];

/**
 * Feature: unified-remote-transport
 * Property 4: Routing Correctness
 *
 * For any message sent to a registered address, the MessageRouter SHALL invoke
 * the correct handler. The handler invoked SHALL be the one registered for
 * that exact address.
 */
test('Property 4: Routing Correctness', async (t) => {
  /**
   * Property: Registered handler is invoked for matching address.
   *
   * For any valid address and message, when a handler is registered for that
   * address and a message is delivered via WebSocket (self-connection), the
   * correct handler should be invoked.
   */
  t.test('registered handler is invoked for matching address', async (t) => {
    // Use a fixed port for this test to avoid port conflicts
    let port = 19100;

    await fc.assert(
      fc.asyncProperty(
        // Generate entity type and entity ID
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          data: fc.string({minLength: 0, maxLength: 50}),
        }),
        async (entityType, entityId, messagePayload) => {
          const currentPort = port++;
          const nodeId = `routing-test-${currentPort}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: currentPort,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;
            const receivedMessages = [];

            // Register handler that records received messages
            router.register(targetAddress, (envelope) => {
              receivedMessages.push({
                address: envelope.targetAddress,
                payload: envelope.payload,
              });
              return {acknowledged: true, handlerId: targetAddress};
            });

            // Deliver message via self-connection
            const result = await router.deliver(targetAddress, messagePayload);

            await router.shutdown();

            // Verify handler was invoked with correct message
            return result.acknowledged === true &&
                   result.handlerId === targetAddress &&
                   receivedMessages.length === 1 &&
                   receivedMessages[0].address === targetAddress &&
                   receivedMessages[0].payload.type === messagePayload.type &&
                   receivedMessages[0].payload.data === messagePayload.data;
          } catch (_error) {
            await router.shutdown();
            return false;
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('registered handler is invoked for matching address');
  });

  /**
   * Property: Only the exact matching handler is invoked.
   *
   * When multiple handlers are registered, only the handler for the exact
   * target address should be invoked, not handlers for similar addresses.
   */
  t.test('only exact matching handler is invoked', async (t) => {
    let port = 19200;

    await fc.assert(
      fc.asyncProperty(
        // Generate two different entity IDs
        fc.string({minLength: 1, maxLength: 15}).filter((s) => !s.includes('/')),
        fc.string({minLength: 1, maxLength: 15}).filter((s) => !s.includes('/')),
        fc.constantFrom(...VALID_ENTITY_TYPES),
        async (entityId1, entityId2, entityType) => {
          // Ensure entity IDs are different
          if (entityId1 === entityId2) {
            entityId2 = entityId2 + '-different';
          }

          const currentPort = port++;
          const nodeId = `exact-match-${currentPort}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: currentPort,
          });

          try {
            await router.initialize({startServer: true});

            const address1 = `${nodeId}/${entityType}/${entityId1}`;
            const address2 = `${nodeId}/${entityType}/${entityId2}`;

            const handler1Calls = [];
            const handler2Calls = [];

            // Register two handlers
            router.register(address1, (envelope) => {
              handler1Calls.push(envelope.targetAddress);
              return {acknowledged: true, handler: 'handler1'};
            });

            router.register(address2, (envelope) => {
              handler2Calls.push(envelope.targetAddress);
              return {acknowledged: true, handler: 'handler2'};
            });

            // Deliver to address1
            const result = await router.deliver(address1, {type: 'TEST'});

            await router.shutdown();

            // Only handler1 should be called
            return result.acknowledged === true &&
                   result.handler === 'handler1' &&
                   handler1Calls.length === 1 &&
                   handler2Calls.length === 0;
          } catch (_error) {
            await router.shutdown();
            return false;
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('only exact matching handler is invoked');
  });

  /**
   * Property: Handler response is returned in ACK.
   *
   * For any handler that returns a response object, the response fields
   * should be included in the delivery result.
   */
  t.test('handler response is returned in ACK', async (t) => {
    let port = 19300;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate response data
        fc.record({
          responseData: fc.string({minLength: 1, maxLength: 30}),
          responseCode: fc.integer({min: 0, max: 1000}),
        }),
        async (entityType, entityId, responseData) => {
          const currentPort = port++;
          const nodeId = `response-test-${currentPort}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: currentPort,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            // Register handler that returns specific response
            router.register(targetAddress, () => {
              return {
                acknowledged: true,
                data: responseData.responseData,
                code: responseData.responseCode,
              };
            });

            // Deliver message
            const result = await router.deliver(targetAddress, {type: 'TEST'});

            await router.shutdown();

            // Verify response fields are in result
            return result.acknowledged === true &&
                   result.data === responseData.responseData &&
                   result.code === responseData.responseCode;
          } catch (_error) {
            await router.shutdown();
            return false;
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('handler response is returned in ACK');
  });

  /**
   * Property: Unregistered address returns noHandler flag.
   *
   * When a message is sent to an address with no registered handler,
   * the result should indicate no handler was found.
   */
  t.test('unregistered address returns noHandler flag', async (t) => {
    let port = 19400;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        async (entityType, entityId) => {
          const currentPort = port++;
          const nodeId = `no-handler-${currentPort}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: currentPort,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            // Do NOT register any handler

            // Deliver message to unregistered address
            const result = await router.deliver(targetAddress, {type: 'TEST'});

            await router.shutdown();

            // Should be acknowledged but with noHandler flag
            return result.acknowledged === true && result.noHandler === true;
          } catch (_error) {
            await router.shutdown();
            return false;
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('unregistered address returns noHandler flag');
  });

  /**
   * Property: Handler errors are returned in ACK.
   *
   * When a handler throws an error, the error message should be returned
   * in the delivery result with acknowledged: false.
   */
  t.test('handler errors are returned in ACK', async (t) => {
    let port = 19500;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        fc.string({minLength: 1, maxLength: 50}),
        async (entityType, entityId, errorMessage) => {
          const currentPort = port++;
          const nodeId = `error-test-${currentPort}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: currentPort,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            // Register handler that throws error
            router.register(targetAddress, () => {
              throw new Error(errorMessage);
            });

            // Deliver message
            const result = await router.deliver(targetAddress, {type: 'TEST'});

            await router.shutdown();

            // Should not be acknowledged and should have error
            return result.acknowledged === false &&
                   result.error === errorMessage;
          } catch (_error) {
            await router.shutdown();
            // The deliver itself might throw if the error propagates
            return _error.message === errorMessage;
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('handler errors are returned in ACK');
  });

  /**
   * Property: Async handler results are awaited.
   *
   * When a handler returns a Promise, the result should be awaited
   * and the resolved value returned in the ACK.
   */
  t.test('async handler results are awaited', async (t) => {
    let port = 19600;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        fc.string({minLength: 1, maxLength: 30}),
        async (entityType, entityId, asyncData) => {
          const currentPort = port++;
          const nodeId = `async-test-${currentPort}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: currentPort,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            // Register async handler
            router.register(targetAddress, async () => {
              await Promise.resolve();
              return {acknowledged: true, asyncResult: asyncData};
            });

            // Deliver message
            const result = await router.deliver(targetAddress, {type: 'TEST'});

            await router.shutdown();

            // Verify async result is returned
            return result.acknowledged === true &&
                   result.asyncResult === asyncData;
          } catch (_error) {
            await router.shutdown();
            return false;
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('async handler results are awaited');
  });
});
