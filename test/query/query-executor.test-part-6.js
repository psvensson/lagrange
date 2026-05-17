/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {ERRORS} from '../../src/constants/index.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  QUERY_LOG_MSG,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {
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

// Helper to parse SQL


test('QueryExecutor - getRoutablePartitionServices excludes services on ' +
  'non-serve-eligible nodes', (t) => {
  const readinessService = {
    getNodeReadinessSync: (nodeId) => {
      if (nodeId === 'node-down') {
        return {dimensions: {serveEligible: false}};
      }
      return {dimensions: {serveEligible: true}};
    },
  };

  const systemCache = {
    services: [
      {
        service_id: 'p1-r1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node-down',
        address: 'node-down/partition/p1',
        status: 'active',
      },
      {
        service_id: 'p1-r2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node-ok',
        address: 'node-ok/partition/p1',
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
    controlPlaneReadinessService: readinessService,
  });

  const services = executor.getRoutablePartitionServices('p1');

  t.equal(services.length, 1);
  t.equal(
    services[0].node_id,
    'node-ok',
    'only services on serve-eligible nodes should be routable',
  );
  t.end();
});

test('QueryExecutor - getPartitionRoutingSnapshot reports service rows ' +
  'filtered by stale serve-eligibility and recovers after owner refresh',
async (t) => {
  // §1.4.12: Transport-connected nodes with stale leases are healthy.
  // This test uses a mock readiness service that starts ineligible
  // and transitions to eligible after an authoritative refresh,
  // proving the routing snapshot recovery path.
  const partitionId = 'p-stale-routing';
  const nodeId = 'node-stale-routing';
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: nodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: nodeId,
        raft_role: 'leader',
        address: `${nodeId}/partition/${partitionId}`,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find(
          (p) => p.partition_id === key,
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

  let nodeEligible = false;
  const authoritativeRefreshes = [];
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-11T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          serveEligible: nodeEligible,
          repairEligible: nodeEligible,
        },
        reasons: nodeEligible ? [] : [
          {code: 'cluster_member_unhealthy'},
        ],
      };
    },
    async getNodeReadiness(targetNodeId) {
      authoritativeRefreshes.push(targetNodeId);
      // Simulate authoritative repair succeeding.
      nodeEligible = true;
      return this.getNodeReadinessSync();
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    controlPlaneReadinessService: readinessService,
  });

  const staleSnapshot =
    executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    staleSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON
      .ALL_SERVICES_FILTERED_BY_READINESS,
    'routing snapshot should distinguish readiness-filtered ' +
      'candidates from missing rows',
  );
  t.equal(staleSnapshot.serviceRowCount, 1);
  t.equal(staleSnapshot.routableServiceCount, 0);
  t.ok(
    staleSnapshot.deniedByNodeId[nodeId].reasonCodes
      .includes('cluster_member_unhealthy'),
    'routing snapshot should surface cluster_member_unhealthy',
  );

  // Trigger the repair path.
  await executor.maybeAwaitDeniedPartitionRoutingRepair(
    staleSnapshot,
  );

  t.same(
    authoritativeRefreshes,
    [nodeId],
    'routing repair should trigger one authoritative refresh',
  );

  const refreshedSnapshot =
    executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    refreshedSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
    'routing snapshot should clear once authoritative owner ' +
      'evidence repairs the cache',
  );
  t.equal(refreshedSnapshot.routableServiceCount, 1);
  t.equal(
    executor.getPartitionServiceCandidates(
      partitionId, true,
    ).length,
    1,
    'read candidates should recover after the readiness ' +
      'repair lands',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition awaits one authoritative readiness ' +
  'repair when stale serve-eligibility filters all candidates',
async (t) => {
  // §1.4.12: Uses a mock readiness service that starts ineligible
  // and transitions to eligible after authoritative refresh, proving
  // executeOnPartition awaits the repair before failing.
  const partitionId = 'p-stale-routing-read';
  const nodeId = 'node-stale-routing-read';
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: nodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: nodeId,
        raft_role: 'leader',
        address: `${nodeId}/partition/${partitionId}`,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find(
          (p) => p.partition_id === key,
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

  let nodeEligible = false;
  const authoritativeRefreshes = [];
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-11T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          serveEligible: nodeEligible,
          repairEligible: nodeEligible,
        },
        reasons: nodeEligible ? [] : [
          {code: 'cluster_member_unhealthy'},
        ],
      };
    },
    async getNodeReadiness(targetNodeId) {
      authoritativeRefreshes.push(targetNodeId);
      nodeEligible = true;
      return this.getNodeReadinessSync();
    },
  };

  let deliveryCount = 0;
  let deliveredAddress = null;
  const executor = new QueryExecutor({
    messageRouter: {
      async deliver(address) {
        deliveryCount += 1;
        deliveredAddress = address;
        return {
          acknowledged: true,
          success: true,
          rows: [{ok: true}],
        };
      },
    },
    systemCache,
    controlPlaneReadinessService: readinessService,
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT 1',
    [],
    true,
    false,
    false,
  );

  t.equal(
    result.success,
    true,
    'read execution should await the owner repair ' +
      'instead of failing on the stale snapshot',
  );
  t.equal(
    deliveryCount, 1,
    'query should be dispatched after the readiness ' +
      'repair lands',
  );
  t.equal(
    deliveredAddress,
    `${nodeId}/partition/${partitionId}`,
    'repaired routing should use the recovered partition ' +
      'service address',
  );
  t.same(
    authoritativeRefreshes,
    [nodeId],
    'executeOnPartition should await one authoritative ' +
      'node/service repair',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition can suppress routing-triggered ' +
  'authoritative readiness repair', async (t) => {
  const partitionId = 'p-stale-routing-read-suppressed';
  const nodeId = 'node-stale-routing-read-suppressed';
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: nodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: nodeId,
        raft_role: 'leader',
        address: `${nodeId}/partition/${partitionId}`,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find(
          (partition) => partition.partition_id === key,
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

  const authoritativeRefreshes = [];
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-11T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          serveEligible: false,
          repairEligible: false,
        },
        reasons: [
          {code: 'cluster_member_unhealthy'},
        ],
      };
    },
    async getNodeReadiness(targetNodeId) {
      authoritativeRefreshes.push(targetNodeId);
      return this.getNodeReadinessSync();
    },
  };

  let deliveryCount = 0;
  const executor = new QueryExecutor({
    messageRouter: {
      async deliver() {
        deliveryCount += 1;
        return {
          acknowledged: true,
          success: true,
          rows: [{ok: true}],
        };
      },
    },
    systemCache,
    controlPlaneReadinessService: readinessService,
  });
  executor.readRetryAttempts = 1;

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT 1',
    [],
    true,
    false,
    false,
    {
      allowReadinessAuthoritativeRefresh: false,
    },
  );

  t.equal(
    result.success,
    false,
    'query should fail closed on the stale snapshot when repair is suppressed',
  );
  t.equal(
    deliveryCount,
    0,
    'suppressed repair should not route the query to an ineligible candidate',
  );
  t.same(
    authoritativeRefreshes,
    [],
    'suppressed repair should not recurse into authoritative readiness refresh',
  );
  t.end();
});

