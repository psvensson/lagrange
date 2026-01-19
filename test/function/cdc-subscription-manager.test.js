/**
 * Tests for CDCSubscriptionManager.
 * Requirements: 34.14, 34.15
 */

import {test} from 'tap';
import {
  CDCSubscriptionManager,
  SubscriptionType,
} from '../../src/function/cdc-subscription-manager.js';

// Mock function registry
function createMockFunctionRegistry() {
  const invocations = [];
  return {
    invoke: async (functionId, context) => {
      invocations.push({functionId, context});
      if (functionId === 'error-func') {
        throw new Error('Function error');
      }
      return {success: true};
    },
    getInvocations: () => invocations,
    clearInvocations: () => invocations.length = 0,
  };
}

test('CDCSubscriptionManager - constructor', async (t) => {
  const manager = new CDCSubscriptionManager();

  t.equal(manager.isInitialized(), false, 'Should not be initialized');
  t.equal(manager.subscriptions.size, 0, 'Should have no subscriptions');
});

test('CDCSubscriptionManager - initialize', async (t) => {
  const registry = createMockFunctionRegistry();
  const manager = new CDCSubscriptionManager();

  manager.initialize({functionRegistry: registry});

  t.equal(manager.isInitialized(), true, 'Should be initialized');
  t.ok(manager.functionRegistry, 'Should have registry');
});

test('CDCSubscriptionManager - subscribe creates callback subscription', async (t) => {
  const manager = new CDCSubscriptionManager();
  const events = [];

  const result = await manager.subscribe(
    'subscriber-1',
    'users',
    'status = active',
    (change) => events.push(change),
  );

  t.ok(result.subscriptionId, 'Should return subscription ID');
  t.ok(result.subscriptionId.startsWith('subscriber-1:users:'), 'Should have correct prefix');

  const subscription = manager.getSubscription(result.subscriptionId);
  t.ok(subscription, 'Should store subscription');
  t.equal(subscription.type, SubscriptionType.CALLBACK, 'Should be callback type');
  t.equal(subscription.tableName, 'users', 'Should have table name');
});

test('CDCSubscriptionManager - subscribe requires callback function', async (t) => {
  const manager = new CDCSubscriptionManager();

  await t.rejects(
    manager.subscribe('sub-1', 'users', '*', 'not-a-function'),
    /Callback must be a function/,
    'Should reject non-function callback',
  );
});

test('CDCSubscriptionManager - subscribeWithInvoke creates invoke subscription', async (t) => {
  const registry = createMockFunctionRegistry();
  const manager = new CDCSubscriptionManager({functionRegistry: registry});

  const result = await manager.subscribeWithInvoke(
    'subscriber-1',
    'orders',
    'status = pending',
    'process-order',
    {extra: 'context'},
  );

  t.ok(result.subscriptionId, 'Should return subscription ID');

  const subscription = manager.getSubscription(result.subscriptionId);
  t.ok(subscription, 'Should store subscription');
  t.equal(subscription.type, SubscriptionType.INVOKE, 'Should be invoke type');
  t.equal(subscription.functionId, 'process-order', 'Should have function ID');
  t.same(subscription.baseContext, {extra: 'context'}, 'Should have base context');
});

test('CDCSubscriptionManager - subscribeWithInvoke requires function ID', async (t) => {
  const manager = new CDCSubscriptionManager();

  await t.rejects(
    manager.subscribeWithInvoke('sub-1', 'users', '*', null),
    /Function ID is required/,
    'Should reject null function ID',
  );
});

test('CDCSubscriptionManager - unsubscribe removes subscription', async (t) => {
  const manager = new CDCSubscriptionManager();

  const {subscriptionId} = await manager.subscribe(
    'sub-1',
    'users',
    '*',
    () => {},
  );

  const removed = await manager.unsubscribe(subscriptionId);

  t.equal(removed, true, 'Should return true');
  t.equal(manager.getSubscription(subscriptionId), undefined, 'Should remove subscription');
});

test('CDCSubscriptionManager - unsubscribe returns false for nonexistent', async (t) => {
  const manager = new CDCSubscriptionManager();

  const removed = await manager.unsubscribe('nonexistent');

  t.equal(removed, false, 'Should return false');
});

test('CDCSubscriptionManager - unsubscribeAll removes all for subscriber', async (t) => {
  const manager = new CDCSubscriptionManager();

  await manager.subscribe('sub-1', 'users', '*', () => {});
  await manager.subscribe('sub-1', 'orders', '*', () => {});
  await manager.subscribe('sub-2', 'users', '*', () => {});

  const count = await manager.unsubscribeAll('sub-1');

  t.equal(count, 2, 'Should remove 2 subscriptions');
  t.equal(manager.getSubscriptionsForSubscriber('sub-1').length, 0, 'Should have none for sub-1');
  t.equal(manager.getSubscriptionsForSubscriber('sub-2').length, 1, 'Should still have sub-2');
});

test('CDCSubscriptionManager - handleCDCEvent calls callback for INSERT', async (t) => {
  const manager = new CDCSubscriptionManager();
  const events = [];

  await manager.subscribe('sub-1', 'users', '*', (change, match) => {
    events.push({change, match});
  });

  await manager.handleCDCEvent('users', {
    operation: 'INSERT',
    data: {id: 1, name: 'test'},
  });

  t.equal(events.length, 1, 'Should receive 1 event');
  t.equal(events[0].match.type, 'insert', 'Should be insert type');
  t.same(events[0].match.row, {id: 1, name: 'test'}, 'Should have row data');
});

