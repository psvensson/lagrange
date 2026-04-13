/**
 * Performance test for bootstrap response building.
 * Validates: Requirement 8.1 - Bootstrap response building performance
 * Tests that building the bootstrap response with system table snapshots
 * completes in < 100ms for a typical cluster.
 */
// @ts-nocheck


import {performance} from 'perf_hooks';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Initialize test environment with configuration and logging.
 */
function initializeTestEnvironment() {
  const configManager = ConfigurationManager.getInstance();
  if (!configManager.isInitialized()) {
    configManager.initialize({
      node: {id: 'test-seed-node'},
    });
  }

  const loggingService = LoggingService.getInstance();
  if (!loggingService.isInitialized()) {
    loggingService.initialize({level: 'error'});
  }
}

/**
 * Create a typical cluster state in the system cache.
 * Simulates a cluster with 3 nodes, 6 system tables, 18 partitions (3 replicas each).
 * @param {SystemTableCache} cache - System table cache to populate.
 */
function populateTypicalClusterState(cache) {
  const nodeCount = 3;
  const systemTables = [
    'nodes', 'partitions', 'services',
    'tables', 'message_groups', 'replica_operations',
  ];
  const replicasPerPartition = 3;

  // Add nodes
  for (let i = 0; i < nodeCount; i++) {
    const nodeId = `node-${i}`;
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      node_id: nodeId,
      node_address: `http://localhost:${8080 + i}`,
      status: SERVICE_STATUS.ACTIVE,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }

  // Add system tables metadata
  for (const tableName of systemTables) {
    cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      table_id: tableName,
      table_name: tableName,
      schema: JSON.stringify({columns: []}),
      created_at: Date.now(),
    });

    // Add partition for this table
    const partitionId = `${tableName}-partition-0`;
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: partitionId,
      table_id: tableName,
      table_name: tableName,
      partition_key_start: null,
      partition_key_end: null,
      replica_count: replicasPerPartition,
      created_at: Date.now(),
    });

    // Add replicas for this partition
    for (let r = 0; r < replicasPerPartition; r++) {
      const replicaId = `${partitionId}-r${r}`;
      const nodeId = `node-${r % nodeCount}`;
      cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        service_id: replicaId,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: nodeId,
        address: `${nodeId}/partition/${replicaId}`,
        raft_role: r === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        created_at: Date.now(),
      });
    }
  }

  // Add message groups
  cache.applySystemTableChange(TABLES.MESSAGE_GROUPS, 'INSERT', {
    group_id: 'initial-message-group',
    replica_count: replicasPerPartition,
    created_at: Date.now(),
  });
}

test('Bootstrap response building performance - typical cluster', async (t) => {
  initializeTestEnvironment();

  // Create system table cache with typical cluster state
  const cache = new SystemTableCache();
  populateTypicalClusterState(cache);

  // Create bootstrap API
  const api = new BootstrapAPI({
    seedNodeId: 'test-seed-node',
    seedNodeAddress: 'http://localhost:8080',
    wsPort: 9090,
    systemTableCache: cache,
  });

  await api.initialize(0, {listen: false});

  // Measure time to build system table snapshots
  const iterations = 10;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    const snapshots = api.buildSystemTableSnapshots();
    const endTime = performance.now();
    const duration = endTime - startTime;
    times.push(duration);

    // Verify snapshots are complete
    t.ok(snapshots, 'snapshots should exist');
    t.ok(Array.isArray(snapshots.nodes), 'nodes should be array');
    t.ok(Array.isArray(snapshots.partitions), 'partitions should be array');
    t.ok(Array.isArray(snapshots.services), 'services should be array');
    t.ok(Array.isArray(snapshots.tables), 'tables should be array');
    t.ok(Array.isArray(snapshots.message_groups), 'message_groups should be array');
    t.ok(
      Array.isArray(snapshots.replica_operations),
      'replica_operations should be array',
    );
  }

  // Calculate statistics
  const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  t.comment(`Performance statistics (${iterations} iterations):`);
  t.comment(`  Average: ${avgTime.toFixed(2)}ms`);
  t.comment(`  Min: ${minTime.toFixed(2)}ms`);
  t.comment(`  Max: ${maxTime.toFixed(2)}ms`);

  // Verify performance requirement: < 100ms
  t.ok(avgTime < 100, `average time ${avgTime.toFixed(2)}ms should be < 100ms`);
  t.ok(maxTime < 100, `max time ${maxTime.toFixed(2)}ms should be < 100ms`);

  await api.shutdown();
  t.end();
});

test('Bootstrap response building performance - large cluster', async (t) => {
  initializeTestEnvironment();

  // Create system table cache with larger cluster state
  // Simulate 10 nodes, 6 system tables, 18 partitions (3 replicas each)
  const cache = new SystemTableCache();
  const nodeCount = 10;
  const systemTables = [
    'nodes', 'partitions', 'services',
    'tables', 'message_groups', 'replica_operations',
  ];
  const replicasPerPartition = 3;

  // Add nodes
  for (let i = 0; i < nodeCount; i++) {
    const nodeId = `node-${i}`;
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      node_id: nodeId,
      node_address: `http://localhost:${8080 + i}`,
      status: SERVICE_STATUS.ACTIVE,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }

  // Add system tables and partitions
  for (const tableName of systemTables) {
    cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      table_id: tableName,
      table_name: tableName,
      schema: JSON.stringify({columns: []}),
      created_at: Date.now(),
    });

    const partitionId = `${tableName}-partition-0`;
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: partitionId,
      table_id: tableName,
      table_name: tableName,
      partition_key_start: null,
      partition_key_end: null,
      replica_count: replicasPerPartition,
      created_at: Date.now(),
    });

    for (let r = 0; r < replicasPerPartition; r++) {
      const replicaId = `${partitionId}-r${r}`;
      const nodeId = `node-${r % nodeCount}`;
      cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        service_id: replicaId,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: nodeId,
        address: `${nodeId}/partition/${replicaId}`,
        raft_role: r === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        created_at: Date.now(),
      });
    }
  }

  cache.applySystemTableChange(TABLES.MESSAGE_GROUPS, 'INSERT', {
    group_id: 'initial-message-group',
    replica_count: replicasPerPartition,
    created_at: Date.now(),
  });

  // Create bootstrap API
  const api = new BootstrapAPI({
    seedNodeId: 'test-seed-node',
    seedNodeAddress: 'http://localhost:8080',
    wsPort: 9090,
    systemTableCache: cache,
  });

  await api.initialize(0, {listen: false});

  // Measure time to build system table snapshots
  const iterations = 10;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    api.buildSystemTableSnapshots();
    const endTime = performance.now();
    const duration = endTime - startTime;
    times.push(duration);
  }

  // Calculate statistics
  const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  t.comment(`Large cluster performance (${iterations} iterations):`);
  t.comment(`  Average: ${avgTime.toFixed(2)}ms`);
  t.comment(`  Min: ${minTime.toFixed(2)}ms`);
  t.comment(`  Max: ${maxTime.toFixed(2)}ms`);

  // Verify performance requirement: < 100ms even for larger cluster
  t.ok(avgTime < 100, `average time ${avgTime.toFixed(2)}ms should be < 100ms`);
  t.ok(maxTime < 100, `max time ${maxTime.toFixed(2)}ms should be < 100ms`);

  await api.shutdown();
  t.end();
});
