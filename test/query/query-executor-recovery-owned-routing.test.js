/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  createMockMessageRouter,
} from './query-executor-test-support.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
} from '../../src/query/query-constants.js';
import {
  CANONICAL_LEADER_IDENTITY_SOURCE,
  CANONICAL_LEADER_IDENTITY_STATE,
  CANONICAL_LEADER_ROUTING_GAP_STATE,
} from '../../src/query/canonical-leader-routing.js';
import {
} from '../../src/partition/partition-service-constants.js';
import {
} from './routing-repair-test-helpers.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();


test('QueryExecutor - recovery-owned system-table writes reuse retained ' +
  'bootstrap leader ownership while control-plane metadata converges',
async (t) => {
  const partitionId = 'sql_transactions-p1';
  const retainedLeaderAddress = 'node-a/partition/sql_transactions-p1-r1';
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.SQL_TRANSACTIONS,
          leader_node_id: null,
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.SQL_TRANSACTIONS,
          leader_node_id: null,
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            service_id: 'sql_transactions-p1-r1',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-a',
            raft_role: 'follower',
            address: retainedLeaderAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'sql_transactions-p1-r2',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-b',
            raft_role: 'follower',
            address: 'node-b/partition/sql_transactions-p1-r2',
            status: SERVICE_STATUS.ACTIVE,
          },
        ].filter(predicate);
      }
      return [];
    },
  };
  const bootstrapTopologySnapshotOwner = {
    resolveCanonicalPartitionLeaderNodeId(requestedPartitionId) {
      return requestedPartitionId === partitionId ? 'node-a' : null;
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    bootstrapTopologySnapshotOwner,
  });

  const resolution = executor.resolvePartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.equal(
    resolution.routingSnapshot.canonicalLeaderIdentityState,
    CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED,
    'routing snapshot should reuse retained bootstrap owner metadata as canonical truth',
  );
  t.equal(
    resolution.routingSnapshot.canonicalLeaderRoutingGapState,
    CANONICAL_LEADER_ROUTING_GAP_STATE.NONE,
    'retained bootstrap owner metadata should close the canonical leader gap',
  );
  t.same(
    resolution.candidates.map((candidate) => candidate.address),
    [retainedLeaderAddress],
    'recovery-owned system-table writes should target the retained canonical leader instead of widening immediately',
  );
  t.equal(
    executor.findPartitionLeaderAddress(partitionId),
    retainedLeaderAddress,
    'strict leader lookup should reuse the retained bootstrap owner metadata',
  );
});

test('QueryExecutor - canonical leader routing reuses the richer bootstrap owner surface when available',
  async (t) => {
    const partitionId = 'sql_transactions-p1';
    const retainedLeaderAddress = 'node-a/partition/sql_transactions-p1-r1';
    const systemCache = {
      get(tableName, key) {
        if (tableName === TABLES.PARTITIONS && key === partitionId) {
          return {
            partition_id: partitionId,
            table_name: TABLES.SQL_TRANSACTIONS,
            leader_node_id: null,
          };
        }
        return null;
      },
      filter(tableName, predicate) {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: partitionId,
            table_name: TABLES.SQL_TRANSACTIONS,
            leader_node_id: null,
          }].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          return [{
            service_id: 'sql_transactions-p1-r1',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-a',
            raft_role: 'follower',
            address: retainedLeaderAddress,
            status: SERVICE_STATUS.ACTIVE,
          }].filter(predicate);
        }
        return [];
      },
    };
    const bootstrapTopologySnapshotOwner = {
      resolveCanonicalPartitionLeaderIdentity(requestedPartitionId) {
        if (requestedPartitionId !== partitionId) {
          return null;
        }
        return {
          state: CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED,
          source: 'owner_row',
          leaderNodeId: 'node-a',
          leaderWitnessNodeCount: 0,
          bootstrapLeaderStabilizationState: 'retained_cache_owner',
        };
      },
    };

    const executor = new QueryExecutor({
      messageRouter: createMockMessageRouter(),
      systemCache,
      bootstrapTopologySnapshotOwner,
    });

    const resolution = executor.resolvePartitionServiceCandidates(
      partitionId,
      false,
      false,
      false,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    );

    t.equal(
      resolution.routingSnapshot.bootstrapLeaderStabilizationState,
      'retained_cache_owner',
      'routing snapshot should preserve bootstrap stabilization diagnostics from the shared owner surface',
    );
    t.same(
      resolution.candidates.map((candidate) => candidate.address),
      [retainedLeaderAddress],
      'routing should honor the richer bootstrap owner surface without needing the legacy node-id-only method',
    );
  });

