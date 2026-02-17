/**
 * Performance test for system cache hydration from bootstrap response.
 * Validates: Requirement 8.2 - Cache hydration performance
 * Tests that hydrating the system cache from bootstrap response snapshots
 * completes in < 50ms for a typical cluster.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {performance} from 'node:perf_hooks';

/**
 * Initialize test environment with configuration and logging.
 */
function initializeTestEnvironment() {
  const configManager = ConfigurationManager.getInstance();
  if (!configManager.isInitialized()) {
    configManager.initialize({
      node: {id: 'test-joining-node'},
    });
  }

  const loggingService = LoggingService.getInstance();
  if (!loggingService.isInitialized()) {
    loggingService.initialize({level: 'error'});
  }
}

/**
 * Create a typical cluster bootstrap response with system table snapshots.
 * Simulates a cluster with 3 nodes, 6 system tables, 18 partitions.
 * @return {Object} Bootstrap response with system table snapshots.
 */
function createTypicalBootstrapResponse() {
  const nodeCount = 3;
  const systemTables = [
    'nodes', 'partitions', 'services',
    'tables', 'message_groups', 'replica_operations',
  ];
  const replicasPerPartition = 3;

  const snapshots = {
    nodes: [],
    partitions: [],
    services: [],
    tables: [],
    message_groups: [],
    replica_operations: [],
  };

  // Add nodes
  for (let i = 0; i < nodeCount; i++) {
    const nodeId = `node-${i}`;
    snapshots.nodes.push({
      node_id: nodeId,
      node_address: `http://localhost:${8080 + i}`,
      status: SERVICE_STATUS.ACTIVE,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }

  // Add system tables metadata and partitions
  for (const tableName of systemTables) {
    snapshots.tables.push({
      table_id: tableName,
      table_name: tableName,
      schema: JSON.stringify({columns: []}),
      created_at: Date.now(),
    });

    // Add partition for this table
    const partitionId = `${tableName}-partition-0`;
    snapshots.partitions.push({
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
      snapshots.services.push({
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
  snapshots.message_groups.push({
    group_id: 'initial-message-group',
    replica_count: replicasPerPartition,
    created_at: Date.now(),
  });

  return {
    success: true,
    seedNodeId: 'seed-node',
    seedNodeAddress: 'http://localhost:8080',
    systemTableSnapshots: snapshots,
  };
}

/**
 * Create a large cluster bootstrap response with system table snapshots.
 * Simulates a cluster with 10 nodes, 6 system tables, 18 partitions.
 * @return {Object} Bootstrap response with system table snapshots.
 */
function createLargeBootstrapResponse() {
  const nodeCount = 10;
  const systemTables = [
    'nodes', 'partitions', 'services',
    'tables', 'message_groups', 'replica_operations',
  ];
  const replicasPerPartition = 3;

  const snapshots = {
    nodes: [],
    partitions: [],
    services: [],
    tables: [],
    message_groups: [],
    replica_operations: [],
  };

  // Add nodes
  for (let i = 0; i < nodeCount; i++) {
    const nodeId = `node-${i}`;
    snapshots.nodes.push({
      node_id: nodeId,
      node_address: `http://localhost:${8080 + i}`,
      status: SERVICE_STATUS.ACTIVE,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }

  // Add system tables metadata and partitions
  for (const tableName of systemTables) {
    snapshots.tables.push({
      table_id: tableName,
      table_name: tableName,
      schema: JSON.stringify({columns: []}),
      created_at: Date.now(),
    });

    const partitionId = `${tableName}-partition-0`;
    snapshots.partitions.push({
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
      snapshots.services.push({
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

  snapshots.message_groups.push({
    group_id: 'initial-message-group',
    replica_count: replicasPerPartition,
    created_at: Date.now(),
  });

  return {
    success: true,
    seedNodeId: 'seed-node',
    seedNodeAddress: 'http://localhost:8080',
    systemTableSnapshots: snapshots,
  };
}

test('Cache hydration performance - typical cluster', async (t) => {
  initializeTestEnvironment();

  // Create bootstrap response with typical cluster state
  const bootstrapResponse = createTypicalBootstrapResponse();

  // Measure time to hydrate cache
  const iterations = 10;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    // Create fresh node service and cache for each iteration
    const nodeService = NodeService.getInstance();
    if (nodeService.isInitialized()) {
      await nodeService.shutdown();
    }

    const nodeId = `test-joining-node-${i}`;
    const nodeAddress = `http://localhost:${9000 + i}`;

    nodeService.initialize({
      nodeId,
      nodeAddress,
    });

    // Create joining service
    const joiningService = new NodeJoiningService({
      nodeId,
      nodeAddress,
      seedNodeAddress: 'http://localhost:8080',
    });

    // Set bootstrap response
    joiningService.bootstrapResponse = bootstrapResponse;

    // Measure hydration time
    const startTime = performance.now();
    await joiningService.hydrateSystemCacheFromBootstrap();
    const endTime = performance.now();
    const duration = endTime - startTime;
    times.push(duration);

    // Verify cache was hydrated
    const cache = nodeService.getSystemTableCache();
    t.ok(cache, 'cache should exist');

    const nodes = cache.getAll(TABLES.NODES);
    t.ok(Array.isArray(nodes), 'nodes should be array');
    t.equal(nodes.length, 3, 'should have 3 nodes');

    // Cleanup
    await nodeService.shutdown();
  }

  // Calculate statistics
  const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  t.comment(`Performance statistics (${iterations} iterations):`);
  t.comment(`  Average: ${avgTime.toFixed(2)}ms`);
  t.comment(`  Min: ${minTime.toFixed(2)}ms`);
  t.comment(`  Max: ${maxTime.toFixed(2)}ms`);

  // Verify performance requirement: < 50ms
  t.ok(avgTime < 50, `average time ${avgTime.toFixed(2)}ms should be < 50ms`);
  t.ok(maxTime < 50, `max time ${maxTime.toFixed(2)}ms should be < 50ms`);

  t.end();
});

test('Cache hydration performance - large cluster', async (t) => {
  initializeTestEnvironment();

  // Create bootstrap response with large cluster state
  const bootstrapResponse = createLargeBootstrapResponse();

  // Measure time to hydrate cache
  const iterations = 10;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    // Create fresh node service and cache for each iteration
    const nodeService = NodeService.getInstance();
    if (nodeService.isInitialized()) {
      await nodeService.shutdown();
    }

    const nodeId = `test-joining-node-${i}`;
    const nodeAddress = `http://localhost:${9000 + i}`;

    nodeService.initialize({
      nodeId,
      nodeAddress,
    });

    // Create joining service
    const joiningService = new NodeJoiningService({
      nodeId,
      nodeAddress,
      seedNodeAddress: 'http://localhost:8080',
    });

    // Set bootstrap response
    joiningService.bootstrapResponse = bootstrapResponse;

    // Measure hydration time
    const startTime = performance.now();
    await joiningService.hydrateSystemCacheFromBootstrap();
    const endTime = performance.now();
    const duration = endTime - startTime;
    times.push(duration);

    // Verify cache was hydrated
    const cache = nodeService.getSystemTableCache();
    t.ok(cache, 'cache should exist');

    const nodes = cache.getAll(TABLES.NODES);
    t.ok(Array.isArray(nodes), 'nodes should be array');
    t.equal(nodes.length, 10, 'should have 10 nodes');

    // Cleanup
    await nodeService.shutdown();
  }

  // Calculate statistics
  const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  t.comment(`Large cluster performance (${iterations} iterations):`);
  t.comment(`  Average: ${avgTime.toFixed(2)}ms`);
  t.comment(`  Min: ${minTime.toFixed(2)}ms`);
  t.comment(`  Max: ${maxTime.toFixed(2)}ms`);

  // Verify performance requirement: < 50ms even for larger cluster
  t.ok(avgTime < 50, `average time ${avgTime.toFixed(2)}ms should be < 50ms`);
  t.ok(maxTime < 50, `max time ${maxTime.toFixed(2)}ms should be < 50ms`);

  t.end();
});
