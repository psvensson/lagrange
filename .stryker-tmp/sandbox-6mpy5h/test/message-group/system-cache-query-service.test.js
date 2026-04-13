/**
 * Unit tests for SystemCacheQueryService.
 * Requirements: 4.5, 4.8
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {SystemCacheQueryService} from '../../src/message-group/system-cache-query-service.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';

// Port counter for unique ports per test
let testPortCounter = 26000;

let messageGroup;
let router;

beforeEach(async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});

  // Create real WebSocket transport
  const port = testPortCounter++;
  const nodeId = `test-node-${port}`;
  router = new MessageRouter({nodeId, wsPort: port});
  await router.initialize({startServer: true});

  // Create and initialize a message group for testing
  messageGroup = new MessageGroupService({
    groupId: 'mg-1',
    replicaId: 'mg-1-r1',
    nodeId,
    replicaIds: ['mg-1-r1'],
    transport: router,
  });
  await messageGroup.initialize();

  // Subscribe to system tables and add test data
  await messageGroup.subscribeToCDC('nodes');
  await messageGroup.subscribeToCDC('partitions');
  await messageGroup.subscribeToCDC('tables');
  await messageGroup.subscribeToCDC('services');
  await messageGroup.subscribeToCDC('message_groups');
  await messageGroup.subscribeToCDC('indices');

  // Add test data
  await messageGroup.applyCDCEvent('nodes', 'INSERT', {
    id: 'node-1',
    address: '127.0.0.1:8080',
    status: 'active',
  });
  await messageGroup.applyCDCEvent('nodes', 'INSERT', {
    id: 'node-2',
    address: '127.0.0.1:8081',
    status: 'inactive',
  });
  await messageGroup.applyCDCEvent('partitions', 'INSERT', {
    id: 'partition-1',
    tableId: 'table-1',
    status: 'active',
  });
  await messageGroup.applyCDCEvent('tables', 'INSERT', {
    id: 'table-1',
    name: 'users',
  });
});

afterEach(async () => {
  if (messageGroup) {
    await messageGroup.shutdown();
  }
  if (router) {
    await router.shutdown();
  }
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('SystemCacheQueryService - constructor creates service', async (t) => {
  const queryService = new SystemCacheQueryService();

  t.ok(queryService, 'Should create service');
  t.equal(queryService.queryCount, 0, 'Should have zero queries');
});

test('SystemCacheQueryService - registerMessageGroup adds replica', async (t) => {
  const queryService = new SystemCacheQueryService();

  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const stats = queryService.getStats();
  t.equal(stats.registeredReplicas, 1, 'Should have 1 registered replica');
});

test('SystemCacheQueryService - unregisterMessageGroup removes replica', async (t) => {
  const queryService = new SystemCacheQueryService();

  queryService.registerMessageGroup('mg-1-r1', messageGroup);
  queryService.unregisterMessageGroup('mg-1-r1');

  const stats = queryService.getStats();
  t.equal(stats.registeredReplicas, 0, 'Should have 0 registered replicas');
});

test('SystemCacheQueryService - querySystemCache routes to replica', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const result = await queryService.querySystemCache('nodes', {key: 'node-1'});

  t.ok(result, 'Should return result');
  t.equal(result.id, 'node-1', 'Should return correct record');
  t.equal(result.status, 'active', 'Should have correct status');
});

test('SystemCacheQueryService - throws when no replica available', async (t) => {
  const queryService = new SystemCacheQueryService();

  await t.rejects(
    queryService.querySystemCache('nodes', {key: 'node-1'}),
    /No active local message group replica/,
    'Should throw when no replica',
  );
});

test('SystemCacheQueryService - get returns record by key', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const result = await queryService.get('nodes', 'node-1');

  t.ok(result, 'Should return result');
  t.equal(result.id, 'node-1', 'Should return correct record');
});

test('SystemCacheQueryService - get returns undefined for missing key', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const result = await queryService.get('nodes', 'nonexistent');

  t.equal(result, undefined, 'Should return undefined');
});

test('SystemCacheQueryService - find returns first match', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const result = await queryService.find('nodes', (n) => n.status === 'active');

  t.ok(result, 'Should return result');
  t.equal(result.status, 'active', 'Should match predicate');
});

test('SystemCacheQueryService - filter returns all matches', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const results = await queryService.filter('nodes', (n) => n.status === 'active');

  t.equal(results.length, 1, 'Should return 1 match');
  t.equal(results[0].id, 'node-1', 'Should return correct record');
});

test('SystemCacheQueryService - getAll returns all records', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const results = await queryService.getAll('nodes');

  t.equal(results.length, 2, 'Should return all records');
});

test('SystemCacheQueryService - has returns true for existing key', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const exists = await queryService.has('nodes', 'node-1');

  t.equal(exists, true, 'Should return true');
});

test('SystemCacheQueryService - has returns false for missing key', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const exists = await queryService.has('nodes', 'nonexistent');

  t.equal(exists, false, 'Should return false');
});

test('SystemCacheQueryService - count returns record count', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const count = await queryService.count('nodes');

  t.equal(count, 2, 'Should return correct count');
});

test('SystemCacheQueryService - getNodes returns nodes', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const allNodes = await queryService.getNodes();
  t.equal(allNodes.length, 2, 'Should return all nodes');

  const byId = await queryService.getNodes({nodeId: 'node-1'});
  t.equal(byId.length, 1, 'Should filter by nodeId');

  const byStatus = await queryService.getNodes({status: 'active'});
  t.equal(byStatus.length, 1, 'Should filter by status');
});

test('SystemCacheQueryService - getPartitions returns partitions', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const allPartitions = await queryService.getPartitions();
  t.equal(allPartitions.length, 1, 'Should return all partitions');

  const byId = await queryService.getPartitions({partitionId: 'partition-1'});
  t.equal(byId.length, 1, 'Should filter by partitionId');

  const byTable = await queryService.getPartitions({tableId: 'table-1'});
  t.equal(byTable.length, 1, 'Should filter by tableId');
});

test('SystemCacheQueryService - getTables returns tables', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  const allTables = await queryService.getTables();
  t.equal(allTables.length, 1, 'Should return all tables');

  const byId = await queryService.getTables({tableId: 'table-1'});
  t.equal(byId.length, 1, 'Should filter by tableId');

  const byName = await queryService.getTables({tableName: 'users'});
  t.equal(byName.length, 1, 'Should filter by tableName');
});

test('SystemCacheQueryService - getStats returns statistics', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  await queryService.get('nodes', 'node-1');
  await queryService.get('nodes', 'node-2');

  const stats = queryService.getStats();

  t.equal(stats.queryCount, 2, 'Should count queries');
  t.equal(stats.cacheHits, 2, 'Should count hits');
  t.equal(stats.cacheMisses, 0, 'Should have no misses');
  t.ok(stats.hitRate, 'Should have hit rate');
});

test('SystemCacheQueryService - resetStats clears statistics', async (t) => {
  const queryService = new SystemCacheQueryService();
  queryService.registerMessageGroup('mg-1-r1', messageGroup);

  await queryService.get('nodes', 'node-1');
  queryService.resetStats();

  const stats = queryService.getStats();
  t.equal(stats.queryCount, 0, 'Should reset query count');
  t.equal(stats.cacheHits, 0, 'Should reset hits');
});

test('SystemCacheQueryService - uses getLocalReplica function', async (t) => {
  const queryService = new SystemCacheQueryService({
    getLocalReplica: () => messageGroup,
  });

  const result = await queryService.get('nodes', 'node-1');

  t.ok(result, 'Should use provided function');
  t.equal(result.id, 'node-1', 'Should return correct record');
});
