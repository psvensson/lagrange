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

test('QueryExecutor - executeOnPartition retries session-bound transaction ' +
  'contention on the same replica before widening', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';
  let leaderAttempts = 0;

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
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
    async deliver(address) {
      deliveries.push(address);
      if (address === leaderAddress) {
        leaderAttempts += 1;
        if (leaderAttempts === 1) {
          return {
            acknowledged: true,
            success: false,
            error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          };
        }
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected fallback delivery',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });
  executor.delay = async () => {};

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [leaderAddress, leaderAddress],
    'session-bound transaction contention should retry the pinned replica ' +
      'instead of widening to another live replica in the same attempt',
  );
});

test('QueryExecutor - executeOnPartition pins session-bound writes to the ' +
  'same replica address across calls', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS) {
        return this.partitions.find((row) => row.partition_id === key) || null;
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: true,
        changes: 1,
        rows: [],
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  const firstResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['creating', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );
  systemCache.partitions[0].leader_node_id = 'follower-node';
  systemCache.services[0].raft_role = 'follower';
  systemCache.services[1].raft_role = 'leader';
  const secondResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['sending', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );

  t.equal(firstResult.success, true);
  t.equal(secondResult.success, true);
  t.same(
    deliveries,
    [leaderAddress, leaderAddress],
    'session-bound writes should stay pinned to the replica that accepted the earlier step',
  );
});

test('QueryExecutor - executeOnPartition clears session-bound replica ' +
  'affinity after successful transactional teardown', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS) {
        return this.partitions.find((row) => row.partition_id === key) || null;
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: true,
        changes: 1,
        rows: [],
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['creating', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );
  systemCache.partitions[0].leader_node_id = 'follower-node';
  systemCache.services[0].raft_role = 'follower';
  systemCache.services[1].raft_role = 'leader';
  await executor.executeOnPartition(
    partitionId,
    '',
    [],
    false,
    false,
    false,
    {
      sessionId: 'tx-1',
      clearSessionPartitionAffinityOnSuccess: true,
      buildRequest: () => ({type: 'TRANSACTION', operation: 'COMMIT'}),
    },
  );
  const thirdResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['completed', 'op-1'],
    false,
    false,
    false,
    {sessionId: 'tx-1'},
  );

  t.equal(thirdResult.success, true);
  t.same(
    deliveries,
    [leaderAddress, leaderAddress, fallbackAddress],
    'successful teardown should release session affinity so later work can follow fresh routing',
  );
});

test('QueryExecutor - executeOnPartition quarantines thrown stale no-handler ' +
  'leader address across consecutive writes', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const staleAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: staleAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
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

  const routingMetadataOverlay = {
    getPartitionById() {
      return null;
    },
    getServicesForPartition() {
      return [];
    },
    async refreshPartitionRouting() {
      return false;
    },
  };

  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        throw new Error(`${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`);
      }
      if (address === fallbackAddress) {
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
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
    routingMetadataOverlay,
    nodeId: 'local-node',
    noHandlerAddressQuarantineMs: 60000,
  });

  const firstResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
  );
  const secondResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['completed', 'op-1'],
    false,
  );

  t.equal(firstResult.success, true);
  t.equal(secondResult.success, true);
  t.same(
    deliveries,
    [staleAddress, fallbackAddress, fallbackAddress],
    'second write should skip the quarantined stale no-handler leader address when no-handler arrives as a thrown transport error',
  );
  t.end();
});