test('QueryExecutor - recovery-owned priority control-plane partitions retain ' +
  'the last-known-good leader while current owner rows lag', async (t) => {
  const partitionId = 'sql_transactions-p1';
  let currentLeaderNodeId = 'node-a';
  const currentServiceRows = [
    {
      service_id: 'sql_transactions-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: 'node-a',
      raft_role: 'follower',
      address: 'node-a/partition/sql_transactions-p1-r1',
      status: SERVICE_STATUS.ACTIVE,
    },
    {
      service_id: 'sql_transactions-p1-r2',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: 'node-b',
      raft_role: 'follower',
      address: 'node-b/partition/sql_transactions-p1-r2',
      status: SERVICE_STATUS.ACTIVE,
    },
  ];
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.SQL_TRANSACTIONS,
          leader_node_id: currentLeaderNodeId,
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.SQL_TRANSACTIONS,
          leader_node_id: currentLeaderNodeId,
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        return currentServiceRows.filter(predicate);
      }
      return [];
    },
  };
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const seededResolution = executor.resolvePartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );
  t.equal(
    seededResolution.routingSnapshot.canonicalLeaderIdentityState,
    CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED,
    'test fixture should seed retained leader ownership from the current owner row',
  );

  currentLeaderNodeId = null;
  const retainedResolution = executor.resolvePartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.equal(
    retainedResolution.routingSnapshot.canonicalLeaderIdentityState,
    CANONICAL_LEADER_IDENTITY_STATE.RETAINED_RUNTIME,
    'routing snapshot should expose runtime-retained priority control-plane leader evidence explicitly',
  );
  t.equal(
    retainedResolution.routingSnapshot.canonicalLeaderRoutingGapState,
    CANONICAL_LEADER_ROUTING_GAP_STATE.NONE,
    'retained priority control-plane leader should close the owner gap',
  );
  t.equal(
    retainedResolution.routingSnapshot.canonicalLeaderIdentitySource,
    CANONICAL_LEADER_IDENTITY_SOURCE.RETAINED_RUNTIME,
    'routing snapshot should preserve the shared retained-runtime source instead of masquerading as owner-confirmed state',
  );
  t.same(
    retainedResolution.candidates.map((candidate) => candidate.address),
    ['node-a/partition/sql_transactions-p1-r1'],
    'recovery-owned routing should continue targeting the retained leader node while current owner rows lag',
  );
});

test('QueryExecutor - retained priority control-plane leader is dropped ' +
  'and recovery candidates widen when the remembered node disappears',
async (t) => {
  const partitionId = 'sql_transactions-p1';
  let currentLeaderNodeId = 'node-a';
  let currentServiceRows = [
    {
      service_id: 'sql_transactions-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: 'node-a',
      raft_role: 'follower',
      address: 'node-a/partition/sql_transactions-p1-r1',
      status: SERVICE_STATUS.ACTIVE,
    },
    {
      service_id: 'sql_transactions-p1-r2',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: 'node-b',
      raft_role: 'follower',
      address: 'node-b/partition/sql_transactions-p1-r2',
      status: SERVICE_STATUS.ACTIVE,
    },
  ];
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.SQL_TRANSACTIONS,
          leader_node_id: currentLeaderNodeId,
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.SQL_TRANSACTIONS,
          leader_node_id: currentLeaderNodeId,
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        return currentServiceRows.filter(predicate);
      }
      return [];
    },
  };
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  executor.resolvePartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  currentLeaderNodeId = null;
  currentServiceRows = [{
    service_id: 'sql_transactions-p1-r2',
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: 'node-b',
    raft_role: 'follower',
    address: 'node-b/partition/sql_transactions-p1-r2',
    status: SERVICE_STATUS.ACTIVE,
  }];
  const clearedResolution = executor.resolvePartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.equal(
    clearedResolution.routingSnapshot.canonicalLeaderIdentityState,
    CANONICAL_LEADER_IDENTITY_STATE.MISSING,
    'retained leader ownership should be discarded once the remembered node no longer serves the partition',
  );
  t.equal(
    clearedResolution.routingSnapshot.canonicalLeaderRoutingGapState,
    CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING,
    'routing snapshot should surface the owner gap again after retained leader invalidation',
  );
  t.same(
    clearedResolution.candidates.map((candidate) => candidate.address),
    ['node-b/partition/sql_transactions-p1-r2'],
    'priority recovery routing should widen to live candidates after retained leader invalidation while owner metadata catches up',
  );
});

