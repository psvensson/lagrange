/**
 * Property-based test for Retry with Exponential Backoff.
 * Property 24: For any failed message delivery, the system should retry
 * with exponential backoff up to the configured maximum retries,
 * trying alternative replicas when available.
 * Validates: Requirements 17.1, 17.2
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {
  MessageRetryHandler,
  RetryStatus,
} from '../../src/message-group/message-retry-handler.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

let retryHandler;

beforeEach(async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(async () => {
  if (retryHandler) {
    retryHandler = null;
  }
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Feature: message-retry, Property 24: Retry with Exponential Backoff
 * For any retry configuration, delays should follow exponential backoff pattern.
 * Validates: Requirements 17.1, 17.2
 */
test('Property 24: Exponential backoff delays increase exponentially', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate retry configuration - use noNaN to avoid NaN values
      fc.record({
        initialDelayMs: fc.integer({min: 10, max: 100}),
        maxDelayMs: fc.integer({min: 500, max: 2000}),
        backoffMultiplier: fc.double({min: 1.5, max: 3.0, noNaN: true}),
      }),
      async (config) => {
        retryHandler = new MessageRetryHandler({
          maxRetries: 5,
          initialDelayMs: config.initialDelayMs,
          maxDelayMs: config.maxDelayMs,
          backoffMultiplier: config.backoffMultiplier,
          jitterFactor: 0, // No jitter for deterministic testing
        });

        // Calculate delays for multiple attempts
        const delays = [];
        for (let i = 0; i <= 5; i++) {
          delays.push(retryHandler.calculateDelay(i));
        }

        // Property: First attempt (0) should have no delay
        t.equal(delays[0], 0, 'First attempt should have no delay');

        // Property: Subsequent delays should increase (until max)
        for (let i = 2; i < delays.length; i++) {
          const prevDelay = delays[i - 1];
          const currDelay = delays[i];

          // Either delay increases or is capped at maxDelayMs
          t.ok(
            currDelay >= prevDelay || currDelay === config.maxDelayMs,
            `Delay should increase or be capped: ${prevDelay} -> ${currDelay}`,
          );
        }

        // Property: No delay should exceed maxDelayMs
        for (const delay of delays) {
          t.ok(
            delay <= config.maxDelayMs,
            `Delay ${delay} should not exceed max ${config.maxDelayMs}`,
          );
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 24: Retry with Exponential Backoff
 * Jitter should add randomness within configured bounds.
 * Validates: Requirements 17.1, 17.4
 */
test('Property 24: Jitter adds bounded randomness to delays', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate jitter factor
      fc.double({min: 0.05, max: 0.5}),
      async (jitterFactor) => {
        retryHandler = new MessageRetryHandler({
          maxRetries: 3,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor,
        });

        // Calculate multiple delays for the same attempt to observe jitter
        const attempt = 2;
        const baseDelay = 100 * Math.pow(2, attempt - 1); // 200ms
        const delays = [];

        for (let i = 0; i < 10; i++) {
          delays.push(retryHandler.calculateDelay(attempt));
        }

        // Property: All delays should be within jitter bounds
        const minExpected = baseDelay * (1 - jitterFactor);
        const maxExpected = baseDelay * (1 + jitterFactor);

        for (const delay of delays) {
          t.ok(
            delay >= minExpected - 1 && delay <= maxExpected + 1,
            `Delay ${delay} should be within jitter bounds [${minExpected}, ${maxExpected}]`,
          );
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 24: Retry with Exponential Backoff
 * Successful delivery on first attempt should not trigger retries.
 * Validates: Requirements 17.1
 */
test('Property 24: Successful first attempt has no retries', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate message payload
      fc.record({
        type: fc.constantFrom('RAFT', 'CDC', 'QUERY'),
        data: fc.string({minLength: 1, maxLength: 50}),
      }),
      fc.string({minLength: 5, maxLength: 30}),
      async (payload, targetAddress) => {
        retryHandler = new MessageRetryHandler({
          maxRetries: 3,
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0.1,
        });

        let callCount = 0;
        const deliveryFn = async () => {
          callCount++;
          return {acknowledged: true};
        };

        const result = await retryHandler.executeWithRetry(deliveryFn, {
          targetAddress,
          messageId: 'msg-1',
          message: payload,
        });

        // Property: Should succeed on first attempt
        t.equal(result.status, RetryStatus.SUCCESS, 'Should succeed');
        t.equal(callCount, 1, 'Should only call delivery once');
        t.equal(result.attempt, 0, 'Should be attempt 0');

        // Property: Stats should reflect single successful delivery
        const stats = retryHandler.getStats();
        t.equal(stats.retriesPerformed, 0, 'No retries should be performed');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 24: Retry with Exponential Backoff
 * Failed attempts should trigger retries up to max.
 * Validates: Requirements 17.1, 17.2
 */
test('Property 24: Failed attempts trigger retries with backoff', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate max retries
      fc.integer({min: 1, max: 4}),
      // Generate number of failures before success
      fc.integer({min: 1, max: 3}),
      async (maxRetries, failuresBeforeSuccess) => {
        // Ensure we can succeed within max retries
        const actualFailures = Math.min(failuresBeforeSuccess, maxRetries);

        retryHandler = new MessageRetryHandler({
          maxRetries,
          initialDelayMs: 1, // Fast for testing
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0,
        });

        let callCount = 0;
        const deliveryFn = async () => {
          callCount++;
          if (callCount <= actualFailures) {
            throw new Error('Simulated failure');
          }
          return {acknowledged: true};
        };

        const result = await retryHandler.executeWithRetry(deliveryFn, {
          targetAddress: 'test-target',
          messageId: 'msg-retry',
          message: {data: 'test'},
        });

        // Property: Should succeed after retries
        t.equal(result.status, RetryStatus.SUCCESS, 'Should eventually succeed');
        t.equal(callCount, actualFailures + 1, 'Should retry correct number of times');

        // Property: Attempt history should record all attempts
        t.equal(
          result.attemptHistory.length,
          actualFailures + 1,
          'Should have correct attempt history length',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 24: Retry with Exponential Backoff
 * Alternative replicas should be tried on failure.
 * Validates: Requirements 17.2
 */
test('Property 24: Alternative replicas are tried on failure', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate alternative replicas
      fc.array(
        fc.string({minLength: 5, maxLength: 20}),
        {minLength: 1, maxLength: 3},
      ),
      async (alternatives) => {
        const targetsCalled = [];

        retryHandler = new MessageRetryHandler({
          maxRetries: alternatives.length + 1,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0,
          getAlternativeReplicas: async () => alternatives,
        });

        let callCount = 0;
        const deliveryFn = async (target) => {
          callCount++;
          targetsCalled.push(target);
          // Fail until we've tried all alternatives
          if (callCount <= alternatives.length) {
            throw new Error('Simulated failure');
          }
          return {acknowledged: true};
        };

        await retryHandler.executeWithRetry(deliveryFn, {
          targetAddress: 'primary-target',
          messageId: 'msg-alt',
          message: {data: 'test'},
        });

        // Property: Should try primary first
        t.equal(targetsCalled[0], 'primary-target', 'Should try primary first');

        // Property: Should try alternatives on failure
        for (let i = 0; i < Math.min(alternatives.length, callCount - 1); i++) {
          t.ok(
            targetsCalled.includes(alternatives[i]) ||
            targetsCalled[i + 1] === alternatives[i],
            `Should try alternative ${alternatives[i]}`,
          );
        }

        // Property: Stats should track alternative usage
        const stats = retryHandler.getStats();
        t.ok(
          stats.alternativeReplicasUsed > 0,
          'Should track alternative replica usage',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 24: Retry with Exponential Backoff
 * Attempt history should accurately record all attempts.
 * Validates: Requirements 17.1, 17.2
 */
test('Property 24: Attempt history is accurate', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate number of failures
      fc.integer({min: 0, max: 3}),
      async (numFailures) => {
        retryHandler = new MessageRetryHandler({
          maxRetries: 5,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0,
        });

        let callCount = 0;
        const deliveryFn = async (_target) => {
          callCount++;
          if (callCount <= numFailures) {
            throw new Error(`Failure ${callCount}`);
          }
          return {acknowledged: true};
        };

        const result = await retryHandler.executeWithRetry(deliveryFn, {
          targetAddress: 'test-target',
          messageId: 'msg-history',
          message: {data: 'test'},
        });

        // Property: History length matches total attempts
        t.equal(
          result.attemptHistory.length,
          numFailures + 1,
          'History should have correct length',
        );

        // Property: Each attempt has required fields
        for (let i = 0; i < result.attemptHistory.length; i++) {
          const attempt = result.attemptHistory[i];
          t.ok(attempt.attempt === i, `Attempt ${i} should have correct index`);
          t.ok(attempt.target, `Attempt ${i} should have target`);
          t.ok(attempt.timestamp, `Attempt ${i} should have timestamp`);
          t.ok(attempt.status, `Attempt ${i} should have status`);
        }

        // Property: Last attempt should be success
        const lastAttempt = result.attemptHistory[result.attemptHistory.length - 1];
        t.equal(lastAttempt.status, 'success', 'Last attempt should be success');

        return true;
      },
    ),
    {numRuns: 10},
  );
});
