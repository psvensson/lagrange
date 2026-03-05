/**
 * Unit tests for CDCHandler.
 * Requirements: 4.4, 4.7, 5.3, 5.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCHandler, CDCEvent} from '../../src/message-group/cdc-handler.js';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {HLCClockService} from '../../src/hlc/hlc-clock-service.js';

let cache;
let hlcClock;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});

  cache = new SystemTableCache();
  hlcClock = new HLCClockService('test-node');
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('CDCHandler - constructor requires cache', async (t) => {
  t.throws(
    () => new CDCHandler(null),
    /requires a SystemTableCache/,
    'Should throw without cache',
  );
});

test('CDCHandler - constructor initializes correctly', async (t) => {
  const handler = new CDCHandler(cache);

  t.ok(handler, 'Should create handler');
  t.equal(handler.initialized, false, 'Should not be initialized');
  t.equal(handler.getSubscriptions().length, 0, 'Should have no subscriptions');
});

test('CDCHandler - initialize starts handler', async (t) => {
  const handler = new CDCHandler(cache);
  handler.initialize();

  t.equal(handler.initialized, true, 'Should be initialized');
  t.equal(handler.flushTimer, null, 'Should not schedule idle flush timer');

  handler.shutdown();
});

test('CDCHandler - subscribe adds subscription', async (t) => {
  const handler = new CDCHandler(cache);
  handler.initialize();

  let subscribedEvent = null;
  handler.on('subscribed', (event) => {
    subscribedEvent = event;
  });

  handler.subscribe('nodes');

  t.ok(handler.isSubscribed('nodes'), 'Should be subscribed to nodes');
  t.ok(subscribedEvent, 'Should emit subscribed event');
  t.equal(subscribedEvent.tableName, 'nodes', 'Event should have tableName');

  handler.shutdown();
});

test('CDCHandler - unsubscribe removes subscription', async (t) => {
  const handler = new CDCHandler(cache);
  handler.initialize();

  handler.subscribe('nodes');
  t.ok(handler.isSubscribed('nodes'), 'Should be subscribed');

  let unsubscribedEvent = null;
  handler.on('unsubscribed', (event) => {
    unsubscribedEvent = event;
  });

  handler.unsubscribe('nodes');

  t.notOk(handler.isSubscribed('nodes'), 'Should not be subscribed');
  t.ok(unsubscribedEvent, 'Should emit unsubscribed event');

  handler.shutdown();
});

test('CDCHandler - handleEvent buffers events', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 10});
  handler.initialize();
  handler.subscribe('nodes');

  const timestamp = hlcClock.now().toString();
  const result = handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-1', status: 'active'},
    timestamp,
  });

  t.ok(result, 'Should accept event');
  t.equal(handler.getBufferSize('nodes'), 1, 'Should buffer event');

  handler.shutdown();
});

test('CDCHandler - handleEvent ignores unsubscribed tables', async (t) => {
  const handler = new CDCHandler(cache);
  handler.initialize();

  const timestamp = hlcClock.now().toString();
  const result = handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-1'},
    timestamp,
  });

  t.notOk(result, 'Should reject event for unsubscribed table');

  handler.shutdown();
});

test('CDCHandler - handleEvent deduplicates events', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 10});
  handler.initialize();
  handler.subscribe('nodes');

  const timestamp = hlcClock.now().toString();
  const event = {
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-1'},
    timestamp,
  };

  // First event
  handler.handleEvent(event);
  handler.flushBuffer('nodes');

  // Duplicate event
  const result = handler.handleEvent(event);

  t.notOk(result, 'Should reject duplicate event');

  handler.shutdown();
});

test(
  'CDCHandler - dedupe uses table primary key when id is absent',
  async (t) => {
    const handler = new CDCHandler(cache, {bufferSize: 10});
    handler.initialize();
    handler.subscribe('partitions');

    const timestamp = hlcClock.now().toString();
    const firstEvent = {
      tableName: 'partitions',
      operation: CDC_OPERATIONS.INSERT,
      data: {
        partition_id: 'partition-1',
        table_id: 'table-a',
      },
      timestamp,
    };
    const secondEvent = {
      tableName: 'partitions',
      operation: CDC_OPERATIONS.INSERT,
      data: {
        partition_id: 'partition-2',
        table_id: 'table-a',
      },
      timestamp,
    };

    const firstAccepted = handler.handleEvent(firstEvent);
    handler.flushBuffer('partitions');
    const secondAccepted = handler.handleEvent(secondEvent);
    handler.flushBuffer('partitions');

    t.ok(firstAccepted, 'Should accept first event');
    t.ok(
      secondAccepted,
      'Should not deduplicate distinct partition_id events at same timestamp',
    );
    t.ok(cache.get('partitions', 'partition-1'), 'Should apply first partition event');
    t.ok(cache.get('partitions', 'partition-2'), 'Should apply second partition event');

    handler.shutdown();
  },
);

test('CDCHandler - flushBuffer applies events to cache', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 10});
  handler.initialize();
  handler.subscribe('nodes');

  let appliedEvent = null;
  handler.on('eventApplied', (event) => {
    appliedEvent = event;
  });

  const timestamp = hlcClock.now().toString();
  handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-1', status: 'active'},
    timestamp,
  });

  handler.flushBuffer('nodes');

  t.ok(appliedEvent, 'Should emit eventApplied');
  t.equal(appliedEvent.tableName, 'nodes', 'Should have tableName');
  t.equal(appliedEvent.key, 'node-1', 'Should have key');

  // Verify cache was updated
  const record = cache.get('nodes', 'node-1');
  t.ok(record, 'Should find record in cache');
  t.equal(record.status, 'active', 'Should have correct status');

  handler.shutdown();
});

test('CDCHandler - events applied in timestamp order', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 10});
  handler.initialize();
  handler.subscribe('nodes');

  // Create events with different timestamps
  const ts1 = hlcClock.now().toString();
  const ts2 = hlcClock.now().toString();
  const ts3 = hlcClock.now().toString();

  // Add events out of order
  handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-1', version: 3},
    timestamp: ts3,
  });
  handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.UPDATE,
    data: {id: 'node-1', version: 1},
    timestamp: ts1,
  });
  handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.UPDATE,
    data: {id: 'node-1', version: 2},
    timestamp: ts2,
  });

  handler.flushBuffer('nodes');

  // Last applied should be ts3 (highest timestamp)
  const lastTs = handler.getLastAppliedTimestamp('nodes');
  t.equal(lastTs, ts3, 'Last applied should be highest timestamp');

  handler.shutdown();
});

test('CDCHandler - applyImmediate bypasses buffer', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 10});
  handler.initialize();
  handler.subscribe('nodes');

  const timestamp = hlcClock.now().toString();
  handler.applyImmediate({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-1', status: 'active'},
    timestamp,
  });

  // Should be applied immediately, not buffered
  t.equal(handler.getBufferSize('nodes'), 0, 'Should not buffer');

  const record = cache.get('nodes', 'node-1');
  t.ok(record, 'Should find record in cache');

  handler.shutdown();
});

test('CDCHandler - applyImmediate normalizes DELETE events from whereClause', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 10});
  handler.initialize();
  handler.subscribe('services');

  cache.applySystemTableChange('services', CDC_OPERATIONS.INSERT, {
    service_id: 'svc-delete',
    service_type: 'partition',
    partition_id: 'partition-1',
    node_id: 'node-1',
    status: 'active',
  });

  handler.applyImmediate({
    tableName: 'services',
    operation: CDC_OPERATIONS.DELETE,
    whereClause: {service_id: 'svc-delete'},
    timestamp: hlcClock.now().toString(),
  });

  t.notOk(cache.get('services', 'svc-delete'),
    'DELETE should use whereClause primary key when data is omitted');

  handler.shutdown();
});

test('CDCHandler - applyImmediate normalizes UPDATE events from whereClause', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 10});
  handler.initialize();
  handler.subscribe('services');

  cache.applySystemTableChange('services', CDC_OPERATIONS.INSERT, {
    service_id: 'svc-update',
    service_type: 'partition',
    partition_id: 'partition-1',
    node_id: 'node-1',
    status: 'pending',
  });

  handler.applyImmediate({
    tableName: 'services',
    operation: CDC_OPERATIONS.UPDATE,
    data: {status: 'active'},
    whereClause: {service_id: 'svc-update'},
    timestamp: hlcClock.now().toString(),
  });

  t.equal(cache.get('services', 'svc-update')?.status, 'active',
    'UPDATE should merge whereClause primary key into the applied row');

  handler.shutdown();
});

test('CDCHandler - applyImmediate preserves causeId in apply telemetry', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 10});
  handler.initialize();
  handler.subscribe('nodes');

  const appliedEvents = [];
  handler.on('eventApplied', (event) => {
    appliedEvents.push(event);
  });

  const timestamp = hlcClock.now().toString();
  const causeId = 'cause-1';
  handler.applyImmediate({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-cause', status: 'active'},
    timestamp,
    causeId,
  });

  t.equal(appliedEvents.length, 1, 'Should emit eventApplied');
  t.equal(
    appliedEvents[0].causeId,
    causeId,
    'Should include the initiating causeId on cache apply telemetry',
  );

  handler.shutdown();
});

test(
  'CDCHandler - last applied timestamp should stay monotonic for out-of-order immediate events',
  async (t) => {
    const handler = new CDCHandler(cache, {bufferSize: 10});
    handler.initialize();
    handler.subscribe('nodes');

    const olderTimestamp = hlcClock.now().toString();
    const newerTimestamp = hlcClock.now().toString();

    handler.applyImmediate({
      tableName: 'nodes',
      operation: CDC_OPERATIONS.INSERT,
      data: {id: 'node-monotonic-a', status: 'active'},
      timestamp: newerTimestamp,
    });
    handler.applyImmediate({
      tableName: 'nodes',
      operation: CDC_OPERATIONS.INSERT,
      data: {id: 'node-monotonic-b', status: 'active'},
      timestamp: olderTimestamp,
    });

    t.equal(
      handler.getLastAppliedTimestamp('nodes'),
      newerTimestamp,
      'out-of-order immediate event should not regress last applied timestamp',
    );

    handler.shutdown();
  },
);

test('CDCHandler - auto-flush when buffer full', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 2});
  handler.initialize();
  handler.subscribe('nodes');

  const ts1 = hlcClock.now().toString();
  const ts2 = hlcClock.now().toString();

  handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-1'},
    timestamp: ts1,
  });

  t.equal(handler.getBufferSize('nodes'), 1, 'Should have 1 buffered');

  handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-2'},
    timestamp: ts2,
  });

  // Buffer should be flushed when full
  t.equal(handler.getBufferSize('nodes'), 0, 'Should be flushed');

  // Both records should be in cache
  t.ok(cache.get('nodes', 'node-1'), 'Should have node-1');
  t.ok(cache.get('nodes', 'node-2'), 'Should have node-2');

  handler.shutdown();
});

test('CDCHandler - delayed flush is demand-driven and self-clearing', async (t) => {
  const handler = new CDCHandler(cache, {
    bufferSize: 10,
    flushIntervalMs: 10,
  });
  handler.initialize();
  handler.subscribe('nodes');

  const ts1 = hlcClock.now().toString();
  handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-delayed'},
    timestamp: ts1,
  });

  t.ok(handler.flushTimer, 'Should schedule delayed flush when buffer has events');

  await new Promise((resolve) => setTimeout(resolve, 30));

  const record = cache.get('nodes', 'node-delayed');
  t.ok(record, 'Delayed flush should apply buffered event');
  t.equal(handler.flushTimer, null, 'Flush timer should clear after buffer drains');

  handler.shutdown();
});

test('CDCHandler - getStatus returns complete status', async (t) => {
  const handler = new CDCHandler(cache);
  handler.initialize();
  handler.subscribe('nodes');
  handler.subscribe('partitions');

  const status = handler.getStatus();

  t.equal(status.initialized, true, 'Should be initialized');
  t.equal(status.subscriptions.length, 2, 'Should have 2 subscriptions');
  t.ok(status.subscriptions.includes('nodes'), 'Should include nodes');
  t.ok(status.subscriptions.includes('partitions'), 'Should include partitions');
  t.equal(typeof status.totalBuffered, 'number', 'Should have totalBuffered');

  handler.shutdown();
});

test('CDCHandler - shutdown flushes remaining events', async (t) => {
  const handler = new CDCHandler(cache, {bufferSize: 10});
  handler.initialize();
  handler.subscribe('nodes');

  const timestamp = hlcClock.now().toString();
  handler.handleEvent({
    tableName: 'nodes',
    operation: CDC_OPERATIONS.INSERT,
    data: {id: 'node-1'},
    timestamp,
  });

  t.equal(handler.getBufferSize('nodes'), 1, 'Should have buffered event');

  handler.shutdown();

  // Event should be applied during shutdown
  const record = cache.get('nodes', 'node-1');
  t.ok(record, 'Should have applied event during shutdown');
});

test('CDCEvent - constructor creates event', async (t) => {
  const timestamp = hlcClock.now().toString();
  const event = new CDCEvent(
    'nodes',
    CDC_OPERATIONS.INSERT,
    {id: 'node-1', status: 'active'},
    timestamp,
    'partition-1',
  );

  t.equal(event.tableName, 'nodes', 'Should have tableName');
  t.equal(event.operation, CDC_OPERATIONS.INSERT, 'Should have operation');
  t.equal(event.getKey(), 'node-1', 'Should return key');
  t.equal(event.sourcePartition, 'partition-1', 'Should have sourcePartition');
});

test('CDCEvent - compareTimestamp orders events', async (t) => {
  const ts1 = hlcClock.now().toString();
  const ts2 = hlcClock.now().toString();

  const event1 = new CDCEvent('nodes', CDC_OPERATIONS.INSERT, {id: 'n1'}, ts1);
  const event2 = new CDCEvent('nodes', CDC_OPERATIONS.INSERT, {id: 'n2'}, ts2);

  t.ok(event1.compareTimestamp(event2) < 0, 'event1 should be before event2');
  t.ok(event2.compareTimestamp(event1) > 0, 'event2 should be after event1');
  t.equal(event1.compareTimestamp(event1), 0, 'Same event should be equal');
});
