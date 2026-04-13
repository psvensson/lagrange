/**
 * Property Test: Live Query Event Rate Calculation
 * Property 51: For any live query subscription, the event rate should equal
 * the count of events received in the last second.
 *
 * **Validates: Requirements 32.10**
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

/**
 * Generate a live query event type
 */
const eventTypeArb = fc.constantFrom('INSERT', 'UPDATE', 'DELETE');

/**
 * Generate event data
 */
const eventDataArb = fc.record({
  id: fc.integer({min: 1, max: 1000}),
  value: fc.string({minLength: 1, maxLength: 20}),
});

test('Property 51: Live Query Event Rate Calculation', async (t) => {
  await t.test('event rate equals count of recent events', async (t) => {
    fc.assert(
      fc.property(
        // Generate number of events to send
        fc.integer({min: 0, max: 50}),
        fc.array(eventTypeArb, {minLength: 1, maxLength: 50}),
        fc.array(eventDataArb, {minLength: 1, maxLength: 50}),
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

          // Send events (all within the same second since test runs fast)
          const eventsToSend = Math.min(
            eventCount,
            eventTypes.length,
            eventData.length,
          );
          for (let i = 0; i < eventsToSend; i++) {
            manager.handleLiveQueryEvent({
              subscriptionId,
              type: 'live_query_event',
              eventType: eventTypes[i],
              data: eventData[i],
            });
          }

          const subscription = manager.getSubscription(subscriptionId);

          // Event rate should equal the number of events sent
          // (since all events are within the last second)
          return subscription.eventRate === eventsToSend;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Event rate equals count of recent events');
  });

  await t.test('event rate is zero when no events received', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 30}),
        (tableName) => {
          const eventBus = new EventBus();
          const connMgr = createMockConnectionManager();
          const manager = new LiveQueryManager(connMgr, eventBus);

          const sql = `LIVE SELECT * FROM ${tableName.replace(/\s/g, '_')}`;
          const subscriptionId = manager.subscribe(sql);

          // Activate the subscription
          manager.handleLiveQueryEvent({
            subscriptionId,
            type: 'live_query_initial',
            data: [],
            partitions: ['p1'],
          });

          const subscription = manager.getSubscription(subscriptionId);

          // Event rate should be zero when no events received
          return subscription.eventRate === 0;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Event rate is zero when no events received');
  });

  await t.test('event rate updates with each new event', async (t) => {
    fc.assert(
      fc.property(
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

          const subscription = manager.getSubscription(subscriptionId);

          // Send events one by one and verify rate increases
          const eventsToSend = Math.min(
            eventCount,
            eventTypes.length,
            eventData.length,
          );
          for (let i = 0; i < eventsToSend; i++) {
            manager.handleLiveQueryEvent({
              subscriptionId,
              type: 'live_query_event',
              eventType: eventTypes[i],
              data: eventData[i],
            });

            // Event rate should equal i + 1 (events sent so far)
            if (subscription.eventRate !== i + 1) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Event rate updates with each new event');
  });

  await t.test('event rate is consistent with events array length', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 30}),
        fc.array(eventTypeArb, {minLength: 1, maxLength: 30}),
        fc.array(eventDataArb, {minLength: 1, maxLength: 30}),
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

          // Send events
          const eventsToSend = Math.min(
            eventCount,
            eventTypes.length,
            eventData.length,
          );
          for (let i = 0; i < eventsToSend; i++) {
            manager.handleLiveQueryEvent({
              subscriptionId,
              type: 'live_query_event',
              eventType: eventTypes[i],
              data: eventData[i],
            });
          }

          const subscription = manager.getSubscription(subscriptionId);

          // Since all events are within the last second,
          // event rate should equal events array length
          return subscription.eventRate === subscription.events.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Event rate is consistent with events array length');
  });
});
