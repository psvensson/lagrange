/**
 * Property Test: Pending Response Round-Trip
 * **Property 4: Pending response round-trip**
 * **Validates: Requirements 2.5**
 *
 * Feature: transport-architecture-improvements,
 * Property 4: Pending response round-trip
 *
 * *For any* message sent by the RouterDeliveryManager that expects
 * a handler result, registering a pending response and then
 * receiving a SERVICE_RESPONSE with the matching messageId SHALL
 * resolve the pending response promise with the result from the
 * SERVICE_RESPONSE.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RouterDeliveryManager} from
  '../../src/transport/router-delivery-manager.js';
import '../../src/constants/transport.js';

/**
 * Timeout for pending responses in tests (ms).
 * Long enough to never fire during a passing test.
 */
const TEST_TIMEOUT_MS = 5000;

/**
 * Arbitrary for a message ID string.
 */
const messageIdArb = fc.stringMatching(/^msg-[a-z0-9]{1,12}$/);

/**
 * Arbitrary for a handler result (success case).
 */
const handlerResultArb = fc.oneof(
  fc.record({
    status: fc.constantFrom('ok', 'created', 'updated'),
  }),
  fc.record({
    rows: fc.array(fc.integer(), {maxLength: 5}),
  }),
  fc.constant({acknowledged: true}),
  fc.record({count: fc.nat({max: 1000})}),
  fc.constant(null),
  fc.string({maxLength: 30}),
  fc.integer(),
);

/**
 * Arbitrary for an error message string (failure case).
 */
const errorMsgArb = fc.oneof(
  fc.constant('Table not found'),
  fc.constant('Permission denied'),
  fc.constant('Timeout exceeded'),
  fc.stringMatching(/^err-[a-z0-9]{1,20}$/),
);

/**
 * Create a minimal RouterDeliveryManager for testing pending
 * response registration and resolution.
 * @return {RouterDeliveryManager} A test manager instance.
 */
function createTestManager() {
  return new RouterDeliveryManager({
    nodeId: 'test-node',
    logger: {debug: () => {}, warn: () => {}, error: () => {}},
    nodeConnections: new Map(),
    pendingMessages: new Map(),
    messageTimeoutMs: TEST_TIMEOUT_MS,
    sendRaw: () => {},
    parseAddress: () => ({}),
    isValidAddress: () => true,
    hasTransportRegistry: () => false,
    getTransportRegistry: () => null,
    getConnectionPool: () => null,
    outboundQueue: {enqueueOutbound: () => Promise.resolve()},
  });
}

test('Property 4: Pending response round-trip', async (t) => {
  /**
   * Property: For any messageId and handler result, registering a
   * pending response and then resolving it with the matching
   * messageId SHALL resolve the promise with the correct result.
   */
  t.test('success: resolves with correct result for any messageId',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          messageIdArb,
          handlerResultArb,
          async (messageId, result) => {
            const manager = createTestManager();

            const responsePromise = manager.registerPendingResponse(
              messageId, TEST_TIMEOUT_MS,
            );

            const resolved = manager.resolvePendingResponse(
              messageId, result, undefined,
            );

            // Must find and resolve the pending response
            if (!resolved) return false;

            const actual = await responsePromise;

            // Result must match exactly
            if (JSON.stringify(actual) !==
                JSON.stringify(result)) {
              return false;
            }

            // Pending response must be cleaned up
            if (manager.pendingResponses.size !== 0) return false;

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'success: resolves with correct result for any messageId',
      );
    });

  /**
   * Property: For any messageId and error message, registering a
   * pending response and then resolving it with an error SHALL
   * reject the promise with the correct error message.
   */
  t.test('error: rejects with correct error for any messageId',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          messageIdArb,
          errorMsgArb,
          async (messageId, errorMsg) => {
            const manager = createTestManager();

            const responsePromise = manager.registerPendingResponse(
              messageId, TEST_TIMEOUT_MS,
            );

            const resolved = manager.resolvePendingResponse(
              messageId, undefined, errorMsg,
            );

            // Must find and resolve the pending response
            if (!resolved) return false;

            try {
              await responsePromise;
              // Should not resolve successfully
              return false;
            } catch (err) {
              // Error message must match
              if (err.message !== errorMsg) return false;
            }

            // Pending response must be cleaned up
            if (manager.pendingResponses.size !== 0) return false;

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'error: rejects with correct error for any messageId',
      );
    });

  /**
   * Property: For any two distinct messageIds, resolving a pending
   * response with a non-matching messageId SHALL NOT resolve the
   * original pending response. The original remains pending.
   */
  t.test('non-matching messageId does not resolve pending response',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          messageIdArb,
          messageIdArb,
          handlerResultArb,
          async (messageIdA, messageIdB, result) => {
            // Ensure the two messageIds are distinct
            fc.pre(messageIdA !== messageIdB);

            const manager = createTestManager();

            // Capture the promise so we can handle its rejection
            // during cleanup without triggering unhandled rejection.
            const pendingPromise = manager.registerPendingResponse(
              messageIdA, TEST_TIMEOUT_MS,
            ).catch(() => {
              // Expected: clearPendingResponses rejects this.
            });

            const resolved = manager.resolvePendingResponse(
              messageIdB, result, undefined,
            );

            // Must NOT find a pending response for the wrong ID
            if (resolved) return false;

            // Original pending response must still be in the map
            if (manager.pendingResponses.size !== 1) return false;
            if (!manager.pendingResponses.has(messageIdA)) {
              return false;
            }

            // Clean up to avoid timeout leaks
            manager.clearPendingResponses('test cleanup');
            await pendingPromise;

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'non-matching messageId does not resolve pending response',
      );
    });

  /**
   * Property: For any messageId and result, after resolving a
   * pending response, calling resolvePendingResponse again with
   * the same messageId SHALL return false (idempotent cleanup).
   */
  t.test('double resolve returns false for any messageId',
    async (t) => {
      await fc.assert(
        fc.asyncProperty(
          messageIdArb,
          handlerResultArb,
          async (messageId, result) => {
            const manager = createTestManager();

            const responsePromise = manager.registerPendingResponse(
              messageId, TEST_TIMEOUT_MS,
            );

            // First resolve succeeds
            const first = manager.resolvePendingResponse(
              messageId, result, undefined,
            );
            if (!first) return false;

            await responsePromise;

            // Second resolve returns false — already cleaned up
            const second = manager.resolvePendingResponse(
              messageId, result, undefined,
            );
            if (second) return false;

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('double resolve returns false for any messageId');
    });
});