test('QueryExecutor - control-plane no-handler quarantine stays active until ' +
  'service metadata changes', async (t) => {
  const partitionId = 'replica_operations-p1';
  const staleAddress = 'leader-node/partition/replica_operations-p1-r1';
  let nowMs = 1_000;
  const realDateNow = Date.now;
  Date.now = () => nowMs;
  t.teardown(() => {
    Date.now = realDateNow;
  });

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        table_name: TABLES.REPLICA_OPERATIONS,
        leader_node_id: 'leader-node',
      },
    ],
    services: [],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
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

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    nodeId: 'local-node',
  });

  const originalService = {
    service_id: 'replica_operations-p1-r1',
    service_type: 'partition',
    partition_id: partitionId,
    node_id: 'leader-node',
    raft_role: 'leader',
    address: staleAddress,
    status: 'active',
    updated_at: 100,
  };

  executor.markTemporarilyUnroutableAddress(
    partitionId,
    staleAddress,
    originalService,
  );

  nowMs += QUERY_DEFAULTS.NO_SERVICE_WARN_THROTTLE_MS + 1_000;
  t.equal(
    executor.isTemporarilyUnroutableAddress(
      partitionId,
      staleAddress,
      originalService,
    ),
    true,
    'control-plane stale address should remain shadowed beyond the generic warn throttle while metadata is unchanged',
  );

  const refreshedService = {
    ...originalService,
    updated_at: 200,
  };
  t.equal(
    executor.isTemporarilyUnroutableAddress(
      partitionId,
      staleAddress,
      refreshedService,
    ),
    false,
    'updated service metadata should immediately release the stale no-handler shadow',
  );
});

test('QueryExecutor - non-control-plane no-handler quarantine keeps default ' +
  'short window', async (t) => {
  const partitionId = 'users-p1';
  const address = 'leader-node/partition/users-p1-r1';
  let nowMs = 5_000;
  const realDateNow = Date.now;
  Date.now = () => nowMs;
  t.teardown(() => {
    Date.now = realDateNow;
  });

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        table_name: 'users',
        leader_node_id: 'leader-node',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter() {
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    nodeId: 'local-node',
  });

  executor.markTemporarilyUnroutableAddress(partitionId, address, {
    service_id: 'users-p1-r1',
    service_type: 'partition',
    partition_id: partitionId,
    node_id: 'leader-node',
    raft_role: 'leader',
    address,
    status: 'active',
    updated_at: 100,
  });

  nowMs += QUERY_DEFAULTS.NO_SERVICE_WARN_THROTTLE_MS + 1_000;
  t.equal(
    executor.isTemporarilyUnroutableAddress(partitionId, address),
    false,
    'non-control-plane partitions should age out at the default short quarantine window',
  );
});

test('QueryExecutor - findPartitionLeaderAddress prefers canonical partition leader ' +
  'over stale service raft_role metadata', (t) => {
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'node1',
      },
    ],
    services: [
      {
        service_id: 'p1-node1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: null,
        address: 'node1/partition/p1',
        status: 'active',
      },
      {
        service_id: 'p1-node2',
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

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const address = executor.findPartitionLeaderAddress('p1');

  t.equal(address, 'node1/partition/p1');
  t.end();
});

test('QueryExecutor - excludes creating and syncing services from routable candidates',
  (t) => {
    const systemCache = {
      services: [
        {
          service_id: 'p1-creating',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node1',
          raft_role: 'leader',
          address: 'node1/partition/p1',
          status: 'creating',
        },
        {
          service_id: 'p1-syncing',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node2',
          raft_role: 'follower',
          address: 'node2/partition/p1',
          status: 'syncing',
        },
        {
          service_id: 'p1-active',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'node3',
          raft_role: 'leader',
          address: 'node3/partition/p1',
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
      messageRouter: createMockMessageRouter(),
      systemCache,
    });

    const services = executor.getRoutablePartitionServices('p1');

    t.same(
      services.map((service) => service.service_id),
      ['p1-active'],
      'only fully active partition services should be routable',
    );
    t.end();
  });

test('QueryExecutor - read candidates ignore NodeService leader hints', (t) => {
  const originalGetInstance = NodeService.getInstance;
  NodeService.getInstance = () => ({
    getPartitionLeader: () => ({
      address: 'stale-node/partition/p1',
      nodeId: 'stale-node',
      replicaId: 'stale-r1',
    }),
  });

  try {
    const systemCache = {
      services: [
        {
          service_id: 'p1-leader',
          service_type: 'partition',
          partition_id: 'p1',
          node_id: 'fresh-node',
          raft_role: 'leader',
          address: 'fresh-node/partition/p1',
          status: 'active',
        },
      ],
      filter: function(type, predicate) {
        if (type === 'services') {
          return this.services.filter(predicate);
        }
        return [];
      },
    };

    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache,
    });

    const candidates = executor.getPartitionServiceCandidates('p1', true, true);

    t.equal(
      candidates[0]?.address,
      'fresh-node/partition/p1',
      'read routing must use services table leader, not NodeService hint',
    );
  } finally {
    NodeService.getInstance = originalGetInstance;
  }
  t.end();
});

