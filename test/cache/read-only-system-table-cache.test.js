/**
 * Unit tests for ReadOnlySystemTableCache.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  SystemTableCache,
  CDC_OPERATIONS,
} from '../../src/cache/system-table-cache.js';
import {
  ReadOnlySystemTableCache,
  createReadOnlyCache,
} from '../../src/cache/read-only-system-table-cache.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

let underlyingCache;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});

  underlyingCache = new SystemTableCache();
  // Pre-populate with test data
  underlyingCache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    address: '127.0.0.1:8080',
    status: 'active',
  });
  underlyingCache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-2',
    address: '127.0.0.1:8081',
    status: 'inactive',
  });
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('ReadOnlySystemTableCache - requires underlying cache', async (t) => {
  t.throws(
    () => new ReadOnlySystemTableCache(null),
    /requires an underlying cache/,
    'Should throw when no cache provided',
  );
});

test('ReadOnlySystemTableCache - get works correctly', async (t) => {
  const readOnly = new ReadOnlySystemTableCache(underlyingCache);

  const result = readOnly.get('nodes', 'node-1');
  t.equal(result.id, 'node-1', 'Should return correct record');
  t.equal(result.address, '127.0.0.1:8080', 'Should have correct address');
});

test('ReadOnlySystemTableCache - find works correctly', async (t) => {
  const readOnly = new ReadOnlySystemTableCache(underlyingCache);

  const result = readOnly.find('nodes', (r) => r.status === 'active');
  t.ok(result, 'Should find a record');
  t.equal(result.status, 'active', 'Should match predicate');
});

test('ReadOnlySystemTableCache - filter works correctly', async (t) => {
  const readOnly = new ReadOnlySystemTableCache(underlyingCache);

  const results = readOnly.filter('nodes', (r) => r.status === 'active');
  t.equal(results.length, 1, 'Should return matching records');
});

test('ReadOnlySystemTableCache - getAll works correctly', async (t) => {
  const readOnly = new ReadOnlySystemTableCache(underlyingCache);

  const results = readOnly.getAll('nodes');
  t.equal(results.length, 2, 'Should return all records');
});

test('ReadOnlySystemTableCache - has works correctly', async (t) => {
  const readOnly = new ReadOnlySystemTableCache(underlyingCache);

  t.equal(readOnly.has('nodes', 'node-1'), true, 'Should return true');
  t.equal(readOnly.has('nodes', 'nonexistent'), false, 'Should return false');
});

test('ReadOnlySystemTableCache - count works correctly', async (t) => {
  const readOnly = new ReadOnlySystemTableCache(underlyingCache);

  t.equal(readOnly.count('nodes'), 2, 'Should return correct count');
});

test('ReadOnlySystemTableCache - getTableNames works correctly', async (t) => {
  const readOnly = new ReadOnlySystemTableCache(underlyingCache);

  const names = readOnly.getTableNames();
  t.ok(names.includes('nodes'), 'Should include nodes');
  t.ok(names.includes('partitions'), 'Should include partitions');
});

test('ReadOnlySystemTableCache - forwards freshness/version accessors', async (t) => {
  const readOnly = new ReadOnlySystemTableCache(underlyingCache);
  underlyingCache.getLastAppliedAtMs = (_tableName) => 1234;
  underlyingCache.getLastAppliedCauseId = (_tableName) => 'cause-1';
  underlyingCache.getAppliedSchemaVersion = (_tableName) => '42';

  t.equal(
    readOnly.getLastAppliedAtMs('service_endpoints'),
    1234,
    'should forward getLastAppliedAtMs to underlying cache',
  );
  t.equal(
    readOnly.getLastAppliedCauseId('service_endpoints'),
    'cause-1',
    'should forward getLastAppliedCauseId to underlying cache',
  );
  t.equal(
    readOnly.getAppliedSchemaVersion('service_endpoints'),
    '42',
    'should forward getAppliedSchemaVersion to underlying cache',
  );
});

test('createReadOnlyCache - blocks applySystemTableChange', async (t) => {
  const readOnly = createReadOnlyCache(underlyingCache);

  t.throws(
    () => readOnly.applySystemTableChange('nodes', 'INSERT', {id: 'new'}),
    /Cache write violation/,
    'Should throw on write attempt',
  );
});

test('createReadOnlyCache - blocks clear', async (t) => {
  const readOnly = createReadOnlyCache(underlyingCache);

  t.throws(
    () => readOnly.clear(),
    /Cache write violation/,
    'Should throw on clear attempt',
  );
});

test('createReadOnlyCache - blocks direct cache access', async (t) => {
  const readOnly = createReadOnlyCache(underlyingCache);

  t.throws(
    () => readOnly._cache,
    /Cache write violation/,
    'Should throw on direct cache access',
  );
});

test('createReadOnlyCache - blocks tables access', async (t) => {
  const readOnly = createReadOnlyCache(underlyingCache);

  t.throws(
    () => readOnly.tables,
    /Cache write violation/,
    'Should throw on tables access',
  );
});

test('createReadOnlyCache - allows read operations', async (t) => {
  const readOnly = createReadOnlyCache(underlyingCache);

  // All these should work without throwing
  const record = readOnly.get('nodes', 'node-1');
  t.ok(record, 'get should work');

  const found = readOnly.find('nodes', (r) => r.id === 'node-1');
  t.ok(found, 'find should work');

  const filtered = readOnly.filter('nodes', () => true);
  t.ok(filtered.length > 0, 'filter should work');

  const all = readOnly.getAll('nodes');
  t.ok(all.length > 0, 'getAll should work');

  const exists = readOnly.has('nodes', 'node-1');
  t.equal(exists, true, 'has should work');

  const count = readOnly.count('nodes');
  t.ok(count > 0, 'count should work');
});

test('createReadOnlyCache - reflects underlying cache changes', async (t) => {
  const readOnly = createReadOnlyCache(underlyingCache);

  // Verify initial state
  t.equal(readOnly.count('nodes'), 2, 'Should have 2 nodes initially');

  // Modify underlying cache (simulating CDC handler)
  underlyingCache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-3',
    address: '127.0.0.1:8082',
  });

  // Read-only view should reflect the change
  t.equal(readOnly.count('nodes'), 3, 'Should have 3 nodes after CDC update');
  t.ok(readOnly.has('nodes', 'node-3'), 'Should see new node');
});
