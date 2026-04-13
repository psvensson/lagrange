/**
 * Unit tests for SystemCacheClient adapter factories.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {SystemTableCache, CDC_OPERATIONS} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {
  createDirectSystemCacheClient,
  createProxySystemCacheClient,
  createSystemCacheClient,
  SYSTEM_CACHE_CLIENT_MODE,
} from '../../src/cache/system-cache-client.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function seedNodes(cache) {
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-1',
    node_id: 'node-1',
    status: 'active',
  });
  cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-2',
    node_id: 'node-2',
    status: 'inactive',
  });
}

function createMockProxy(recordsByTable = {}) {
  return {
    async get(tableName, key) {
      return (recordsByTable[tableName] || []).find((row) => row.id === key);
    },
    async find(tableName, predicate) {
      return (recordsByTable[tableName] || []).find(predicate);
    },
    async filter(tableName, predicate) {
      return (recordsByTable[tableName] || []).filter(predicate);
    },
    async getAll(tableName) {
      return [...(recordsByTable[tableName] || [])];
    },
    async has(tableName, key) {
      return (recordsByTable[tableName] || []).some((row) => row.id === key);
    },
  };
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('SystemCacheClient - direct and proxy parity for read APIs', async (t) => {
  const writableCache = new SystemTableCache();
  seedNodes(writableCache);
  const readOnlyCache = createReadOnlyCache(writableCache);
  const directClient = createDirectSystemCacheClient(readOnlyCache);

  const rows = readOnlyCache.getAll('nodes');
  const proxyClient = createProxySystemCacheClient(createMockProxy({nodes: rows}));

  const directGet = directClient.get('nodes', 'node-1');
  const proxyGet = await proxyClient.get('nodes', 'node-1');
  t.equal(directGet.id, proxyGet.id, 'get() should return equivalent row');

  const directFind = directClient.find('nodes', (row) => row.status === 'active');
  const proxyFind = await proxyClient.find('nodes', (row) => row.status === 'active');
  t.equal(directFind.id, proxyFind.id, 'find() should return equivalent row');

  const directFilter = directClient.filter('nodes', (row) => row.status === 'active');
  const proxyFilter = await proxyClient.filter('nodes', (row) => row.status === 'active');
  t.equal(directFilter.length, proxyFilter.length, 'filter() count should match');

  const directAll = directClient.getAll('nodes');
  const proxyAll = await proxyClient.getAll('nodes');
  t.equal(directAll.length, proxyAll.length, 'getAll() count should match');

  const directHas = directClient.has('nodes', 'node-2');
  const proxyHas = await proxyClient.has('nodes', 'node-2');
  t.equal(directHas, proxyHas, 'has() should match');

  const directCount = directClient.count('nodes');
  const proxyCount = await proxyClient.count('nodes');
  t.equal(directCount, proxyCount, 'count() should match');
});

test('SystemCacheClient - factory returns direct and proxy variants', async (t) => {
  const writableCache = new SystemTableCache();
  seedNodes(writableCache);

  const directClient = createSystemCacheClient({
    mode: SYSTEM_CACHE_CLIENT_MODE.DIRECT,
    cache: createReadOnlyCache(writableCache),
  });
  t.ok(directClient.get('nodes', 'node-1'), 'direct factory should provide sync get()');

  const proxyClient = createSystemCacheClient({
    mode: SYSTEM_CACHE_CLIENT_MODE.PROXY,
    cache: createMockProxy({nodes: writableCache.getAll('nodes')}),
  });
  const proxyRecord = await proxyClient.get('nodes', 'node-1');
  t.ok(proxyRecord, 'proxy factory should provide async get()');
});

test('SystemCacheClient - listener behavior is explicit per backing', async (t) => {
  const writableCache = new SystemTableCache();
  seedNodes(writableCache);
  const directClient = createDirectSystemCacheClient(createReadOnlyCache(writableCache));

  let directObserved = false;
  const listener = (tableName) => {
    if (tableName === 'nodes') {
      directObserved = true;
    }
  };
  directClient.onCacheChange(listener);
  writableCache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, {
    id: 'node-3',
    node_id: 'node-3',
    status: 'active',
  });
  await new Promise((resolve) => setImmediate(resolve));
  directClient.offCacheChange(listener);
  t.equal(directObserved, true, 'direct client should surface cache-change events');

  const proxyClient = createProxySystemCacheClient(createMockProxy({nodes: []}));
  t.equal(
    proxyClient.onCacheChange(() => {}),
    null,
    'proxy client should explicitly no-op for onCacheChange()',
  );
  t.equal(
    proxyClient.offCacheChange(() => {}),
    false,
    'proxy client should explicitly no-op for offCacheChange()',
  );
});
