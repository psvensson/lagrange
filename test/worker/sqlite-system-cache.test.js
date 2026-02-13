/**
 * Unit tests for SQLiteSystemCache.
 *
 * Tests the in-memory SQLite cache for system tables used by message group replicas.
 *
 * @see Requirements 3.1, 3.2, 3.5 - Independent System Caches
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  SQLiteSystemCache,
  PRIMARY_KEY_COLUMNS,
} from '../../src/worker/sqlite-system-cache.js';
import {CDC_OPERATION} from '../../src/constants/index.js';

test('SQLiteSystemCache - initialization', async (t) => {
  const cache = new SQLiteSystemCache();

  t.equal(cache.isInitialized(), false, 'cache starts uninitialized');

  cache.initialize();

  t.equal(cache.isInitialized(), true, 'cache is initialized after initialize()');

  // Double initialization should throw
  try {
    cache.initialize();
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('already initialized'), 'throws on double init');
  }

  cache.close();
  t.equal(cache.isInitialized(), false, 'cache is uninitialized after close()');
});

test('SQLiteSystemCache - get() returns undefined for missing record', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  const result = cache.get('nodes', 'non-existent-node');
  t.equal(result, undefined, 'returns undefined for missing record');

  cache.close();
});


test('SQLiteSystemCache - applyCDCEvent INSERT and get()', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  const nodeData = {
    node_id: 'node-1',
    node_address: 'ws://localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    cpu_usage_percent: 25.5,
    memory_usage_percent: 50.0,
    disk_usage_percent: 30.0,
    status: 'active',
    ws_connection_state: 'connected',
    capabilities: '[]',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };

  cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, nodeData);

  const result = cache.get('nodes', 'node-1');
  t.ok(result, 'record was inserted');
  t.equal(result.node_id, 'node-1', 'node_id matches');
  t.equal(result.node_address, 'ws://localhost:8080', 'node_address matches');
  t.equal(result.cpu_cores, 4, 'cpu_cores matches');
  t.equal(result.status, 'active', 'status matches');

  cache.close();
});

test('SQLiteSystemCache - applyCDCEvent UPDATE', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  // Insert first
  const nodeData = {
    node_id: 'node-1',
    node_address: 'ws://localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    ws_connection_state: 'connected',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };
  cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, nodeData);

  // Update
  cache.applyCDCEvent('nodes', CDC_OPERATION.UPDATE, {
    node_id: 'node-1',
    status: 'inactive',
    cpu_usage_percent: 75.0,
  });

  const result = cache.get('nodes', 'node-1');
  t.equal(result.status, 'inactive', 'status was updated');
  t.equal(result.cpu_usage_percent, 75.0, 'cpu_usage_percent was updated');
  t.equal(result.node_address, 'ws://localhost:8080', 'other fields unchanged');

  cache.close();
});


test('SQLiteSystemCache - applyCDCEvent DELETE', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  // Insert first
  const nodeData = {
    node_id: 'node-1',
    node_address: 'ws://localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    ws_connection_state: 'connected',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };
  cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, nodeData);

  // Verify it exists
  t.ok(cache.get('nodes', 'node-1'), 'record exists before delete');

  // Delete
  cache.applyCDCEvent('nodes', CDC_OPERATION.DELETE, {node_id: 'node-1'});

  const result = cache.get('nodes', 'node-1');
  t.equal(result, undefined, 'record was deleted');

  cache.close();
});

test('SQLiteSystemCache - applyCDCEvent UPSERT', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  const nodeData = {
    node_id: 'node-1',
    node_address: 'ws://localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    ws_connection_state: 'connected',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };

  // Upsert as insert
  cache.applyCDCEvent('nodes', CDC_OPERATION.UPSERT, nodeData);
  let result = cache.get('nodes', 'node-1');
  t.ok(result, 'record was inserted via upsert');
  t.equal(result.status, 'active', 'status is active');

  // Upsert as update
  cache.applyCDCEvent('nodes', CDC_OPERATION.UPSERT, {
    ...nodeData,
    status: 'inactive',
  });
  result = cache.get('nodes', 'node-1');
  t.equal(result.status, 'inactive', 'status was updated via upsert');

  cache.close();
});


test('SQLiteSystemCache - query() with SQL', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  // Insert multiple nodes
  const now = Date.now();
  const nodes = [
    {
      node_id: 'node-1', node_address: 'ws://host1:8080', cpu_cores: 4,
      memory_mb: 8192, disk_gb: 100, status: 'active',
      ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
    },
    {
      node_id: 'node-2', node_address: 'ws://host2:8080', cpu_cores: 8,
      memory_mb: 16384, disk_gb: 200, status: 'active',
      ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
    },
    {
      node_id: 'node-3', node_address: 'ws://host3:8080', cpu_cores: 2,
      memory_mb: 4096, disk_gb: 50, status: 'inactive',
      ws_connection_state: 'disconnected', last_heartbeat: now, created_at: now,
    },
  ];

  for (const node of nodes) {
    cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, node);
  }

  // Query all active nodes
  const activeNodes = cache.query(
    'SELECT * FROM nodes WHERE status = ?',
    ['active'],
  );
  t.equal(activeNodes.length, 2, 'found 2 active nodes');

  // Query with multiple conditions
  const highMemNodes = cache.query(
    'SELECT node_id, memory_mb FROM nodes WHERE memory_mb > ? AND status = ?',
    [8000, 'active'],
  );
  t.equal(highMemNodes.length, 2, 'found 2 high memory active nodes');

  // Query with ORDER BY
  const orderedNodes = cache.query(
    'SELECT node_id FROM nodes ORDER BY cpu_cores DESC',
  );
  t.equal(orderedNodes[0].node_id, 'node-2', 'node-2 has most cores');

  cache.close();
});

test('SQLiteSystemCache - filter() with predicate', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  const now = Date.now();
  const nodes = [
    {
      node_id: 'node-1', node_address: 'ws://host1:8080', cpu_cores: 4,
      memory_mb: 8192, disk_gb: 100, status: 'active',
      ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
    },
    {
      node_id: 'node-2', node_address: 'ws://host2:8080', cpu_cores: 8,
      memory_mb: 16384, disk_gb: 200, status: 'active',
      ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
    },
  ];

  for (const node of nodes) {
    cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, node);
  }

  const filtered = cache.filter('nodes', (node) => node.cpu_cores > 4);
  t.equal(filtered.length, 1, 'found 1 node with > 4 cores');
  t.equal(filtered[0].node_id, 'node-2', 'correct node filtered');

  cache.close();
});


test('SQLiteSystemCache - getAll()', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  // Initially empty
  let allNodes = cache.getAll('nodes');
  t.equal(allNodes.length, 0, 'no nodes initially');

  // Insert some nodes
  const now = Date.now();
  cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, {
    node_id: 'node-1', node_address: 'ws://host1:8080', cpu_cores: 4,
    memory_mb: 8192, disk_gb: 100, status: 'active',
    ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
  });
  cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, {
    node_id: 'node-2', node_address: 'ws://host2:8080', cpu_cores: 8,
    memory_mb: 16384, disk_gb: 200, status: 'active',
    ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
  });

  allNodes = cache.getAll('nodes');
  t.equal(allNodes.length, 2, 'found 2 nodes');

  cache.close();
});

test('SQLiteSystemCache - getReplicationState() and applyReplicationState()', async (t) => {
  // Create source cache with data
  const sourceCache = new SQLiteSystemCache();
  sourceCache.initialize();

  const now = Date.now();
  sourceCache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, {
    node_id: 'node-1', node_address: 'ws://host1:8080', cpu_cores: 4,
    memory_mb: 8192, disk_gb: 100, status: 'active',
    ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
  });
  sourceCache.applyCDCEvent('partitions', CDC_OPERATION.INSERT, {
    partition_id: 'part-1', table_id: 'table-1', replica_count: 3,
    state: 'normal', created_at: now, updated_at: now,
  });

  // Get replication state
  const state = sourceCache.getReplicationState();
  t.ok(state, 'got replication state');
  t.ok(state.nodes, 'state has nodes');
  t.ok(state.partitions, 'state has partitions');
  t.equal(state.nodes.length, 1, 'state has 1 node');
  t.equal(state.partitions.length, 1, 'state has 1 partition');

  // Create target cache and apply state
  const targetCache = new SQLiteSystemCache();
  targetCache.initialize();

  // Verify target is empty
  t.equal(targetCache.getAll('nodes').length, 0, 'target has no nodes initially');

  // Apply replication state
  targetCache.applyReplicationState(state);

  // Verify data was replicated
  const replicatedNodes = targetCache.getAll('nodes');
  t.equal(replicatedNodes.length, 1, 'target has 1 node after replication');
  t.equal(replicatedNodes[0].node_id, 'node-1', 'node_id matches');

  const replicatedPartitions = targetCache.getAll('partitions');
  t.equal(replicatedPartitions.length, 1, 'target has 1 partition');
  t.equal(replicatedPartitions[0].partition_id, 'part-1', 'partition_id matches');

  sourceCache.close();
  targetCache.close();
});


test('SQLiteSystemCache - applyReplicationState() clears existing data', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  const now = Date.now();

  // Insert initial data
  cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, {
    node_id: 'old-node', node_address: 'ws://old:8080', cpu_cores: 2,
    memory_mb: 4096, disk_gb: 50, status: 'active',
    ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
  });

  t.equal(cache.getAll('nodes').length, 1, 'has 1 node initially');

  // Apply new state with different data
  const newState = {
    nodes: [{
      node_id: 'new-node', node_address: 'ws://new:8080', cpu_cores: 8,
      memory_mb: 16384, disk_gb: 200, status: 'active',
      ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
    }],
    partitions: [],
    tables: [],
    services: [],
    indices: [],
    message_groups: [],
    logs: [],
    config: [],
    live_queries: [],
    contexts: [],
    code: [],
    replica_operations: [],
    node_endpoints: [],
  };

  cache.applyReplicationState(newState);

  const nodes = cache.getAll('nodes');
  t.equal(nodes.length, 1, 'still has 1 node');
  t.equal(nodes[0].node_id, 'new-node', 'old data was replaced');

  cache.close();
});

test('SQLiteSystemCache - getStats()', async (t) => {
  const cache = new SQLiteSystemCache();

  // Stats before initialization
  let stats = cache.getStats();
  t.equal(stats.initialized, false, 'shows not initialized');
  t.equal(stats.tableCount, 0, 'no tables');
  t.equal(stats.totalRecords, 0, 'no records');

  cache.initialize();

  stats = cache.getStats();
  t.equal(stats.initialized, true, 'shows initialized');
  t.equal(
    stats.tableCount,
    Object.keys(PRIMARY_KEY_COLUMNS).length,
    'has all primary-key mapped system tables',
  );
  t.equal(stats.totalRecords, 0, 'no records yet');

  // Insert some data
  const now = Date.now();
  cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, {
    node_id: 'node-1', node_address: 'ws://host1:8080', cpu_cores: 4,
    memory_mb: 8192, disk_gb: 100, status: 'active',
    ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
  });

  stats = cache.getStats();
  t.equal(stats.totalRecords, 1, 'has 1 record');
  t.equal(stats.tableCounts.nodes, 1, 'nodes table has 1 record');

  cache.close();
});


test('SQLiteSystemCache - error handling: unknown table', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  try {
    cache.get('unknown_table', 'key');
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('Unknown system table'), 'throws for unknown table');
  }

  try {
    cache.getAll('unknown_table');
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('Unknown system table'), 'throws for unknown table');
  }

  try {
    cache.filter('unknown_table', () => true);
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('Unknown system table'), 'throws for unknown table');
  }

  cache.close();
});

test('SQLiteSystemCache - error handling: unknown CDC operation', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  try {
    cache.applyCDCEvent('nodes', 'INVALID_OP', {node_id: 'node-1'});
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('Unknown CDC operation'), 'throws for unknown op');
  }

  cache.close();
});

test('SQLiteSystemCache - error handling: invalid data', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  try {
    cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, null);
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('Invalid data'), 'throws for null data');
  }

  try {
    cache.applyCDCEvent('nodes', CDC_OPERATION.UPDATE, {});
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('Invalid data'), 'throws for missing pk in update');
  }

  try {
    cache.applyCDCEvent('nodes', CDC_OPERATION.DELETE, {});
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('Invalid data'), 'throws for missing pk in delete');
  }

  cache.close();
});

test('SQLiteSystemCache - error handling: not initialized', async (t) => {
  const cache = new SQLiteSystemCache();

  try {
    cache.get('nodes', 'node-1');
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'throws when not initialized');
  }

  try {
    cache.query('SELECT * FROM nodes');
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'throws when not initialized');
  }

  try {
    cache.applyCDCEvent('nodes', CDC_OPERATION.INSERT, {node_id: 'node-1'});
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.includes('not initialized'), 'throws when not initialized');
  }
});


test('SQLiteSystemCache - supports all system tables', async (t) => {
  const cache = new SQLiteSystemCache();
  cache.initialize();

  const now = Date.now();

  // Test each system table
  const testData = {
    tables: {
      table_id: 'tbl-1', table_name: 'test_table', schema_definition: '{}',
      partition_key: 'id', partition_count: 1, created_at: now, updated_at: now,
    },
    partitions: {
      partition_id: 'part-1', table_id: 'tbl-1', replica_count: 3,
      state: 'normal', created_at: now, updated_at: now,
    },
    indices: {
      index_id: 'idx-1', table_id: 'tbl-1', index_name: 'idx_test',
      column_names: '["col1"]', created_at: now,
    },
    message_groups: {
      group_id: 'mg-1', group_name: 'test_group', replica_count: 3,
      created_at: now, updated_at: now,
    },
    nodes: {
      node_id: 'node-1', node_address: 'ws://host:8080', cpu_cores: 4,
      memory_mb: 8192, disk_gb: 100, status: 'active',
      ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
    },
    services: {
      service_id: 'svc-1', service_type: 'partition', node_id: 'node-1',
      status: 'active', created_at: now, updated_at: now,
    },
    node_endpoints: {
      endpoint_id: 'ep-1', node_id: 'node-1', transport_type: 'websocket',
      address: 'ws://host:8080', priority: 0, created_at: now, updated_at: now,
    },
    replica_operations: {
      operation_id: 'op-1', type: 'ADD', partition_id: 'part-1',
      entity_type: 'partition', entity_id: 'part-1',
      source_node_id: 'node-1', target_node_id: 'node-2', status: 'pending',
      workflow_step: 'init', steps_history: '[]', created_at: now, updated_at: now,
    },
  };

  // Insert and verify each table
  for (const [tableName, data] of Object.entries(testData)) {
    cache.applyCDCEvent(tableName, CDC_OPERATION.INSERT, data);
    const pkColumn = PRIMARY_KEY_COLUMNS[tableName];
    const result = cache.get(tableName, data[pkColumn]);
    t.ok(result, `${tableName}: record was inserted`);
    t.equal(result[pkColumn], data[pkColumn], `${tableName}: pk matches`);
  }

  cache.close();
});

test('SQLiteSystemCache - cache isolation (multiple instances)', async (t) => {
  // Create two separate cache instances
  const cache1 = new SQLiteSystemCache();
  const cache2 = new SQLiteSystemCache();

  cache1.initialize();
  cache2.initialize();

  const now = Date.now();

  // Insert data into cache1 only
  cache1.applyCDCEvent('nodes', CDC_OPERATION.INSERT, {
    node_id: 'node-1', node_address: 'ws://host1:8080', cpu_cores: 4,
    memory_mb: 8192, disk_gb: 100, status: 'active',
    ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
  });

  // Verify cache1 has the data
  t.ok(cache1.get('nodes', 'node-1'), 'cache1 has the node');

  // Verify cache2 does NOT have the data (isolation)
  t.equal(cache2.get('nodes', 'node-1'), undefined, 'cache2 does not have the node');

  // Insert different data into cache2
  cache2.applyCDCEvent('nodes', CDC_OPERATION.INSERT, {
    node_id: 'node-2', node_address: 'ws://host2:8080', cpu_cores: 8,
    memory_mb: 16384, disk_gb: 200, status: 'active',
    ws_connection_state: 'connected', last_heartbeat: now, created_at: now,
  });

  // Verify each cache has only its own data
  t.ok(cache1.get('nodes', 'node-1'), 'cache1 still has node-1');
  t.equal(cache1.get('nodes', 'node-2'), undefined, 'cache1 does not have node-2');
  t.equal(cache2.get('nodes', 'node-1'), undefined, 'cache2 does not have node-1');
  t.ok(cache2.get('nodes', 'node-2'), 'cache2 has node-2');

  cache1.close();
  cache2.close();
});
