import {test} from 'tap';
import {ConnectionManager} from '../../../src/cli/core/connection-manager.js';

test('ConnectionManager - initial state', async (t) => {
  const manager = new ConnectionManager();

  t.equal(manager.getStatus(), 'disconnected');
  t.equal(manager.getAddress(), null);
  t.equal(manager.getReconnectAttempts(), 0);
  t.equal(manager.isConnected(), false);
});

test('ConnectionManager - default config values', async (t) => {
  const manager = new ConnectionManager();

  t.equal(manager.maxReconnectAttempts, 10);
  t.equal(manager.baseDelay, 1000);
  t.equal(manager.maxDelay, 30000);
});

test('ConnectionManager - custom config values', async (t) => {
  const manager = new ConnectionManager({
    maxReconnectAttempts: 5,
    baseDelay: 500,
    maxDelay: 10000,
  });

  t.equal(manager.maxReconnectAttempts, 5);
  t.equal(manager.baseDelay, 500);
  t.equal(manager.maxDelay, 10000);
});

test('ConnectionManager - buildWebSocketUrl adds protocol', async (t) => {
  const manager = new ConnectionManager();

  t.equal(
    manager.buildWebSocketUrl('localhost:8080'),
    'ws://localhost:8080/api/admin/stream',
  );
});

test('ConnectionManager - buildWebSocketUrl converts http to ws', async (t) => {
  const manager = new ConnectionManager();

  t.equal(
    manager.buildWebSocketUrl('http://localhost:8080'),
    'ws://localhost:8080/api/admin/stream',
  );
});

test('ConnectionManager - buildWebSocketUrl converts https to wss', async (t) => {
  const manager = new ConnectionManager();

  t.equal(
    manager.buildWebSocketUrl('https://localhost:8080'),
    'wss://localhost:8080/api/admin/stream',
  );
});

test('ConnectionManager - buildWebSocketUrl preserves ws protocol', async (t) => {
  const manager = new ConnectionManager();

  t.equal(
    manager.buildWebSocketUrl('ws://localhost:8080'),
    'ws://localhost:8080/api/admin/stream',
  );
});

test('ConnectionManager - buildWebSocketUrl preserves wss protocol', async (t) => {
  const manager = new ConnectionManager();

  t.equal(
    manager.buildWebSocketUrl('wss://localhost:8080'),
    'wss://localhost:8080/api/admin/stream',
  );
});

test('ConnectionManager - buildWebSocketUrl handles trailing slash', async (t) => {
  const manager = new ConnectionManager();

  t.equal(
    manager.buildWebSocketUrl('http://localhost:8080/'),
    'ws://localhost:8080/api/admin/stream',
  );
});

test('ConnectionManager - buildWebSocketUrl preserves existing path', async (t) => {
  const manager = new ConnectionManager();

  t.equal(
    manager.buildWebSocketUrl('http://localhost:8080/api/admin/stream'),
    'ws://localhost:8080/api/admin/stream',
  );
});

test('ConnectionManager - calculateBackoffDelay exponential', async (t) => {
  const manager = new ConnectionManager({baseDelay: 1000, maxDelay: 30000});

  t.equal(manager.calculateBackoffDelay(0), 1000);
  t.equal(manager.calculateBackoffDelay(1), 2000);
  t.equal(manager.calculateBackoffDelay(2), 4000);
  t.equal(manager.calculateBackoffDelay(3), 8000);
  t.equal(manager.calculateBackoffDelay(4), 16000);
});

test('ConnectionManager - calculateBackoffDelay caps at maxDelay', async (t) => {
  const manager = new ConnectionManager({baseDelay: 1000, maxDelay: 10000});

  t.equal(manager.calculateBackoffDelay(5), 10000); // 32000 capped to 10000
  t.equal(manager.calculateBackoffDelay(10), 10000);
});

test('ConnectionManager - disconnect sets status', async (t) => {
  const manager = new ConnectionManager();
  const statusChanges = [];

  manager.onStatusChange = (status) => statusChanges.push(status);
  manager.disconnect();

  t.equal(manager.getStatus(), 'disconnected');
  t.ok(statusChanges.includes('disconnected'));
});

test('ConnectionManager - disconnect cancels reconnect timer', async (t) => {
  const manager = new ConnectionManager();

  // Simulate a pending reconnect
  manager.reconnectTimer = setTimeout(() => {}, 10000);
  manager.disconnect();

  t.equal(manager.reconnectTimer, null);
});

test('ConnectionManager - resetReconnectAttempts', async (t) => {
  const manager = new ConnectionManager();

  manager.reconnectAttempts = 5;
  manager.resetReconnectAttempts();

  t.equal(manager.getReconnectAttempts(), 0);
});

