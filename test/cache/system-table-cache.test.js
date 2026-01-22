/**
 * Unit tests for SystemTableCache.
 * Requirements: 4.4, 4.5, 4.8
 */

import {test, beforeEach, afterEach} from 'tap';
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
