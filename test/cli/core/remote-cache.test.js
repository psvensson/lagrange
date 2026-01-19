import {test} from 'tap';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';

test('RemoteCache - constructor initializes empty tables', async (t) => {
  const cache = new RemoteCache();

  t.ok(cache.tables.nodes instanceof Map, 'nodes is a Map');
  t.ok(cache.tables.services instanceof Map, 'services is a Map');
  t.ok(cache.tables.partitions instanceof Map, 'partitions is a Map');
  t.ok(cache.tables.tables instanceof Map, 'tables is a Map');
  t.ok(cache.tables.message_groups instanceof Map, 'message_groups is a Map');
  t.ok(cache.tables.indices instanceof Map, 'indices is a Map');
  t.ok(cache.tables.logs instanceof Map, 'logs is a Map');
  t.ok(cache.tables.config instanceof Map, 'config is a Map');
  t.ok(cache.tables.contexts instanceof Map, 'contexts is a Map');
  t.equal(cache.lastUpdate, null, 'lastUpdate is null');
  t.equal(cache.cdcLag, 0, 'cdcLag is 0');
});

test('RemoteCache - loadFromDump initializes cache from dump', async (t) => {
  const cache = new RemoteCache();
  const dump = {
    nodes: [
      {node_id: 'node-1', node_address: '127.0.0.1:8080', status: 'active'},
      {node_id: 'node-2', node_address: '127.0.0.1:8081', status: 'active'},
    ],
    services: [
      {service_id: 'svc-1', node_id: 'node-1', service_type: 'partition'},
    ],
    partitions: [],
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
  };

  cache.loadFromDump(dump);

  t.equal(cache.getNodes().length, 2, 'loaded 2 nodes');
  t.equal(cache.getServices().length, 1, 'loaded 1 service');
  t.equal(cache.getTables().length, 1, 'loaded 1 table');
  t.ok(cache.lastUpdate !== null, 'lastUpdate is set');
});

test('RemoteCache - applyCDCEvent INSERT adds record', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  const result = cache.applyCDCEvent({
    table: 'nodes',
    operation: 'INSERT',
    key: 'node-1',
    data: {node_id: 'node-1', status: 'active'},
    timestamp: Date.now(),
  });

  t.equal(result.applied, true, 'event was applied');
  t.equal(cache.getNodes().length, 1, 'node was added');
  t.equal(cache.getNode('node-1').status, 'active', 'node has correct status');
});

test('RemoteCache - applyCDCEvent UPDATE modifies record', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'node-1', status: 'active'}],
  });

  cache.applyCDCEvent({
    table: 'nodes',
    operation: 'UPDATE',
    key: 'node-1',
    data: {node_id: 'node-1', status: 'failed'},
    timestamp: Date.now(),
  });

  t.equal(cache.getNode('node-1').status, 'failed', 'node status was updated');
});

test('RemoteCache - applyCDCEvent DELETE removes record', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'node-1', status: 'active'}],
  });

  cache.applyCDCEvent({
    table: 'nodes',
    operation: 'DELETE',
    key: 'node-1',
    timestamp: Date.now(),
  });

  t.equal(cache.getNodes().length, 0, 'node was removed');
  t.equal(cache.getNode('node-1'), undefined, 'node is undefined');
});

test('RemoteCache - getServices filters by nodeId', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    services: [
      {service_id: 'svc-1', node_id: 'node-1', service_type: 'partition'},
      {service_id: 'svc-2', node_id: 'node-2', service_type: 'partition'},
      {service_id: 'svc-3', node_id: 'node-1', service_type: 'message_group'},
    ],
  });

  const filtered = cache.getServices({nodeId: 'node-1'});
  t.equal(filtered.length, 2, 'filtered to 2 services');
  t.ok(filtered.every((s) => s.node_id === 'node-1'), 'all have node-1');
});

test('RemoteCache - getServices filters by type', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    services: [
      {service_id: 'svc-1', node_id: 'node-1', service_type: 'partition'},
      {service_id: 'svc-2', node_id: 'node-2', service_type: 'partition'},
      {service_id: 'svc-3', node_id: 'node-1', service_type: 'message_group'},
    ],
  });

  const filtered = cache.getServices({type: 'partition'});
  t.equal(filtered.length, 2, 'filtered to 2 services');
  t.ok(filtered.every((s) => s.service_type === 'partition'), 'all partitions');
});