test('ConnectionManager - cancelReconnect clears timer', async (t) => {
  const manager = new ConnectionManager();

  manager.reconnectTimer = setTimeout(() => {}, 10000);
  manager.cancelReconnect();

  t.equal(manager.reconnectTimer, null);
});

test('ConnectionManager - sendQuery returns false when not connected', async (t) => {
  const manager = new ConnectionManager();

  const result = manager.sendQuery('q1', 'SELECT * FROM test');
  t.equal(result, false);
});

test('ConnectionManager - subscribeLiveQuery returns false when not connected', async (t) => {
  const manager = new ConnectionManager();

  const result = manager.subscribeLiveQuery('sub1', 'LIVE SELECT * FROM test');
  t.equal(result, false);
});

test('ConnectionManager - unsubscribeLiveQuery returns false when not connected', async (t) => {
  const manager = new ConnectionManager();

  const result = manager.unsubscribeLiveQuery('sub1');
  t.equal(result, false);
});

test('ConnectionManager - requestCacheDump returns false when not connected', async (t) => {
  const manager = new ConnectionManager();

  const result = manager.requestCacheDump();
  t.equal(result, false);
});

test('ConnectionManager - handleMessage parses cache_dump', async (t) => {
  const manager = new ConnectionManager();
  let receivedData = null;

  manager.onCacheDump = (data) => {
    receivedData = data;
  };

  manager.handleMessage(JSON.stringify({
    type: 'cache_dump',
    data: {nodes: [], services: []},
  }));

  t.same(receivedData, {nodes: [], services: []});
});

test('ConnectionManager - handleMessage parses cdc_event', async (t) => {
  const manager = new ConnectionManager();
  let receivedEvent = null;

  manager.onCDCEvent = (event) => {
    receivedEvent = event;
  };

  // Server sends CDC event fields directly in message (not nested in event)
  manager.handleMessage(JSON.stringify({
    type: 'cdc_event',
    table: 'nodes',
    operation: 'insert',
    record: {node_id: 'node-1', status: 'active'},
    timestamp: 1234567890,
  }));

  t.same(receivedEvent, {
    table: 'nodes',
    operation: 'INSERT',
    data: {node_id: 'node-1', status: 'active'},
    key: 'node-1',
    timestamp: 1234567890,
  });
});

test('ConnectionManager - handleMessage parses query_result', async (t) => {
  const manager = new ConnectionManager();
  let receivedResult = null;

  manager.onQueryResult = (result) => {
    receivedResult = result;
  };

  manager.handleMessage(JSON.stringify({
    type: 'query_result',
    queryId: 'q1',
    result: {rows: []},
  }));

  t.same(receivedResult, {type: 'query_result', queryId: 'q1', result: {rows: []}});
});

test('ConnectionManager - handleMessage parses error', async (t) => {
  const manager = new ConnectionManager();
  let receivedError = null;

  manager.onError = (err) => {
    receivedError = err;
  };

  manager.handleMessage(JSON.stringify({
    type: 'error',
    message: 'Test error',
  }));

  t.ok(receivedError instanceof Error);
  t.equal(receivedError.message, 'Test error');
});

test('ConnectionManager - handleMessage handles invalid JSON', async (t) => {
  const manager = new ConnectionManager();
  let receivedError = null;

  manager.onError = (err) => {
    receivedError = err;
  };

  manager.handleMessage('not valid json');

  t.ok(receivedError instanceof Error);
  t.ok(receivedError.message.includes('Failed to parse message'));
});

test('ConnectionManager - handleMessage ignores unknown types', async (t) => {
  const manager = new ConnectionManager();
  let errorCalled = false;

  manager.onError = () => {
    errorCalled = true;
  };

  manager.handleMessage(JSON.stringify({
    type: 'unknown_type',
    data: {},
  }));

  t.equal(errorCalled, false);
});

test('ConnectionManager - scheduleReconnect respects max attempts', async (t) => {
  const manager = new ConnectionManager({maxReconnectAttempts: 3});
  const statusChanges = [];

  manager.onStatusChange = (status) => statusChanges.push(status);
  manager.reconnectAttempts = 3;

  manager.scheduleReconnect();

  t.equal(manager.getStatus(), 'failed');
  t.ok(statusChanges.includes('failed'));
});

test('ConnectionManager - scheduleReconnect does nothing if intentional disconnect', async (t) => {
  const manager = new ConnectionManager();

  manager.intentionalDisconnect = true;
  manager.scheduleReconnect();

  t.equal(manager.reconnectTimer, null);
  t.equal(manager.getStatus(), 'disconnected');
});
