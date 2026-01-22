/**
 * Property Test: Pending Request Tracking Round-Trip
 * **Property 7: Pending Request Tracking Round-Trip**
 * **Validates: Requirements 3.2, 3.3**
 *
 * *For any* lifecycle message sent via deliverWithAck, if an ACK with matching
 * request_id is received (either in response or via event), the promise SHALL
 * resolve with that ACK.
 */

import {test} from 'tap';
import fc from 'fast-check';
import {PendingRequestTracker} from '../../src/partition/pending-request-tracker.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

test('Property 7: Pending Request Tracking Round-Trip', async (t) => {
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
   * Property: For any request tracked, resolving with matching requestId
   * returns the ACK to the waiting promise.
   */
  t.test('track and resolve returns ACK to promise', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        fc.record({
          type: fc.constantFrom('CREATE_REPLICA', 'REMOVE_REPLICA'),
          targetAddress: fc.string({minLength: 1, maxLength: 50}),
        }), // metadata
        fc.record({
          request_id: fc.uuid(),
          status: fc.constantFrom('success', 'initiated', 'completed'),
          acknowledged: fc.boolean(),
        }), // ack response
        async (requestId, metadata, ackData) => {
          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: 5000,
          });

          try {
            // Track the request
            const trackPromise = tracker.track(requestId, metadata);

            // Verify request is pending
            const isPending = tracker.hasPending(requestId);

            // Resolve with ACK (use the same requestId in ACK)
            const ack = {...ackData, request_id: requestId};
            const resolved = tracker.resolve(requestId, ack);

            // Wait for promise to resolve
            const result = await trackPromise;

            // Verify request is no longer pending
            const isStillPending = tracker.hasPending(requestId);

            return isPending === true &&
              resolved === true &&
              isStillPending === false &&
              result.request_id === requestId;
          } finally {
            tracker.clear();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('track and resolve returns ACK to promise');
  });

  /**
   * Property: For any request, the pending count increases by 1 when tracked
   * and decreases by 1 when resolved.
   */
  t.test('pending count changes correctly on track and resolve', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), {minLength: 1, maxLength: 5}), // requestIds
        async (requestIds) => {
          // Ensure unique request IDs
          const uniqueIds = [...new Set(requestIds)];
          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: 5000,
          });

          try {
            const initialCount = tracker.getPendingCount();

            // Track all requests
            const promises = uniqueIds.map((id) =>
              tracker.track(id, {type: 'CREATE_REPLICA'}),
            );

            const countAfterTrack = tracker.getPendingCount();

            // Resolve all requests
            for (const id of uniqueIds) {
              tracker.resolve(id, {request_id: id, status: 'success'});
            }

            // Wait for all promises
            await Promise.all(promises);

            const countAfterResolve = tracker.getPendingCount();

            return initialCount === 0 &&
              countAfterTrack === uniqueIds.length &&
              countAfterResolve === 0;
          } finally {
            tracker.clear();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('pending count changes correctly on track and resolve');
  });

  /**
   * Property: For any request, resolving with wrong requestId does not
   * affect the original request.
   */
  t.test('resolve with wrong requestId does not affect original', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // correctRequestId
        fc.uuid(), // wrongRequestId
        async (correctRequestId, wrongRequestId) => {
          // Ensure IDs are different
          if (correctRequestId === wrongRequestId) {
            return true; // Skip this case
          }

          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: 5000,
          });

          try {
            // Track the request
            const trackPromise = tracker.track(correctRequestId, {
              type: 'CREATE_REPLICA',
            });

            // Try to resolve with wrong ID
            const wrongResolved = tracker.resolve(wrongRequestId, {
              request_id: wrongRequestId,
              status: 'success',
            });

            // Original request should still be pending
            const stillPending = tracker.hasPending(correctRequestId);

            // Now resolve correctly
            tracker.resolve(correctRequestId, {
              request_id: correctRequestId,
              status: 'success',
            });

            await trackPromise;

            return wrongResolved === false && stillPending === true;
          } finally {
            tracker.clear();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('resolve with wrong requestId does not affect original');
  });

  /**
   * Property: For any request, metadata is preserved and retrievable.
   */
  t.test('metadata is preserved for pending requests', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        fc.record({
          type: fc.constantFrom('CREATE_REPLICA', 'REMOVE_REPLICA'),
          targetAddress: fc.string({minLength: 1, maxLength: 50}),
          targetNodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }), // metadata
        async (requestId, metadata) => {
          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: 5000,
          });

          try {
            // Track the request
            const trackPromise = tracker.track(requestId, metadata);

            // Get metadata
            const retrievedMetadata = tracker.getMetadata(requestId);

            // Resolve to clean up
            tracker.resolve(requestId, {request_id: requestId, status: 'success'});
            await trackPromise;

            return retrievedMetadata !== null &&
              retrievedMetadata.type === metadata.type &&
              retrievedMetadata.targetAddress === metadata.targetAddress &&
              retrievedMetadata.targetNodeId === metadata.targetNodeId &&
              retrievedMetadata.replicaId === metadata.replicaId;
          } finally {
            tracker.clear();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('metadata is preserved for pending requests');
  });

  /**
   * Property: For any resolved request, hasPending returns false.
   */
  t.test('hasPending returns false after resolve', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // requestId
        async (requestId) => {
          const tracker = new PendingRequestTracker({
            defaultTimeoutMs: 5000,
          });

          try {
            // Track the request
            const trackPromise = tracker.track(requestId, {type: 'CREATE_REPLICA'});

            const pendingBefore = tracker.hasPending(requestId);

            // Resolve
            tracker.resolve(requestId, {request_id: requestId, status: 'success'});
            await trackPromise;

            const pendingAfter = tracker.hasPending(requestId);

            return pendingBefore === true && pendingAfter === false;
          } finally {
            tracker.clear();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('hasPending returns false after resolve');
  });
});
