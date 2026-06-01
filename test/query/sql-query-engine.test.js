/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/partition/partition-constants.js';
import {
} from '../../src/control-plane/timeout-budget.js';
import {
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../../src/cdc/cdc-integration-service.js';
import {
  registerSqlQueryEngineExecutionTestCases,
} from './sql-query-engine-execution-test-cases.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

const AUTHORITATIVE_OVERLAY_STATE_AUTHORITATIVE_MISSING =
  'authoritative_missing';

// Mock partition data for routing
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/replicaId)
      const parts = address.split('/');
      const replicaId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(replicaId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: 0,
        };
      }
      return {acknowledged: true, success: true};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(tables, partitions, services, nodes = []) {
  const resolvedServices = services || partitions.map((p) => ({
    service_id: p.partition_id,
    service_type: 'partition',
    partition_id: p.partition_id,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${p.partition_id}`,
    status: 'active',
  }));
  const resolvedPartitions = partitions.map((partition) => {
    if (Object.prototype.hasOwnProperty.call(partition, 'leader_node_id') ||
        Object.prototype.hasOwnProperty.call(partition, 'leaderNodeId')) {
      return partition;
    }
    const leaderService = resolvedServices.find((service) =>
      service.partition_id === partition.partition_id &&
      service.raft_role === 'leader',
    ) || resolvedServices.find((service) =>
      service.partition_id === partition.partition_id,
    );
    return {
      ...partition,
      leader_node_id: leaderService?.node_id || 'test-node',
    };
  });
  return {
    tables,
    partitions: resolvedPartitions,
    services: resolvedServices,
    get: function(type, key) {
      if (type === 'tables') {
        return this.tables.find((t) => t.table_name === key);
      }
      if (type === 'nodes') {
        return nodes.find((node) => node[COLUMN.NODE_ID] === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'nodes') {
        return nodes.filter(predicate);
      }
      return [];
    },
    getAll: function(type) {
      if (type === 'partitions') return this.partitions;
      if (type === 'tables') return this.tables;
      if (type === 'services') return this.services;
      if (type === 'nodes') return nodes;
      return [];
    },
  };
}


test('SQLQueryEngine - seeds bootstrap routing overlay snapshots for ' +
  'system-table partition lookup during restart cache gaps', async (t) => {
  const cache = createMockSystemCache([], [], [], []);
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'join-node',
  });

  const seededCount = engine.seedBootstrapRoutingOverlayFromSnapshots({
    [TABLES.PARTITIONS]: [
      {
        partition_id: 'nodes-p1',
        table_name: TABLES.NODES,
        created_at: 1,
        updated_at: 1,
      },
      {
        partition_id: 'users-p1',
        table_name: 'users',
        created_at: 1,
        updated_at: 1,
      },
    ],
    [TABLES.SERVICES]: [
      {
        service_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'nodes-p1',
        node_id: 'seed-node',
        raft_role: 'leader',
        address: 'seed-node/partition/nodes-p1-r1',
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'users-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'users-p1',
        node_id: 'seed-node',
        raft_role: 'leader',
        address: 'seed-node/partition/users-p1-r1',
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
  });

  t.equal(seededCount, 1, 'should seed overlay only for system-table partitions');

  const partitions = engine.getTablePartitions(TABLES.NODES);
  t.equal(partitions.length, 1,
    'system-table partition lookup should use bootstrap overlay when cache is empty');
  t.equal(partitions[0].partition_id, 'nodes-p1',
    'overlay partition should preserve canonical partition id');
  t.equal(partitions[0].leader_node_id, 'seed-node',
    'overlay partition should expose the canonical leader node');

  const services = engine.queryExecutor.getRoutablePartitionServices('nodes-p1');
  t.equal(services.length, 1,
    'query executor should see routable services from the same overlay owner path');
  t.equal(services[0].address, 'seed-node/partition/nodes-p1-r1',
    'overlay service should remain routable during the cache gap');
});

test('SQLQueryEngine - keeps bootstrap routing overlay service visibility ' +
  'when cache leader metadata survives but leader services disappear', async (t) => {
  const partitionId = 'nodes-p1';
  const cache = createMockSystemCache([], [
    {
      partition_id: partitionId,
      table_name: TABLES.NODES,
      leader_node_id: 'seed-node',
      created_at: 1,
      updated_at: 2,
    },
  ], []);
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'join-node',
  });

  const seededCount = engine.seedBootstrapRoutingOverlayFromSnapshots({
    [TABLES.PARTITIONS]: [
      {
        partition_id: partitionId,
        table_name: TABLES.NODES,
        leader_node_id: 'seed-node',
        created_at: 1,
        updated_at: 2,
      },
    ],
    [TABLES.SERVICES]: [
      {
        service_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'seed-node',
        raft_role: 'leader',
        address: 'seed-node/partition/nodes-p1-r1',
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
  });

  t.equal(seededCount, 1,
    'system-table bootstrap routing overlay should remain installable as a service-gap bridge');
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    'seed-node/partition/nodes-p1-r1',
    'query routing should keep the canonical leader address when cache service rows disappear',
  );
  t.equal(
    engine.queryExecutor.getPartitionRoutingSnapshot(partitionId)
      .serviceRowCount,
    1,
    'routing snapshot should reuse the bootstrap overlay service row while the cache gap remains',
  );
});

test('SQLQueryEngine - keeps system-table bootstrap routing overlays ' +
  'available beyond the provisioning timeout while canonical leader ' +
  'service rows are still missing', async (t) => {
  const partitionId = 'nodes-p1';
  const leaderNodeId = 'seed-node';
  const leaderAddress = 'seed-node/partition/nodes-p1-r1';
  const overlayTimeoutMs = 5000;
  let nowMs = 1;
  const cache = createMockSystemCache([], [
    {
      partition_id: partitionId,
      table_name: TABLES.NODES,
      leader_node_id: leaderNodeId,
      created_at: 1,
      updated_at: 2,
    },
  ], []);
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'join-node',
    nowFn: () => nowMs,
    tablePartitionProvisioningTimeoutMs: overlayTimeoutMs,
  });

  const seededCount = engine.seedBootstrapRoutingOverlayFromSnapshots({
    [TABLES.PARTITIONS]: [
      {
        partition_id: partitionId,
        table_name: TABLES.NODES,
        leader_node_id: leaderNodeId,
        created_at: 1,
        updated_at: 2,
      },
    ],
    [TABLES.SERVICES]: [
      {
        service_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: leaderNodeId,
        raft_role: 'leader',
        address: leaderAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
  });

  t.equal(seededCount, 1,
    'system-table service-gap bridges should still seed once from bootstrap snapshots');

  nowMs = overlayTimeoutMs + 1000;

  const routingSnapshot =
    engine.queryExecutor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    routingSnapshot.serviceRowCount,
    1,
    'routing snapshot should keep the system-table service-gap bridge after the provisioning timeout elapses',
  );
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    leaderAddress,
    'leader routing should still resolve through the retained system-table bridge',
  );
});

test('SQLQueryEngine - reactivates retained system-table bootstrap bridges ' +
  'when cache leader services disappear again after initial convergence',
async (t) => {
  const partitionId = 'nodes-p1';
  const leaderNodeId = 'seed-node';
  const leaderAddress = 'seed-node/partition/nodes-p1-r1';
  let cacheServices = [];
  const cache = createMockSystemCache([], [
    {
      partition_id: partitionId,
      table_name: TABLES.NODES,
      leader_node_id: leaderNodeId,
      created_at: 1,
      updated_at: 2,
    },
  ], []);
  cache.filter = function(type, predicate) {
    if (type === TABLES.PARTITIONS) {
      return this.partitions.filter(predicate);
    }
    if (type === TABLES.SERVICES) {
      return cacheServices.filter(predicate);
    }
    return [];
  };
  cache.getAll = function(type) {
    if (type === TABLES.PARTITIONS) {
      return this.partitions;
    }
    if (type === TABLES.SERVICES) {
      return cacheServices;
    }
    if (type === TABLES.TABLES) {
      return this.tables;
    }
    return [];
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'join-node',
  });

  const seededCount = engine.seedBootstrapRoutingOverlayFromSnapshots({
    [TABLES.PARTITIONS]: [
      {
        partition_id: partitionId,
        table_name: TABLES.NODES,
        leader_node_id: leaderNodeId,
        created_at: 1,
        updated_at: 2,
      },
    ],
    [TABLES.SERVICES]: [
      {
        service_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: leaderNodeId,
        raft_role: 'leader',
        address: leaderAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
  });

  t.equal(seededCount, 1);
  t.equal(
    engine.queryExecutor.getPartitionRoutingSnapshot(partitionId).serviceRowCount,
    1,
    'bootstrap bridge should initially cover the system-table leader service gap',
  );

  cacheServices = [
    {
      service_id: 'nodes-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: leaderNodeId,
      raft_role: 'leader',
      address: leaderAddress,
      status: SERVICE_STATUS.ACTIVE,
    },
  ];

  t.equal(
    engine.queryExecutor.getPartitionRoutingSnapshot(partitionId).serviceRowCount,
    1,
    'cache routing should supersede the retained bridge once canonical leader services converge',
  );

  cacheServices = [];

  t.equal(
    engine.queryExecutor.getPartitionRoutingSnapshot(partitionId).serviceRowCount,
    1,
    'retained system-table bridge should reactivate after cache leader services disappear again',
  );
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    leaderAddress,
    'reactivated system-table bridge should preserve the canonical leader address',
  );
});

test('SQLQueryEngine - seeds dormant system-table bootstrap bridges even when ' +
  'cache routing is initially healthy',
async (t) => {
  const partitionId = 'nodes-p1';
  const leaderNodeId = 'seed-node';
  const leaderAddress = 'seed-node/partition/nodes-p1-r1';
  let cacheServices = [
    {
      service_id: 'nodes-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: leaderNodeId,
      raft_role: 'leader',
      address: leaderAddress,
      status: SERVICE_STATUS.ACTIVE,
    },
  ];
  const cache = createMockSystemCache([], [
    {
      partition_id: partitionId,
      table_name: TABLES.NODES,
      leader_node_id: leaderNodeId,
      created_at: 1,
      updated_at: 2,
    },
  ], []);
  cache.filter = function(type, predicate) {
    if (type === TABLES.PARTITIONS) {
      return this.partitions.filter(predicate);
    }
    if (type === TABLES.SERVICES) {
      return cacheServices.filter(predicate);
    }
    return [];
  };
  cache.getAll = function(type) {
    if (type === TABLES.PARTITIONS) {
      return this.partitions;
    }
    if (type === TABLES.SERVICES) {
      return cacheServices;
    }
    if (type === TABLES.TABLES) {
      return this.tables;
    }
    return [];
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'join-node',
  });

  const seededCount = engine.seedBootstrapRoutingOverlayFromSnapshots({
    [TABLES.PARTITIONS]: [
      {
        partition_id: partitionId,
        table_name: TABLES.NODES,
        leader_node_id: leaderNodeId,
        created_at: 1,
        updated_at: 2,
      },
    ],
    [TABLES.SERVICES]: [
      {
        service_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: leaderNodeId,
        raft_role: 'leader',
        address: leaderAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
  });

  t.equal(
    seededCount,
    1,
    'system-table bootstrap seeding should retain a dormant bridge even when cache routing is already healthy',
  );
  t.equal(
    engine.queryExecutor.getPartitionRoutingSnapshot(partitionId).serviceRowCount,
    1,
    'healthy cache routing should still serve the canonical leader immediately after seeding',
  );

  cacheServices = [];

  t.equal(
    engine.queryExecutor.getPartitionRoutingSnapshot(partitionId).serviceRowCount,
    1,
    'dormant system-table bootstrap bridge should reactivate after later cache service regression',
  );
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    leaderAddress,
    'dormant bridge reactivation should preserve the canonical leader address',
  );
});

test('SQLQueryEngine - ignores stale bootstrap routing snapshot services ' +
  'when cache leader metadata points at a different node', async (t) => {
  const partitionId = 'nodes-p1';
  const cache = createMockSystemCache([], [
    {
      partition_id: partitionId,
      table_name: TABLES.NODES,
      leader_node_id: 'new-owner',
      created_at: 1,
      updated_at: 2,
    },
  ], []);
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'join-node',
  });

  const seededCount = engine.seedBootstrapRoutingOverlayFromSnapshots({
    [TABLES.PARTITIONS]: [
      {
        partition_id: partitionId,
        table_name: TABLES.NODES,
        leader_node_id: 'seed-node',
        created_at: 1,
        updated_at: 2,
      },
    ],
    [TABLES.SERVICES]: [
      {
        service_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'seed-node',
        raft_role: 'leader',
        address: 'seed-node/partition/nodes-p1-r1',
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
  });

  t.equal(seededCount, 0,
    'bootstrap routing overlay should fail closed when snapshot service ownership conflicts with cached leader metadata');
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    null,
    'query routing should not revive stale leader services for the wrong owner node',
  );
});

test('SQLQueryEngine - recovery routing overlay does not invent a leader ' +
  'from follower-only service visibility', async (t) => {
  const partitionId = 'nodes-p1';
  const cache = createMockSystemCache([], [], [], []);
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'join-node',
  });

  const installed = engine.installRecoveryRoutingOverlayEntry(
    partitionId,
    TABLES.NODES,
    [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'seed-node',
        raft_role: 'follower',
        address: 'seed-node/partition/nodes-p1-r1',
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: `${partitionId}-r2`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'node-b',
        raft_role: 'follower',
        address: 'node-b/partition/nodes-p1-r2',
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: `${partitionId}-r3`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'node-c',
        raft_role: 'follower',
        address: 'node-c/partition/nodes-p1-r3',
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
  );

  t.equal(installed, true, 'recovery overlay should still install service visibility');
  t.equal(
    engine.getTablePartitions(TABLES.NODES)[0]?.leader_node_id || null,
    null,
    'recovery overlay should not fabricate canonical leader ownership from follower-only services',
  );
  t.equal(
    engine.queryExecutor.findPartitionLeaderAddress(partitionId),
    null,
    'routing should fail closed until coherent leader evidence exists',
  );
});

test('SQLQueryEngine - bootstrap overlay reuse follows the shared canonical ' +
  'leader owner before stale cached partition rows', async (t) => {
  const BOOTSTRAP_OVERLAY_REUSE_STATE_FRESH_BOOTSTRAP = 'fresh_bootstrap';
  const partitionId = 'nodes-p1';
  const cache = createMockSystemCache([], [
    {
      partition_id: partitionId,
      table_name: TABLES.NODES,
      leader_node_id: 'stale-owner',
    },
  ], []);
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    nodeId: 'join-node',
    bootstrapTopologySnapshotOwner: {
      resolveCanonicalPartitionLeaderIdentity(targetPartitionId) {
        if (targetPartitionId !== partitionId) {
          return null;
        }
        return {
          state: 'missing',
          source: 'none',
          leaderNodeId: null,
          leaderWitnessNodeCount: 0,
        };
      },
    },
  });

  const decision = engine.resolveBootstrapRoutingOverlayReuseDecision(
    partitionId,
    {
      partition: {
        partition_id: partitionId,
        table_name: TABLES.NODES,
      },
      services: [
        {
          service_id: `${partitionId}-r1`,
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: 'fresh-owner',
          raft_role: 'leader',
          address: 'fresh-owner/partition/nodes-p1-r1',
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
    },
  );

  t.equal(
    decision.state,
    BOOTSTRAP_OVERLAY_REUSE_STATE_FRESH_BOOTSTRAP,
    'overlay reuse should follow the shared owner gap instead of reviving stale cached leader metadata',
  );
  t.equal(
    decision.partition?.partition_id,
    partitionId,
    'overlay reuse should preserve the offered partition identity when the shared owner reports a gap',
  );
});

test('SQLQueryEngine - composes authoritative routing overlay refresh ' +
  'into QueryExecutor runtime repair', async (t) => {
  const partitionId = 'replica_operations-p1';
  const cache = createMockSystemCache([], [
    {
      partition_id: partitionId,
      table_name: TABLES.REPLICA_OPERATIONS,
      leader_node_id: 'old-owner',
    },
  ], [
    {
      service_id: 'replica_operations-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: 'old-owner',
      raft_role: 'leader',
      address: 'old-owner/partition/replica_operations-p1-r1',
      status: SERVICE_STATUS.ACTIVE,
    },
  ]);
  const authoritativeReads = [];
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: {
      async readRows(tableName, _sql, params) {
        authoritativeReads.push({tableName, params});
        if (tableName === TABLES.PARTITIONS) {
          return {
            success: true,
            rows: [
              {
                partition_id: partitionId,
                table_name: TABLES.REPLICA_OPERATIONS,
                leader_node_id: 'new-owner',
              },
            ],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [
              {
                service_id: 'replica_operations-p1-r4',
                service_type: SERVICE_TYPE.PARTITION,
                partition_id: partitionId,
                node_id: 'new-owner',
                raft_role: 'leader',
                address: 'new-owner/partition/replica_operations-p1-r4',
                status: SERVICE_STATUS.ACTIVE,
              },
            ],
          };
        }
        return {success: false, rows: []};
      },
    },
  });

  const refreshed =
    await engine.queryExecutor.routingMetadataOverlay
      .refreshPartitionRouting(partitionId);

  t.equal(refreshed, true,
    'composed overlay should expose authoritative refresh for runtime routing repair');
  t.equal(authoritativeReads.length, 2,
    'authoritative refresh should read both partitions and services for the target partition');
  t.equal(
    engine.authoritativeRoutingOverlay.shouldMaskCacheServicesForPartition(
      partitionId,
    ),
    true,
    'authoritative overlay should suppress stale cached service rows after refresh',
  );

  const candidates = engine.queryExecutor.getPartitionServiceCandidates(
    partitionId,
    true,
  );
  t.notOk(
    candidates.some(
      (candidate) =>
        candidate.address ===
        'old-owner/partition/replica_operations-p1-r1',
    ),
    'stale cached owner endpoint should be masked once authoritative refresh publishes a new service set',
  );
  t.ok(
    candidates.some(
      (candidate) =>
        candidate.address ===
        'new-owner/partition/replica_operations-p1-r4',
    ),
    'refreshed authoritative owner endpoint should be visible to query routing after repair',
  );

  const recoveryCandidates =
    engine.queryExecutor.getLeaderRecoveryCandidates(
      engine.queryExecutor.getPartitionRoutingSnapshot(partitionId),
      new Set(['old-owner/partition/replica_operations-p1-r1']),
      false,
    );
  t.equal(recoveryCandidates.length, 1,
    'leader recovery candidate selection should skip the stale attempted address');
  t.equal(
    recoveryCandidates[0].address,
    'new-owner/partition/replica_operations-p1-r4',
    'leader recovery should target the refreshed authoritative owner endpoint',
  );
});

test('SQLQueryEngine - exposes initialized local priority control-plane ' +
  'partition services while durable service status lags', async (t) => {
  const partitionId = 'replica_operations-p1';
  const staleSeedAddress = 'seed/partition/replica_operations-p1-r1';
  const localAddress = 'local/partition/replica_operations-p1-r4';
  const localPartitionServices = new Map([
    ['replica_operations-p1-r4', {
      partitionId,
      replicaId: 'replica_operations-p1-r4',
      nodeId: 'local',
      unifiedAddress: localAddress,
      initialized: true,
      role: 'leader',
    }],
  ]);
  const engine = new SQLQueryEngine({
    nodeId: 'local',
    systemCache: createMockSystemCache([], [
      {
        partition_id: partitionId,
        table_name: TABLES.REPLICA_OPERATIONS,
        leader_node_id: 'seed',
      },
    ], [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'seed',
        raft_role: 'leader',
        address: staleSeedAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'replica_operations-p1-r4',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'local',
        raft_role: 'leader',
        address: localAddress,
        status: 'pending',
      },
    ]),
    messageRouter: createMockMessageRouter(),
    partitionServicesProvider: () => localPartitionServices,
  });

  const routingSnapshot = engine.queryExecutor.getPartitionRoutingSnapshot(
    partitionId,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.ok(
    routingSnapshot.routableServices.some(
      (service) =>
        service.address === localAddress &&
        service.status === SERVICE_STATUS.ACTIVE,
    ),
    'initialized local runtime service should be routable as active before its durable services row converges',
  );

  const recoveryCandidates = engine.queryExecutor.getLeaderRecoveryCandidates(
    routingSnapshot,
    new Set([staleSeedAddress]),
    false,
  );

  t.equal(
    recoveryCandidates[0]?.address,
    localAddress,
    'priority recovery routing should widen from a failed seed owner to the local runtime service',
  );
});

test('SQLQueryEngine - excludes disconnected priority control-plane ' +
  'routing endpoints', async (t) => {
  const partitionId = 'replica_operations-p1';
  const disconnectedAddress = 'dead/partition/replica_operations-p1-r3';
  const connectedAddress = 'live/partition/replica_operations-p1-r4';
  const engine = new SQLQueryEngine({
    nodeId: 'local',
    systemCache: createMockSystemCache([], [
      {
        partition_id: partitionId,
        table_name: TABLES.REPLICA_OPERATIONS,
        leader_node_id: 'dead',
      },
    ], [
      {
        service_id: 'replica_operations-p1-r3',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'dead',
        raft_role: 'leader',
        address: disconnectedAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'replica_operations-p1-r4',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'live',
        raft_role: 'follower',
        address: connectedAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ]),
    messageRouter: {
      ...createMockMessageRouter(),
      getConnectionState(nodeId) {
        return nodeId === 'dead' ? 'closed' : 'connected';
      },
    },
  });

  const routingSnapshot = engine.queryExecutor.getPartitionRoutingSnapshot(
    partitionId,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.notOk(
    routingSnapshot.routableServices.some(
      (service) => service.address === disconnectedAddress,
    ),
    'closed priority endpoint should not remain routable',
  );
  t.ok(
    routingSnapshot.routableServices.some(
      (service) => service.address === connectedAddress,
    ),
    'connected priority endpoint should remain routable',
  );

  const candidates = engine.queryExecutor.getPartitionServiceCandidates(
    partitionId,
    true,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );
  t.notOk(
    candidates.some((candidate) => candidate.address === disconnectedAddress),
    'read candidates should skip the closed priority endpoint',
  );
});

test('SQLQueryEngine - authoritative routing overlay refresh masks stale ' +
  'cached service rows when authoritative reads confirm the partition is absent',
async (t) => {
  const partitionId = 'control_plane_publications-p1';
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [
      {
        partition_id: partitionId,
        table_name: TABLES.CONTROL_PLANE_PUBLICATIONS,
        leader_node_id: 'stale-owner',
      },
    ], [
      {
        service_id: 'control_plane_publications-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'stale-owner',
        raft_role: 'leader',
        address: 'stale-owner/partition/control_plane_publications-p1-r1',
        status: SERVICE_STATUS.ACTIVE,
      },
    ]),
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: {
      async readRows() {
        return {
          success: true,
          rows: [],
        };
      },
    },
  });

  const refreshed =
    await engine.queryExecutor.routingMetadataOverlay
      .refreshPartitionRouting(partitionId);

  t.equal(
    refreshed,
    true,
    'authoritative refresh should still install overlay state when absence is confirmed',
  );
  t.equal(
    engine.getAuthoritativeRoutingOverlayEntryState(partitionId).state,
    AUTHORITATIVE_OVERLAY_STATE_AUTHORITATIVE_MISSING,
    'authoritative absence should be recorded explicitly in overlay state',
  );
  t.equal(
    engine.queryExecutor.getPartitionRoutingSnapshot(partitionId).serviceRowCount,
    0,
    'stale cached service rows should be masked when the authoritative owner reports no partition routing rows',
  );
});

test('SQLQueryEngine - authoritative routing overlay keeps cache services ' +
  'eligible when the service snapshot is below the replica target',
async (t) => {
  const partitionId = 'control_plane_publications-p1';
  const overlayNodeId = 'overlay-node';
  const cacheNodeId = 'cache-node';
  const targetReplicaCount = 3;
  const overlayAddress =
    'overlay-node/partition/control_plane_publications-p1-r5';
  const cacheFallbackAddress =
    'cache-node/partition/control_plane_publications-p1-r4';
  const cache = createMockSystemCache([], [
    {
      partition_id: partitionId,
      table_name: TABLES.CONTROL_PLANE_PUBLICATIONS,
      leader_node_id: overlayNodeId,
      replica_count: targetReplicaCount,
    },
  ], [
    {
      service_id: 'control_plane_publications-p1-r4',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: partitionId,
      node_id: cacheNodeId,
      raft_role: 'follower',
      address: cacheFallbackAddress,
      status: SERVICE_STATUS.ACTIVE,
    },
  ]);
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: {
      async readRows(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return {
            success: true,
            rows: [
              {
                partition_id: partitionId,
                table_name: TABLES.CONTROL_PLANE_PUBLICATIONS,
                leader_node_id: overlayNodeId,
                replica_count: targetReplicaCount,
              },
            ],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [
              {
                service_id: 'control_plane_publications-p1-r5',
                service_type: SERVICE_TYPE.PARTITION,
                partition_id: partitionId,
                node_id: overlayNodeId,
                raft_role: 'follower',
                address: overlayAddress,
                status: SERVICE_STATUS.ACTIVE,
              },
            ],
          };
        }
        return {
          success: false,
          rows: [],
        };
      },
    },
  });

  const refreshed =
    await engine.queryExecutor.routingMetadataOverlay
      .refreshPartitionRouting(partitionId);

  t.equal(refreshed, true);
  t.equal(
    engine.authoritativeRoutingOverlay.shouldMaskCacheServicesForPartition(
      partitionId,
    ),
    false,
    'partial authoritative service snapshots should not mask cached fallback rows',
  );
  const candidates = engine.queryExecutor.getPartitionServiceCandidates(
    partitionId,
    true,
  );
  t.ok(
    candidates.some((candidate) => candidate.address === overlayAddress),
    'routing should include the refreshed authoritative service row',
  );
  t.ok(
    candidates.some((candidate) => candidate.address === cacheFallbackAddress),
    'routing should retain cached fallback rows when authoritative coverage is incomplete',
  );
});

test('SQLQueryEngine - authoritative routing overlay refresh requests ' +
  'bounded local replica fallback for control-plane routing repair', async (t) => {
  const partitionId = 'replica_operations-p1';
  const authoritativeReads = [];
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [
      {
        partition_id: partitionId,
        table_name: TABLES.REPLICA_OPERATIONS,
        leader_node_id: 'old-owner',
      },
    ], [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: 'old-owner',
        raft_role: 'leader',
        address: 'old-owner/partition/replica_operations-p1-r1',
        status: SERVICE_STATUS.ACTIVE,
      },
    ]),
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: {
      async readRows(tableName, _sql, params, options) {
        authoritativeReads.push({tableName, params, options});
        if (
          options?.replicaFallbackConsistency !==
          LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA
        ) {
          return {
            success: false,
            rows: [],
            error: 'expected_any_replica_fallback',
          };
        }
        if (tableName === TABLES.PARTITIONS) {
          return {
            success: true,
            rows: [
              {
                partition_id: partitionId,
                table_name: TABLES.REPLICA_OPERATIONS,
                leader_node_id: 'new-owner',
              },
            ],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [
              {
                service_id: 'replica_operations-p1-r5',
                service_type: SERVICE_TYPE.PARTITION,
                partition_id: partitionId,
                node_id: 'new-owner',
                raft_role: 'leader',
                address: 'new-owner/partition/replica_operations-p1-r5',
                status: SERVICE_STATUS.ACTIVE,
              },
            ],
          };
        }
        return {
          success: false,
          rows: [],
        };
      },
    },
  });

  const refreshed =
    await engine.queryExecutor.routingMetadataOverlay
      .refreshPartitionRouting(partitionId);

  t.equal(refreshed, true,
    'authoritative routing refresh should succeed through bounded local replica fallback');
  t.equal(authoritativeReads.length, 2,
    'routing repair should still read both partition and service metadata');
  t.same(
    authoritativeReads.map((entry) => entry.options?.replicaFallbackConsistency),
    [
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
    ],
    'routing repair should request bounded local replica fallback for both authoritative reads',
  );
  const candidates = engine.queryExecutor.getPartitionServiceCandidates(
    partitionId,
    true,
  );
  t.ok(
    candidates.some((candidate) =>
      candidate.address === 'new-owner/partition/replica_operations-p1-r5'),
    'runtime routing should expose the repaired service row after fallback-backed refresh',
  );
});

registerSqlQueryEngineExecutionTestCases({
  createMockMessageRouter,
  createMockSystemCache,
  mockPartitionData,
});