test('RemoteCache - getPartitions filters by tableId', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    partitions: [
      {partition_id: 'p-1', table_id: 'tbl-1'},
      {partition_id: 'p-2', table_id: 'tbl-1'},
      {partition_id: 'p-3', table_id: 'tbl-2'},
    ],
  });

  const filtered = cache.getPartitions({tableId: 'tbl-1'});
  t.equal(filtered.length, 2, 'filtered to 2 partitions');
  t.ok(filtered.every((p) => p.table_id === 'tbl-1'), 'all for tbl-1');
});

test('RemoteCache - getLogs filters by multiple criteria', async (t) => {
  const now = Date.now();
  const cache = new RemoteCache();
  cache.loadFromDump({
    logs: [
      {log_id: 'l-1', level: 'ERROR', node_id: 'n-1', timestamp: now - 1000},
      {log_id: 'l-2', level: 'INFO', node_id: 'n-1', timestamp: now - 500},
      {log_id: 'l-3', level: 'ERROR', node_id: 'n-2', timestamp: now - 200},
    ],
  });

  const byLevel = cache.getLogs({level: 'ERROR'});
  t.equal(byLevel.length, 2, 'filtered by level');

  const byNode = cache.getLogs({nodeId: 'n-1'});
  t.equal(byNode.length, 2, 'filtered by nodeId');

  const byTime = cache.getLogs({startTime: now - 600});
  t.equal(byTime.length, 2, 'filtered by startTime');
});

test('RemoteCache - getContexts filters by type and namePattern', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    contexts: [
      {context_id: 'c-1', context_type: 'function', name: 'myFunc'},
      {context_id: 'c-2', context_type: 'trigger', name: 'myTrigger'},
      {context_id: 'c-3', context_type: 'function', name: 'otherFunc'},
    ],
  });

  const byType = cache.getContexts({type: 'function'});
  t.equal(byType.length, 2, 'filtered by type');

  const byPattern = cache.getContexts({namePattern: 'my'});
  t.equal(byPattern.length, 2, 'filtered by namePattern');
});

test('RemoteCache - serialize and deserialize round-trip', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'node-1', status: 'active'}],
    services: [{service_id: 'svc-1', node_id: 'node-1'}],
    tables: [{table_id: 'tbl-1', table_name: 'users'}],
  });

  const serialized = cache.serialize();
  const newCache = new RemoteCache();
  newCache.deserialize(serialized);

  t.equal(newCache.getNodes().length, 1, 'nodes restored');
  t.equal(newCache.getServices().length, 1, 'services restored');
  t.equal(newCache.getTables().length, 1, 'tables restored');
  t.equal(newCache.getNode('node-1').status, 'active', 'node data correct');
});

test('RemoteCache - clear removes all data', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'node-1'}],
    services: [{service_id: 'svc-1'}],
  });

  cache.clear();

  t.equal(cache.getNodes().length, 0, 'nodes cleared');
  t.equal(cache.getServices().length, 0, 'services cleared');
  t.equal(cache.lastUpdate, null, 'lastUpdate cleared');
});

test('RemoteCache - getStats returns cache statistics', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({
    nodes: [{node_id: 'n-1'}, {node_id: 'n-2'}],
    services: [{service_id: 's-1'}],
  });

  const stats = cache.getStats();

  t.ok(stats.lastUpdate !== null, 'lastUpdate is set');
  t.equal(stats.tableCounts.nodes, 2, 'nodes count is 2');
  t.equal(stats.tableCounts.services, 1, 'services count is 1');
});

test('RemoteCache - isInitialized returns correct state', async (t) => {
  const cache = new RemoteCache();
  t.equal(cache.isInitialized(), false, 'not initialized initially');

  cache.loadFromDump({nodes: []});
  t.equal(cache.isInitialized(), true, 'initialized after loadFromDump');
});

test('RemoteCache - isStale checks CDC lag', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  cache.cdcLag = 1000;
  t.equal(cache.isStale(5000), false, 'not stale with low lag');

  cache.cdcLag = 10000;
  t.equal(cache.isStale(5000), true, 'stale with high lag');
});

test('RemoteCache - applyCDCEvent handles unknown table', async (t) => {
  const cache = new RemoteCache();

  const result = cache.applyCDCEvent({
    table: 'unknown_table',
    operation: 'INSERT',
    key: 'key-1',
    data: {id: 'key-1'},
  });

  t.equal(result.applied, false, 'event was not applied');
});

test('RemoteCache - applyCDCEvent handles unknown operation', async (t) => {
  const cache = new RemoteCache();
  cache.loadFromDump({nodes: []});

  const result = cache.applyCDCEvent({
    table: 'nodes',
    operation: 'UNKNOWN',
    key: 'node-1',
    data: {node_id: 'node-1'},
  });

  t.equal(result.applied, false, 'event was not applied');
});
