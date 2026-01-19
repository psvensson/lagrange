/**
 * Property-based test for Maximum Retry Limiting.
 * Property 25: When the maximum retry count is exceeded, the system
 * should return an error to the caller with diagnostic information.
 * Validates: Requirements 17.3
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
 * Feature: message-retry, Property 25: Maximum Retry Limiting
 * For any max retry configuration, system should stop after max+1 attempts.
 * Validates: Requirements 17.3
 */
test('Property 25: System stops after max retries exceeded', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate max retries (1-5)
      fc.integer({min: 1, max: 5}),
      async (maxRetries) => {
        retryHandler = new MessageRetryHandler({
          maxRetries,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0,
        });

        let callCount = 0;
        const alwaysFailFn = async () => {
          callCount++;
          throw new Error('Permanent failure');
        };

        const result = await retryHandler.executeWithRetry(alwaysFailFn, {
          targetAddress: 'test-target',
          messageId: 'msg-max-retry',
          message: {data: 'test'},
        });

        // Property: Should return MAX_RETRIES_EXCEEDED status
        t.equal(
          result.status,
          RetryStatus.MAX_RETRIES_EXCEEDED,
          'Should return MAX_RETRIES_EXCEEDED',
        );

        // Property: Should have made exactly maxRetries + 1 attempts
        // (initial attempt + maxRetries retries)
        t.equal(
          callCount,
          maxRetries + 1,
          `Should make exactly ${maxRetries + 1} attempts`,
        );

        // Property: Attempt history should match call count
        t.equal(
          result.diagnostics.attemptHistory.length,
          maxRetries + 1,
          'Attempt history should match call count',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 25: Maximum Retry Limiting
 * Error response should include diagnostic information.
 * Validates: Requirements 17.3
 */
test('Property 25: Error includes diagnostic information', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate target address
      fc.string({minLength: 5, maxLength: 30}),
      // Generate message ID
      fc.uuid(),
      // Generate error message
      fc.string({minLength: 5, maxLength: 50}),
      async (targetAddress, messageId, errorMessage) => {
        retryHandler = new MessageRetryHandler({
          maxRetries: 2,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0,
        });

        const alwaysFailFn = async () => {
          throw new Error(errorMessage);
        };

        const result = await retryHandler.executeWithRetry(alwaysFailFn, {
          targetAddress,
          messageId,
          message: {data: 'test'},
        });

        // Property: Should have diagnostics object
        t.ok(result.diagnostics, 'Should have diagnostics');

        // Property: Diagnostics should include original target
        t.equal(
          result.diagnostics.originalTarget,
          targetAddress,
          'Diagnostics should include original target',
        );

        // Property: Diagnostics should include message ID
        t.equal(
          result.diagnostics.messageId,
          messageId,
          'Diagnostics should include message ID',
        );

        // Property: Diagnostics should include last error
        t.ok(
          result.diagnostics.lastError.includes(errorMessage),
          'Diagnostics should include last error message',
        );

        // Property: Diagnostics should include total attempts
        t.equal(
          result.diagnostics.totalAttempts,
          3,
          'Diagnostics should include total attempts',
        );

        // Property: Diagnostics should include attempt history
        t.ok(
          Array.isArray(result.diagnostics.attemptHistory),
          'Diagnostics should include attempt history',
        );

        // Property: Diagnostics should include tried targets
        t.ok(
          Array.isArray(result.diagnostics.triedTargets),
          'Diagnostics should include tried targets',
        );
        t.ok(
          result.diagnostics.triedTargets.includes(targetAddress),
          'Tried targets should include original target',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 25: Maximum Retry Limiting
 * All tried targets should be recorded in diagnostics.
 * Validates: Requirements 17.3
 */
test('Property 25: All tried targets recorded in diagnostics', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate alternative replicas
      fc.array(
        fc.string({minLength: 5, maxLength: 20}),
        {minLength: 2, maxLength: 4},
      ),
      async (alternatives) => {
        retryHandler = new MessageRetryHandler({
          maxRetries: alternatives.length,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0,
          getAlternativeReplicas: async () => alternatives,
        });

        const alwaysFailFn = async () => {
          throw new Error('Failure');
        };

        const result = await retryHandler.executeWithRetry(alwaysFailFn, {
          targetAddress: 'primary-target',
          messageId: 'msg-targets',
          message: {data: 'test'},
        });

        // Property: Should include primary target
        t.ok(
          result.diagnostics.triedTargets.includes('primary-target'),
          'Should include primary target',
        );

        // Property: Should include alternative targets that were tried
        const triedAlternatives = alternatives.filter((alt) =>
          result.diagnostics.triedTargets.includes(alt),
        );
        t.ok(
          triedAlternatives.length > 0,
          'Should have tried at least one alternative',
        );

        // Property: Tried targets should be unique
        const uniqueTargets = new Set(result.diagnostics.triedTargets);
        t.equal(
          uniqueTargets.size,
          result.diagnostics.triedTargets.length,
          'Tried targets should be unique',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 25: Maximum Retry Limiting
 * Error message should be descriptive.
 * Validates: Requirements 17.3
 */
test('Property 25: Error message is descriptive', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate max retries
      fc.integer({min: 1, max: 4}),
      async (maxRetries) => {
        retryHandler = new MessageRetryHandler({
          maxRetries,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0,
        });

        const alwaysFailFn = async () => {
          throw new Error('Connection refused');
        };

        const result = await retryHandler.executeWithRetry(alwaysFailFn, {
          targetAddress: 'test-target',
          messageId: 'msg-error',
          message: {data: 'test'},
        });

        // Property: Error should mention number of attempts
        t.ok(
          result.error.includes(`${maxRetries + 1}`),
          `Error should mention ${maxRetries + 1} attempts`,
        );

        // Property: Error should include original error message
        t.ok(
          result.error.includes('Connection refused'),
          'Error should include original error message',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 25: Maximum Retry Limiting
 * Statistics should accurately track failed deliveries.
 * Validates: Requirements 17.3
 */
test('Property 25: Statistics track failed deliveries', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate number of failed delivery attempts
      fc.integer({min: 1, max: 3}),
      async (numFailedDeliveries) => {
        retryHandler = new MessageRetryHandler({
          maxRetries: 2,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0,
        });

        // Perform multiple failed deliveries
        for (let i = 0; i < numFailedDeliveries; i++) {
          const alwaysFailFn = async () => {
            throw new Error('Failure');
          };

          await retryHandler.executeWithRetry(alwaysFailFn, {
            targetAddress: `target-${i}`,
            messageId: `msg-${i}`,
            message: {data: 'test'},
          });
        }

        const stats = retryHandler.getStats();

        // Property: Failed deliveries should match
        t.equal(
          stats.failedDeliveries,
          numFailedDeliveries,
          'Failed deliveries should match',
        );

        // Property: Total attempts should be (maxRetries + 1) * numFailedDeliveries
        t.equal(
          stats.totalAttempts,
          3 * numFailedDeliveries,
          'Total attempts should match',
        );

        // Property: Retries performed should be maxRetries * numFailedDeliveries
        t.equal(
          stats.retriesPerformed,
          2 * numFailedDeliveries,
          'Retries performed should match',
        );

        // Property: Success rate should be 0
        t.equal(stats.successRate, 0, 'Success rate should be 0');

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-retry, Property 25: Maximum Retry Limiting
 * maxRetriesExceeded event should be emitted.
 * Validates: Requirements 17.3
 */
test('Property 25: maxRetriesExceeded event is emitted', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 3}),
      async (maxRetries) => {
        retryHandler = new MessageRetryHandler({
          maxRetries,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
          jitterFactor: 0,
        });

        let eventEmitted = false;
        let eventData = null;

        retryHandler.on('maxRetriesExceeded', (data) => {
          eventEmitted = true;
          eventData = data;
        });

        const alwaysFailFn = async () => {
          throw new Error('Failure');
        };

        await retryHandler.executeWithRetry(alwaysFailFn, {
          targetAddress: 'test-target',
          messageId: 'msg-event',
          message: {data: 'test'},
        });

        // Property: Event should be emitted
        t.ok(eventEmitted, 'maxRetriesExceeded event should be emitted');

        // Property: Event data should include diagnostics
        t.ok(eventData.messageId, 'Event should include messageId');
        t.ok(eventData.originalTarget, 'Event should include originalTarget');
        t.ok(eventData.attemptHistory, 'Event should include attemptHistory');

        return true;
      },
    ),
    {numRuns: 10},
  );
});
