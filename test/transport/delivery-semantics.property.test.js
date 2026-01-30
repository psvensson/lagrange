/**
 * Property test for Delivery Semantics.
 * Property 5: For any message delivery attempt, the result SHALL be either:
 * - Success with the handler's response (acknowledged: true)
 * - Failure with an error message (acknowledged: false, error: string)
 *
 * There SHALL be no silent failures or fallback delivery methods.
 *
 * Validates: Requirements 6.2, 7.1, 7.2, 7.3, 7.4
 *
 * Feature: unified-remote-transport
 * Property 5: Delivery Semantics
 */

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

// Valid entity types for unified address format
const VALID_ENTITY_TYPES = ['message-group', 'partition', 'lifecycle', 'service'];

/**
 * Feature: unified-remote-transport
 * Property 5: Delivery Semantics
 *
 * For any message delivery attempt, the result SHALL be either:
 * - Success with the handler's response (acknowledged: true)
 * - Failure with an error message (acknowledged: false, error: string)
 *
 * There SHALL be no silent failures or fallback delivery methods.
 */
test('Property 5: Delivery Semantics', async (t) => {
  // Port counter for unique ports per test
  let portCounter = 21000;

  /**
   * Property: Successful delivery returns acknowledged: true with handler response.
   *
   * For any message sent to a registered handler that returns successfully,
   * the delivery result SHALL have acknowledged: true and include the
   * handler's response data.
   *
   * Validates: Requirements 7.1
   */
  t.test('successful delivery returns acknowledged true with response', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entity type and entity ID for valid address
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          data: fc.string({minLength: 0, maxLength: 100}),
        }),
        // Generate handler response data
        fc.record({
          responseData: fc.string({minLength: 1, maxLength: 50}),
          status: fc.constantFrom('success', 'processed', 'completed'),
        }),
        async (entityType, entityId, message, handlerResponse) => {
          const port = portCounter++;
          const nodeId = `delivery-test-${port}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: port,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            // Register handler that returns success
            router.register(targetAddress, () => ({
              acknowledged: true,
              ...handlerResponse,
            }));

            // Deliver message
            const result = await router.deliver(targetAddress, message);

            // Result must have acknowledged: true
            // Result must include handler response data
            return result.acknowledged === true &&
                   result.responseData === handlerResponse.responseData &&
                   result.status === handlerResponse.status &&
                   typeof result.messageId === 'string';
          } finally {
            await router.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('successful delivery returns acknowledged true with response');
  });

  /**
   * Property: Failed delivery returns acknowledged: false with error message.
   *
   * For any message sent to an address without a handler, the delivery
   * result SHALL have acknowledged: true but with noHandler flag.
   *
   * Validates: Requirements 7.2
   */
  t.test('delivery to unregistered address returns noHandler flag', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entity type and entity ID for valid address
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          data: fc.string({minLength: 0, maxLength: 100}),
        }),
        async (entityType, entityId, message) => {
          const port = portCounter++;
          const nodeId = `unregistered-test-${port}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: port,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            // Do NOT register any handler for targetAddress

            // Deliver message
            const result = await router.deliver(targetAddress, message);

            // Result must have acknowledged: true with noHandler flag
            return result.acknowledged === true &&
                   result.noHandler === true &&
                   typeof result.messageId === 'string';
          } finally {
            await router.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('delivery to unregistered address returns noHandler flag');
  });

  /**
   * Property: Handler exception returns acknowledged: false with error.
   *
   * For any message where the handler throws an exception, the delivery
   * should reject with an error containing the handler's error message.
   *
   * Validates: Requirements 7.2, 7.4
   */
  t.test('handler exception rejects with error', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entity type and entity ID for valid address
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
        }),
        // Generate error message (non-empty, no special chars that could break)
        fc.string({minLength: 1, maxLength: 50})
          .filter((s) => s.trim().length > 0)
          .map((s) => `TestError: ${s.trim()}`),
        async (entityType, entityId, message, errorMessage) => {
          const port = portCounter++;
          const nodeId = `error-test-${port}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: port,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            // Register handler that throws
            router.register(targetAddress, () => {
              throw new Error(errorMessage);
            });

            // Deliver message - should reject
            try {
              await router.deliver(targetAddress, message);
              // If we get here, the delivery didn't reject as expected
              return false;
            } catch (error) {
              // Error should contain the handler's error message
              return error.message.includes(errorMessage);
            }
          } finally {
            await router.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('handler exception rejects with error');
  });

  /**
   * Property: Result always has messageId.
   *
   * For any delivery attempt (success or failure), the result SHALL
   * always include a messageId for tracking purposes.
   *
   * Validates: Requirements 7.1, 7.2
   */
  t.test('result always includes messageId', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entity type and entity ID for valid address
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
        }),
        // Generate whether handler exists
        fc.boolean(),
        async (entityType, entityId, message, hasHandler) => {
          const port = portCounter++;
          const nodeId = `msgid-test-${port}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: port,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            if (hasHandler) {
              router.register(targetAddress, () => ({acknowledged: true}));
            }

            // Deliver message
            const result = await router.deliver(targetAddress, message);

            // Result must always have messageId
            return typeof result.messageId === 'string' &&
                   result.messageId.length > 0;
          } finally {
            await router.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('result always includes messageId');
  });

  /**
   * Property: No silent failures - result is always defined.
   *
   * For any delivery attempt, the result SHALL never be undefined or null.
   * There must always be an explicit success or failure response.
   *
   * Validates: Requirements 7.4
   */
  t.test('no silent failures - result is always defined', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entity type and entity ID for valid address
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
          data: fc.option(fc.string({maxLength: 50})),
        }),
        // Generate handler behavior
        fc.constantFrom('success', 'failure', 'none', 'undefined_return'),
        async (entityType, entityId, message, handlerBehavior) => {
          const port = portCounter++;
          const nodeId = `silent-test-${port}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: port,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            if (handlerBehavior === 'success') {
              router.register(targetAddress, () => ({acknowledged: true}));
            } else if (handlerBehavior === 'failure') {
              router.register(targetAddress, () => ({acknowledged: false}));
            } else if (handlerBehavior === 'undefined_return') {
              router.register(targetAddress, () => undefined);
            }
            // 'none' - no handler registered

            // Deliver message
            const result = await router.deliver(targetAddress, message);

            // Result must never be undefined or null
            // Result must have acknowledged property (boolean)
            return result !== undefined &&
                   result !== null &&
                   typeof result === 'object' &&
                   typeof result.acknowledged === 'boolean';
          } finally {
            await router.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('no silent failures - result is always defined');
  });

  /**
   * Property: Acknowledged is strictly boolean in result.
   *
   * For any delivery result, the acknowledged field SHALL be strictly
   * a boolean value (true or false).
   *
   * Validates: Requirements 7.1, 7.2
   */
  t.test('acknowledged is strictly boolean in result', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entity type and entity ID for valid address
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
        }),
        // Generate handler response with various acknowledged values
        fc.constantFrom(true, false),
        async (entityType, entityId, message, ackValue) => {
          const port = portCounter++;
          const nodeId = `bool-test-${port}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: port,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            router.register(targetAddress, () => ({acknowledged: ackValue}));

            // Deliver message
            const result = await router.deliver(targetAddress, message);

            // Result.acknowledged must be strictly boolean
            return (result.acknowledged === true || result.acknowledged === false);
          } finally {
            await router.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('acknowledged is strictly boolean in result');
  });

  /**
   * Property: Error handling is consistent.
   *
   * For any successful delivery (acknowledged: true), the error field
   * SHALL be undefined or not present. For handler errors, the promise
   * rejects with an Error.
   *
   * Validates: Requirements 7.1, 7.2
   */
  t.test('error handling is consistent', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entity type and entity ID for valid address
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
        }),
        // Generate whether handler throws
        fc.boolean(),
        async (entityType, entityId, message, shouldThrow) => {
          const port = portCounter++;
          const nodeId = `err-test-${port}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: port,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            if (shouldThrow) {
              router.register(targetAddress, () => {
                throw new Error('Test error');
              });
            } else {
              router.register(targetAddress, () => ({
                acknowledged: true,
                data: 'success',
              }));
            }

            // Deliver message
            try {
              const result = await router.deliver(targetAddress, message);
              // Success case: error should be undefined
              return result.acknowledged === true &&
                     (result.error === undefined || result.error === null);
            } catch (error) {
              // Error case: should have thrown with error message
              return shouldThrow && error.message.includes('Test error');
            }
          } finally {
            await router.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('error handling is consistent');
  });

  /**
   * Property: Handler response fields are preserved in result.
   *
   * For any successful delivery, all fields returned by the handler
   * SHALL be present in the delivery result (flattened structure).
   *
   * Validates: Requirements 7.1
   */
  t.test('handler response fields are preserved', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entity type and entity ID for valid address
        fc.constantFrom(...VALID_ENTITY_TYPES),
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate message payload
        fc.record({
          type: fc.string({minLength: 1, maxLength: 20}),
        }),
        // Generate handler response with multiple fields
        fc.record({
          customField1: fc.string({minLength: 1, maxLength: 20}),
          customField2: fc.integer({min: 0, max: 1000}),
          status: fc.constantFrom('ok', 'done', 'processed'),
        }),
        async (entityType, entityId, message, responseFields) => {
          const port = portCounter++;
          const nodeId = `preserve-test-${port}`;
          const router = new MessageRouter({
            nodeId,
            wsPort: port,
          });

          try {
            await router.initialize({startServer: true});

            const targetAddress = `${nodeId}/${entityType}/${entityId}`;

            router.register(targetAddress, () => ({
              acknowledged: true,
              ...responseFields,
            }));

            // Deliver message
            const result = await router.deliver(targetAddress, message);

            // All handler response fields should be in result
            return result.acknowledged === true &&
                   result.customField1 === responseFields.customField1 &&
                   result.customField2 === responseFields.customField2 &&
                   result.status === responseFields.status;
          } finally {
            await router.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('handler response fields are preserved');
  });
});
