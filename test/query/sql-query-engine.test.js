/**
 * SQL Query Engine Tests
 * Tests for the main SQL query processing entry point.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 15.1, 15.2, 15.3, 15.4, 20.6, 20.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
} from '../../src/query/query-constants.js';
import {
  COLUMN,
  METRICS_LOG_TAG,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
  createTimeoutBudget,
} from '../../src/control-plane/timeout-budget.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  assertNoHandlerRepairConverged,
  createStaleOverlayOwnerHandoffFixture,
} from './routing-repair-test-helpers.js';
import {createSqlRequest} from '../../src/query/sql-request.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

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

function uniqueNodeIds(nodeIds) {
  return [...new Set(nodeIds)];
}

const TABLE_PARTITION_METADATA_WAIT_TIMEOUT_DRIFT_MS = 1;

function createAdmittedSplitAdmissionService() {
  return {
    async checkSplit(options = {}) {
      return {
        allowed: true,
        decisionType: 'admitted',
        decision: 'admitted',
        operationType: 'partition_split',
        requiredReplicaCount: options.requiredReplicaCount || 1,
        candidateTargetNodeIds: Array.isArray(options.targetNodeIds) ?
          [...options.targetNodeIds] :
          [],
        eligibleNodeIds: Array.isArray(options.targetNodeIds) ?
          [...options.targetNodeIds] :
          [],
        sourceRoutableNodeIds: Array.isArray(options.sourceRoutableNodeIds) ?
          [...options.sourceRoutableNodeIds] :
          [],
      };
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

  const candidates = engine.queryExecutor.getPartitionServiceCandidates(
    partitionId,
    true,
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

test('SQLQueryEngine - authoritative system-table selects request bounded ' +
  'local replica fallback before owner RPC', async (t) => {
  const authoritativeReads = [];
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], [], []),
    messageRouter: createMockMessageRouter(),
    authoritativeControlPlaneView: {
      async readRows(tableName, sql, params, options) {
        authoritativeReads.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{
            log_id: params[0],
          }],
          source: 'local_partition_replica',
        };
      },
    },
  });

  const result = await engine.executeQuery(
    'SELECT log_id FROM logs WHERE log_id = ?',
    ['log-visible-1'],
  );

  t.equal(result.success, true, 'authoritative system-table reads should succeed');
  t.equal(result.rows.length, 1, 'authoritative local rows should be returned');
  t.equal(
    authoritativeReads.length,
    1,
    'system-table SELECT should use one authoritative local read',
  );
  t.equal(
    authoritativeReads[0]?.options?.replicaFallbackConsistency,
    'any_replica',
    'system-table SELECT should allow bounded local replica fallback before owner RPC',
  );
  t.equal(
    authoritativeReads[0]?.options?.allowSqlFallback,
    false,
    'system-table SELECT should keep routed SQL disabled during the authoritative preflight',
  );
});

test('SQLQueryEngine - query routing repair avoids stale no-handler retry ' +
  'when overlay refresh keeps the same service id', async (t) => {
  const fixture = createStaleOverlayOwnerHandoffFixture({
    sameServiceId: true,
    refreshedAddress: 'new-owner/partition/replica_operations-p1-r1',
    successRows: [{operation_id: 'op-engine-1'}],
  });

  const engine = new SQLQueryEngine({
    systemCache: fixture.systemCache,
    messageRouter: fixture.messageRouter,
    routingMetadataOverlay: fixture.routingMetadataOverlay,
    nodeId: 'local-node',
  });

  const result = await engine.queryExecutor.executeOnPartition(
    fixture.partitionId,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-engine-1'],
    true,
  );

  t.equal(result.success, true);
  assertNoHandlerRepairConverged(t, {
    deliveries: fixture.deliveries,
    staleAddress: fixture.staleAddress,
    refreshedAddress: fixture.refreshedAddress,
    overlayRefreshCalls: fixture.overlayRefreshCalls,
    context: 'SQL engine composed overlay repair',
  });
  t.equal(
    fixture.overlayRefreshCalls[0].options.refreshReason,
    QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
    'engine-composed overlay refresh should keep stale-service repair reason',
  );
});

test('SQLQueryEngine - routes priority control-plane transaction delivery ' +
  'through recovery eligibility', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], [], []),
    messageRouter: {
      deliver: async () => ({acknowledged: true, success: true}),
    },
    nodeId: 'local-node',
  });
  const routingCalls = [];
  engine.queryExecutor.executeOnPartition = async (
    partitionId,
    sql,
    params,
    forRead,
    preferLeader,
    preferSameLatencyGroup,
    executionOptions = {},
  ) => {
    routingCalls.push({
      partitionId,
      sql,
      params,
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      routingReadinessDimension: executionOptions.routingReadinessDimension,
    });
    return {success: true};
  };

  await engine.deliverTransactionOperation(
    'session-1',
    'replica_operations-p1',
    'COMMIT',
  );

  t.equal(routingCalls.length, 1,
    'transaction delivery should perform a single routing lookup');
  t.same(routingCalls[0], {
    partitionId: 'replica_operations-p1',
    sql: '',
    params: [],
    forRead: false,
    preferLeader: false,
    preferSameLatencyGroup: false,
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  }, 'priority control-plane transaction delivery should use recovery routing');
});

test('SQLQueryEngine - keeps user transaction delivery on the default ' +
  'routing dimension', async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], [], []),
    messageRouter: {
      deliver: async () => ({acknowledged: true, success: true}),
    },
    nodeId: 'local-node',
  });
  const routingCalls = [];
  engine.queryExecutor.executeOnPartition = async (
    partitionId,
    sql,
    params,
    forRead,
    preferLeader,
    preferSameLatencyGroup,
    executionOptions = {},
  ) => {
    routingCalls.push({
      partitionId,
      sql,
      params,
      forRead,
      preferLeader,
      preferSameLatencyGroup,
      routingReadinessDimension: executionOptions.routingReadinessDimension,
    });
    return {success: true};
  };

  await engine.deliverTransactionOperation(
    'session-2',
    'users-p1',
    'COMMIT',
  );

  t.equal(routingCalls.length, 1,
    'user transaction delivery should perform a single routing lookup');
  t.same(routingCalls[0], {
    partitionId: 'users-p1',
    sql: '',
    params: [],
    forRead: false,
    preferLeader: false,
    preferSameLatencyGroup: false,
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
  }, 'user transaction delivery should keep the default serve routing');
});

test('SQLQueryEngine - transaction delivery repairs stale no-handler owner ' +
  'handoff before retrying control-plane commit', async (t) => {
  const fixture = createStaleOverlayOwnerHandoffFixture({
    sameServiceId: true,
    refreshedAddress: 'new-owner/partition/replica_operations-p1-r1',
  });

  const engine = new SQLQueryEngine({
    systemCache: fixture.systemCache,
    messageRouter: fixture.messageRouter,
    routingMetadataOverlay: fixture.routingMetadataOverlay,
    nodeId: 'local-node',
  });

  await engine.deliverTransactionOperation(
    'session-3',
    fixture.partitionId,
    'COMMIT',
  );

  assertNoHandlerRepairConverged(t, {
    deliveries: fixture.deliveries,
    staleAddress: fixture.staleAddress,
    refreshedAddress: fixture.refreshedAddress,
    overlayRefreshCalls: fixture.overlayRefreshCalls,
    context: 'transaction delivery routing repair',
  });
});

test('SQLQueryEngine - executes SELECT query', async (t) => {
  // Set up mock partition data
  mockPartitionData.set('p1', [{id: 1, name: 'Alice'}]);
  mockPartitionData.set('p2', [{id: 2, name: 'Bob'}]);

  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    [
      {partition_id: 'p1', table_name: 'users', partition_key_start: null, partition_key_end: 'm'},
      {partition_id: 'p2', table_name: 'users', partition_key_start: 'm', partition_key_end: null},
    ],
  );

  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
  });

  const result = await engine.executeQuery('SELECT * FROM users');

  t.equal(result.success, true);
  t.equal(result.rows.length, 2);

  // Clean up
  mockPartitionData.clear();
});

test('SQLQueryEngine - reserves critical routing for topology tables and ' +
  'demotes high-volume transaction metadata',
async (t) => {
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], []),
    messageRouter: createMockMessageRouter(),
  });

  t.equal(
    engine.resolveRoutedDeliveryPriority(TABLES.NODES),
    'critical',
    'topology metadata should stay on the critical lane',
  );
  t.equal(
    engine.resolveRoutedDeliveryPriority(TABLES.SQL_TRANSACTIONS),
    'background',
    'transaction metadata should not consume the reserved control lane',
  );
  t.equal(
    engine.resolveRoutedDeliveryPriority(
      TABLES.SQL_TRANSACTION_PARTICIPANTS,
    ),
    'background',
    'participant metadata should also use the background lane',
  );
});

test('SQLQueryEngine - keeps recovery-critical transaction state on the ' +
  'critical lane while leaving write-operation telemetry on background',
async (t) => {
  const submissions = [];
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], []),
    messageRouter: createMockMessageRouter(),
  });
  engine.getControlPlaneSystemTableGateway = () => ({
    supportsMutationSubmission: () => true,
    submitMutation: async (mutation, options) => {
      submissions.push({mutation, options});
      return {success: true};
    },
  });

  await engine.persistDistributedTransactionRow({
    transactionId: 'tx-1',
    sessionId: 'session-1',
    status: 'ACTIVE',
    transactionEpoch: 1,
    timeoutDeadline: Date.now() + 1000,
    createdAt: 1,
    updatedAt: 2,
  });
  await engine.persistDistributedTransactionParticipantRow({
    participantId: 'participant-1',
    transactionId: 'tx-1',
    partitionId: 'users-p1',
    status: 'PREPARED',
    lastError: null,
    createdAt: 1,
    updatedAt: 2,
  });
  await engine.persistDistributedWriteOperationRow({
    operationId: 'write-op-1',
    transactionId: 'tx-1',
    statementType: 'UPDATE',
    status: 'FAILED',
    idempotencyKey: 'idem-1',
    payloadHash: 'hash-1',
    partitionIds: ['users-p1'],
    retryCount: 1,
    lastError: 'query_timeout',
    createdAt: 1,
    updatedAt: 2,
  });

  t.equal(submissions.length, 3,
    'transaction persistence should submit transaction, participant, and write-operation mutations');
  t.equal(submissions[0].options.deliveryPriority, 'critical',
    'transaction rows should stay on the critical delivery lane');
  t.equal(submissions[1].options.deliveryPriority, 'critical',
    'participant rows should stay on the critical delivery lane');
  t.equal(submissions[2].options.deliveryPriority, 'background',
    'write-operation telemetry should remain on the background delivery lane');
  t.equal(submissions[0].options.skipCacheWait, true,
    'transaction rows should not fail closed on cache visibility lag');
  t.equal(submissions[1].options.skipCacheWait, true,
    'participant rows should not fail closed on cache visibility lag');
  t.equal(submissions[2].options.skipCacheWait, true,
    'write-operation telemetry should also bypass cache visibility lag');
  t.equal(submissions[0].options.mergePolicy, 'replace_pending',
    'transaction rows should coalesce to the latest durable state');
  t.equal(submissions[1].options.mergePolicy, 'replace_pending',
    'participant rows should coalesce to the latest durable state');
  t.equal(submissions[2].options.mergePolicy, 'replace_pending',
    'write-operation telemetry should still coalesce to the latest durable state');
  t.equal(
    submissions[0].options.coalescingKey,
    'sql-transaction:tx-1',
    'transaction persistence should use a stable coalescing key',
  );
  t.equal(
    submissions[1].options.coalescingKey,
    'sql-transaction-participant:participant-1',
    'participant persistence should use a stable coalescing key',
  );
  t.equal(
    submissions[2].options.coalescingKey,
    'sql-write-operation:write-op-1',
    'write-operation persistence should use a stable coalescing key',
  );
});

test('SQLQueryEngine - transactional write-operation persistence stays on the ' +
  'critical lane through the coordinator wiring',
async (t) => {
  const submissions = [];
  const engine = new SQLQueryEngine({
    systemCache: createMockSystemCache([], [], []),
    messageRouter: createMockMessageRouter(),
  });
  engine.getControlPlaneSystemTableGateway = () => ({
    supportsMutationSubmission: () => true,
    submitMutation: async (mutation, options) => {
      submissions.push({mutation, options});
      return {success: true};
    },
  });

  await engine.transactionCoordinator.begin('session-1');
  await engine.transactionCoordinator.recordWriteOperation('session-1', {
    operationId: 'write-op-1',
    statementType: 'UPDATE',
    partitionIds: ['users-p1'],
    idempotencyKey: 'idem-1',
    payloadHash: 'hash-1',
  });
  await engine.transactionCoordinator.markWriteOperationResult(
    'session-1',
    'write-op-1',
    {
      success: true,
      retryCount: 1,
    },
  );

  const writeOperationSubmissions = submissions.filter((entry) => {
    return entry.mutation?.tableName === TABLES.SQL_WRITE_OPERATIONS;
  });

  t.equal(
    writeOperationSubmissions.length,
    2,
    'transactional write-operation persistence should record pending and terminal rows',
  );
  t.ok(
    writeOperationSubmissions.every((entry) =>
      entry.options?.deliveryPriority === 'critical'),
    'transaction-owned write-operation rows should stay on the critical delivery lane',
  );
  t.ok(
    writeOperationSubmissions.every((entry) =>
      entry.options?.workClass === PRESSURE_WORK_CLASS.CRITICAL),
    'transaction-owned write-operation rows should keep critical mutation work class',
  );
});

test('SQLQueryEngine - query ingress reuses the shared pressure admission ' +
  'contract', async (t) => {
  const pressureSummary = {
    backpressured: true,
    saturatedNodeCount: 1,
    totalPending: 64,
    maxPendingUtilization: 1,
  };
  const engine = new SQLQueryEngine({
    nodeId: 'pressure-node',
    systemCache: createMockSystemCache([], [], []),
    messageRouter: {
      getOutboundPressureSummary() {
        return pressureSummary;
      },
    },
  });

  const cases = [
    {
      name: 'defer',
      options: {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        pressureRetryAfterMs: 321,
      },
      expectedError: 'query_admission_deferred',
      expectedAction: 'defer',
      expectedRetryAfterMs: 321,
    },
    {
      name: 'reject',
      options: {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: false,
        pressureRetryAfterMs: 654,
      },
      expectedError: 'query_admission_rejected',
      expectedAction: 'reject',
      expectedRetryAfterMs: 654,
    },
  ];

  for (const testCase of cases) {
    const result = await engine.executeQuery(
      'SELECT * FROM users',
      [],
      testCase.options,
    );

    t.equal(result.success, false,
      `${testCase.name}: query admission under pressure should fail closed`);
    t.equal(result.error, testCase.expectedError,
      `${testCase.name}: query ingress should preserve its query-specific admission error`);
    t.equal(result.pressureAction, testCase.expectedAction,
      `${testCase.name}: query ingress should expose the shared pressure action`);
    t.equal(result.pressureReason, 'transport_backpressure',
      `${testCase.name}: query ingress should expose the shared pressure reason`);
    t.equal(result.retryAfterMs, testCase.expectedRetryAfterMs,
      `${testCase.name}: query ingress should preserve retry hints from the shared contract`);
    t.same(result.pressureSummary, {
      sensor: 'transport:outbound',
      capacityPartition: 'query-plane',
      ...pressureSummary,
      totalPendingCritical: 0,
      totalPendingBackground: 0,
    }, `${testCase.name}: query ingress should expose the shared pressure summary shape`);
  }
});