test('QueryExecutor - recovery-owned system-table writes should spread ' +
  'widened recovery candidates from the selection owner, not cache row order',
async (t) => {
  const partitionId = 'nodes-p1';
  const firstAddress = 'node-a/partition/nodes-p1-r1';
  const secondAddress = 'node-b/partition/nodes-p1-r2';
  const thirdAddress = 'node-c/partition/nodes-p1-r3';
  const rotationSeedA = 'seed-a';
  const rotationSeedB = 'seed-b';
  const rotationSeedC = 'seed-c';
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.NODES,
          leader_node_id: 'stale-node',
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.NODES,
          leader_node_id: 'stale-node',
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            service_id: 'nodes-p1-r1',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-a',
            raft_role: 'follower',
            address: firstAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'nodes-p1-r2',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-b',
            raft_role: 'follower',
            address: secondAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'nodes-p1-r3',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-c',
            raft_role: 'follower',
            address: thirdAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
        ].filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const seedAResolution = executor.resolvePartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    {recoveryCandidateSelectionKey: rotationSeedA},
  );
  const seedBResolution = executor.resolvePartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    {recoveryCandidateSelectionKey: rotationSeedB},
  );
  const seedCResolution = executor.resolvePartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    {recoveryCandidateSelectionKey: rotationSeedC},
  );

  t.equal(
    seedAResolution.routingSnapshot.canonicalLeaderRoutingGapState,
    CANONICAL_LEADER_ROUTING_GAP_STATE.SERVICE_MISSING,
    'selection rotation should still run inside the canonical service-gap recovery path',
  );
  t.same(
    seedAResolution.candidates.map((candidate) => candidate.address),
    [firstAddress, secondAddress, thirdAddress],
    'one selection seed should preserve the first widened recovery candidate',
  );
  t.same(
    seedBResolution.candidates.map((candidate) => candidate.address),
    [secondAddress, thirdAddress, firstAddress],
    'a different selection seed should rotate the first widened recovery candidate',
  );
  t.same(
    seedCResolution.candidates.map((candidate) => candidate.address),
    [thirdAddress, firstAddress, secondAddress],
    'recovery candidate spread should cover the remaining live replica order as well',
  );
});

test('QueryExecutor - executeOnPartition applies recovery candidate ' +
  'selection before the first widened write delivery', async (t) => {
  const partitionId = 'nodes-p1';
  const firstAddress = 'node-a/partition/nodes-p1-r1';
  const secondAddress = 'node-b/partition/nodes-p1-r2';
  const thirdAddress = 'node-c/partition/nodes-p1-r3';
  const rotationSeedB = 'seed-b';
  const deliveries = [];
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
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.NODES,
          leader_node_id: 'stale-node',
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.NODES,
          leader_node_id: 'stale-node',
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            service_id: 'nodes-p1-r1',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-a',
            raft_role: 'follower',
            address: firstAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'nodes-p1-r2',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-b',
            raft_role: 'follower',
            address: secondAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'nodes-p1-r3',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-c',
            raft_role: 'follower',
            address: thirdAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
        ].filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE nodes SET status = ? WHERE node_id = ?',
    ['active', 'node-b'],
    false,
    false,
    false,
    {
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      recoveryCandidateSelectionKey: rotationSeedB,
    },
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [secondAddress],
    'executeOnPartition should route the first widened attempt through the same recovery-candidate spread owner as direct resolution',
  );
});

