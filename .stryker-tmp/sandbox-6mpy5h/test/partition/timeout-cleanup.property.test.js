/**
 * Property Test: Timeout Cleanup
 * **Property 8: Timeout Cleanup**
 * **Validates: Requirements 3.4**
 *
 * *For any* pending request that times out, the request SHALL be removed from
 * the pending tracker and the promise SHALL be rejected with a timeout error.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PendingRequestTracker} from '../../src/partition/pending-request-tracker.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

test('Property 8: Timeout Cleanup', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Property: For any request with a short timeout, the promise rejects
   * with a timeout error and the request is removed from pending.
   */
  t.test('timeout removes request and rejects promise', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        fc.integer({min: 10, max: 50}), // timeoutMs (very short for testing)
        async (requestId, timeoutMs) => {
          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: timeoutMs,
          });

          try {
            // Track the request with short timeout
            const trackPromise = tracker.track(requestId, {
              type: 'CREATE_REPLICA',
              timeoutMs,
            });

            // Verify request is pending
            const isPendingBefore = tracker.hasPending(requestId);

            // Wait for timeout
            let rejectedWithTimeout = false;
            let errorMessage = '';

            try {
              await trackPromise;
            } catch (error) {
              rejectedWithTimeout = true;
              errorMessage = error.message;
            }

            // Verify request is no longer pending
            const isPendingAfter = tracker.hasPending(requestId);

            return isPendingBefore === true &&
              isPendingAfter === false &&
              rejectedWithTimeout === true &&
              errorMessage.includes('timeout') &&
              errorMessage.includes(requestId);
          } finally {
            tracker.clear();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('timeout removes request and rejects promise');
  });

  /**
   * Property: For any request, the pending count decreases after timeout.
   */
  t.test('pending count decreases after timeout', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        async (requestId) => {
          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: 20, // Very short timeout
          });

          try {
            const countBefore = tracker.getPendingCount();

            // Track the request
            const trackPromise = tracker.track(requestId, {
              type: 'CREATE_REPLICA',
              timeoutMs: 20,
            });

            const countDuring = tracker.getPendingCount();

            // Wait for timeout
            try {
              await trackPromise;
            } catch {
              // Expected timeout
            }

            const countAfter = tracker.getPendingCount();

            return countBefore === 0 &&
              countDuring === 1 &&
              countAfter === 0;
          } finally {
            tracker.clear();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('pending count decreases after timeout');
  });

  /**
   * Property: For any request, clear() rejects all pending with shutdown error.
   */
  t.test('clear rejects all pending requests', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), {minLength: 1, maxLength: 5}), // requestIds
        async (requestIds) => {
          // Ensure unique request IDs
          const uniqueIds = [...new Set(requestIds)];
          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: 30000, // Long timeout
          });

          // Track all requests
          const promises = uniqueIds.map((id) =>
            tracker.track(id, {type: 'CREATE_REPLICA'}),
          );

          const countBefore = tracker.getPendingCount();

          // Clear all
          tracker.clear();

          const countAfter = tracker.getPendingCount();

          // All promises should reject with shutdown error
          const results = await Promise.allSettled(promises);
          const allRejectedWithShutdown = results.every(
            (r) => r.status === 'rejected' && r.reason.message.includes('shutdown'),
          );

          return countBefore === uniqueIds.length &&
            countAfter === 0 &&
            allRejectedWithShutdown === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('clear rejects all pending requests');
  });

  /**
   * Property: For any request, reject() removes request and rejects promise.
   */
  t.test('reject removes request and rejects promise', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        fc.string({minLength: 1, maxLength: 100}), // errorMessage
        async (requestId, errorMessage) => {
          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: 30000,
          });

          try {
            // Track the request
            const trackPromise = tracker.track(requestId, {
              type: 'CREATE_REPLICA',
            });

            const isPendingBefore = tracker.hasPending(requestId);

            // Reject the request
            const rejected = tracker.reject(requestId, errorMessage);

            const isPendingAfter = tracker.hasPending(requestId);

            // Wait for promise to reject
            let caughtError = null;
            try {
              await trackPromise;
            } catch (error) {
              caughtError = error;
            }

            return isPendingBefore === true &&
              rejected === true &&
              isPendingAfter === false &&
              caughtError !== null &&
              caughtError.message === errorMessage;
          } finally {
            tracker.clear();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('reject removes request and rejects promise');
  });

  /**
   * Property: For any request, getPendingIds returns all tracked request IDs.
   */
  t.test('getPendingIds returns all tracked IDs', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), {minLength: 1, maxLength: 5}), // requestIds
        async (requestIds) => {
          // Ensure unique request IDs
          const uniqueIds = [...new Set(requestIds)];
          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: 30000,
          });

          try {
            // Track all requests
            const promises = uniqueIds.map((id) =>
              tracker.track(id, {type: 'CREATE_REPLICA'}),
            );

            // Get pending IDs
            const pendingIds = tracker.getPendingIds();

            // Verify all IDs are present
            const allPresent = uniqueIds.every((id) => pendingIds.includes(id));
            const sameLength = pendingIds.length === uniqueIds.length;

            // Clean up
            for (const id of uniqueIds) {
              tracker.resolve(id, {request_id: id, status: 'success'});
            }
            await Promise.all(promises);

            return allPresent && sameLength;
          } finally {
            tracker.clear();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('getPendingIds returns all tracked IDs');
  });
});
