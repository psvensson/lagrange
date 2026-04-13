/**
 * Property Test: Live Query Subscription Limit
 * Property 48: For any attempt to create a live query subscription when at
 * maximum capacity, the operation should fail with an appropriate error.
 *
 * **Validates: Requirements 32.11**
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {LiveQueryManager} from '../../../src/cli/core/live-query-manager.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

/**
 * Create a mock connection manager
 * @return {Object} Mock connection manager
 */
function createMockConnectionManager() {
  return {
    subscribeLiveQuery: () => true,
    unsubscribeLiveQuery: () => true,
  };
}

test('Property 48: Live Query Subscription Limit', async (t) => {
  await t.test('subscription fails when at maximum capacity', async (t) => {
    fc.assert(
      fc.property(
        // Generate max subscriptions limit (1-20)
        fc.integer({min: 1, max: 20}),
        // Generate SQL queries to subscribe
        fc.array(
          fc.string({minLength: 1, maxLength: 50})
            .map((s) => `LIVE SELECT * FROM ${s.replace(/\s/g, '_')}`),
          {minLength: 1, maxLength: 25},
        ),
        (maxSubscriptions, queries) => {
          const eventBus = new EventBus();
          const connMgr = createMockConnectionManager();
          const manager = new LiveQueryManager(connMgr, eventBus, {
            maxSubscriptions,
          });

          let successCount = 0;
          let failCount = 0;

          for (const sql of queries) {
            try {
              manager.subscribe(sql);
              successCount++;
            } catch (err) {
              // Should fail with appropriate error message
              if (err.message.includes('Maximum') &&
                      err.message.includes('concurrent live queries reached')) {
                failCount++;
              } else {
                // Unexpected error
                return false;
              }
            }
          }

          // Success count should be at most maxSubscriptions
          if (successCount > maxSubscriptions) {
            return false;
          }

          // If we tried more than max, some should have failed
          if (queries.length > maxSubscriptions) {
            if (failCount !== queries.length - maxSubscriptions) {
              return false;
            }
          }

          // Final subscription count should be at most maxSubscriptions
          return manager.getSubscriptionCount() <= maxSubscriptions;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Subscription limit is enforced correctly');
  });

  await t.test('isAtCapacity returns true when at limit', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10}),
        (maxSubscriptions) => {
          const eventBus = new EventBus();
          const connMgr = createMockConnectionManager();
          const manager = new LiveQueryManager(connMgr, eventBus, {
            maxSubscriptions,
          });

          // Initially not at capacity
          if (manager.isAtCapacity()) {
            return false;
          }

          // Fill up to capacity
          for (let i = 0; i < maxSubscriptions; i++) {
            manager.subscribe(`LIVE SELECT * FROM table_${i}`);
          }

          // Now should be at capacity
          return manager.isAtCapacity() === true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('isAtCapacity correctly reports capacity status');
  });

  await t.test('cancelling subscription allows new subscription', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10}),
        (maxSubscriptions) => {
          const eventBus = new EventBus();
          const connMgr = createMockConnectionManager();
          const manager = new LiveQueryManager(connMgr, eventBus, {
            maxSubscriptions,
          });

          // Fill to capacity
          const subscriptionIds = [];
          for (let i = 0; i < maxSubscriptions; i++) {
            subscriptionIds.push(
              manager.subscribe(`LIVE SELECT * FROM table_${i}`),
            );
          }

          // Should be at capacity
          if (!manager.isAtCapacity()) {
            return false;
          }

          // Cancel one subscription
          manager.cancel(subscriptionIds[0]);

          // Should no longer be at capacity
          if (manager.isAtCapacity()) {
            return false;
          }

          // Should be able to subscribe again
          try {
            manager.subscribe('LIVE SELECT * FROM new_table');
            return true;
          } catch (_err) {
            return false;
          }
        },
      ),
      {numRuns: 10},
    );
    t.pass('Cancelling subscription frees up capacity');
  });
});