test('QueryExecutor - getPartitionServiceCandidates logs typed routing ' +
  'denials when services exist but readiness filters them all', (t) => {
  const readinessService = {
    getNodeReadinessSync() {
      return {
        observedAt: '2026-03-11T00:00:00.000Z',
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {serveEligible: false, repairEligible: true},
        reasons: [{code: 'cluster_member_unhealthy'}],
      };
    },
  };
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: {
      partitions: [{
        partition_id: 'p-log',
        leader_node_id: 'node-filtered',
      }],
      services: [{
        service_id: 'p-log-r1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'p-log',
        node_id: 'node-filtered',
        raft_role: 'leader',
        address: 'node-filtered/partition/p-log',
        status: SERVICE_STATUS.ACTIVE,
      }],
      get(type, key) {
        if (type === TABLES.PARTITIONS) {
          return this.partitions.find((row) => row.partition_id === key) || null;
        }
        return null;
      },
      filter(type, predicate) {
        if (type === TABLES.SERVICES) {
          return this.services.filter(predicate);
        }
        return [];
      },
    },
    controlPlaneReadinessService: readinessService,
  });
  const warnings = [];
  executor.logger = {
    warn(message, context) {
      warnings.push({message, context});
    },
  };

  const candidates = executor.getPartitionServiceCandidates('p-log', true);

  t.same(candidates, []);
  t.equal(warnings.length, 1);
  t.equal(
    warnings[0].message,
    QUERY_LOG_MSG.PARTITION_ROUTING_CANDIDATES_FILTERED,
    'readiness-filtered candidate sets should emit a typed routing warning',
  );
  t.equal(
    warnings[0].context.routingSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
  );
  t.same(
    warnings[0].context.routingSnapshot.deniedByNodeId['node-filtered'].reasonCodes,
    ['cluster_member_unhealthy'],
  );
  t.end();
});