test('CDCSubscriptionManager - handleCDCEvent calls callback for UPDATE', async (t) => {
  const manager = new CDCSubscriptionManager();
  const events = [];

  await manager.subscribe('sub-1', 'users', '*', (change, match) => {
    events.push({change, match});
  });

  await manager.handleCDCEvent('users', {
    operation: 'UPDATE',
    data: {id: 1, name: 'updated'},
    old_data: {id: 1, name: 'original'},
  });

  t.equal(events.length, 1, 'Should receive 1 event');
  t.equal(events[0].match.type, 'update', 'Should be update type');
  t.same(events[0].match.old, {id: 1, name: 'original'}, 'Should have old data');
  t.same(events[0].match.new, {id: 1, name: 'updated'}, 'Should have new data');
});

test('CDCSubscriptionManager - handleCDCEvent calls callback for DELETE', async (t) => {
  const manager = new CDCSubscriptionManager();
  const events = [];

  await manager.subscribe('sub-1', 'users', '*', (change, match) => {
    events.push({change, match});
  });

  await manager.handleCDCEvent('users', {
    operation: 'DELETE',
    old_data: {id: 1, name: 'deleted'},
  });

  t.equal(events.length, 1, 'Should receive 1 event');
  t.equal(events[0].match.type, 'delete', 'Should be delete type');
  t.same(events[0].match.row, {id: 1, name: 'deleted'}, 'Should have row data');
});

test('CDCSubscriptionManager - handleCDCEvent invokes function', async (t) => {
  const registry = createMockFunctionRegistry();
  const manager = new CDCSubscriptionManager({functionRegistry: registry});

  await manager.subscribeWithInvoke(
    'sub-1',
    'orders',
    '*',
    'process-order',
    {source: 'test'},
  );

  await manager.handleCDCEvent('orders', {
    operation: 'INSERT',
    data: {id: 1, status: 'new'},
  });

  const invocations = registry.getInvocations();
  t.equal(invocations.length, 1, 'Should invoke function once');
  t.equal(invocations[0].functionId, 'process-order', 'Should call correct function');
  t.equal(invocations[0].context.source, 'test', 'Should pass base context');
  t.ok(invocations[0].context.cdcEvent, 'Should pass CDC event');
  t.ok(invocations[0].context.matchResult, 'Should pass match result');
});

test('CDCSubscriptionManager - handleCDCEvent filters by table', async (t) => {
  const manager = new CDCSubscriptionManager();
  const userEvents = [];
  const orderEvents = [];

  await manager.subscribe('sub-1', 'users', '*', () => userEvents.push(1));
  await manager.subscribe('sub-1', 'orders', '*', () => orderEvents.push(1));

  await manager.handleCDCEvent('users', {
    operation: 'INSERT',
    data: {id: 1},
  });

  t.equal(userEvents.length, 1, 'Should receive user event');
  t.equal(orderEvents.length, 0, 'Should not receive order event');
});

test('CDCSubscriptionManager - handleCDCEvent filters by predicate', async (t) => {
  const manager = new CDCSubscriptionManager();
  const events = [];

  await manager.subscribe('sub-1', 'users', 'status = active', (change, match) => {
    events.push(match);
  });

  // Should match
  await manager.handleCDCEvent('users', {
    operation: 'INSERT',
    data: {id: 1, status: 'active'},
  });

  // Should not match
  await manager.handleCDCEvent('users', {
    operation: 'INSERT',
    data: {id: 2, status: 'inactive'},
  });

  t.equal(events.length, 1, 'Should only receive matching event');
  t.same(events[0].row, {id: 1, status: 'active'}, 'Should have correct row');
});

test('CDCSubscriptionManager - UPDATE enter/exit detection', async (t) => {
  const manager = new CDCSubscriptionManager();
  const events = [];

  await manager.subscribe('sub-1', 'users', 'status = active', (change, match) => {
    events.push(match);
  });

  // Enter: inactive -> active
  await manager.handleCDCEvent('users', {
    operation: 'UPDATE',
    data: {id: 1, status: 'active'},
    old_data: {id: 1, status: 'inactive'},
  });

  t.equal(events.length, 1, 'Should receive enter event');
  t.equal(events[0].type, 'enter', 'Should be enter type');

  // Exit: active -> inactive
  await manager.handleCDCEvent('users', {
    operation: 'UPDATE',
    data: {id: 1, status: 'inactive'},
    old_data: {id: 1, status: 'active'},
  });

  t.equal(events.length, 2, 'Should receive exit event');
  t.equal(events[1].type, 'exit', 'Should be exit type');
});

test('CDCSubscriptionManager - getStats returns statistics', async (t) => {
  const manager = new CDCSubscriptionManager();

  await manager.subscribe('sub-1', 'users', '*', () => {});
  await manager.subscribe('sub-2', 'orders', '*', () => {});

  const stats = manager.getStats();

  t.equal(stats.subscriptionCount, 2, 'Should have 2 subscriptions');
  t.equal(stats.subscriberCount, 2, 'Should have 2 subscribers');
});

test('CDCSubscriptionManager - shutdown clears state', async (t) => {
  const manager = new CDCSubscriptionManager();

  await manager.subscribe('sub-1', 'users', '*', () => {});
  manager.initialize({});

  manager.shutdown();

  t.equal(manager.isInitialized(), false, 'Should not be initialized');
  t.equal(manager.subscriptions.size, 0, 'Should have no subscriptions');
});
