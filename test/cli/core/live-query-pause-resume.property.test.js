/**
 * Property Test: Live Query Pause/Resume Consistency
 * Property 50: For any paused live query subscription, events should not be
 * added to the events array until resumed.
 *
 * **Validates: Requirements 32.7**
 */

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

/**
 * Generate a live query event type
 */
const eventTypeArb = fc.constantFrom('INSERT', 'UPDATE', 'DELETE');

/**
 * Generate event data
 */
const eventDataArb = fc.record({
  id: fc.integer({min: 1, max: 1000}),
  name: fc.string({minLength: 1, maxLength: 20}),
});

test('Property 50: Live Query Pause/Resume Consistency', async (t) => {
  await t.test('events are not added when subscription is paused', async (t) => {
    fc.assert(
      fc.property(
        // Generate number of events to send while paused
        fc.integer({min: 1, max: 20}),
        fc.array(eventTypeArb, {minLength: 1, maxLength: 20}),
        fc.array(eventDataArb, {minLength: 1, maxLength: 20}),
        (eventCount, eventTypes, eventData) => {
          const eventBus = new EventBus();
          const connMgr = createMockConnectionManager();
          const manager = new LiveQueryManager(connMgr, eventBus);

          const subscriptionId = manager.subscribe('LIVE SELECT * FROM t');

          // Activate the subscription
          manager.handleLiveQueryEvent({
            subscriptionId,
            type: 'live_query_initial',
            data: [],
            partitions: ['p1'],
          });

          // Pause the subscription
          manager.pause(subscriptionId);

          const subscription = manager.getSubscription(subscriptionId);
          const eventCountBefore = subscription.events.length;

          // Send events while paused
          const eventsToSend = Math.min(eventCount, eventTypes.length);
          for (let i = 0; i < eventsToSend; i++) {
            manager.handleLiveQueryEvent({
              subscriptionId,
              type: 'live_query_event',
              eventType: eventTypes[i % eventTypes.length],
              data: eventData[i % eventData.length],
            });
          }

          // Events should not have been added
          return subscription.events.length === eventCountBefore;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Events are not added when paused');
  });

  await t.test('events are added after resume', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10}),
        fc.array(eventTypeArb, {minLength: 1, maxLength: 10}),
        fc.array(eventDataArb, {minLength: 1, maxLength: 10}),
        (eventCount, eventTypes, eventData) => {
          const eventBus = new EventBus();
          const connMgr = createMockConnectionManager();
          const manager = new LiveQueryManager(connMgr, eventBus);

          const subscriptionId = manager.subscribe('LIVE SELECT * FROM t');

          // Activate the subscription
          manager.handleLiveQueryEvent({
            subscriptionId,
            type: 'live_query_initial',
            data: [],
            partitions: ['p1'],
          });

          // Pause and then resume
          manager.pause(subscriptionId);
          manager.resume(subscriptionId);

          const subscription = manager.getSubscription(subscriptionId);
          const eventCountBefore = subscription.events.length;

          // Send events after resume
          const eventsToSend = Math.min(eventCount, eventTypes.length);
          for (let i = 0; i < eventsToSend; i++) {
            manager.handleLiveQueryEvent({
              subscriptionId,
              type: 'live_query_event',
              eventType: eventTypes[i % eventTypes.length],
              data: eventData[i % eventData.length],
            });
          }

          // Events should have been added
          return subscription.events.length === eventCountBefore + eventsToSend;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Events are added after resume');
  });

  await t.test('pause/resume cycle preserves existing events', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10}),
        fc.array(eventTypeArb, {minLength: 1, maxLength: 10}),
        fc.array(eventDataArb, {minLength: 1, maxLength: 10}),
        (eventCount, eventTypes, eventData) => {
          const eventBus = new EventBus();
          const connMgr = createMockConnectionManager();
          const manager = new LiveQueryManager(connMgr, eventBus);

          const subscriptionId = manager.subscribe('LIVE SELECT * FROM t');

          // Activate the subscription
          manager.handleLiveQueryEvent({
            subscriptionId,
            type: 'live_query_initial',
            data: [],
            partitions: ['p1'],
          });

          // Send some events before pausing
          const eventsToSend = Math.min(eventCount, eventTypes.length);
          for (let i = 0; i < eventsToSend; i++) {
            manager.handleLiveQueryEvent({
              subscriptionId,
              type: 'live_query_event',
              eventType: eventTypes[i % eventTypes.length],
              data: eventData[i % eventData.length],
            });
          }

          const subscription = manager.getSubscription(subscriptionId);
          const eventCountBefore = subscription.events.length;
          const eventsCopy = [...subscription.events];

          // Pause and resume
          manager.pause(subscriptionId);
          manager.resume(subscriptionId);

          // Existing events should be preserved
          if (subscription.events.length !== eventCountBefore) {
            return false;
          }

          // Events should be the same
          for (let i = 0; i < eventsCopy.length; i++) {
            if (subscription.events[i].eventType !== eventsCopy[i].eventType) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Pause/resume cycle preserves existing events');
  });

  await t.test('paused status is correctly tracked', async (t) => {
    fc.assert(
      fc.property(
        // Generate sequence of pause/resume operations
        fc.array(fc.boolean(), {minLength: 1, maxLength: 20}),
        (operations) => {
          const eventBus = new EventBus();
          const connMgr = createMockConnectionManager();
          const manager = new LiveQueryManager(connMgr, eventBus);

          const subscriptionId = manager.subscribe('LIVE SELECT * FROM t');

          // Activate the subscription
          manager.handleLiveQueryEvent({
            subscriptionId,
            type: 'live_query_initial',
            data: [],
            partitions: ['p1'],
          });

          const subscription = manager.getSubscription(subscriptionId);
          let expectedPaused = false;

          for (const shouldPause of operations) {
            if (shouldPause && !expectedPaused) {
              manager.pause(subscriptionId);
              expectedPaused = true;
            } else if (!shouldPause && expectedPaused) {
              manager.resume(subscriptionId);
              expectedPaused = false;
            }

            // Verify paused status matches expected
            if (subscription.paused !== expectedPaused) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Paused status is correctly tracked');
  });
});
