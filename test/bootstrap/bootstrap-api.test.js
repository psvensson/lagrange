/**
 * Tests for Bootstrap API.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {BOOTSTRAP_API_ERROR} from '../../src/bootstrap/bootstrap-api-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CACHE_SYSTEM_TABLES} from '../../src/cache/cache-constants.js';
import {SERVICE_TYPE, STATE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createEmptySystemTableCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

test('BootstrapAPI - initialization', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
  });

  t.equal(api.isInitialized(), false, 'should not be initialized before init');

  // Initialize on random port
  await api.initialize(0, {listen: false});

  t.equal(api.isInitialized(), true, 'should be initialized after init');
  t.ok(api.getFastify(), 'should have fastify instance');

  await api.shutdown();
  t.equal(api.isInitialized(), false, 'should not be initialized after shutdown');
});

test('BootstrapAPI - health endpoint', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/health',
  });

  t.equal(response.statusCode, 200, 'should return 200');
  const body = JSON.parse(response.body);
  t.equal(body.status, 'healthy', 'should return healthy status');
  t.equal(body.nodeId, 'seed-node-1', 'should return seed node ID');

  await api.shutdown();
});

test('BootstrapAPI - bootstrap validation', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
  });

  await api.initialize(0, {listen: false});

  // Test missing nodeId
  let response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for missing nodeId');
  let body = JSON.parse(response.body);
  t.ok(body.error.includes('nodeId'), 'error should mention nodeId');

  // Test invalid nodeId
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: 'invalid-uuid', nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for invalid nodeId');
  body = JSON.parse(response.body);
  t.ok(body.error.includes('UUID'), 'error should mention UUID');

  // Test missing nodeAddress
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: '550e8400-e29b-41d4-a716-446655440000'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for missing nodeAddress');
  body = JSON.parse(response.body);
  t.ok(body.error.includes('nodeAddress'), 'error should mention nodeAddress');

  await api.shutdown();
});

test('BootstrapAPI - bootstrap conflict detection', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache that tracks registered nodes
  const registeredNodes = new Map();
  const mockSystemTableCache = {
    get(tableName, key) {
      if (tableName === 'nodes') {
        return registeredNodes.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === 'nodes') {
        return Array.from(registeredNodes.values());
      }
      return [];
    },
    getReadyNodes() {
      return [];
    },
    // Helper to simulate node registration (via CDC in production)
    _registerNode(nodeId, nodeAddress) {
      registeredNodes.set(nodeId, {node_id: nodeId, node_address: nodeAddress});
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  // First bootstrap should succeed
  const nodeId = '550e8400-e29b-41d4-a716-446655440000';
  let response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'first bootstrap should succeed');

  // Simulate the node being registered via CDC (in production this happens via system table)
  mockSystemTableCache._registerNode(nodeId, 'ws://localhost:9090');

  // Second bootstrap with same nodeId should fail
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9091'},
  });

  t.equal(response.statusCode, 409, 'duplicate nodeId should return 409');
  const body = JSON.parse(response.body);
  t.ok(body.error.includes('already registered'), 'error should mention already registered');

  // Bootstrap with seed node ID should fail
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: 'seed-node-1',
      nodeAddress: 'ws://localhost:9092',
    },
  });

  // seed-node-1 is not a valid UUID, so it should fail validation first
  t.equal(response.statusCode, 400, 'seed node ID should fail validation');

  await api.shutdown();
});

test('BootstrapAPI - blocks bootstrap until raft leaders are ready', async (t) => {
  initializeTestEnvironment();

  const mockSystemTableCache = {
    getAll(tableName) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'partition-1',
          table_name: 'nodes',
        }];
      }
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{
          group_id: 'mg-1',
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [{
          service_id: 'svc-1',
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: 'partition-1',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: STATE.ACTIVE,
        }];
      }
      return [];
    },
    get() {
      return null;
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: '550e8400-e29b-41d4-a716-446655440000',
      nodeAddress: 'ws://localhost:9090',
    },
  });

  t.equal(response.statusCode, 503, 'should return 503 when leaders are missing');
  const body = JSON.parse(response.body);
  t.equal(body.error, BOOTSTRAP_API_ERROR.RAFT_LEADERS_NOT_READY, 'should return error');
  t.equal(body.missingPartitionLeaders[0], 'partition-1', 'should report missing leader');
  t.equal(body.missingMessageGroupLeaders[0], 'mg-1', 'should report missing group leader');

  await api.shutdown();
});

test('BootstrapAPI - successful bootstrap with CREATE_SELF_HOSTED', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
    systemTableCache: createEmptySystemTableCache(),
  });

  await api.initialize(0, {listen: false});

  const nodeId = '550e8400-e29b-41d4-a716-446655440001';
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'bootstrap should succeed');

  const body = JSON.parse(response.body);
  t.equal(body.success, true, 'should return success');
  t.equal(body.seedNodeId, 'seed-node-1', 'should return seed node ID');
  t.ok(body.messageGroupAssignment, 'should have message group assignment');
  t.equal(
    body.messageGroupAssignment.strategy,
    BootstrapStrategy.CREATE_SELF_HOSTED,
    'should use CREATE_SELF_HOSTED strategy when no movable replicas',
  );
  t.equal(body.messageGroupAssignment.replicaCount, 3, 'should have 3 replicas');
  t.ok(body.clusterConfig, 'should have cluster config');
  t.ok(body.timestamp, 'should have timestamp');

  await api.shutdown();
});

test('BootstrapAPI - bootstrap with MOVE_REPLICA strategy', async (t) => {
  initializeTestEnvironment();

  // Create mock message group services (live services) for MOVE_REPLICA assignment
  // When messageGroupServices is provided, getMessageGroups() uses it instead of cache
  const mockMessageGroupServices = new Map();
  mockMessageGroupServices.set('mg-1-r1', {
    groupId: 'mg-1',
    replicaId: 'mg-1-r1',
    nodeId: 'seed-node-1',
    unifiedAddress: 'seed-node-1/message-group/mg-1-r1',
  });
  mockMessageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    replicaId: 'mg-1-r2',
    nodeId: 'seed-node-1',
    unifiedAddress: 'seed-node-1/message-group/mg-1-r2',
  });
  mockMessageGroupServices.set('mg-1-r3', {
    groupId: 'mg-1',
    replicaId: 'mg-1-r3',
    nodeId: 'seed-node-1',
    unifiedAddress: 'seed-node-1/message-group/mg-1-r3',
  });

  // Empty system table cache - no partitions or message_groups to check for leaders
  const mockSystemTableCache = {
    data: {
      message_groups: [],
      services: [],
      nodes: [],
      partitions: [],
    },
    getAll(table) {
      return this.data[table] || [];
    },
    get(table, id) {
      const items = this.data[table] || [];
      return items.find((item) => item[`${table.slice(0, -1)}_id`] === id);
    },
    filter(table, predicate) {
      return (this.data[table] || []).filter(predicate);
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
    messageGroupServices: mockMessageGroupServices,
  });

  await api.initialize(0, {listen: false});

  const nodeId = '550e8400-e29b-41d4-a716-446655440002';
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'bootstrap should succeed');

  const body = JSON.parse(response.body);
  t.equal(body.success, true, 'should return success');
  t.ok(body.messageGroupAssignment, 'should have message group assignment');
  t.equal(
    body.messageGroupAssignment.strategy,
    BootstrapStrategy.MOVE_REPLICA,
    'should use MOVE_REPLICA strategy when movable replicas exist',
  );
  t.equal(body.messageGroupAssignment.groupId, 'mg-1', 'should target existing group');
  t.equal(
    body.messageGroupAssignment.sourceNodeId,
    'seed-node-1',
    'should identify source node',
  );
  t.ok(body.messageGroupAssignment.replicaToMove, 'should identify replica to move');
  t.ok(body.messageGroupAssignment.replicaAddresses, 'should have replica addresses');

  await api.shutdown();
});

test('BootstrapAPI - cluster state endpoint', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache that tracks registered nodes
  const registeredNodes = new Map();
  const mockSystemTableCache = {
    get(tableName, key) {
      if (tableName === 'nodes') {
        return registeredNodes.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === 'nodes') {
        return Array.from(registeredNodes.values());
      }
      return [];
    },
    getReadyNodes() {
      return [];
    },
    // Helper to simulate node registration (via CDC in production)
    _registerNode(nodeId, nodeAddress) {
      registeredNodes.set(nodeId, {node_id: nodeId, node_address: nodeAddress});
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  // Bootstrap a node first
  const nodeId = '550e8400-e29b-41d4-a716-446655440003';
  await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  // Simulate the node being registered via CDC
  mockSystemTableCache._registerNode(nodeId, 'ws://localhost:9090');

  // Get cluster state
  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/cluster/state',
  });

  t.equal(response.statusCode, 200, 'should return 200');

  const body = JSON.parse(response.body);
  t.equal(body.seedNodeId, 'seed-node-1', 'should return seed node ID');
  t.equal(body.nodeCount, 2, 'should have 2 nodes (seed + new)');
  t.ok(Array.isArray(body.nodes), 'should have nodes array');
  t.ok(body.nodes.find((n) => n.isSeed), 'should have seed node');
  t.ok(body.nodes.find((n) => n.nodeId === nodeId), 'should have new node');

  await api.shutdown();
});

test('BootstrapAPI - buildSystemTableSnapshots', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache with sample data
  const mockSystemTableCache = {
    data: {
      nodes: [
        {node_id: 'node-1', node_address: 'ws://localhost:8080', status: 'active'},
        {node_id: 'node-2', node_address: 'ws://localhost:8081', status: 'active'},
      ],
      partitions: [
        {partition_id: 'p1', table_name: 'users', key_range_start: 0, key_range_end: 100},
        {partition_id: 'p2', table_name: 'orders', key_range_start: 0, key_range_end: 100},
      ],
      services: [
        {service_id: 's1', service_type: 'partition', partition_id: 'p1', node_id: 'node-1'},
        {service_id: 's2', service_type: 'message_group', group_id: 'mg-1', node_id: 'node-1'},
      ],
      tables: [
        {table_id: 'users', table_name: 'users', schema: '{}'},
        {table_id: 'orders', table_name: 'orders', schema: '{}'},
      ],
      message_groups: [
        {group_id: 'mg-1', group_name: 'message_group_1', replica_count: 3},
      ],
      replica_operations: [
        {operation_id: 'op-1', operation_type: 'add_replica', status: 'pending'},
      ],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
    },
    getAll(table) {
      return this.data[table] || [];
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  // Call buildSystemTableSnapshots
  const snapshots = api.buildSystemTableSnapshots();

  // Verify all system tables are present
  t.ok(snapshots, 'should return snapshots object');
  for (const tableName of CACHE_SYSTEM_TABLES) {
    t.ok(Array.isArray(snapshots[tableName]), `${tableName} should be an array`);
  }

  // Verify data is correct
  t.equal(snapshots.nodes.length, 2, 'should have 2 nodes');
  t.equal(snapshots.partitions.length, 2, 'should have 2 partitions');
  t.equal(snapshots.services.length, 2, 'should have 2 services');
  t.equal(snapshots.tables.length, 2, 'should have 2 tables');
  t.equal(snapshots.message_groups.length, 1, 'should have 1 message group');
  t.equal(snapshots.replica_operations.length, 1, 'should have 1 replica operation');

  // Verify specific data
  t.equal(snapshots.nodes[0].node_id, 'node-1', 'should have correct node data');
  t.equal(snapshots.partitions[0].partition_id, 'p1', 'should have correct partition data');

  await api.shutdown();
});

test('BootstrapAPI - buildSystemTableSnapshots handles empty cache', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: createEmptySystemTableCache(),
  });

  await api.initialize(0, {listen: false});

  // Call buildSystemTableSnapshots with empty cache
  const snapshots = api.buildSystemTableSnapshots();

  // Verify all system tables are present but empty
  t.ok(snapshots, 'should return snapshots object');
  for (const tableName of CACHE_SYSTEM_TABLES) {
    t.ok(Array.isArray(snapshots[tableName]), `${tableName} should be an array`);
  }

  // Verify all arrays are empty
  for (const tableName of CACHE_SYSTEM_TABLES) {
    t.equal(snapshots[tableName].length, 0, `${tableName} should be empty`);
  }

  await api.shutdown();
});

test('BootstrapAPI - buildSystemTableSnapshots handles missing cache', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: null, // No cache
  });

  await api.initialize(0, {listen: false});

  // Call buildSystemTableSnapshots with missing cache should throw
  t.throws(
    () => api.buildSystemTableSnapshots(),
    /BootstrapAPI requires systemTableCache/,
    'should throw error when cache is missing',
  );

  await api.shutdown();
});

test('BootstrapAPI - handleBootstrapRequest includes systemTableSnapshots', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache with sample data
  // Must include partition and message group leaders with addresses for bootstrap to succeed
  const mockCache = {
    get() {
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [{node_id: 'seed-node-1', node_address: 'ws://localhost:8080'}];
      }
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'p1',
          table_name: 'nodes',
          leader_node_id: 'seed-node-1',
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            service_id: 'partition-leader',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'p1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/partition/partition-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: STATE.ACTIVE,
          },
          {
            service_id: 'message-group-leader',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            group_id: 'mg1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/message-group-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: STATE.ACTIVE,
          },
        ];
      }
      if (tableName === TABLES.TABLES) {
        return [{table_id: 't1', table_name: 'nodes'}];
      }
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{group_id: 'mg1', leader_node_id: 'seed-node-1'}];
      }
      if (tableName === TABLES.REPLICA_OPERATIONS) {
        return [];
      }
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'http://localhost:8080',
    wsPort: 9090,
    systemTableCache: mockCache,
    messageGroupServices: new Map(),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: '550e8400-e29b-41d4-a716-446655440000',
      nodeAddress: 'ws://localhost:9090',
    },
  });

  t.equal(response.statusCode, 200, 'should return 200');
  const body = JSON.parse(response.body);

  t.equal(body.success, true, 'should return success');
  t.ok(body.systemTableSnapshots, 'should include systemTableSnapshots');
  t.ok(Array.isArray(body.systemTableSnapshots.nodes), 'nodes should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.partitions),
    'partitions should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.services),
    'services should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.tables), 'tables should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.message_groups),
    'message_groups should be an array');
  t.ok(Array.isArray(body.systemTableSnapshots.replica_operations),
    'replica_operations should be an array');

  t.equal(body.systemTableSnapshots.nodes.length, 1,
    'should have 1 node in snapshot');
  t.equal(body.systemTableSnapshots.partitions.length, 1,
    'should have 1 partition in snapshot');
  t.equal(body.systemTableSnapshots.services.length, 2,
    'should have 2 services in snapshot');

  await api.shutdown();
});
