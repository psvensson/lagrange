/**
 * Unit tests for LiveQueryManager
 *
 * Tests live query subscription management including subscribe, pause,
 * resume, cancel, and renew operations.
 *
 * Requirements: 32.1, 32.7, 32.9, 32.10, 32.11
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
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

test('LiveQueryManager', async (t) => {
  await t.test('constructor initializes with defaults', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    t.equal(manager.getSubscriptionCount(), 0);
    t.equal(manager.getMaxSubscriptions(), 100);
    t.equal(manager.isAtCapacity(), false);
  });

  await t.test('constructor accepts custom options', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus, {
      maxSubscriptions: 5,
      maxEventsPerSubscription: 50,
    });

    t.equal(manager.getMaxSubscriptions(), 5);
  });

  await t.test('subscribe creates a new subscription', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const sql = 'LIVE SELECT * FROM users';
    const subscriptionId = manager.subscribe(sql);

    t.ok(subscriptionId);
    t.ok(subscriptionId.startsWith('lq_'));
    t.equal(manager.getSubscriptionCount(), 1);

    const subscription = manager.getSubscription(subscriptionId);
    t.ok(subscription);
    t.equal(subscription.sql, sql);
    t.equal(subscription.status, 'pending');
    t.equal(subscription.paused, false);
    t.same(subscription.events, []);
  });

  await t.test('subscribe throws when at capacity', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus, {
      maxSubscriptions: 2,
    });

    manager.subscribe('LIVE SELECT * FROM t1');
    manager.subscribe('LIVE SELECT * FROM t2');

    t.throws(() => {
      manager.subscribe('LIVE SELECT * FROM t3');
    }, /Maximum 2 concurrent live queries reached/);
  });

  await t.test('subscribe emits event', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    let emittedEvent = null;
    eventBus.on('livequery:subscribed', (data) => {
      emittedEvent = data;
    });

    const sql = 'LIVE SELECT * FROM users';
    const subscriptionId = manager.subscribe(sql);

    t.ok(emittedEvent);
    t.equal(emittedEvent.subscriptionId, subscriptionId);
    t.equal(emittedEvent.sql, sql);
  });

  await t.test('pause pauses an active subscription', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');

    // Simulate activation
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_initial',
      data: [],
      partitions: ['p1'],
    });

    const result = manager.pause(subscriptionId);
    t.equal(result, true);

    const subscription = manager.getSubscription(subscriptionId);
    t.equal(subscription.paused, true);
  });

  await t.test('pause returns false for non-existent subscription', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const result = manager.pause('non-existent');
    t.equal(result, false);
  });

  await t.test('resume resumes a paused subscription', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');

    // Simulate activation and pause
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_initial',
      data: [],
      partitions: ['p1'],
    });
    manager.pause(subscriptionId);

    const result = manager.resume(subscriptionId);
    t.equal(result, true);

    const subscription = manager.getSubscription(subscriptionId);
    t.equal(subscription.paused, false);
  });

  await t.test('resume returns false for non-paused subscription', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');

    // Simulate activation but don't pause
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_initial',
      data: [],
      partitions: ['p1'],
    });

    const result = manager.resume(subscriptionId);
    t.equal(result, false);
  });

  await t.test('cancel removes subscription', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');
    t.equal(manager.getSubscriptionCount(), 1);

    const result = manager.cancel(subscriptionId);
    t.equal(result, true);
    t.equal(manager.getSubscriptionCount(), 0);
    t.equal(manager.getSubscription(subscriptionId), undefined);
  });

  await t.test('cancel returns false for non-existent subscription', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const result = manager.cancel('non-existent');
    t.equal(result, false);
  });

  await t.test('renew renews an expired subscription', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');

    // Simulate expiration
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_expired',
    });

    const subscription = manager.getSubscription(subscriptionId);
    t.equal(subscription.status, 'expired');

    const result = manager.renew(subscriptionId);
    t.equal(result, true);
    t.equal(subscription.status, 'renewing');
  });

  await t.test('renew returns false for non-expired subscription', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');

    const result = manager.renew(subscriptionId);
    t.equal(result, false);
  });

  await t.test('handleLiveQueryEvent processes initial results', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');

    let emittedEvent = null;
    eventBus.on('livequery:initialized', (data) => {
      emittedEvent = data;
    });

    const initialData = [{id: 1, name: 'Alice'}];
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_initial',
      data: initialData,
      partitions: ['p1', 'p2'],
    });

    const subscription = manager.getSubscription(subscriptionId);
    t.equal(subscription.status, 'active');
    t.same(subscription.partitions, ['p1', 'p2']);
    t.same(subscription.initialResults, initialData);
    t.ok(emittedEvent);
  });

  await t.test('handleLiveQueryEvent adds events when not paused', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');

    // Activate
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_initial',
      data: [],
      partitions: ['p1'],
    });

    // Send event
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_event',
      eventType: 'INSERT',
      data: {id: 1, name: 'Alice'},
    });

    const subscription = manager.getSubscription(subscriptionId);
    t.equal(subscription.events.length, 1);
    t.equal(subscription.events[0].eventType, 'INSERT');
    t.ok(subscription.lastEventAt);
  });

  await t.test('handleLiveQueryEvent ignores events when paused', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');

    // Activate and pause
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_initial',
      data: [],
      partitions: ['p1'],
    });
    manager.pause(subscriptionId);

    // Send event while paused
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_event',
      eventType: 'INSERT',
      data: {id: 1, name: 'Alice'},
    });

    const subscription = manager.getSubscription(subscriptionId);
    t.equal(subscription.events.length, 0);
  });

  await t.test('getAllSubscriptions returns all subscriptions', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    manager.subscribe('LIVE SELECT * FROM t1');
    manager.subscribe('LIVE SELECT * FROM t2');
    manager.subscribe('LIVE SELECT * FROM t3');

    const all = manager.getAllSubscriptions();
    t.equal(all.length, 3);
  });

  await t.test('getActiveCount returns count of active subscriptions', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const id1 = manager.subscribe('LIVE SELECT * FROM t1');
    const id2 = manager.subscribe('LIVE SELECT * FROM t2');
    manager.subscribe('LIVE SELECT * FROM t3');

    // Activate first two
    manager.handleLiveQueryEvent({
      subscriptionId: id1,
      type: 'live_query_initial',
      data: [],
      partitions: [],
    });
    manager.handleLiveQueryEvent({
      subscriptionId: id2,
      type: 'live_query_initial',
      data: [],
      partitions: [],
    });

    t.equal(manager.getActiveCount(), 2);
  });

  await t.test('destroy cancels all subscriptions', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    manager.subscribe('LIVE SELECT * FROM t1');
    manager.subscribe('LIVE SELECT * FROM t2');

    t.equal(manager.getSubscriptionCount(), 2);

    manager.destroy();

    t.equal(manager.getSubscriptionCount(), 0);
  });

  await t.test('event rate is calculated correctly', async (t) => {
    const eventBus = new EventBus();
    const connMgr = createMockConnectionManager();
    const manager = new LiveQueryManager(connMgr, eventBus);

    const subscriptionId = manager.subscribe('LIVE SELECT * FROM users');

    // Activate
    manager.handleLiveQueryEvent({
      subscriptionId,
      type: 'live_query_initial',
      data: [],
      partitions: ['p1'],
    });

    // Send multiple events
    for (let i = 0; i < 5; i++) {
      manager.handleLiveQueryEvent({
        subscriptionId,
        type: 'live_query_event',
        eventType: 'INSERT',
        data: {id: i},
      });
    }

    const subscription = manager.getSubscription(subscriptionId);
    t.equal(subscription.events.length, 5);
    t.equal(subscription.eventRate, 5);
  });
});