test('QueryExecutor - follows leader redirect response', async (t) => {
  mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);

  // Mock router that returns redirect on first call, success on second
  let callCount = 0;
  const redirectRouter = {
    deliver: async function(address, message) {
      callCount++;
      if (message.type === 'QUERY') {
        // First call to follower returns redirect
        if (address === 'follower-node/partition/p1') {
          return {
            acknowledged: true,
            success: false,
            redirect: 'LEADER_REDIRECT',
            leaderAddress: 'leader-node/partition/p1',
            partitionId: 'p1',
          };
        }
        // Second call to leader succeeds
        if (address === 'leader-node/partition/p1') {
          return {
            acknowledged: true,
            success: true,
            rows: mockPartitionData.get('p1') || [],
            changes: 1,
          };
        }
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };

  // Cache returns follower address first
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
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: redirectRouter,
    systemCache,
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1']);

  t.equal(result.success, true, 'query should succeed after redirect');
  t.equal(result.rows.length, 1, 'should return data from leader');
  t.equal(callCount, 2, 'should make two calls (follower + leader)');

  mockPartitionData.clear();
});

test('QueryExecutor - handles redirect when leader also fails', async (t) => {
  // Mock router where both follower and leader fail
  const failingRouter = {
    deliver: async function(address, message) {
      if (message.type === 'QUERY') {
        if (address === 'follower-node/partition/p1') {
          return {
            acknowledged: true,
            success: false,
            redirect: 'LEADER_REDIRECT',
            leaderAddress: 'leader-node/partition/p1',
            partitionId: 'p1',
          };
        }
        // Leader also fails
        return {
          acknowledged: true,
          success: false,
          error: 'Leader unavailable',
          partitionId: 'p1',
        };
      }
      return {acknowledged: true, success: true};
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
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: failingRouter,
    systemCache,
  });

  const ast = parseSQL('SELECT * FROM users');
  const result = await executor.executeSelect(ast, ['p1']);

  t.equal(result.success, false, 'query fails closed when all replicas fail');
  t.equal(result.errorCode, 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.same(result.failedPartitions, ['p1']);
});

// --- RETURNING clause reconstruction tests (Requirements: 3.2, 3.3) ---

test('QueryExecutor - buildInsertSQL appends RETURNING *', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') RETURNING *',
  );
  const sql = executor.buildInsertSQL(ast);

  t.match(sql, /RETURNING \*$/);
});

test('QueryExecutor - buildInsertSQL appends RETURNING columns', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\') RETURNING id, name',
  );
  const sql = executor.buildInsertSQL(ast);

  t.match(sql, /RETURNING id, name$/);
});

test('QueryExecutor - buildInsertSQL omits RETURNING when absent', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'INSERT INTO users (id, name) VALUES (\'a\', \'Alice\')',
  );
  const sql = executor.buildInsertSQL(ast);

  t.notMatch(sql, /RETURNING/);
});

test('QueryExecutor - buildUpdateSQL appends RETURNING *', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\' RETURNING *',
  );
  const sql = executor.buildUpdateSQL(ast);

  t.match(sql, /RETURNING \*$/);
});

test('QueryExecutor - buildUpdateSQL appends RETURNING columns', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\' RETURNING id, name',
  );
  const sql = executor.buildUpdateSQL(ast);

  t.match(sql, /RETURNING id, name$/);
});