// --- Read retry and candidate fallthrough tests (§1.10, §1.12) ---

test('QueryExecutor - executeOnPartition retries reads across ' +
  'multiple candidates on transient failure (§1.12)', async (t) => {
  // Proves: read path tries next candidate when one fails with a
  // transient error instead of returning hard failure immediately.
  const deliveries = [];
  const systemCache = {
    partitions: [
      {partition_id: 'p1', leader_node_id: 'node1'},
    ],
    services: [
      {
        service_id: 'svc-n1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'leader',
        address: 'node1/partition/p1',
        status: 'active',
      },
      {
        service_id: 'svc-n2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'follower',
        address: 'node2/partition/p1',
        status: 'active',
      },
      {
        service_id: 'svc-n3',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node3',
        raft_role: 'follower',
        address: 'node3/partition/p1',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find(
          (p) => p.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') return this.services.filter(predicate);
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    deliver: async (address, _message) => {
      deliveries.push(address);
      if (address === 'node1/partition/p1') {
        // First candidate: transient failure (timeout)
        return {
          acknowledged: true,
          success: false,
          error: 'Message timeout',
        };
      }
      if (address === 'node2/partition/p1') {
        // Second candidate: also transient failure
        return {
          acknowledged: true,
          success: false,
          error: 'Query execution error',
        };
      }
      // Third candidate: success
      return {
        acknowledged: true,
        success: true,
        rows: [{id: 1}],
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
    'SELECT * FROM users',
    [],
    true, // forRead
    false,
    false,
  );

  t.equal(
    result.success,
    true,
    'read should succeed after falling through transient failures',
  );
  t.equal(deliveries.length, 3,
    'should have tried all three candidates');
  t.end();
});

test('QueryExecutor - reconnect delivery deferral falls through to another ' +
  'read candidate inside the query budget', async (t) => {
  const partitionId = 'p-reconnect-delivery';
  const firstNodeId = 'node-reconnecting';
  const secondNodeId = 'node-ready';
  const firstAddress = `${firstNodeId}/partition/${partitionId}`;
  const secondAddress = `${secondNodeId}/partition/${partitionId}`;
  const firstServiceId = `${partitionId}-r1`;
  const secondServiceId = `${partitionId}-r2`;
  const leaderRole = 'leader';
  const followerRole = 'follower';
  const selectNodesSql = 'SELECT * FROM nodes';
  const reconnectClosedError =
    'Connection to node node-reconnecting closed';
  const reconnectClosedErrorCode = 'ROUTER_CONNECTION_CLOSED';
  const queryTimeoutMs = 3000;
  const reconnectRetryAfterMs = 250;
  const deliveries = [];
  const deliveryOptions = [];
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: firstNodeId},
    ],
    services: [
      {
        service_id: firstServiceId,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: firstNodeId,
        raft_role: leaderRole,
        address: firstAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: secondServiceId,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: secondNodeId,
        raft_role: followerRole,
        address: secondAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    get: function(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find(
          (partition) => partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    deliver: async (address, _message, options) => {
      deliveries.push(address);
      deliveryOptions.push(options);
      if (address === firstAddress) {
        return {
          acknowledged: false,
          success: false,
          error: reconnectClosedError,
          errorCode: reconnectClosedErrorCode,
          deferRetry: true,
          retryAfterMs: reconnectRetryAfterMs,
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [{node_id: secondNodeId}],
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
    selectNodesSql,
    [],
    true,
    false,
    false,
    {timeoutMs: queryTimeoutMs},
  );

  t.equal(result.success, true,
    'read should succeed after a reconnect-deferred candidate');
  t.same(deliveries, [firstAddress, secondAddress],
    'read should fall through from reconnect-deferred target to live peer');
  t.ok(
    deliveryOptions.every((options) =>
      Number.isFinite(options?.timeoutMs) &&
      options.timeoutMs > 0 &&
      options.timeoutMs <= queryTimeoutMs,
    ),
    'candidate deliveries should stay inside the original query budget',
  );
  t.same(result.rows, [{node_id: secondNodeId}],
    'read should return rows from the live candidate');
});

test('QueryExecutor - executeOnPartition returns last error when ' +
  'all read candidates fail with transient errors (§1.12)', async (t) => {
  // Proves: when every candidate fails, the read returns the last
  // transient error rather than failing on the first one.
  const systemCache = {
    partitions: [
      {partition_id: 'p1', leader_node_id: 'node1'},
    ],
    services: [
      {
        service_id: 'svc-n1',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node1',
        raft_role: 'leader',
        address: 'node1/partition/p1',
        status: 'active',
      },
      {
        service_id: 'svc-n2',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'node2',
        raft_role: 'follower',
        address: 'node2/partition/p1',
        status: 'active',
      },
    ],
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find(
          (p) => p.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') return this.services.filter(predicate);
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    deliver: async (_address, _message) => {
      return {
        acknowledged: true,
        success: false,
        error: 'Message timeout',
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
    'SELECT * FROM users',
    [],
    true, // forRead
    false,
    false,
  );

  t.equal(result.success, false);
  t.equal(
    result.error,
    'Message timeout',
    'should return last transient error after exhausting candidates',
  );
  t.end();
});

test('QueryExecutor - denied routing repair refreshes authoritative overlay ' +
  'for canonical leader service gaps', async (t) => {
  const partitionId = 'nodes-p1';
  const leaderNodeId = 'seed-node';
  const overlayServices = [];
  const refreshCalls = [];
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.NODES,
          leader_node_id: leaderNodeId,
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return overlayServices.filter(predicate);
      }
      if (tableName === TABLES.PARTITIONS) {
        const rows = [
          {
            partition_id: partitionId,
            table_name: TABLES.NODES,
            leader_node_id: leaderNodeId,
          },
        ];
        return rows.filter(predicate);
      }
      return [];
    },
  };

  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    routingMetadataOverlay: {
      getServicesForPartition(requestedPartitionId) {
        return requestedPartitionId === partitionId ? overlayServices : [];
      },
      async refreshPartitionRouting(requestedPartitionId, options = {}) {
        const refreshCall = {
          partitionId: requestedPartitionId,
          reasonCode: options.routingSnapshot?.reasonCode || null,
        };
        if (typeof options.routingSnapshot?.canonicalLeaderNodeId === 'string') {
          refreshCall.leaderNodeId =
            options.routingSnapshot.canonicalLeaderNodeId;
        }
        refreshCalls.push(refreshCall);
        overlayServices.splice(0, overlayServices.length, {
          service_id: 'nodes-p1-r1',
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: leaderNodeId,
          raft_role: 'leader',
          address: `${leaderNodeId}/partition/${partitionId}-r1`,
          status: SERVICE_STATUS.ACTIVE,
        });
        return true;
      },
    },
  });

  const staleSnapshot =
    executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    staleSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
    'routing snapshot should surface the canonical leader service gap',
  );
  t.equal(staleSnapshot.serviceRowCount, 0);
  t.equal(staleSnapshot.canonicalLeaderNodeId, leaderNodeId);
  t.equal(staleSnapshot.leaderKnown, true);

  const repaired =
    await executor.maybeAwaitDeniedPartitionRoutingRepair(staleSnapshot);

  t.equal(repaired, true,
    'denied routing repair should retry after authoritative overlay refresh');
  t.same(
    refreshCalls,
    [
      {
        partitionId,
        reasonCode: QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
        leaderNodeId,
      },
    ],
    'denied repair should reuse the authoritative overlay refresh path',
  );

  const refreshedSnapshot =
    executor.getPartitionRoutingSnapshot(partitionId);
  t.equal(
    refreshedSnapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.OK,
    'routing snapshot should recover once overlay service rows arrive',
  );
  t.equal(refreshedSnapshot.serviceRowCount, 1);
  t.equal(
    executor.getPartitionServiceCandidates(
      partitionId,
      true,
    ).length,
    1,
    'read candidates should recover after the overlay refresh',
  );
  t.end();
});

test('QueryExecutor - priority recovery writes widen when the canonical ' +
  'leader is filtered by readiness but peer replicas are routable',
(t) => {
  const partitionId = 'replica_operations-p1';
  const leaderNodeId = 'node-restarting';
  const peerNodeId = 'node-peer-ready';
  const tableName = TABLES.REPLICA_OPERATIONS;
  const observedAt = '2026-04-25T22:15:00.000Z';
  const leaderServiceId = `${partitionId}-r1`;
  const peerServiceId = `${partitionId}-r2`;
  const leaderAddress = `${leaderNodeId}/partition/${leaderServiceId}`;
  const peerAddress = `${peerNodeId}/partition/${peerServiceId}`;
  const systemCache = {
    get(tableNameArg, key) {
      if (tableNameArg === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: tableName,
          leader_node_id: leaderNodeId,
        };
      }
      return null;
    },
    filter(tableNameArg, predicate) {
      if (tableNameArg !== TABLES.SERVICES) {
        return [];
      }
      return [
        {
          service_id: leaderServiceId,
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: leaderNodeId,
          address: leaderAddress,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: peerServiceId,
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: partitionId,
          node_id: peerNodeId,
          address: peerAddress,
          status: SERVICE_STATUS.ACTIVE,
        },
      ].filter(predicate);
    },
  };
  const readinessService = {
    getNodeReadinessSync(nodeId) {
      const recoveryEligible = nodeId !== leaderNodeId;
      return {
        nodeId,
        observedAt,
        lifecycleState: SERVICE_STATUS.ACTIVE,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
            recoveryEligible,
        },
        reasons: recoveryEligible ?
          [] :
          [
            {
              code:
                CONTROL_PLANE_READINESS_REASON
                  .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            },
          ],
      };
    },
  };
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache,
    controlPlaneReadinessService: readinessService,
  });

  const routingSnapshot = executor.getPartitionRoutingSnapshot(
    partitionId,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );
  const recoveryContract =
    executor.resolveCanonicalLeaderGapRecoveryRoutingContract(
      partitionId,
      routingSnapshot,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    );
  const candidates = executor.getPartitionServiceCandidates(
    partitionId,
    false,
    false,
    false,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  );

  t.equal(
    routingSnapshot.canonicalLeaderServiceCount,
    1,
    'fixture should keep the stale canonical leader service row visible',
  );
  t.equal(
    routingSnapshot.routableServiceCount,
    1,
    'fixture should keep one recovery-eligible peer replica routable',
  );
  t.equal(
    recoveryContract.canonicalLeaderFilteredByReadiness,
    true,
    'contract should classify the canonical leader as readiness-filtered',
  );
  t.equal(
    recoveryContract.recoveryCandidateWidening,
    true,
    'priority recovery routing should widen to available peer replicas',
  );
  t.same(
    candidates.map((candidate) => candidate.nodeId),
    [peerNodeId],
    'write routing should use the recovery-eligible peer replica',
  );
  t.end();
});

test('QueryExecutor - recovery-owned system-table writes fail closed when ' +
  'only service-role leader witnesses exist',
async (t) => {
  const partitionId = 'nodes-p1';
  const leaderAddress = 'node-b/partition/nodes-p1-r2';
  const OWNER_MISSING_REASON = 'owner_row_missing';
  const OBSERVATION_DEFERRED = 'deferred';
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.NODES,
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.NODES,
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
            address: 'node-a/partition/nodes-p1-r1',
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'nodes-p1-r2',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-b',
            raft_role: 'leader',
            address: leaderAddress,
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
    resolution.routingSnapshot.canonicalLeaderIdentityState,
    CANONICAL_LEADER_IDENTITY_STATE.SERVICE_ROLE_DERIVED,
    'routing snapshot should surface the derived leader-identity state',
  );
  t.equal(
    resolution.routingSnapshot.canonicalLeaderObservationState,
    OBSERVATION_DEFERRED,
    'service-role leader witnesses should remain a deferred owner-row observation',
  );
  t.equal(
    resolution.routingSnapshot.canonicalLeaderObservationReasonCode,
    OWNER_MISSING_REASON,
    'routing snapshot should classify the missing owner row explicitly',
  );
  t.equal(
    resolution.routingSnapshot.canonicalLeaderRoutingGapState,
    CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING,
    'service-role leader witnesses should not close the owner gap',
  );
  t.same(
    resolution.candidates,
    [],
    'recovery-owned writes should fail closed instead of targeting a service-role-derived leader',
  );
  t.equal(
    executor.findPartitionLeaderAddress(
      partitionId,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    ),
    null,
    'strict leader lookup should fail closed without owner-row leader truth',
  );
});

test('QueryExecutor - recovery-owned system-table writes fail closed when ' +
  'canonical leader identity remains completely unresolved', async (t) => {
  const partitionId = 'nodes-p1';
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.NODES,
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.NODES,
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
            address: 'node-a/partition/nodes-p1-r1',
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'nodes-p1-r2',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-b',
            raft_role: 'follower',
            address: 'node-b/partition/nodes-p1-r2',
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
    resolution.routingSnapshot.canonicalLeaderIdentityState,
    CANONICAL_LEADER_IDENTITY_STATE.MISSING,
    'routing snapshot should preserve the unresolved leader-identity state',
  );
  t.equal(
    resolution.routingSnapshot.canonicalLeaderRoutingGapState,
    CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING,
    'routing snapshot should surface the canonical leader owner gap',
  );
  t.same(
    resolution.candidates,
    [],
    'recovery-owned system-table writes should defer instead of widening across follower-only candidates when leader identity remains unproven',
  );
});

