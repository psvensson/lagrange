/**
 * Tests for CDCStreamHandler
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.9
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import {CDCStreamHandler} from '../../../src/cli/core/cdc-stream-handler.js';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

// Mock ConnectionManager
class MockConnectionManager {
  constructor() {
    this.onCacheDump = null;
    this.onCDCEvent = null;
    this.onStatusChange = null;
    this.connected = false;
    this.cacheDumpRequested = false;
  }

  isConnected() {
    return this.connected;
  }

  requestCacheDump() {
    this.cacheDumpRequested = true;
    return this.connected;
  }
}

test('CDCStreamHandler - constructor initializes with default state', async (t) => {
  const handler = new CDCStreamHandler({});

  t.equal(handler.getStatus(), 'disconnected');
  t.equal(handler.isPaused(), false);
  t.equal(handler.isConnected(), false);

  const stats = handler.getStats();
  t.equal(stats.eventsReceived, 0);
  t.equal(stats.eventsPerSecond, 0);
  t.equal(stats.lastEventTime, null);
});

test('CDCStreamHandler - handleCacheDump initializes cache', async (t) => {
  const cache = new RemoteCache();
  const eventBus = new EventBus();
  const connectionManager = new MockConnectionManager();

  const handler = new CDCStreamHandler({
    cache,
    eventBus,
    connectionManager,
  });

  let initEvent = null;
  eventBus.on('cdc:initialized', (data) => {
    initEvent = data;
  });

  const dump = {
    nodes: [{node_id: 'node-1', status: 'active'}],
    services: [{service_id: 'svc-1', node_id: 'node-1'}],
  };

  handler.handleCacheDump(dump);

  t.equal(handler.getStatus(), 'connected');
  t.equal(cache.getNodes().length, 1);
  t.ok(initEvent);
  t.equal(initEvent.tableCount, 2);
});

test('CDCStreamHandler - handleCDCEvent updates cache and emits events', async (t) => {
  const cache = new RemoteCache();
  const eventBus = new EventBus();

  cache.loadFromDump({nodes: []});

  const handler = new CDCStreamHandler({
    cache,
    eventBus,
  });

  let updateEvent = null;
  eventBus.on('cache:update', (data) => {
    updateEvent = data;
  });

  const cdcEvent = {
    table: 'nodes',
    operation: 'INSERT',
    key: 'node-1',
    data: {node_id: 'node-1', status: 'active'},
    timestamp: Date.now(),
  };

  handler.handleCDCEvent(cdcEvent);

  t.equal(cache.getNodes().length, 1);
  t.ok(updateEvent);
  t.equal(updateEvent.table, 'nodes');
  t.equal(updateEvent.key, 'node-1');
  t.equal(updateEvent.operation, 'INSERT');

  const stats = handler.getStats();
  t.equal(stats.eventsReceived, 1);
  t.ok(stats.lastEventTime);
});

test('CDCStreamHandler - paused state prevents event processing', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  const handler = new CDCStreamHandler({cache});

  handler.pause();
  t.equal(handler.isPaused(), true);
  t.equal(handler.getStatus(), 'paused');

  const cdcEvent = {
    table: 'nodes',
    operation: 'INSERT',
    key: 'node-1',
    data: {node_id: 'node-1', status: 'active'},
  };

  handler.handleCDCEvent(cdcEvent);

  // Event should not be processed
  t.equal(cache.getNodes().length, 0);
  t.equal(handler.getStats().eventsReceived, 0);
});

test('CDCStreamHandler - resume restores event processing', async (t) => {
  const cache = new RemoteCache();
  const connectionManager = new MockConnectionManager();
  connectionManager.connected = true;

  cache.loadFromDump({nodes: []});

  const handler = new CDCStreamHandler({
    cache,
    connectionManager,
  });

  handler.pause();
  handler.resume();

  t.equal(handler.isPaused(), false);
  t.equal(handler.getStatus(), 'connected');

  const cdcEvent = {
    table: 'nodes',
    operation: 'INSERT',
    key: 'node-1',
    data: {node_id: 'node-1', status: 'active'},
  };

  handler.handleCDCEvent(cdcEvent);

  t.equal(cache.getNodes().length, 1);
});

test('CDCStreamHandler - togglePause switches pause state', async (t) => {
  const handler = new CDCStreamHandler({});

  t.equal(handler.isPaused(), false);

  const result1 = handler.togglePause();
  t.equal(result1, true);
  t.equal(handler.isPaused(), true);

  const result2 = handler.togglePause();
  t.equal(result2, false);
  t.equal(handler.isPaused(), false);
});

test('CDCStreamHandler - tracks changed rows for highlighting', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  const handler = new CDCStreamHandler({
    cache,
    highlightDurationMs: 100, // Short duration for testing
  });

  const cdcEvent = {
    table: 'nodes',
    operation: 'INSERT',
    key: 'node-1',
    data: {node_id: 'node-1', status: 'active'},
  };

  handler.handleCDCEvent(cdcEvent);

  t.equal(handler.isRowChanged('node-1'), true);

  const changedRows = handler.getChangedRows();
  t.equal(changedRows.size, 1);
  t.ok(changedRows.has('node-1'));
});

test('CDCStreamHandler - requestRefresh sends cache dump request', async (t) => {
  const connectionManager = new MockConnectionManager();
  connectionManager.connected = true;

  const handler = new CDCStreamHandler({connectionManager});

  const result = handler.requestRefresh();

  t.equal(result, true);
  t.equal(connectionManager.cacheDumpRequested, true);
});

test('CDCStreamHandler - requestRefresh fails when disconnected', async (t) => {
  const connectionManager = new MockConnectionManager();
  connectionManager.connected = false;

  const handler = new CDCStreamHandler({connectionManager});

  const result = handler.requestRefresh();

  t.equal(result, false);
});

test('CDCStreamHandler - getStatusBarInfo returns correct info', async (t) => {
  const handler = new CDCStreamHandler({});

  // Disconnected state
  let info = handler.getStatusBarInfo();
  t.equal(info.status, 'disconnected');
  t.equal(info.color, 'red');
  t.ok(info.text.includes('Disconnected'));

  // Paused state
  handler.pause();
  info = handler.getStatusBarInfo();
  t.equal(info.status, 'paused');
  t.equal(info.color, 'yellow');
  t.ok(info.text.includes('Paused'));
  t.ok(info.text.includes('stale'));
});

test('CDCStreamHandler - handleStatusChange updates status', async (t) => {
  const eventBus = new EventBus();
  const handler = new CDCStreamHandler({eventBus});

  let statusEvent = null;
  eventBus.on('cdc:status', (data) => {
    statusEvent = data;
  });

  handler.handleStatusChange('connected');
  t.equal(handler.getStatus(), 'connected');
  t.ok(statusEvent);
  t.equal(statusEvent.status, 'connected');

  handler.handleStatusChange('disconnected');
  t.equal(handler.getStatus(), 'disconnected');

  handler.handleStatusChange('failed');
  t.equal(handler.getStatus(), 'error');
});

test('CDCStreamHandler - emits table-specific CDC events', async (t) => {
  const cache = new RemoteCache();
  const eventBus = new EventBus();
  cache.loadFromDump({nodes: []});

  const handler = new CDCStreamHandler({
    cache,
    eventBus,
  });

  let tableEvent = null;
  eventBus.on('cdc:nodes', (data) => {
    tableEvent = data;
  });

  const cdcEvent = {
    table: 'nodes',
    operation: 'INSERT',
    key: 'node-1',
    data: {node_id: 'node-1', status: 'active'},
  };

  handler.handleCDCEvent(cdcEvent);

  t.ok(tableEvent);
  t.equal(tableEvent.key, 'node-1');
  t.equal(tableEvent.operation, 'INSERT');
});

test('CDCStreamHandler - resetStats clears statistics', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  const handler = new CDCStreamHandler({cache});

  // Generate some events
  handler.handleCDCEvent({
    table: 'nodes',
    operation: 'INSERT',
    key: 'node-1',
    data: {node_id: 'node-1'},
  });

  t.equal(handler.getStats().eventsReceived, 1);

  handler.resetStats();

  const stats = handler.getStats();
  t.equal(stats.eventsReceived, 0);
  t.equal(stats.eventsPerSecond, 0);
  t.equal(stats.lastEventTime, null);
});

test('CDCStreamHandler - destroy cleans up resources', async (t) => {
  const connectionManager = new MockConnectionManager();
  const eventBus = new EventBus();

  const handler = new CDCStreamHandler({
    connectionManager,
    eventBus,
  });

  let destroyEvent = null;
  eventBus.on('cdc:destroyed', (data) => {
    destroyEvent = data;
  });

  handler.destroy();

  t.ok(destroyEvent);
  t.equal(connectionManager.onCacheDump, null);
  t.equal(connectionManager.onCDCEvent, null);
});

test('CDCStreamHandler - calculates event rate correctly', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  const handler = new CDCStreamHandler({cache});

  // Send multiple events
  for (let i = 0; i < 5; i++) {
    handler.handleCDCEvent({
      table: 'nodes',
      operation: 'INSERT',
      key: `node-${i}`,
      data: {node_id: `node-${i}`},
    });
  }

  const stats = handler.getStats();
  t.equal(stats.eventsReceived, 5);
  t.ok(stats.eventsPerSecond > 0);
});

test('CDCStreamHandler - emits pause/resume events', async (t) => {
  const eventBus = new EventBus();
  const handler = new CDCStreamHandler({eventBus});

  let pauseEvent = null;
  let resumeEvent = null;

  eventBus.on('cdc:paused', (data) => {
    pauseEvent = data;
  });
  eventBus.on('cdc:resumed', (data) => {
    resumeEvent = data;
  });

  handler.pause();
  t.ok(pauseEvent);
  t.ok(pauseEvent.timestamp);

  handler.resume();
  t.ok(resumeEvent);
  t.ok(resumeEvent.timestamp);
});
