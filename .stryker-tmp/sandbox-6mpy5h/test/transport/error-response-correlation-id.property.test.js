/**
 * Property Test: Error Response Correlation ID
 * **Property 11: Error Response Correlation ID**
 * **Validates: Requirements 8.5**
 *
 * Feature: code-clarity-maintainability, Property 11: Error Response Correlation ID
 *
 * *For any* failed operation that returns an error response, the response SHALL
 * include the correlationId from the original request.
 *
 * This property test verifies:
 * 1. Error responses from MessageRouter include the correlationId
 * 2. When original message has correlationId, it is preserved in error response
 * 3. When original message has no correlationId, a new one is generated and included
 */
// @ts-nocheck


console.log('Loading test file');
import {test} from '../../src/test-helpers/tap.js';
console.log('Imported tap');
import fc from 'fast-check';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests (module level)
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const loggingService = LoggingService.getInstance();
loggingService.initialize({level: 'error'});

/**
 * UUID format regex for validation (accepts any UUID version).
 * Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generator for valid UUID correlation IDs.
 */
const validCorrelationIdArb = fc.uuid();

/**
 * Generator for arbitrary message payloads.
 */
const messagePayloadArb = fc.record({
  type: fc.string({minLength: 1, maxLength: 50}),
  data: fc.anything(),
});

/**
 * Generator for message payloads with correlationId.
 */
const messageWithCorrelationIdArb = fc.record({
  type: fc.string({minLength: 1, maxLength: 50}),
  data: fc.anything(),
  correlationId: validCorrelationIdArb,
});

/**
 * Generator for valid node IDs (UUID format).
 */
const nodeIdArb = fc.uuid();

/**
 * Helper function to create a router and deliver a message, returning the result.
 * @param {string} nodeId - The node ID for the router.
 * @param {string} targetAddress - The target address for delivery.
 * @param {Object} payload - The message payload.
 * @return {Promise<Object>} The delivery result.
 */
async function deliverWithRouter(nodeId, targetAddress, payload) {
  const router = new MessageRouter({
    nodeId,
    wsPort: null,
  });
  router.initialized = true;
  return router.deliver(targetAddress, payload);
}