test('QueryExecutor - executeOnPartition defers recovery-owned system-table ' +
  'writes when canonical leader identity remains completely unresolved',
async (t) => {
  const deliveries = [];
  const partitionId = 'nodes-p1';
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.NODES,
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.NODES,
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
            address: 'node-a/partition/nodes-p1-r1',
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'nodes-p1-r2',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-b',
            raft_role: 'follower',
            address: 'node-b/partition/nodes-p1-r2',
            status: SERVICE_STATUS.ACTIVE,
          },
        ].filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    deliver: async (address) => {
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
  });
  executor.leaderRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    partitionId,
    'INSERT INTO nodes (node_id) VALUES (?)',
    ['node-c'],
    false,
    false,
    false,
    {
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.equal(
    result.success,
    false,
    'recovery-owned system-table writes should fail closed when leader identity is still missing',
  );
  t.equal(
    result.error,
    ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
    'the caller should receive the canonical no-leader outcome instead of a speculative follower dispatch',
  );
  t.same(
    deliveries,
    [],
    'no speculative follower delivery should be attempted while canonical leader identity is missing',
  );
});

test('QueryExecutor - steady-state system-table writes fail closed when ' +
  'canonical leader identity is only service-role-derived', async (t) => {
  const partitionId = 'nodes-p1';
  const leaderAddress = 'node-b/partition/nodes-p1-r2';
  const systemCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === partitionId) {
        return {
          partition_id: partitionId,
          table_name: TABLES.NODES,
        };
      }
      return null;
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: partitionId,
          table_name: TABLES.NODES,
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
            address: 'node-a/partition/nodes-p1-r1',
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'nodes-p1-r2',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: partitionId,
            node_id: 'node-b',
            raft_role: 'leader',
            address: leaderAddress,
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
    CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
  );

  t.equal(
    resolution.routingSnapshot.canonicalLeaderIdentityState,
    CANONICAL_LEADER_IDENTITY_STATE.SERVICE_ROLE_DERIVED,
    'routing snapshot should still expose the underlying service-role-derived witness',
  );
  t.equal(
    resolution.routingSnapshot.canonicalLeaderObservationReasonCode,
    'owner_row_missing',
    'steady-state diagnostics should classify the missing owner row explicitly',
  );
  t.equal(
    resolution.routingSnapshot.canonicalLeaderRoutingGapState,
    CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING,
    'steady-state writes should normalize the derived witness back into an owner gap',
  );
  t.same(
    resolution.candidates,
    [],
    'steady-state writes should fail closed instead of trusting service-role-derived owner metadata',
  );
  t.equal(
    executor.findPartitionLeaderAddress(partitionId),
    null,
    'strict steady-state leader lookup should fail closed when only service-role-derived evidence exists',
  );
});
