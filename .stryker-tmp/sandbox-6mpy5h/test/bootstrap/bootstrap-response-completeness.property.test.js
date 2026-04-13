/**
 * Property-based test for Bootstrap Response Completeness.
 * **Property 1: Bootstrap Response Completeness**
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * Property: For any bootstrap request, the bootstrap response SHALL contain
 * complete snapshots of all system tables, and each snapshot SHALL be an array.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-seed-node', restApiPort: 9999},
    logging: {level: 'error'},
  });
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a mock system table cache with arbitrary data.
 * @param {Object} data - Data for each system table.
 * @return {Object} Mock system table cache.
 */
function createMockSystemTableCache(data) {
  return {
    getAll(tableName) {
      return data[tableName] || [];
    },
    get(tableName, key) {
      const items = data[tableName] || [];
      const keyField = `${tableName.slice(0, -1)}_id`;
      return items.find((item) => item[keyField] === key) || null;
    },
    filter(tableName, predicate) {
      return (data[tableName] || []).filter(predicate);
    },
    find(tableName, predicate) {
      return (data[tableName] || []).find(predicate) || null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

function ensureLeaderServices(systemTableData) {
  const services = [...(systemTableData.services || [])];
  const seedNodeId = 'seed-node-1';
  const seedNodeAddress = 'ws://localhost:8080';

  for (const partition of systemTableData.partitions || []) {
    const partitionId = partition.partition_id;
    if (!partitionId) {
      continue;
    }

    // Ensure partition has leader_node_id
    partition.leader_node_id = partition.leader_node_id || seedNodeId;

    const hasLeader = services.some((service) =>
      service.partition_id === partitionId &&
      service.service_type === SERVICE_TYPE.PARTITION &&
      service.raft_role === RAFT_ROLE.LEADER &&
      service.status === SERVICE_STATUS.ACTIVE,
    );

    if (!hasLeader) {
      services.push({
        service_id: partitionId,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: seedNodeId,
        address: seedNodeAddress,
        raft_role: RAFT_ROLE.LEADER,
        status: SERVICE_STATUS.ACTIVE,
      });
    }
  }

  for (const group of systemTableData.message_groups || []) {
    const groupId = group.group_id;
    if (!groupId) {
      continue;
    }

    // Ensure message group has leader_node_id
    group.leader_node_id = group.leader_node_id || seedNodeId;

    const hasLeader = services.some((service) =>
      service.group_id === groupId &&
      service.service_type === SERVICE_TYPE.MESSAGE_GROUP &&
      service.raft_role === RAFT_ROLE.LEADER &&
      service.status === SERVICE_STATUS.ACTIVE,
    );

    if (!hasLeader) {
      services.push({
        service_id: groupId,
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: groupId,
        node_id: seedNodeId,
        address: seedNodeAddress,
        raft_role: RAFT_ROLE.LEADER,
        status: SERVICE_STATUS.ACTIVE,
      });
    }
  }

  systemTableData.services = services;
}

/**
 * Feature: system-cache-seeding-architecture
 * Property 1: Bootstrap Response Completeness
 *
 * For any bootstrap request, the bootstrap response SHALL contain complete
 * snapshots of all system tables, and each snapshot SHALL be an array.
 */
test('Property 1: Bootstrap response contains all system table snapshots', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        nodes: fc.array(fc.record({
          node_id: fc.uuid(),
          node_address: fc.webUrl(),
          status: fc.constantFrom('active', 'inactive'),
        })),
        partitions: fc.array(fc.record({
          partition_id: fc.uuid(),
          table_name: fc.string({minLength: 1, maxLength: 20}),
          key_range_start: fc.integer({min: 0, max: 1000}),
          key_range_end: fc.integer({min: 0, max: 1000}),
        })),
        services: fc.array(fc.record({
          service_id: fc.uuid(),
          service_type: fc.constantFrom('partition', 'message_group'),
          node_id: fc.uuid(),
          address: fc.string({minLength: 1, maxLength: 50}),
        })),
        tables: fc.array(fc.record({
          table_id: fc.uuid(),
          table_name: fc.string({minLength: 1, maxLength: 20}),
          schema: fc.string(),
        })),
        message_groups: fc.array(fc.record({
          group_id: fc.uuid(),
          group_name: fc.string({minLength: 1, maxLength: 20}),
          replica_count: fc.constantFrom(3, 5, 7),
        })),
        replica_operations: fc.array(fc.record({
          operation_id: fc.uuid(),
          operation_type: fc.constantFrom('add_replica', 'remove_replica'),
          status: fc.constantFrom('pending', 'in_progress', 'completed'),
        })),
        indices: fc.array(fc.record({
          index_id: fc.uuid(),
          table_id: fc.uuid(),
        })),
        config: fc.array(fc.record({
          config_key: fc.string({minLength: 1, maxLength: 20}),
          config_value: fc.string(),
        })),
        logs: fc.array(fc.record({
          log_id: fc.uuid(),
          message: fc.string(),
        })),
        live_queries: fc.array(fc.record({
          query_id: fc.uuid(),
        })),
        contexts: fc.array(fc.record({
          context_id: fc.uuid(),
        })),
        code: fc.array(fc.record({
          function_id: fc.uuid(),
        })),
      }),
      async (systemTableData) => {
        ensureLeaderServices(systemTableData);
        const mockCache = createMockSystemTableCache(systemTableData);

        const api = new BootstrapAPI({
          seedNodeId: 'seed-node-1',
          seedNodeAddress: 'http://localhost:8080',
          wsPort: 9090,
          systemTableCache: mockCache,
          messageGroupServices: new Map(),
        });

        await api.initialize(0, {listen: false});

        try {
          const response = await api.getFastify().inject({
            method: 'POST',
            url: '/bootstrap',
            payload: {
              nodeId: '550e8400-e29b-41d4-a716-446655440000',
              nodeAddress: 'ws://localhost:9090',
            },
          });

          const body = JSON.parse(response.body);

          // Verify response has systemTableSnapshots
          if (!body.systemTableSnapshots) {
            return false;
          }

          const snapshots = body.systemTableSnapshots;

          // Verify all required system tables are present
          for (const tableName of CACHE_HYDRATION_TABLES) {
            if (!snapshots[tableName]) {
              return false;
            }
            if (!Array.isArray(snapshots[tableName])) {
              return false;
            }
          }

          return true;
        } finally {
          await api.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Bootstrap response contains all system table snapshots');
});

test('Property 1: Bootstrap response snapshots match cache data', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        nodes: fc.array(fc.record({
          node_id: fc.uuid(),
          node_address: fc.webUrl(),
          status: fc.constantFrom('active', 'inactive'),
        }), {maxLength: 5}),
        partitions: fc.array(fc.record({
          partition_id: fc.uuid(),
          table_name: fc.string({minLength: 1, maxLength: 20}),
        }), {maxLength: 5}),
        services: fc.array(fc.record({
          service_id: fc.uuid(),
          service_type: fc.constantFrom('partition', 'message_group'),
        }), {maxLength: 5}),
        tables: fc.array(fc.record({
          table_id: fc.uuid(),
          table_name: fc.string({minLength: 1, maxLength: 20}),
        }), {maxLength: 5}),
        message_groups: fc.array(fc.record({
          group_id: fc.uuid(),
          group_name: fc.string({minLength: 1, maxLength: 20}),
        }), {maxLength: 5}),
        replica_operations: fc.array(fc.record({
          operation_id: fc.uuid(),
          operation_type: fc.constantFrom('add_replica', 'remove_replica'),
        }), {maxLength: 5}),
        indices: fc.array(fc.record({
          index_id: fc.uuid(),
        }), {maxLength: 5}),
        config: fc.array(fc.record({
          config_key: fc.string({minLength: 1, maxLength: 20}),
        }), {maxLength: 5}),
        logs: fc.array(fc.record({
          log_id: fc.uuid(),
        }), {maxLength: 5}),
        live_queries: fc.array(fc.record({
          query_id: fc.uuid(),
        }), {maxLength: 5}),
        contexts: fc.array(fc.record({
          context_id: fc.uuid(),
        }), {maxLength: 5}),
        code: fc.array(fc.record({
          function_id: fc.uuid(),
        }), {maxLength: 5}),
      }),
      async (systemTableData) => {
        ensureLeaderServices(systemTableData);
        const mockCache = createMockSystemTableCache(systemTableData);

        const api = new BootstrapAPI({
          seedNodeId: 'seed-node-1',
          seedNodeAddress: 'http://localhost:8080',
          wsPort: 9090,
          systemTableCache: mockCache,
          messageGroupServices: new Map(),
        });

        await api.initialize(0, {listen: false});

        try {
          const response = await api.getFastify().inject({
            method: 'POST',
            url: '/bootstrap',
            payload: {
              nodeId: '550e8400-e29b-41d4-a716-446655440000',
              nodeAddress: 'ws://localhost:9090',
            },
          });

          const body = JSON.parse(response.body);
          const snapshots = body.systemTableSnapshots;

          // Verify snapshot data matches cache data
          for (const tableName of CACHE_HYDRATION_TABLES) {
            const snapshotRows = snapshots[tableName] || [];
            const cacheRows = systemTableData[tableName] || [];
            if (snapshotRows.length !== cacheRows.length) {
              return false;
            }
          }

          return true;
        } finally {
          await api.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Bootstrap response snapshots match cache data');
});

test('Property 1: Bootstrap response structure is correct', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.constant(null),
      async (_input) => {
        const systemTableData = {
          nodes: [{node_id: 'n1', node_address: 'ws://localhost:8080'}],
          partitions: [{partition_id: 'p1', table_name: 'nodes'}],
          services: [{service_id: 's1', service_type: 'partition'}],
          tables: [{table_id: 't1', table_name: 'nodes'}],
          message_groups: [{group_id: 'mg1', group_name: 'mg1'}],
          replica_operations: [],
        };
        ensureLeaderServices(systemTableData);
        const mockCache = createMockSystemTableCache(systemTableData);

        const api = new BootstrapAPI({
          seedNodeId: 'seed-node-1',
          seedNodeAddress: 'http://localhost:8080',
          wsPort: 9090,
          systemTableCache: mockCache,
          messageGroupServices: new Map(),
        });

        await api.initialize(0, {listen: false});

        try {
          const response = await api.getFastify().inject({
            method: 'POST',
            url: '/bootstrap',
            payload: {
              nodeId: '550e8400-e29b-41d4-a716-446655440000',
              nodeAddress: 'ws://localhost:9090',
            },
          });

          const body = JSON.parse(response.body);

          // Verify response structure
          if (!body.success) return false;
          if (!body.seedNodeId) return false;
          if (!body.seedNodeAddress) return false;
          if (!body.systemTableSnapshots) return false;
          if (!body.messageGroupAssignment) return false;
          if (!body.clusterConfig) return false;
          if (!body.timestamp) return false;

          return true;
        } finally {
          await api.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Bootstrap response structure is correct');
});

test('Property 1: Empty cache produces empty snapshots', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.constant(null),
      async (_input) => {
        const mockCache = createMockSystemTableCache({
          nodes: [],
          partitions: [],
          services: [],
          tables: [],
          message_groups: [],
          replica_operations: [],
        });

        const api = new BootstrapAPI({
          seedNodeId: 'seed-node-1',
          seedNodeAddress: 'http://localhost:8080',
          wsPort: 9090,
          systemTableCache: mockCache,
          messageGroupServices: new Map(),
        });

        await api.initialize(0, {listen: false});

        try {
          const response = await api.getFastify().inject({
            method: 'POST',
            url: '/bootstrap',
            payload: {
              nodeId: '550e8400-e29b-41d4-a716-446655440000',
              nodeAddress: 'ws://localhost:9090',
            },
          });

          const body = JSON.parse(response.body);
          const snapshots = body.systemTableSnapshots;

          // Verify all snapshots are empty arrays
          if (snapshots.nodes.length !== 0) return false;
          if (snapshots.partitions.length !== 0) return false;
          if (snapshots.services.length !== 0) return false;
          if (snapshots.tables.length !== 0) return false;
          if (snapshots.message_groups.length !== 0) return false;
          if (snapshots.replica_operations.length !== 0) return false;

          return true;
        } finally {
          await api.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Empty cache produces empty snapshots');
});
