/**
 * Tests for Bootstrap API.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_HANDOFF_STATUS,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  createEmptySystemTableCache,
  initializeTestEnvironment,
} from './bootstrap-api-test-fixtures.js';


test('BootstrapAPI - allows bootstrap when only message-group leaders are missing',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
    });

    api.getMissingServiceLeaders = () => {
      return {
        missingPartitionLeaders: [],
        missingPartitionLeaderNodes: [],
        missingPartitionLeaderAddresses: [],
        missingMessageGroupLeaders: ['mg-1'],
        missingMessageGroupLeaderNodes: ['mg-1'],
        missingMessageGroupLeaderAddresses: ['mg-1'],
      };
    };

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440000',
        nodeAddress: 'ws://localhost:9090',
      },
    });

    t.equal(response.statusCode, 200,
      'bootstrap should proceed when only message-group leaders are lagging');
    const body = JSON.parse(response.body);
    t.equal(body.success, true, 'should return success');
    t.ok(body.messageGroupAssignment, 'should still include assignment metadata');

    await api.shutdown();
  });

test('BootstrapAPI - waitForServiceLeaders returns promptly when leaders are missing',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptySystemTableCache(),
      bootstrapService: {
        config: {
          leadershipWaitTimeoutMs: 1000,
          leadershipWaitInitialDelayMs: 100,
          leadershipWaitMaxDelayMs: 100,
          leadershipWaitBackoffMultiplier: 2,
        },
      },
      partitionServices: new Map([['partition-1', {partitionId: 'partition-1'}]]),
      messageGroupServices: new Map([['mg-1', {groupId: 'mg-1'}]]),
    });

    api.getMissingServiceLeaders = () => {
      return {
        missingPartitionLeaders: ['partition-1'],
        missingPartitionLeaderNodes: ['partition-1'],
        missingPartitionLeaderAddresses: ['partition-1'],
        missingMessageGroupLeaders: ['mg-1'],
        missingMessageGroupLeaderNodes: ['mg-1'],
        missingMessageGroupLeaderAddresses: ['mg-1'],
      };
    };

    const start = Date.now();
    const status = await api.waitForServiceLeaders();
    const elapsedMs = Date.now() - start;

    t.equal(status.ready, false, 'should report leaders as not ready');
    t.ok(elapsedMs < 200,
      `should return quickly without waiting full timeout (elapsed=${elapsedMs}ms)`);
  });

test('BootstrapAPI - durable rejoin ignores non-traffic leader gaps during bootstrap admission',
  async (t) => {
    initializeTestEnvironment();

    const partitionRows = [
      {partition_id: 'nodes-p1', table_id: TABLES.NODES, table_name: TABLES.NODES},
      {partition_id: 'config-p1', table_id: TABLES.CONFIG, table_name: TABLES.CONFIG},
      {
        partition_id: 'message-groups-p1',
        table_id: TABLES.MESSAGE_GROUPS,
        table_name: TABLES.MESSAGE_GROUPS,
      },
      {
        partition_id: 'replica-operations-p1',
        table_id: TABLES.REPLICA_OPERATIONS,
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ];
    const cache = {
      get() {
        return null;
      },
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return partitionRows;
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
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: cache,
    });

    api.getMissingServiceLeaders = () => {
      return {
        missingPartitionLeaders: [
          'config-p1',
          'message-groups-p1',
          'replica-operations-p1',
        ],
        missingPartitionLeaderNodes: [
          'config-p1',
          'message-groups-p1',
          'replica-operations-p1',
        ],
        missingPartitionLeaderAddresses: [
          'config-p1',
          'message-groups-p1',
          'replica-operations-p1',
        ],
        missingMessageGroupLeaders: ['mg-1'],
        missingMessageGroupLeaderNodes: ['mg-1'],
        missingMessageGroupLeaderAddresses: ['mg-1'],
      };
    };

    const defaultStatus = await api.waitForServiceLeaders();
    t.equal(defaultStatus.ready, false,
      'default bootstrap admission should still block on non-traffic gaps');

    const durableRejoinStatus = await api.waitForServiceLeaders({
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });
    t.equal(durableRejoinStatus.ready, true,
      'durable rejoin should ignore non-traffic leader gaps');
  });

test('BootstrapAPI - durable rejoin only requires node and endpoint leaders during bootstrap admission',
  async (t) => {
    initializeTestEnvironment();

    const partitionRows = [
      {partition_id: 'nodes-p1', table_id: TABLES.NODES, table_name: TABLES.NODES},
      {
        partition_id: 'node-endpoints-p1',
        table_id: TABLES.NODE_ENDPOINTS,
        table_name: TABLES.NODE_ENDPOINTS,
      },
      {partition_id: 'tables-p1', table_id: TABLES.TABLES, table_name: TABLES.TABLES},
      {
        partition_id: 'partitions-p1',
        table_id: TABLES.PARTITIONS,
        table_name: TABLES.PARTITIONS,
      },
      {
        partition_id: 'services-p1',
        table_id: TABLES.SERVICES,
        table_name: TABLES.SERVICES,
      },
    ];
    const cache = {
      get() {
        return null;
      },
      getAll(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return partitionRows;
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
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: cache,
    });

    api.getMissingServiceLeaders = () => {
      return {
        missingPartitionLeaders: [
          'tables-p1',
          'partitions-p1',
          'services-p1',
        ],
        missingPartitionLeaderNodes: [
          'tables-p1',
          'partitions-p1',
          'services-p1',
        ],
        missingPartitionLeaderAddresses: [
          'tables-p1',
          'partitions-p1',
          'services-p1',
        ],
        missingMessageGroupLeaders: ['mg-1'],
        missingMessageGroupLeaderNodes: ['mg-1'],
        missingMessageGroupLeaderAddresses: ['mg-1'],
      };
    };

    const defaultStatus = await api.waitForServiceLeaders();
    t.equal(defaultStatus.ready, false,
      'default bootstrap admission should still block on traffic leader gaps');

    const durableRejoinStatus = await api.waitForServiceLeaders({
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });
    t.equal(durableRejoinStatus.ready, true,
      'durable rejoin should proceed when node and endpoint leaders are available');
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

  // System table cache with message group services for MOVE_REPLICA assignment
  // The system cache (fed by CDC) is the single source of truth
  const mockSystemTableCache = {
    data: {
      message_groups: [],
      services: [
        {
          service_id: 'mg-1-r1',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r1',
          address: 'seed-node-1/message-group/mg-1-r1',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-1-r2',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r2',
          address: 'seed-node-1/message-group/mg-1-r2',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-1-r3',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r3',
          address: 'seed-node-1/message-group/mg-1-r3',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
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
  for (const tableName of CACHE_HYDRATION_TABLES) {
    t.ok(Array.isArray(snapshots[tableName]), `${tableName} should be an array`);
  }
  t.notOk(snapshots[TABLES.LOGS], 'logs table is excluded from default snapshots');

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
  for (const tableName of CACHE_HYDRATION_TABLES) {
    t.ok(Array.isArray(snapshots[tableName]), `${tableName} should be an array`);
  }

  // Verify all arrays are empty
  for (const tableName of CACHE_HYDRATION_TABLES) {
    t.equal(snapshots[tableName].length, 0, `${tableName} should be empty`);
  }

  await api.shutdown();
});

test(
  'BootstrapAPI - buildSystemTableSnapshots prefers authoritative local partition rows',
  async (t) => {
    initializeTestEnvironment();

    const staleEndpointRow = {
      endpoint_id: 'pg-seed',
      service_id: 'sys-postgres-wire',
      node_id: 'seed-node-1',
      protocol: 'tcp',
      address: 'seed-host',
      port: 5432,
      health_status: 'healthy',
      metadata: '{}',
      created_at: 1,
      updated_at: 10,
    };
    const authoritativeRows = [
      staleEndpointRow,
      {
        endpoint_id: 'pg-peer',
        service_id: 'sys-postgres-wire',
        node_id: 'peer-node-2',
        protocol: 'tcp',
        address: 'peer-host',
        port: 5432,
        health_status: 'healthy',
        metadata: '{}',
        created_at: 2,
        updated_at: 20,
      },
    ];
    const cacheData = {
      [TABLES.PARTITIONS]: [
        {
          partition_id: 'service_endpoints-p1',
          table_name: TABLES.SERVICE_ENDPOINTS,
        },
      ],
      [TABLES.SERVICES]: [
        {
          service_id: 'service_endpoints-p1-r1',
          partition_id: 'service_endpoints-p1',
          service_type: SERVICE_TYPE.PARTITION,
          raft_role: RAFT_ROLE.LEADER,
          status: SERVICE_STATUS.ACTIVE,
          node_id: 'seed-node-1',
          address: 'seed-node-1/partition/service_endpoints-p1-r1',
        },
      ],
      [TABLES.SERVICE_ENDPOINTS]: [staleEndpointRow],
    };
    const mockCache = {
      get() {
        return null;
      },
      getAll(tableName) {
        return cacheData[tableName] || [];
      },
      filter(tableName, predicate) {
        return (cacheData[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return [];
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
      partitionServices: new Map([
        ['service_endpoints-p1-r1', {
          partitionId: 'service_endpoints-p1',
          replicaId: 'service_endpoints-p1-r1',
          initialized: true,
          db: {
            prepare(sql) {
              t.equal(
                sql,
                `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
                'bootstrap snapshots should read the local partition directly',
              );
              return {
                all() {
                  return authoritativeRows;
                },
              };
            },
          },
        }],
      ]),
    });

    await api.initialize(0, {listen: false});

    const snapshots = api.buildSystemTableSnapshots();

    t.same(
      snapshots.service_endpoints.map((row) => row.node_id).sort(),
      ['peer-node-2', 'seed-node-1'],
      'authoritative local partition rows should replace stale cache snapshots',
    );

    await api.shutdown();
  },
);

test(
  'BootstrapAPI - message group assignment prefers authoritative local services rows',
  async (t) => {
    initializeTestEnvironment();

    const cacheServices = [
      {
        service_id: 'mg-1-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r1',
        address: 'seed-node-1/message-group/mg-1-r1',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        created_at: 1,
        updated_at: 10,
      },
      {
        service_id: 'mg-1-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r2',
        address: 'seed-node-1/message-group/mg-1-r2',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        created_at: 1,
        updated_at: 10,
      },
      {
        service_id: 'mg-1-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r3',
        address: 'seed-node-1/message-group/mg-1-r3',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        created_at: 1,
        updated_at: 10,
      },
    ];
    const authoritativeServices = [
      {
        ...cacheServices[0],
        node_id: 'node-2',
        address: 'node-2/message-group/mg-1-r1',
        updated_at: 20,
      },
      {
        ...cacheServices[1],
        updated_at: 20,
      },
      {
        ...cacheServices[2],
        updated_at: 20,
      },
    ];
    const cacheData = {
      [TABLES.PARTITIONS]: [
        {
          partition_id: 'services-p1',
          table_name: TABLES.SERVICES,
        },
      ],
      [TABLES.SERVICES]: cacheServices,
      [TABLES.MESSAGE_GROUPS]: [],
    };
    const mockCache = {
      get() {
        return null;
      },
      getAll(tableName) {
        return cacheData[tableName] || [];
      },
      filter(tableName, predicate) {
        return (cacheData[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return ['seed-node-1', 'node-2'];
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
      partitionServices: new Map([
        ['services-p1-r1', {
          partitionId: 'services-p1',
          replicaId: 'services-p1-r1',
          initialized: true,
          db: {
            prepare(sql) {
              t.equal(
                sql,
                `SELECT * FROM ${TABLES.SERVICES}`,
                'message group assignment should use the same authoritative services read as bootstrap snapshots',
              );
              return {
                all() {
                  return authoritativeServices;
                },
              };
            },
          },
        }],
      ]),
    });

    await api.initialize(0, {listen: false});

    const messageGroups = api.getMessageGroups();
    t.same(
      messageGroups[0]?.replicas?.map((replica) => replica.node_id).sort(),
      ['node-2', 'seed-node-1', 'seed-node-1'],
      'message group topology should come from authoritative local services rows',
    );

    const assignment = api.determineMessageGroupAssignment('new-node-1');
    t.equal(
      assignment.strategy,
      BootstrapStrategy.MOVE_REPLICA,
      'assignment should still use MOVE_REPLICA when one source node has two replicas',
    );
    t.not(
      assignment.replicaToMove,
      'mg-1-r1',
      'assignment must not reserve a replica that authoritative services rows already show as moved',
    );
    t.ok(
      ['mg-1-r2', 'mg-1-r3'].includes(assignment.replicaToMove),
      'assignment should choose one of the replicas still owned by the seed',
    );

    await api.shutdown();
  },
);

test(
  'BootstrapAPI - move-assignment reconciliation prefers authoritative local ownership rows',
  async (t) => {
    initializeTestEnvironment();

    const now = Date.now();
    const readyLeaseExpiresAt = now + 60000;
    const staleCacheServiceRow = {
      service_id: 'mg-1-r1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'seed-node-1',
      group_id: 'mg-1',
      replica_id: 'mg-1-r1',
      address: 'seed-node-1/message-group/mg-1-r1',
      raft_role: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
      created_at: 1,
      updated_at: 10,
    };
    const authoritativeServiceRows = [
      {
        ...staleCacheServiceRow,
        node_id: 'node-2',
        address: 'node-2/message-group/mg-1-r1',
        updated_at: 20,
      },
    ];
    const authoritativeNodeRows = [
      {
        node_id: 'seed-node-1',
        status: SERVICE_STATUS.ACTIVE,
        ready_lease_expires_at: readyLeaseExpiresAt,
      },
      {
        node_id: 'node-2',
        status: SERVICE_STATUS.ACTIVE,
        ready_lease_expires_at: readyLeaseExpiresAt,
      },
    ];
    const cacheData = {
      [TABLES.PARTITIONS]: [
        {
          partition_id: 'services-p1',
          table_name: TABLES.SERVICES,
        },
        {
          partition_id: 'nodes-p1',
          table_name: TABLES.NODES,
        },
      ],
      [TABLES.SERVICES]: [staleCacheServiceRow],
      [TABLES.NODES]: [
        {
          node_id: 'seed-node-1',
          status: SERVICE_STATUS.ACTIVE,
          ready_lease_expires_at: readyLeaseExpiresAt,
        },
      ],
    };
    const tablePrimaryKeyFieldByName = Object.freeze({
      [TABLES.PARTITIONS]: 'partition_id',
      [TABLES.SERVICES]: 'service_id',
      [TABLES.NODES]: 'node_id',
    });
    const mockCache = {
      get(tableName, rowKey) {
        const rows = cacheData[tableName] || [];
        const keyField = tablePrimaryKeyFieldByName[tableName] || 'id';
        return rows.find((row) => row?.[keyField] === rowKey) || null;
      },
      getAll(tableName) {
        return cacheData[tableName] || [];
      },
      filter(tableName, predicate) {
        return (cacheData[tableName] || []).filter(predicate);
      },
      getReadyNodes() {
        return authoritativeNodeRows.map((row) => row.node_id);
      },
    };
    const partitionServices = new Map([
      ['services-p1-r1', {
        partitionId: 'services-p1',
        replicaId: 'services-p1-r1',
        initialized: true,
        db: {
          prepare(sql) {
            if (sql === `SELECT * FROM ${TABLES.SERVICES}`) {
              return {
                all() {
                  return authoritativeServiceRows;
                },
              };
            }
            throw new Error(`Unexpected SQL for services partition: ${sql}`);
          },
        },
      }],
      ['nodes-p1-r1', {
        partitionId: 'nodes-p1',
        replicaId: 'nodes-p1-r1',
        initialized: true,
        db: {
          prepare(sql) {
            if (sql === `SELECT * FROM ${TABLES.NODES}`) {
              return {
                all() {
                  return authoritativeNodeRows;
                },
              };
            }
            throw new Error(`Unexpected SQL for nodes partition: ${sql}`);
          },
        },
      }],
    ]);

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
      partitionServices,
      messageGroupServices: new Map(),
    });

    await api.initialize(0, {listen: false});

    const reservation = {
      assignmentId: 'assignment-1',
      replicaId: 'mg-1-r1',
      sourceNodeId: 'seed-node-1',
      targetNodeId: 'node-2',
      groupId: 'mg-1',
      status: BOOTSTRAP_API_HANDOFF_STATUS.PREPARING,
      leaseExpiresAt: readyLeaseExpiresAt,
      updatedAt: now,
      stepsHistory: [],
    };
    api.moveReplicaAssignmentReservations.set(
      reservation.assignmentId,
      reservation,
    );

    t.equal(
      api.shouldReconcileMoveReplicaAssignmentReservationToCommitted(
        reservation,
        now,
      ),
      true,
      'reconciliation should use authoritative local ownership when cache still points at the source node',
    );

    await api.expireMoveReplicaAssignmentReservations();

    const reconciled =
      api.moveReplicaAssignmentReservations.get(reservation.assignmentId) || null;
    t.equal(
      reconciled?.status,
      BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
      'reservation sweep should commit the handoff once authoritative local ownership moved to the target',
    );
    t.ok(
      Array.isArray(reconciled?.stepsHistory) &&
        reconciled.stepsHistory.some((step) =>
          step?.phase === 'observed_committed' &&
          step?.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
        ),
      'reservation history should record the observed committed transition from authoritative local ownership',
    );

    await api.shutdown();
  },
);

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

test('BootstrapAPI - buildSystemTableSnapshots falls back to runtime owner cache', async (t) => {
  initializeTestEnvironment();

  const nodeRow = {
    node_id: 'seed-node-1',
    node_address: 'ws://localhost:8080',
    status: 'active',
  };
  const runtimeOwnerCache = createEmptySystemTableCache();
  runtimeOwnerCache.getAll = (tableName) =>
    tableName === TABLES.NODES ? [nodeRow] : [];

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: null,
    runtimeOwner: {
      get systemTableCache() {
        return runtimeOwnerCache;
      },
    },
  });

  await api.initialize(0, {listen: false});

  t.same(
    api.buildSystemTableSnapshots()[TABLES.NODES],
    [nodeRow],
    'should use runtime owner cache when explicit bootstrap cache is absent',
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
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'message-group-leader',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            group_id: 'mg1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/message-group-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
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
  t.ok(body.topologySnapshotMeta, 'should include topologySnapshotMeta');
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
  t.equal(body.topologySnapshotMeta.topologyEpoch, 0,
    'bootstrap response should include the published topology epoch');
  t.same(
    body.topologySnapshotMeta.hydrationTables,
    CACHE_HYDRATION_TABLES,
    'bootstrap response should advertise the sanctioned hydration tables',
  );

  await api.shutdown();
});

test('BootstrapAPI - getReadyNodes includes seed node when lease expired only with explicit readiness evidence',
  async (t) => {
    initializeTestEnvironment();

    const now = Date.now();
    const expiredLease = now - 1000; // Expired 1 second ago

    // Create cache where seed node has expired lease
    const mockCache = {
      get: () => null,
      getAll: (tableName) => {
        if (tableName === TABLES.NODES) {
          return [
            {
              node_id: 'seed-node-1',
              status: 'active',
              connection_state: STATE.READY,
              ready_lease_expires_at: expiredLease, // Expired
            },
            {
              node_id: 'other-node',
              status: 'active',
              connection_state: STATE.READY,
              ready_lease_expires_at: now + 10000, // Valid
            },
          ];
        }
        return [];
      },
      filter: (tableName, predicate) => {
        const all = mockCache.getAll(tableName);
        return all.filter(predicate);
      },
      find: () => null,
      getReadyNodes: function() {
      // Simulate the real getReadyNodes which filters by lease
        const currentTime = Date.now();
        return this.filter(TABLES.NODES, (node) => {
          return node.connection_state === STATE.READY &&
          node.ready_lease_expires_at &&
          node.ready_lease_expires_at > currentTime;
        }).map((n) => n.node_id);
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return nodeId === 'seed-node-1' ? {ready: true} : null;
        },
      },
    });

    await api.initialize(0, {listen: false});

    const readyNodes = api.getReadyNodes();

    // Should include seed node only because readiness explicitly confirms it.
    t.ok(readyNodes.includes('seed-node-1'),
      'should include seed node when readiness explicitly confirms bootstrap readiness');
    t.ok(readyNodes.includes('other-node'),
      'should include other ready nodes');
    t.equal(readyNodes.length, 2, 'should have 2 ready nodes');

    await api.shutdown();
  });
