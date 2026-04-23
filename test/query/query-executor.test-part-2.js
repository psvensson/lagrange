/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {NodeService} from '../../src/node/node-service.js';
import {ERRORS} from '../../src/constants/index.js';
import {
  COLUMN,
  STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {MIGRATION_PARTITION_OPERATION} from '../../src/migration/migration-constants.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  QUERY_DEFAULTS,
  QUERY_LOG_MSG,
  QUERY_RESPONSE_TYPE,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
} from '../../src/query/query-constants.js';
import {
  CANONICAL_LEADER_IDENTITY_SOURCE,
  CANONICAL_LEADER_IDENTITY_STATE,
  CANONICAL_LEADER_ROUTING_GAP_STATE,
} from '../../src/query/canonical-leader-routing.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  assertNoHandlerRepairConverged,
  createStaleOverlayOwnerHandoffFixture,
} from './routing-repair-test-helpers.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data storage
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/partitionId)
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: data.length || 1,
        };
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(partitionIds) {
  const services = partitionIds.map((pid) => ({
    service_id: pid,
    service_type: 'partition',
    partition_id: pid,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${pid}`,
    status: 'active',
  }));
  const partitions = partitionIds.map((partitionId) => ({
    partition_id: partitionId,
    leader_node_id: 'test-node',
  }));

  return {
    services,
    partitions,
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
}

// Helper to parse SQL
function parseSQL(sql) {
  const parser = new SQLParser(sql);
  return parser.parse();
}

function createReadinessCache({nodes = [], services = []} = {}) {
  const nodeRows = new Map(nodes.map((row) => [row[COLUMN.NODE_ID], row]));
  const serviceRows = new Map(
    services.map((row) => [row[COLUMN.SERVICE_ID], row]),
  );
  const listeners = new Set();

  function notify(tableName, operation, row) {
    for (const listener of listeners) {
      listener(tableName, operation, row, null);
    }
  }

  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return [...serviceRows.values()].filter(predicate);
      }
      return [];
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [...nodeRows.values()];
      }
      if (tableName === TABLES.SERVICES) {
        return [...serviceRows.values()];
      }
      return [];
    },
    applySystemTableChange(tableName, operation, row) {
      const normalizedOperation = String(operation || '').toUpperCase();
      if (tableName === TABLES.NODES) {
        const key = row?.[COLUMN.NODE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          nodeRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = nodeRows.get(key) || {};
        nodeRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, nodeRows.get(key));
        return;
      }
      if (tableName === TABLES.SERVICES) {
        const key = row?.[COLUMN.SERVICE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          serviceRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = serviceRows.get(key) || {};
        serviceRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, serviceRows.get(key));
      }
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
  };
}

function createReadinessPublicationService(snapshot) {
  return {
    getPublicationModeDiagnostics() {
      return snapshot;
    },
  };
}

test('QueryExecutor - retained runtime routing admits non-system services ' +
  'while strict membership evidence lags behind transport-connected recovery',
(t) => {
  const now = 240000;
  const nodeId = 'node-runtime-grace';
  const partitionId = 'p-runtime-grace';
  const tableName = 'benchmark_events';
  const systemCache = {
    partitions: [{
      partition_id: partitionId,
      table_name: tableName,
      leader_node_id: nodeId,
      created_at: now - 120000,
      updated_at: now - 120000,
    }],
    services: [{
      service_id: `${partitionId}-r1`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: nodeId,
      raft_role: 'leader',
      address: `${nodeId}/partition/${partitionId}-r1`,
      status: 'active',
    }],
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 5000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 4000,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 20,
      [COLUMN.DISK_USAGE_PERCENT]: 30,
    }],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      if (type === TABLES.NODES) {
        return this.nodes.find((node) => node[COLUMN.NODE_ID] === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      if (type === TABLES.NODES) {
        return this.nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions;
      }
      if (type === TABLES.SERVICES) {
        return this.services;
      }
      if (type === TABLES.NODES) {
        return this.nodes;
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-12T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
          [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
        },
        nodeEvidence: {
          transportConnected: true,
          readyWhenWritten: true,
        },
        runtimeAuthority: {
          failure: {
            reason: CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
          },
        },
      };
    },
  };
  const initialReadiness = readinessService.getNodeReadinessSync(nodeId);
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    controlPlaneReadinessService: readinessService,
  });

  t.equal(initialReadiness.dimensions.clusterMemberHealthy, false,
    'test fixture must keep strict cluster membership closed');
  t.equal(initialReadiness.dimensions.serveEligible, false,
    'test fixture must require retained runtime grace to route');
  t.equal(initialReadiness.dimensions.controlPlaneRecoveryEligible, true,
    'test fixture must stay open on recovery eligibility');
  t.same(
    executor.getRoutablePartitionServices(partitionId).map((service) => service.node_id),
    [nodeId],
    'retained runtime grace should keep non-system serving routable while recovery stays transport-backed',
  );
  t.equal(
    executor.findPartitionLeaderAddress(partitionId),
    `${nodeId}/partition/${partitionId}-r1`,
    'retained runtime grace should preserve leader routing for the user partition',
  );
  t.end();
});

test('QueryExecutor - retained runtime routing still fails closed for ' +
  'system-table partitions under the same stale-membership evidence',
(t) => {
  const now = 250000;
  const partitionCreatedAt = now - 120000;
  const partitionUpdatedAt = now - 119000;
  const nodeId = 'node-system-fail-closed';
  const partitionId = 'replica_operations-p1';
  const systemCache = {
    partitions: [{
      partition_id: partitionId,
      table_name: TABLES.REPLICA_OPERATIONS,
      leader_node_id: nodeId,
      created_at: partitionCreatedAt,
      updated_at: partitionUpdatedAt,
    }],
    services: [{
      service_id: `${partitionId}-r1`,
      service_type: 'partition',
      partition_id: partitionId,
      node_id: nodeId,
      raft_role: 'leader',
      address: `${nodeId}/partition/${partitionId}-r1`,
      status: 'active',
    }],
    nodes: [{
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 5000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 4000,
      [COLUMN.CPU_USAGE_PERCENT]: 10,
      [COLUMN.MEMORY_USAGE_PERCENT]: 20,
      [COLUMN.DISK_USAGE_PERCENT]: 30,
    }],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      if (type === TABLES.NODES) {
        return this.nodes.find((node) => node[COLUMN.NODE_ID] === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      if (type === TABLES.NODES) {
        return this.nodes.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions;
      }
      if (type === TABLES.SERVICES) {
        return this.services;
      }
      if (type === TABLES.NODES) {
        return this.nodes;
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-12T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
          [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
        },
        nodeEvidence: {
          transportConnected: true,
          readyWhenWritten: true,
        },
        runtimeAuthority: {
          failure: {
            reason: CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
          },
        },
      };
    },
  };
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    controlPlaneReadinessService: readinessService,
  });

  t.same(
    executor.getRoutablePartitionServices(partitionId).map((service) => service.node_id),
    [],
    'system-table routing must stay closed under stale membership even when recovery transport is connected',
  );
  t.equal(
    executor.findPartitionLeaderAddress(partitionId),
    null,
    'system-table leader routing must not reuse retained runtime grace',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition fails closed when the owner row ' +
  'exists but leader_node_id is blank',
async (t) => {
  let deliveries = 0;
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: null,
      },
    ],
    services: [
      {
        service_id: 'p1-stale-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'leader',
        address: 'node2/partition/p1',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    deliver: async () => {
      deliveries += 1;
      return {acknowledged: true, success: true, rows: []};
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.leaderRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    'p1',
    'INSERT INTO users (id) VALUES (\'1\')',
    [],
    false,
    false,
    false,
  );
  t.equal(
    result.success,
    false,
    'steady-state writes must fail closed when the owner row exists but leader_node_id is blank',
  );
  t.equal(result.error, ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  t.equal(
    deliveries,
    0,
    'steady-state writes must not dispatch through a service-role-derived leader witness',
  );
});

test('QueryExecutor - executeOnPartition fails closed on stale service ' +
  'leader hints when no owner row is available', async (t) => {
  let deliveries = 0;
  const systemCache = {
    services: [
      {
        service_id: 'p1-stale-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'leader',
        address: 'node2/partition/p1',
        status: 'active',
      },
    ],
    get: function() {
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    deliver: async () => {
      deliveries += 1;
      return {acknowledged: true, success: true, rows: []};
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.leaderRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    'p1',
    'INSERT INTO users (id) VALUES (\'1\')',
    [],
    false,
    false,
    false,
  );

  t.equal(result.success, false);
  t.equal(result.error, ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  t.equal(deliveries, 0, 'write path should not dispatch using stale service hints without an owner row');
});

test('QueryExecutor - executeOnPartition fails closed when canonical leader ' +
  'metadata is known but its service row is missing', async (t) => {
  let deliveries = 0;
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'node1',
      },
    ],
    services: [
      {
        service_id: 'p1-follower-visible',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'follower',
        address: 'node2/partition/p1',
        status: 'active',
      },
      {
        service_id: 'p1-stale-peer-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node3',
        raft_role: 'leader',
        address: 'node3/partition/p1',
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    deliver: async () => {
      deliveries += 1;
      return {acknowledged: true, success: true, rows: []};
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.leaderRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    'p1',
    'INSERT INTO users (id) VALUES (\'1\')',
    [],
    false,
    false,
    false,
  );

  t.equal(result.success, false);
  t.equal(result.error, ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  t.equal(
    deliveries,
    0,
    'steady-state writes must not widen routing to non-canonical replicas',
  );
});

test('QueryExecutor - executeOnPartition widens recovery-owned system-table ' +
  'writes when the canonical leader service row is missing', async (t) => {
  const deliveries = [];
  const partitionId = 'sql_transactions-p1';
  const followerAddress = 'node2/partition/sql_transactions-p1-r2';
  const redirectedLeaderAddress = 'node3/partition/sql_transactions-p1-r3';
  const leaderRedirect = QUERY_RESPONSE_TYPE.LEADER_REDIRECT;
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        table_name: 'sql_transactions',
        leader_node_id: 'node1',
      },
    ],
    services: [
      {
        service_id: 'sql-transactions-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node2',
        raft_role: 'follower',
        address: followerAddress,
        status: 'active',
      },
      {
        service_id: 'sql-transactions-p1-r3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node3',
        raft_role: 'leader',
        address: redirectedLeaderAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    deliver: async (address) => {
      deliveries.push(address);
      if (address === followerAddress) {
        return {
          acknowledged: true,
          success: false,
          redirect: leaderRedirect,
          leaderAddress: redirectedLeaderAddress,
        };
      }
      if (address === redirectedLeaderAddress) {
        return {
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.leaderRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE sql_transactions SET status = ? WHERE transaction_id = ?',
    ['active', 'tx-1'],
    false,
    false,
    false,
    {
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.equal(result.success, true);
  t.equal(
    deliveries.length > 0,
    true,
    'recovery-owned system-table writes should widen to live recovery candidates',
  );
  t.ok(
    deliveries.includes(followerAddress) ||
      deliveries.includes(redirectedLeaderAddress),
    'candidate widening should dispatch to a live replica instead of failing closed',
  );
});

test('QueryExecutor - executeOnPartition forwards router delivery overrides',
  async (t) => {
    const QUERY_EXECUTOR_DELIVERY_SOURCE =
      'control-plane:read:control_plane_publications';
    const deliveries = [];
    const messageRouter = {
      deliver: async (address, message, options) => {
        deliveries.push({address, message, options});
        return {acknowledged: true, success: true, rows: [], changes: 1};
      },
    };

    const executor = new QueryExecutor({
      messageRouter,
      systemCache: createMockSystemCache(['p1']),
    });

    const result = await executor.executeOnPartition(
      'p1',
      'INSERT INTO users (id) VALUES (?)',
      [1],
      false,
      false,
      false,
      {
        deliveryPriority: 'critical',
        deliverySource: QUERY_EXECUTOR_DELIVERY_SOURCE,
        timeoutMs: 4321,
      },
    );

    t.equal(result.success, true, 'partition execution should still succeed');
    t.equal(deliveries.length, 1, 'partition execution should dispatch once');
    t.equal(
      deliveries[0]?.options?.deliveryPriority,
      'critical',
      'partition execution should preserve delivery priority overrides',
    );
    t.equal(
      deliveries[0]?.options?.timeoutMs,
      4321,
      'partition execution should preserve per-call timeout overrides',
    );
    t.equal(
      deliveries[0]?.options?.deliverySource,
      QUERY_EXECUTOR_DELIVERY_SOURCE,
      'partition execution should preserve explicit delivery-source overrides',
    );
  });

test('QueryExecutor - executeOnPartition dispatches writes during the fresh ' +
  'bootstrap leader window', async (t) => {
  let deliveries = 0;
  let lastAddress = null;
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: null,
        created_at: 100,
        updated_at: 100,
      },
    ],
    services: [
      {
        service_id: 'p1-r1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'follower',
        address: 'node1/partition/p1-r1',
        status: 'active',
      },
      {
        service_id: 'p1-r2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'leader',
        address: 'node2/partition/p1-r2',
        status: 'active',
      },
      {
        service_id: 'p1-r3',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node3',
        raft_role: 'follower',
        address: 'node3/partition/p1-r3',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    deliver: async (address) => {
      deliveries += 1;
      lastAddress = address;
      return {
        acknowledged: true,
        success: true,
        rows: [],
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.leaderRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    'p1',
    'INSERT INTO users (id) VALUES (\'1\')',
    [],
    false,
    false,
    false,
  );

  t.equal(result.success, true);
  t.equal(lastAddress, 'node2/partition/p1-r2');
  t.equal(deliveries, 1, 'write path should dispatch through the visible bootstrap leader');
});

test('QueryExecutor - executeOnPartition fails closed during the fresh ' +
  'bootstrap leader window when only followers are visible', async (t) => {
  let deliveries = 0;
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: null,
        created_at: 100,
        updated_at: 100,
      },
    ],
    services: [
      {
        service_id: 'p1-r1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'follower',
        address: 'node1/partition/p1-r1',
        status: 'active',
      },
      {
        service_id: 'p1-r2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'follower',
        address: 'node2/partition/p1-r2',
        status: 'active',
      },
      {
        service_id: 'p1-r3',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node3',
        raft_role: 'follower',
        address: 'node3/partition/p1-r3',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    deliver: async () => {
      deliveries += 1;
      return {
        acknowledged: true,
        success: true,
        rows: [],
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.leaderRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    'p1',
    'INSERT INTO users (id) VALUES (\'1\')',
    [],
    false,
    false,
    false,
  );

  t.equal(result.success, false);
  t.equal(result.error, ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  t.equal(deliveries, 0, 'write path should not widen to follower-only services');
});

test('QueryExecutor - executeOnPartition forwards migration operation metadata',
  async (t) => {
    const systemCache = createMockSystemCache(['p1']);
    let capturedMessage = null;
    const messageRouter = {
      deliver: async (_address, message) => {
        capturedMessage = message;
        return {
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        };
      },
    };

    const executor = new QueryExecutor({
      messageRouter,
      systemCache,
    });

    const result = await executor.executeOnPartition(
      'p1',
      'ALTER TABLE users ADD COLUMN age INTEGER DEFAULT 10',
      [],
      false,
      true,
      false,
      {
        migrationOperation: MIGRATION_PARTITION_OPERATION.ALTER_TABLE,
        migrationId: 'migration-1',
      },
    );

    t.equal(result.success, true);
    t.equal(capturedMessage.migrationOperation, MIGRATION_PARTITION_OPERATION.ALTER_TABLE);
    t.equal(capturedMessage.migrationId, 'migration-1');
  });

test('QueryExecutor - executeOnPartition forwards sessionId through leader redirects',
  async (t) => {
    const capturedMessages = [];
    const messageRouter = {
      async deliver(address, message) {
        capturedMessages.push({address, message});
        if (address === 'follower-node/partition/p1') {
          return {
            acknowledged: true,
            success: false,
            redirect: 'LEADER_REDIRECT',
            leaderAddress: 'leader-node/partition/p1',
            partitionId: 'p1',
          };
        }
        return {
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        };
      },
    };
    const systemCache = {
      services: [
        {
          service_id: 'p1-follower',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'follower-node',
          raft_role: 'follower',
          address: 'follower-node/partition/p1',
          status: 'active',
        },
      ],
      filter(type, predicate) {
        if (type === 'services') {
          return this.services.filter(predicate);
        }
        return [];
      },
    };
    const executor = new QueryExecutor({
      messageRouter,
      systemCache,
    });

    const result = await executor.executeOnPartition(
      'p1',
      'SELECT * FROM users',
      [],
      true,
      false,
      false,
      {sessionId: 'tx-forward-1'},
    );

    t.equal(result.success, true, 'redirected query should succeed');
    t.equal(capturedMessages.length, 2, 'should issue follower and leader requests');
    t.equal(
      capturedMessages[0]?.message?.sessionId,
      'tx-forward-1',
      'direct write should forward the session id',
    );
    t.equal(
      capturedMessages[1]?.message?.sessionId,
      'tx-forward-1',
      'redirected write should preserve the session id',
    );
  });

test('QueryExecutor - executeOnPartition repairs the canonical leader service ' +
  'gap before using follower fallback', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'p1-follower',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'follower-node',
        raft_role: 'follower',
        address: 'follower-node/partition/p1',
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options) {
      readinessCalls.push({nodeId, options});
      systemCache.services.push({
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'leader-node',
        raft_role: 'leader',
        address: 'leader-node/partition/p1',
        status: 'active',
      });
      return {
        dimensions: {serveEligible: true},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: true,
        rows: [],
        changes: 1,
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    'p1',
    'UPDATE users SET name = ?',
    ['Ada'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    readinessCalls.map((call) => call.nodeId),
    ['leader-node'],
    'write routing should attempt one authoritative refresh for the missing canonical leader row',
  );
  t.same(
    deliveries,
    ['leader-node/partition/p1'],
    'the repaired canonical leader should be used once the service row becomes visible',
  );
});

test('QueryExecutor - executeOnPartition repairs a zero-row canonical leader ' +
  'gap before failing the write closed', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'leader-node',
      },
    ],
    services: [],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options) {
      readinessCalls.push({nodeId, options});
      systemCache.services.push({
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'leader-node',
        raft_role: 'leader',
        address: 'leader-node/partition/p1',
        status: 'active',
      });
      return {
        dimensions: {serveEligible: true},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: true,
        rows: [],
        changes: 1,
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    'p1',
    'UPDATE users SET name = ?',
    ['Ada'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    readinessCalls.map((call) => call.nodeId),
    ['leader-node'],
    'write routing should attempt one authoritative refresh when the canonical leader is known but no service rows are cached',
  );
  t.same(
    deliveries,
    ['leader-node/partition/p1'],
    'the repaired canonical leader should be used once the zero-row gap is repaired',
  );
});