test('QueryExecutor - buildUpdateSQL omits RETURNING when absent', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'UPDATE users SET name = \'Bob\' WHERE id = \'a\'',
  );
  const sql = executor.buildUpdateSQL(ast);

  t.notMatch(sql, /RETURNING/);
});

test('QueryExecutor - buildDeleteSQL appends RETURNING *', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'DELETE FROM users WHERE id = \'a\' RETURNING *',
  );
  const sql = executor.buildDeleteSQL(ast);

  t.match(sql, /RETURNING \*$/);
});

test('QueryExecutor - buildDeleteSQL appends RETURNING columns', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL(
    'DELETE FROM users WHERE id = \'a\' RETURNING id, name',
  );
  const sql = executor.buildDeleteSQL(ast);

  t.match(sql, /RETURNING id, name$/);
});

test('QueryExecutor - buildDeleteSQL omits RETURNING when absent', async (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
  });
  const ast = parseSQL('DELETE FROM users WHERE id = \'a\'');
  const sql = executor.buildDeleteSQL(ast);

  t.notMatch(sql, /RETURNING/);
});

// --- Derived table FROM clause tests (Requirements: 12.2) ---

test('QueryExecutor - buildSelectSQL emits derived table in FROM',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1']),
    });
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {
        type: 'table',
        name: null,
        alias: 't',
        subquery: {
          type: 'SELECT',
          columns: [{type: 'column_ref', table: null, column: 'id'}],
          from: {type: 'table', name: 'users', alias: null},
          joins: [],
          where: null,
          groupBy: null,
          having: null,
          orderBy: null,
          limit: null,
        },
      },
      joins: [],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /FROM \(SELECT id FROM users\) AS t/);
  });

test('QueryExecutor - buildSelectSQL emits derived table in JOIN',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1']),
    });
    const ast = {
      type: 'SELECT',
      columns: [{type: 'column_ref', table: null, column: '*'}],
      from: {type: 'table', name: 'orders', alias: null},
      joins: [{
        joinType: 'INNER',
        table: {
          type: 'table',
          name: null,
          alias: 'u',
          subquery: {
            type: 'SELECT',
            columns: [{type: 'column_ref', table: null, column: 'id'}],
            from: {type: 'table', name: 'users', alias: null},
            joins: [],
            where: null,
            groupBy: null,
            having: null,
            orderBy: null,
            limit: null,
          },
        },
        condition: {
          type: 'binary_expr',
          operator: '=',
          left: {type: 'column_ref', table: 'orders', column: 'user_id'},
          right: {type: 'column_ref', table: 'u', column: 'id'},
        },
      }],
      where: null,
      groupBy: null,
      having: null,
      orderBy: null,
      limit: null,
    };
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /FROM orders/);
    t.match(sql, /INNER JOIN \(SELECT id FROM users\) AS u/);
  });

test('QueryExecutor - buildSelectSQL uses table name when no subquery',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache(['p1']),
    });
    const ast = parseSQL('SELECT * FROM users WHERE id = \'1\'');
    const sql = executor.buildSelectSQL(ast);

    t.match(sql, /FROM users/);
    t.notMatch(sql, /FROM \(/);
  });

// --- CAST expression reconstruction tests (Requirements: 6.4) ---

test('QueryExecutor - buildExpressionSQL emits CAST with affinity',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'cast',
      expression: {type: 'column_ref', table: null, column: 'age'},
      affinity: 'TEXT',
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'CAST(age AS TEXT)');
  });

test('QueryExecutor - buildExpressionSQL emits CAST with nested expression',
  async (t) => {
    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache: createMockSystemCache([]),
    });
    const expr = {
      type: 'cast',
      expression: {type: 'literal', value: 42},
      affinity: 'REAL',
    };
    const sql = executor.buildExpressionSQL(expr);

    t.equal(sql, 'CAST(42 AS REAL)');
  });

// --- CASE expression reconstruction tests (Requirements: 11.3) ---