test('Property 11: Error Response Correlation ID', async (t) => {
  /**
   * Property: For any failed delivery to self without self-connection,
   * the error response SHALL include a correlationId that is a valid UUID.
   *
   * Validates: Requirement 8.5 - THE correlationId SHALL be returned in
   * error responses for failed operations.
   */
  t.test('error responses include correlationId for self-delivery without connection',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          messagePayloadArb,
          async (nodeId, payload) => {
            const targetAddress = `${nodeId}/service/test-service`;
            const result = await deliverWithRouter(nodeId, targetAddress, payload);

            // Error response must include correlationId
            if (!result.correlationId) {
              return false;
            }

            // correlationId must be a valid UUID
            if (!UUID_REGEX.test(result.correlationId)) {
              return false;
            }

            // Response should indicate failure
            return result.acknowledged === false;
          },
        ),
        {numRuns: 10},
      );

      t.pass('error responses include correlationId for self-delivery without connection');
    });

  /**
   * Property: For any failed delivery with provided correlationId to self
   * without self-connection, the error response SHALL preserve the correlationId.
   *
   * Validates: Requirement 8.5 - THE correlationId SHALL be returned in
   * error responses for failed operations.
   */
  t.test('error responses preserve correlationId for self-delivery failures', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        messageWithCorrelationIdArb,
        async (nodeId, payload) => {
          const originalCorrelationId = payload.correlationId;
          const targetAddress = `${nodeId}/service/test-service`;
          const result = await deliverWithRouter(nodeId, targetAddress, payload);

          // Error response must preserve the original correlationId
          if (result.correlationId !== originalCorrelationId) {
            return false;
          }

          // Response should indicate failure
          return result.acknowledged === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('error responses preserve correlationId for self-delivery failures');
  });

  /**
   * Property: For any failed delivery due to no connection to target node,
   * the error response SHALL include a correlationId.
   *
   * Validates: Requirement 8.5 - THE correlationId SHALL be returned in
   * error responses for failed operations.
   */
  t.test('error responses include correlationId for no connection errors', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        nodeIdArb,
        messagePayloadArb,
        async (localNodeId, targetNodeId, payload) => {
          // Ensure target is different from local to avoid self-connection path
          if (targetNodeId === localNodeId) {
            return true; // Skip this case, tested separately
          }

          const targetAddress = `${targetNodeId}/service/test-service`;
          const result = await deliverWithRouter(localNodeId, targetAddress, payload);

          // Error response must include correlationId
          if (!result.correlationId) {
            return false;
          }

          // correlationId must be a valid UUID
          if (!UUID_REGEX.test(result.correlationId)) {
            return false;
          }

          // Response should indicate failure
          return result.acknowledged === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('error responses include correlationId for no connection errors');
  });

  /**
   * Property: For any failed delivery with provided correlationId to remote node
   * without connection, the error response SHALL preserve the correlationId.
   *
   * Validates: Requirement 8.5 - THE correlationId SHALL be returned in
   * error responses for failed operations.
   */
  t.test('error responses preserve correlationId for remote delivery failures', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        nodeIdArb,
        messageWithCorrelationIdArb,
        async (localNodeId, targetNodeId, payload) => {
          // Ensure target is different from local to avoid self-connection path
          if (targetNodeId === localNodeId) {
            return true; // Skip this case, tested separately
          }

          const originalCorrelationId = payload.correlationId;
          const targetAddress = `${targetNodeId}/service/test-service`;
          const result = await deliverWithRouter(localNodeId, targetAddress, payload);

          // Error response must preserve the original correlationId
          if (result.correlationId !== originalCorrelationId) {
            return false;
          }

          // Response should indicate failure
          return result.acknowledged === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('error responses preserve correlationId for remote delivery failures');
  });

  /**
   * Property: For any error response from deliver(), the correlationId field
   * SHALL always be present and be a valid UUID.
   *
   * Validates: Requirement 8.5 - THE correlationId SHALL be returned in
   * error responses for failed operations.
   */
  t.test('correlationId is always present in error responses', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        fc.oneof(messagePayloadArb, messageWithCorrelationIdArb),
        async (nodeId, payload) => {
          const targetAddress = `${nodeId}/service/test-service`;
          const result = await deliverWithRouter(nodeId, targetAddress, payload);

          // correlationId must be present
          if (!result.correlationId) {
            return false;
          }

          // correlationId must be a valid UUID
          if (!UUID_REGEX.test(result.correlationId)) {
            return false;
          }

          // If original had correlationId, it should be preserved
          if (payload.correlationId) {
            return result.correlationId === payload.correlationId;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('correlationId is always present in error responses');
  });

  /**
   * Property: For any error response, the correlationId SHALL be consistent
   * whether the message originally had one or not.
   *
   * Validates: Requirement 8.5 - THE correlationId SHALL be returned in
   * error responses for failed operations.
   */
  t.test('correlationId consistency in error responses', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        messagePayloadArb,
        validCorrelationIdArb,
        async (nodeId, payload, providedCorrelationId) => {
          const targetAddress = `${nodeId}/service/test-service`;

          // Test without correlationId
          const resultWithout = await deliverWithRouter(nodeId, targetAddress, payload);

          // Test with correlationId
          const payloadWithId = {...payload, correlationId: providedCorrelationId};
          const resultWith = await deliverWithRouter(nodeId, targetAddress, payloadWithId);

          // Both must have correlationId
          if (!resultWithout.correlationId || !resultWith.correlationId) {
            return false;
          }

          // Result with provided correlationId must preserve it
          if (resultWith.correlationId !== providedCorrelationId) {
            return false;
          }

          // Result without correlationId must have a valid UUID
          return UUID_REGEX.test(resultWithout.correlationId);
        },
      ),
      {numRuns: 10},
    );

    t.pass('correlationId consistency in error responses');
  });
});