test('QueryExecutor - recovery-owned system-table writes should try ' +
  'the next widened recovery candidate when the first one defers on pressure',
async (t) => {
  const partitionId = 'sql_write_operations-p1';
  const firstAddress = 'node-a/partition/sql_write_operations-p1-r1';
  const secondAddress = 'node-b/partition/sql_write_operations-p1-r2';
  const thirdAddress = 'node-c/partition/sql_write_operations-p1-r3';
  const rotationSeedA = 'seed-a';
  const pressureDeferredError = 'query_admission_deferred';
  const deliveries = [];
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === firstAddress) {
        return {
          acknowledged: true,
          success: false,
          error: pressureDeferredError,
          errorCode: 'INTERNAL_ERROR',
          retryAfterMs: 250,
          deferRetry: true,
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
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.SQL_WRITE_OPERATIONS,
          leader_node_id: 'stale-node',
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.SQL_WRITE_OPERATIONS,
          leader_node_id: 'stale-node',
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            service_id: 'sql_write_operations-p1-r1',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-a',
            raft_role: 'follower',
            address: firstAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'sql_write_operations-p1-r2',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-b',
            raft_role: 'follower',
            address: secondAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'sql_write_operations-p1-r3',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-c',
            raft_role: 'follower',
            address: thirdAddress,
            status: SERVICE_STATUS.ACTIVE,
          },
        ].filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.queryTimeoutMs = 5;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    partitionId,
    'INSERT INTO sql_write_operations (operation_id) VALUES (?)',
    ['op-1'],
    false,
    false,
    false,
    {
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      recoveryCandidateSelectionKey: rotationSeedA,
    },
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [firstAddress, secondAddress],
    'candidate-local deferred pressure should fall through to the next widened recovery candidate instead of restarting the same hot target',
  );
});

test('QueryExecutor - user-table writes stay fail-closed when canonical ' +
  'leader identity is unresolved', async (t) => {
  const partitionId = 'events-p1';
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: 'events',
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: 'events',
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            service_id: 'events-p1-r1',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-a',
            raft_role: 'follower',
            address: 'node-a/partition/events-p1-r1',
            status: SERVICE_STATUS.ACTIVE,
          },
        ].filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
  });

  const resolution = executor.resolvePartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.equal(
    resolution.routingSnapshot.canonicalLeaderRoutingGapState,
    CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING,
    'routing snapshot should still surface the canonical leader owner gap',
  );
  t.same(
    resolution.candidates,
    [],
    'steady-state user-table writes should remain fail-closed on the same gap',
  );
});

test('QueryExecutor - executeOnPartition retries reads with ' +
  'routing repair when no candidates found (§1.10)', async (t) => {
  // Proves: read path gets bounded retries (not just 1 attempt)
  // so routing repair can discover new candidates across attempts.
  let resolveCount = 0;
  const systemCache = {
    partitions: [
      {partition_id: 'p1', leader_node_id: 'node1'},
    ],
    services: [],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find(
          (p) => p.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      resolveCount++;
      // On third resolve call (second retry attempt), return a service
      if (resolveCount >= 3) {
        const services = [
          {
            service_id: 'svc-n1',
            service_type: 'partition',
            partition_id: 'p1',
            node_id: 'node1',
            raft_role: 'leader',
            address: 'node1/partition/p1',
            status: 'active',
          },
        ];
        if (type === 'services') return services.filter(predicate);
      }
      if (type === 'services') return [];
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    deliver: async () => {
      return {acknowledged: true, success: true, rows: [{id: 1}]};
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.queryTimeoutMs = 5;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    'p1',
    'SELECT * FROM users',
    [],
    true, // forRead
    false,
    false,
  );

  t.equal(
    result.success,
    true,
    'read should succeed after routing repair discovers candidates',
  );
  t.end();
});
