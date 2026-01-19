import {test} from 'tap';
import {EventBus} from '../../../src/cli/core/event-bus.js';

test('EventBus - basic subscription and emission', async (t) => {
  const bus = new EventBus();
  const received = [];

  bus.on('test:event', (data) => {
    received.push(data);
  });

  bus.emit('test:event', {value: 1});
  bus.emit('test:event', {value: 2});

  t.equal(received.length, 2);
  t.same(received[0], {value: 1});
  t.same(received[1], {value: 2});
});

test('EventBus - once() auto-unregisters after first call', async (t) => {
  const bus = new EventBus();
  const received = [];

  bus.once('test:event', (data) => {
    received.push(data);
  });

  bus.emit('test:event', {value: 1});
  bus.emit('test:event', {value: 2});

  t.equal(received.length, 1);
  t.same(received[0], {value: 1});
});

test('EventBus - off() removes handler', async (t) => {
  const bus = new EventBus();
  const received = [];

  const handler = (data) => {
    received.push(data);
  };

  bus.on('test:event', handler);
  bus.emit('test:event', {value: 1});

  bus.off('test:event', handler);
  bus.emit('test:event', {value: 2});

  t.equal(received.length, 1);
});

test('EventBus - unsubscribe function works', async (t) => {
  const bus = new EventBus();
  const received = [];

  const unsubscribe = bus.on('test:event', (data) => {
    received.push(data);
  });

  bus.emit('test:event', {value: 1});
  unsubscribe();
  bus.emit('test:event', {value: 2});

  t.equal(received.length, 1);
});

test('EventBus - wildcard subscriptions', async (t) => {
  const bus = new EventBus();
  const received = [];

  bus.on('cache:*', (data, event) => {
    received.push({data, event});
  });

  bus.emit('cache:update', {table: 'nodes'});
  bus.emit('cache:clear', {});
  bus.emit('view:change', {}); // Should not match

  t.equal(received.length, 2);
  t.equal(received[0].event, 'cache:update');
  t.equal(received[1].event, 'cache:clear');
});

test('EventBus - global wildcard', async (t) => {
  const bus = new EventBus();
  const received = [];

  bus.on('*', (data, event) => {
    received.push(event);
  });

  bus.emit('cache:update', {});
  bus.emit('view:change', {});

  t.equal(received.length, 2);
});

test('EventBus - priority ordering', async (t) => {
  const bus = new EventBus();
  const order = [];

  bus.on('test:event', () => order.push('low'), {priority: 1});
  bus.on('test:event', () => order.push('high'), {priority: 10});
  bus.on('test:event', () => order.push('medium'), {priority: 5});

  bus.emit('test:event', {});

  t.same(order, ['high', 'medium', 'low']);
});

test('EventBus - debug mode logs events', async (t) => {
  const bus = new EventBus({debugMode: true});

  bus.on('test:event', () => {});
  bus.emit('test:event', {value: 1});

  const log = bus.getEventLog();
  t.ok(log.length >= 2);
  t.equal(log[0].type, 'subscribe');
  t.equal(log[1].type, 'emit');
});

test('EventBus - handler errors do not break other handlers', async (t) => {
  const bus = new EventBus({debugMode: true});
  const received = [];

  bus.on('test:event', () => {
    throw new Error('Handler error');
  });

  bus.on('test:event', (data) => {
    received.push(data);
  });

  bus.emit('test:event', {value: 1});

  t.equal(received.length, 1);
});

test('EventBus - clear() removes all handlers', async (t) => {
  const bus = new EventBus();

  bus.on('event1', () => {});
  bus.on('event2', () => {});

  t.equal(bus.eventNames().length, 2);

  bus.clear();

  t.equal(bus.eventNames().length, 0);
});

test('EventBus - listenerCount returns correct count', async (t) => {
  const bus = new EventBus();

  t.equal(bus.listenerCount('test:event'), 0);

  bus.on('test:event', () => {});
  bus.on('test:event', () => {});

  t.equal(bus.listenerCount('test:event'), 2);
});
