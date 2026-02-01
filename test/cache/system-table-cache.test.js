/**
 * Unit tests for SystemTableCache.
 * Requirements: 4.4, 4.5, 4.8
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  SystemTableCache,
  SYSTEM_TABLES,
  CDC_OPERATIONS,
} from '../../src/cache/system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('SystemTableCache - constructor initializes all system tables', async (t) => {
  const cache = new SystemTableCache();

  for (const tableName of SYSTEM_TABLES) {
    t.ok(cache.has(tableName, 'nonexistent') === false,
      `Table ${tableName} should be initialized`);
  }

  t.equal(cache.getTableNames().length, SYSTEM_TABLES.length,
    'Should have all system tables');
});

test('SystemTableCache - get returns undefined for non-existent key', async (t) => {
  const cache = new SystemTableCache();

  const result = cache.get('nodes', 'nonexistent');
  t.equal(result, undefined, 'Should return undefined');
});

test('SystemTableCache - get returns cloned record', async (t) => {
  const cache = new SystemTableCache();
  const nodeData = {id: 'node-1', address: '127.0.0.1:8080', status: 'active'};

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, nodeData);

  const result = cache.get('nodes', 'node-1');
  t.same(result, nodeData, 'Should return the record');

  // Verify it's a clone
  result.status = 'modified';
  const result2 = cache.get('nodes', 'node-1');
  t.equal(result2.status, 'active', 'Original should not be modified');
});

test('SystemTableCache - has returns correct boolean', async (t) => {
  const cache = new SystemTableCache();

  t.equal(cache.has('nodes', 'node-1'), false, 'Should return false initially');

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    address: '127.0.0.1:8080',
  });

  t.equal(cache.has('nodes', 'node-1'), true, 'Should return true after insert');
});

test('SystemTableCache - getAll returns all records', async (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    address: '127.0.0.1:8080',
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-2',
    address: '127.0.0.1:8081',
  });

  const results = cache.getAll('nodes');
  t.equal(results.length, 2, 'Should return 2 records');
  t.ok(results.some((r) => r.id === 'node-1'), 'Should include node-1');
  t.ok(results.some((r) => r.id === 'node-2'), 'Should include node-2');
});

test('SystemTableCache - find returns first matching record', async (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    status: 'active',
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-2',
    status: 'inactive',
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-3',
    status: 'active',
  });

  const result = cache.find('nodes', (r) => r.status === 'active');
  t.ok(result, 'Should find a record');
  t.equal(result.status, 'active', 'Should match predicate');
});

test('SystemTableCache - find returns undefined when no match', async (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    status: 'active',
  });

  const result = cache.find('nodes', (r) => r.status === 'nonexistent');
  t.equal(result, undefined, 'Should return undefined');
});

test('SystemTableCache - filter returns all matching records', async (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    status: 'active',
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-2',
    status: 'inactive',
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-3',
    status: 'active',
  });

  const results = cache.filter('nodes', (r) => r.status === 'active');
  t.equal(results.length, 2, 'Should return 2 matching records');
  t.ok(results.every((r) => r.status === 'active'), 'All should match');
});

test('SystemTableCache - count returns correct number', async (t) => {
  const cache = new SystemTableCache();

  t.equal(cache.count('nodes'), 0, 'Should be 0 initially');

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
  });
  t.equal(cache.count('nodes'), 1, 'Should be 1 after insert');

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-2',
  });
  t.equal(cache.count('nodes'), 2, 'Should be 2 after second insert');
});

test('SystemTableCache - applySystemTableChange INSERT', async (t) => {
  const cache = new SystemTableCache();
  const data = {id: 'node-1', address: '127.0.0.1:8080', status: 'active'};

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, data);

  const result = cache.get('nodes', 'node-1');
  t.same(result, data, 'Should insert the record');
});

test('SystemTableCache - applySystemTableChange UPDATE', async (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    address: '127.0.0.1:8080',
    status: 'active',
  });

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.UPDATE, {
    id: 'node-1',
    status: 'inactive',
  });

  const result = cache.get('nodes', 'node-1');
  t.equal(result.status, 'inactive', 'Should update status');
  t.equal(result.address, '127.0.0.1:8080', 'Should preserve other fields');
});

test('SystemTableCache - applySystemTableChange DELETE', async (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    address: '127.0.0.1:8080',
  });

  t.equal(cache.has('nodes', 'node-1'), true, 'Should exist before delete');

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.DELETE, {
    id: 'node-1',
  });

  t.equal(cache.has('nodes', 'node-1'), false, 'Should not exist after delete');
});

test('SystemTableCache - validates table name', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.get('invalid_table', 'key'),
    /Invalid system table name/,
    'Should throw for invalid table name',
  );
});

test('SystemTableCache - validates CDC operation', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.applySystemTableChange('nodes', 'INVALID', {id: 'node-1'}),
    /Invalid CDC operation/,
    'Should throw for invalid operation',
  );
});

test('SystemTableCache - requires primary key field in data', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {}),
    /must include primary key field/,
    'Should throw when primary key is missing',
  );
});

test('SystemTableCache - clear removes all data', async (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {node_id: 'node-1'});
  cache.applySystemTableChange('partitions', CDC_OPERATIONS.INSERT,
    {partition_id: 'p-1'});

  cache.clear();

  t.equal(cache.count('nodes'), 0, 'nodes should be empty');
  t.equal(cache.count('partitions'), 0, 'partitions should be empty');
});

test('SystemTableCache - works with all system tables', async (t) => {
  const cache = new SystemTableCache();

  for (const tableName of SYSTEM_TABLES) {
    const data = {id: `${tableName}-1`, name: `Test ${tableName}`};
    cache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, data);

    const result = cache.get(tableName, `${tableName}-1`);
    t.same(result, data, `Should work with ${tableName}`);
  }
});


test('SystemTableCache - onCacheChange registers listener', async (t) => {
  const cache = new SystemTableCache();
  const events = [];

  cache.onCacheChange((tableName, operation, record) => {
    events.push({tableName, operation, record});
  });

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    address: '127.0.0.1:8080',
  });

  // Wait for setImmediate to fire
  await new Promise((resolve) => setImmediate(resolve));

  t.equal(events.length, 1, 'Should receive one event');
  t.equal(events[0].tableName, 'nodes', 'Should have correct table name');
  t.equal(events[0].operation, 'INSERT', 'Should have correct operation');
  t.equal(events[0].record.id, 'node-1', 'Should have correct record');
});

test('SystemTableCache - onCacheChange throws for non-function', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.onCacheChange('not a function'),
    /Listener must be a function/,
    'Should throw for non-function listener',
  );
});

test('SystemTableCache - offCacheChange removes listener', async (t) => {
  const cache = new SystemTableCache();
  const events = [];

  const listener = (tableName, operation, record) => {
    events.push({tableName, operation, record});
  };

  cache.onCacheChange(listener);
  cache.offCacheChange(listener);

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
  });

  await new Promise((resolve) => setImmediate(resolve));

  t.equal(events.length, 0, 'Should not receive events after removal');
});

test('SystemTableCache - listener errors do not break cache', async (t) => {
  const cache = new SystemTableCache();
  const events = [];

  // First listener throws
  cache.onCacheChange(() => {
    throw new Error('Listener error');
  });

  // Second listener should still receive events
  cache.onCacheChange((tableName, operation, record) => {
    events.push({tableName, operation, record});
  });

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
  });

  await new Promise((resolve) => setImmediate(resolve));

  t.equal(events.length, 1, 'Second listener should still receive event');
});

test('SystemTableCache - notifications are non-blocking', async (t) => {
  const cache = new SystemTableCache();
  let listenerCalled = false;

  cache.onCacheChange(() => {
    listenerCalled = true;
  });

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
  });

  // Listener should not be called synchronously
  t.equal(listenerCalled, false, 'Listener should not be called synchronously');

  await new Promise((resolve) => setImmediate(resolve));

  t.equal(listenerCalled, true, 'Listener should be called after setImmediate');
});

test('SystemTableCache - getAllData returns all tables', async (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    address: '127.0.0.1:8080',
  });
  cache.applySystemTableChange('partitions', CDC_OPERATIONS.INSERT, {
    id: 'p-1',
    table_id: 't-1',
  });

  const data = cache.getAllData();

  t.ok(Array.isArray(data.nodes), 'nodes should be an array');
  t.ok(Array.isArray(data.partitions), 'partitions should be an array');
  t.equal(data.nodes.length, 1, 'nodes should have 1 record');
  t.equal(data.partitions.length, 1, 'partitions should have 1 record');
  t.equal(data.nodes[0].id, 'node-1', 'Should contain correct node data');
});

test('SystemTableCache - getAllData returns cloned data', async (t) => {
  const cache = new SystemTableCache();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    status: 'active',
  });

  const data = cache.getAllData();
  data.nodes[0].status = 'modified';

  const data2 = cache.getAllData();
  t.equal(data2.nodes[0].status, 'active', 'Original should not be modified');
});

test('SystemTableCache - notifies on UPDATE', async (t) => {
  const cache = new SystemTableCache();
  const events = [];

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    status: 'active',
  });

  cache.onCacheChange((tableName, operation, record) => {
    events.push({tableName, operation, record});
  });

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.UPDATE, {
    id: 'node-1',
    status: 'inactive',
  });

  await new Promise((resolve) => setImmediate(resolve));

  t.equal(events.length, 1, 'Should receive one event');
  t.equal(events[0].operation, 'UPDATE', 'Should have UPDATE operation');
  t.equal(events[0].record.status, 'inactive', 'Should have updated status');
});

test('SystemTableCache - notifies on DELETE', async (t) => {
  const cache = new SystemTableCache();
  const events = [];

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    status: 'active',
  });

  cache.onCacheChange((tableName, operation, record) => {
    events.push({tableName, operation, record});
  });

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.DELETE, {
    id: 'node-1',
  });

  await new Promise((resolve) => setImmediate(resolve));

  t.equal(events.length, 1, 'Should receive one event');
  t.equal(events[0].operation, 'DELETE', 'Should have DELETE operation');
  t.equal(events[0].record.id, 'node-1', 'Should have deleted record');
});


test('SystemTableCache - DELETE with service_id primary key', async (t) => {
  const cache = new SystemTableCache();

  // Insert a service record using service_id as primary key
  cache.applySystemTableChange('services', CDC_OPERATIONS.INSERT, {
    service_id: 'tables-p1-r1',
    node_id: 'node-1',
    partition_id: 'tables-p1',
    service_type: 'partition',
    status: 'active',
  });

  t.equal(cache.has('services', 'tables-p1-r1'), true, 'Should exist after insert');
  t.equal(cache.count('services'), 1, 'Should have 1 service');

  // Delete using service_id (simulating CDC event from partition DELETE)
  cache.applySystemTableChange('services', CDC_OPERATIONS.DELETE, {
    service_id: 'tables-p1-r1',
  });

  t.equal(cache.has('services', 'tables-p1-r1'), false, 'Should not exist after delete');
  t.equal(cache.count('services'), 0, 'Should have 0 services');
});


// ============================================================================
// Epoch Tracking Tests - Requirements 7.1, 7.2
// ============================================================================

test('SystemTableCache - getEpoch returns 0 initially', async (t) => {
  const cache = new SystemTableCache();

  t.equal(cache.getEpoch(), 0, 'Should return 0 initially');
});

test('SystemTableCache - updateFromEpoch updates current epoch', async (t) => {
  const cache = new SystemTableCache();

  const epoch = {
    epoch: 42,
    assignments: {'tables-p1': ['node1', 'node2', 'node3']},
    timestamp: '2026-01-22T10:30:00.000Z',
    proposedBy: 'node1',
  };

  cache.updateFromEpoch(epoch);

  t.equal(cache.getEpoch(), 42, 'Should update to epoch 42');
});

test('SystemTableCache - updateFromEpoch throws for null epoch', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.updateFromEpoch(null),
    /Epoch must be a valid object/,
    'Should throw for null epoch',
  );
});

test('SystemTableCache - updateFromEpoch throws for non-object epoch', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.updateFromEpoch('not an object'),
    /Epoch must be a valid object/,
    'Should throw for non-object epoch',
  );
});

test('SystemTableCache - updateFromEpoch throws for missing epoch number', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.updateFromEpoch({assignments: {}}),
    /Epoch must have a numeric epoch field/,
    'Should throw for missing epoch number',
  );
});

test('SystemTableCache - updateFromEpoch throws for non-numeric epoch', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.updateFromEpoch({epoch: 'not a number', assignments: {}}),
    /Epoch must have a numeric epoch field/,
    'Should throw for non-numeric epoch',
  );
});

test('SystemTableCache - updateFromEpoch throws for missing assignments', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.updateFromEpoch({epoch: 1}),
    /Epoch must have an assignments object/,
    'Should throw for missing assignments',
  );
});

test('SystemTableCache - updateFromEpoch throws for non-object assignments', async (t) => {
  const cache = new SystemTableCache();

  t.throws(
    () => cache.updateFromEpoch({epoch: 1, assignments: 'not an object'}),
    /Epoch must have an assignments object/,
    'Should throw for non-object assignments',
  );
});

test('SystemTableCache - updateFromEpoch can update multiple times', async (t) => {
  const cache = new SystemTableCache();

  cache.updateFromEpoch({epoch: 1, assignments: {}});
  t.equal(cache.getEpoch(), 1, 'Should be epoch 1');

  cache.updateFromEpoch({epoch: 2, assignments: {}});
  t.equal(cache.getEpoch(), 2, 'Should be epoch 2');

  cache.updateFromEpoch({epoch: 5, assignments: {}});
  t.equal(cache.getEpoch(), 5, 'Should be epoch 5');
});

// ============================================================================
// getReadyNodes Tests - Requirements 5.9
// ============================================================================

test('SystemTableCache - getReadyNodes returns empty array when no nodes', async (t) => {
  const cache = new SystemTableCache();

  const readyNodes = cache.getReadyNodes();
  t.same(readyNodes, [], 'Should return empty array');
});

test('SystemTableCache - getReadyNodes returns only ready nodes', async (t) => {
  const cache = new SystemTableCache();
  const now = Date.now();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    node_id: 'node-1',
    ws_connection_state: 'ready',
    ready_lease_expires_at: now + 1000,
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    node_id: 'node-2',
    ws_connection_state: 'joining',
    ready_lease_expires_at: now + 1000,
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    node_id: 'node-3',
    ws_connection_state: 'ready',
    ready_lease_expires_at: now + 2000,
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    node_id: 'node-4',
    ws_connection_state: 'draining',
    ready_lease_expires_at: now + 1000,
  });

  const readyNodes = cache.getReadyNodes();
  t.equal(readyNodes.length, 2, 'Should return 2 ready nodes');
  t.ok(readyNodes.includes('node-1'), 'Should include node-1');
  t.ok(readyNodes.includes('node-3'), 'Should include node-3');
  t.notOk(readyNodes.includes('node-2'), 'Should not include joining node');
  t.notOk(readyNodes.includes('node-4'), 'Should not include draining node');
});

test('SystemTableCache - getReadyNodes returns empty when no ready nodes', async (t) => {
  const cache = new SystemTableCache();
  const now = Date.now();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    node_id: 'node-1',
    ws_connection_state: 'joining',
    ready_lease_expires_at: now + 1000,
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    node_id: 'node-2',
    ws_connection_state: 'draining',
    ready_lease_expires_at: now + 1000,
  });

  const readyNodes = cache.getReadyNodes();
  t.same(readyNodes, [], 'Should return empty array');
});

test('SystemTableCache - getReadyNodes rejects missing node_id', async (t) => {
  const cache = new SystemTableCache();
  const now = Date.now();

  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    ws_connection_state: 'ready',
    ready_lease_expires_at: now + 1000,
  });

  t.throws(
    () => cache.getReadyNodes(),
    /node_id/,
    'Should reject nodes without node_id',
  );
});


// ============================================================================
// Epoch-Based Cache Updates Tests - Requirements 7.5
// ============================================================================

test('SystemTableCache - updateFromEpoch rejects older epochs', async (t) => {
  const cache = new SystemTableCache();

  // Set initial epoch to 5
  const result1 = cache.updateFromEpoch({epoch: 5, assignments: {}});
  t.equal(result1, true, 'Should accept initial epoch');
  t.equal(cache.getEpoch(), 5, 'Should be epoch 5');

  // Try to update with older epoch (3)
  const result2 = cache.updateFromEpoch({epoch: 3, assignments: {}});
  t.equal(result2, false, 'Should reject older epoch');
  t.equal(cache.getEpoch(), 5, 'Should still be epoch 5');
});

test('SystemTableCache - updateFromEpoch rejects equal epochs', async (t) => {
  const cache = new SystemTableCache();

  // Set initial epoch to 5
  cache.updateFromEpoch({epoch: 5, assignments: {}});
  t.equal(cache.getEpoch(), 5, 'Should be epoch 5');

  // Try to update with same epoch (5)
  const result = cache.updateFromEpoch({epoch: 5, assignments: {}});
  t.equal(result, false, 'Should reject equal epoch');
  t.equal(cache.getEpoch(), 5, 'Should still be epoch 5');
});

test('SystemTableCache - updateFromEpoch accepts newer epochs', async (t) => {
  const cache = new SystemTableCache();

  // Set initial epoch to 5
  cache.updateFromEpoch({epoch: 5, assignments: {}});
  t.equal(cache.getEpoch(), 5, 'Should be epoch 5');

  // Update with newer epoch (6)
  const result = cache.updateFromEpoch({epoch: 6, assignments: {}});
  t.equal(result, true, 'Should accept newer epoch');
  t.equal(cache.getEpoch(), 6, 'Should be epoch 6');
});

test('SystemTableCache - updateFromEpoch returns true for first update', async (t) => {
  const cache = new SystemTableCache();

  // First update from epoch 0 to 1
  const result = cache.updateFromEpoch({epoch: 1, assignments: {}});
  t.equal(result, true, 'Should accept first epoch update');
  t.equal(cache.getEpoch(), 1, 'Should be epoch 1');
});

test('SystemTableCache - updateFromEpoch rejects epoch 0 after initialization', async (t) => {
  const cache = new SystemTableCache();

  // Set epoch to 1
  cache.updateFromEpoch({epoch: 1, assignments: {}});

  // Try to update with epoch 0
  const result = cache.updateFromEpoch({epoch: 0, assignments: {}});
  t.equal(result, false, 'Should reject epoch 0');
  t.equal(cache.getEpoch(), 1, 'Should still be epoch 1');
});

test('SystemTableCache - updateFromEpoch atomic update on epoch change', async (t) => {
  const cache = new SystemTableCache();

  // Set initial epoch
  cache.updateFromEpoch({epoch: 10, assignments: {'p1': ['node1']}});

  // Update with newer epoch and different assignments
  const result = cache.updateFromEpoch({
    epoch: 11,
    assignments: {'p1': ['node1', 'node2'], 'p2': ['node3']},
    timestamp: '2026-01-22T10:30:00.000Z',
    proposedBy: 'node2',
  });

  t.equal(result, true, 'Should accept newer epoch');
  t.equal(cache.getEpoch(), 11, 'Epoch should be atomically updated to 11');
});

test('SystemTableCache - updateFromEpoch sequence of updates', async (t) => {
  const cache = new SystemTableCache();

  // Sequence of valid updates
  t.equal(cache.updateFromEpoch({epoch: 1, assignments: {}}), true, 'Accept epoch 1');
  t.equal(cache.updateFromEpoch({epoch: 2, assignments: {}}), true, 'Accept epoch 2');
  t.equal(cache.updateFromEpoch({epoch: 3, assignments: {}}), true, 'Accept epoch 3');

  // Try stale update
  t.equal(cache.updateFromEpoch({epoch: 2, assignments: {}}), false, 'Reject stale epoch 2');
  t.equal(cache.getEpoch(), 3, 'Should still be epoch 3');

  // Continue with valid update
  t.equal(cache.updateFromEpoch({epoch: 4, assignments: {}}), true, 'Accept epoch 4');
  t.equal(cache.getEpoch(), 4, 'Should be epoch 4');
});


// ============================================================================
// Endpoint Query Methods Tests - Requirements 6.6
// ============================================================================

test('SystemTableCache - getEndpointsForNode returns empty array when no endpoints',
  async (t) => {
    const cache = new SystemTableCache();

    const endpoints = cache.getEndpointsForNode('node-1');
    t.same(endpoints, [], 'Should return empty array');
  });

test('SystemTableCache - getEndpointsForNode returns endpoints for specific node',
  async (t) => {
    const cache = new SystemTableCache();

    // Insert endpoints for multiple nodes
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-1',
      node_id: 'node-1',
      transport_type: 'ws',
      address: 'ws://192.168.1.10:8080',
      priority: 0,
      status: 'active',
    });
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-2',
      node_id: 'node-2',
      transport_type: 'ws',
      address: 'ws://192.168.1.20:8080',
      priority: 0,
      status: 'active',
    });
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-3',
      node_id: 'node-1',
      transport_type: 'nats',
      address: 'nats://192.168.1.10:4222',
      priority: 1,
      status: 'active',
    });

    const endpoints = cache.getEndpointsForNode('node-1');
    t.equal(endpoints.length, 2, 'Should return 2 endpoints for node-1');
    t.ok(endpoints.every((ep) => ep.node_id === 'node-1'),
      'All endpoints should belong to node-1');
  });

test('SystemTableCache - getEndpointsForNode sorts by priority ascending',
  async (t) => {
    const cache = new SystemTableCache();

    // Insert endpoints with different priorities (out of order)
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-1',
      node_id: 'node-1',
      transport_type: 'veilid',
      address: 'veilid://key123',
      priority: 10,
      status: 'active',
    });
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-2',
      node_id: 'node-1',
      transport_type: 'ws',
      address: 'ws://192.168.1.10:8080',
      priority: 0,
      status: 'active',
    });
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-3',
      node_id: 'node-1',
      transport_type: 'nats',
      address: 'nats://192.168.1.10:4222',
      priority: 5,
      status: 'active',
    });

    const endpoints = cache.getEndpointsForNode('node-1');
    t.equal(endpoints.length, 3, 'Should return 3 endpoints');
    t.equal(endpoints[0].priority, 0, 'First endpoint should have priority 0');
    t.equal(endpoints[1].priority, 5, 'Second endpoint should have priority 5');
    t.equal(endpoints[2].priority, 10, 'Third endpoint should have priority 10');
  });

test('SystemTableCache - getEndpointsForNode handles missing priority as 0',
  async (t) => {
    const cache = new SystemTableCache();

    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-1',
      node_id: 'node-1',
      transport_type: 'ws',
      address: 'ws://192.168.1.10:8080',
      priority: 5,
      status: 'active',
    });
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-2',
      node_id: 'node-1',
      transport_type: 'nats',
      address: 'nats://192.168.1.10:4222',
      // No priority field - should default to 0
      status: 'active',
    });

    const endpoints = cache.getEndpointsForNode('node-1');
    t.equal(endpoints.length, 2, 'Should return 2 endpoints');
    t.equal(endpoints[0].endpoint_id, 'ep-2',
      'Endpoint without priority should come first (treated as 0)');
    t.equal(endpoints[1].endpoint_id, 'ep-1',
      'Endpoint with priority 5 should come second');
  });

test('SystemTableCache - filterEndpointsByStatus filters active endpoints',
  async (t) => {
    const cache = new SystemTableCache();

    const endpoints = [
      {endpoint_id: 'ep-1', status: 'active'},
      {endpoint_id: 'ep-2', status: 'inactive'},
      {endpoint_id: 'ep-3', status: 'active'},
    ];

    const activeEndpoints = cache.filterEndpointsByStatus(endpoints, 'active');
    t.equal(activeEndpoints.length, 2, 'Should return 2 active endpoints');
    t.ok(activeEndpoints.every((ep) => ep.status === 'active'),
      'All endpoints should be active');
  });

test('SystemTableCache - filterEndpointsByStatus filters inactive endpoints',
  async (t) => {
    const cache = new SystemTableCache();

    const endpoints = [
      {endpoint_id: 'ep-1', status: 'active'},
      {endpoint_id: 'ep-2', status: 'inactive'},
      {endpoint_id: 'ep-3', status: 'active'},
    ];

    const inactiveEndpoints = cache.filterEndpointsByStatus(endpoints, 'inactive');
    t.equal(inactiveEndpoints.length, 1, 'Should return 1 inactive endpoint');
    t.equal(inactiveEndpoints[0].endpoint_id, 'ep-2',
      'Should return the inactive endpoint');
  });

test('SystemTableCache - filterEndpointsByStatus returns empty for non-array',
  async (t) => {
    const cache = new SystemTableCache();

    t.same(cache.filterEndpointsByStatus(null, 'active'), [],
      'Should return empty array for null');
    t.same(cache.filterEndpointsByStatus(undefined, 'active'), [],
      'Should return empty array for undefined');
    t.same(cache.filterEndpointsByStatus('not-array', 'active'), [],
      'Should return empty array for string');
  });

test('SystemTableCache - filterEndpointsByStatus returns empty when no match',
  async (t) => {
    const cache = new SystemTableCache();

    const endpoints = [
      {endpoint_id: 'ep-1', status: 'active'},
      {endpoint_id: 'ep-2', status: 'active'},
    ];

    const result = cache.filterEndpointsByStatus(endpoints, 'inactive');
    t.same(result, [], 'Should return empty array when no matches');
  });

test('SystemTableCache - getEndpointsForNode combined with filterEndpointsByStatus',
  async (t) => {
    const cache = new SystemTableCache();

    // Insert endpoints with different statuses
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-1',
      node_id: 'node-1',
      transport_type: 'ws',
      address: 'ws://192.168.1.10:8080',
      priority: 0,
      status: 'active',
    });
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-2',
      node_id: 'node-1',
      transport_type: 'nats',
      address: 'nats://192.168.1.10:4222',
      priority: 1,
      status: 'inactive',
    });
    cache.applySystemTableChange('node_endpoints', CDC_OPERATIONS.INSERT, {
      endpoint_id: 'ep-3',
      node_id: 'node-1',
      transport_type: 'veilid',
      address: 'veilid://key123',
      priority: 2,
      status: 'active',
    });

    const allEndpoints = cache.getEndpointsForNode('node-1');
    const activeEndpoints = cache.filterEndpointsByStatus(allEndpoints, 'active');

    t.equal(allEndpoints.length, 3, 'Should have 3 total endpoints');
    t.equal(activeEndpoints.length, 2, 'Should have 2 active endpoints');
    t.equal(activeEndpoints[0].priority, 0,
      'Active endpoints should still be sorted by priority');
    t.equal(activeEndpoints[1].priority, 2,
      'Second active endpoint should have priority 2');
  });
