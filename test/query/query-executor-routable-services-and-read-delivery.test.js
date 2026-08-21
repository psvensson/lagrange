/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
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
  QUERY_LOG_MSG,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {
} from '../../src/partition/partition-service-constants.js';
import {
} from './routing-repair-test-helpers.js';
import {createMockMessageRouter} from './query-executor-mock-message-router.js';
import {
  registerQueryExecutorRecoveryRoutingTests,
} from './query-executor-recovery-routing-test-cases.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

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
  executor.queryTimeoutMs = 5;
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

test('QueryExecutor - read candidate delivery reserves timeout budget for ' +
  'alternate candidates', async (t) => {
  const partitionId = 'p-read-budget-reserve';
  const staleNodeId = 'node-stale';
  const liveNodeId = 'node-live';
  const spareNodeId = 'node-spare';
  const staleAddress = `${staleNodeId}/partition/${partitionId}`;
  const liveAddress = `${liveNodeId}/partition/${partitionId}`;
  const spareAddress = `${spareNodeId}/partition/${partitionId}`;
  const queryTimeoutMs = 6000;
  const deliveries = [];
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: staleNodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: staleNodeId,
        raft_role: 'leader',
        address: staleAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: `${partitionId}-r2`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: liveNodeId,
        raft_role: 'follower',
        address: liveAddress,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: `${partitionId}-r3`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: spareNodeId,
        raft_role: 'follower',
        address: spareAddress,
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
      deliveries.push({address, timeoutMs: options?.timeoutMs});
      if (address === staleAddress) {
        return {
          acknowledged: false,
          success: false,
          error: 'Message timeout',
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [{node_id: liveNodeId}],
      };
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
    'SELECT * FROM nodes',
    [],
    true,
    false,
    false,
    {timeoutMs: queryTimeoutMs},
  );

  t.equal(result.success, true,
    'read should fall through from the stale candidate to a live alternate');
  t.same(
    deliveries.map((delivery) => delivery.address),
    [staleAddress, liveAddress],
    'delivery should attempt the live alternate before the read budget is exhausted',
  );
  t.ok(
    deliveries[0].timeoutMs > 0 &&
      deliveries[0].timeoutMs <= Math.floor(queryTimeoutMs / 2),
    'first read candidate should not receive the full partition budget',
  );
  t.ok(
    deliveries[1].timeoutMs > 0 &&
      deliveries[1].timeoutMs <= queryTimeoutMs,
    'alternate read candidate should receive a bounded remaining budget',
  );
});

test('QueryExecutor - read delivery defers cold reconnect for a disconnected ' +
  'single candidate', async (t) => {
  const partitionId = 'p-read-cold-reconnect';
  const disconnectedNodeId = 'node-disconnected';
  const disconnectedAddress = `${disconnectedNodeId}/partition/${partitionId}`;
  const queryTimeoutMs = 6000;
  const reconnectDeferTimeoutMs = 1;
  const deliveries = [];
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: disconnectedNodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: disconnectedNodeId,
        raft_role: 'leader',
        address: disconnectedAddress,
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
    getConnectionState: () => 'disconnected',
    deliver: async (address, _message, options) => {
      deliveries.push({address, timeoutMs: options?.timeoutMs});
      return {
        acknowledged: false,
        success: false,
        error: `Connection to node ${disconnectedNodeId} closed`,
        errorCode: 'ROUTER_CONNECTION_CLOSED',
        retryAfterMs: 50,
        deferRetry: true,
      };
    },
  };
  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.readRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT * FROM replica_operations',
    [],
    true,
    false,
    false,
    {
      timeoutMs: queryTimeoutMs,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.equal(result.success, false,
    'read should fail fast when the only observed candidate is disconnected');
  t.same(
    deliveries,
    [{address: disconnectedAddress, timeoutMs: reconnectDeferTimeoutMs}],
    'disconnected read candidate should receive a reconnect-defer budget',
  );
  t.equal(
    result.errorCode,
    'ROUTER_CONNECTION_CLOSED',
    'the failure should preserve the router connection error',
  );
});

test('QueryExecutor - read delivery defers cold reconnect for an unobserved ' +
  'single candidate', async (t) => {
  const partitionId = 'p-read-cold-unobserved';
  const unobservedNodeId = 'node-unobserved';
  const unobservedAddress = `${unobservedNodeId}/partition/${partitionId}`;
  const queryTimeoutMs = 6000;
  const reconnectDeferTimeoutMs = 1;
  const deliveries = [];
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: unobservedNodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: unobservedNodeId,
        raft_role: 'leader',
        address: unobservedAddress,
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
    getConnectionState: () => 'unobserved',
    deliver: async (address, _message, options) => {
      deliveries.push({address, timeoutMs: options?.timeoutMs});
      return {
        acknowledged: false,
        success: false,
        error: `Connection to node ${unobservedNodeId} closed`,
        errorCode: 'ROUTER_CONNECTION_CLOSED',
        retryAfterMs: 50,
        deferRetry: true,
      };
    },
  };
  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.readRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT * FROM replica_operations',
    [],
    true,
    false,
    false,
    {
      timeoutMs: queryTimeoutMs,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.equal(result.success, false,
    'read should fail fast when the only candidate is unobserved');
  t.same(
    deliveries,
    [{address: unobservedAddress, timeoutMs: reconnectDeferTimeoutMs}],
    'unobserved read candidate should receive a reconnect-defer budget under recovery reads',
  );
  t.equal(
    result.errorCode,
    'ROUTER_CONNECTION_CLOSED',
    'the failure should preserve the router connection error',
  );
});

test('QueryExecutor - recovery read bounds connected stale candidate ack ' +
  'timeout', async (t) => {
  const partitionId = 'p-read-stale-connected';
  const staleNodeId = 'node-stale';
  const staleAddress = `${staleNodeId}/partition/${partitionId}`;
  const queryTimeoutMs = 6000;
  const reconnectIntervalMs = 1000;
  const deliveries = [];
  const systemCache = {
    partitions: [
      {partition_id: partitionId, leader_node_id: staleNodeId},
    ],
    services: [
      {
        service_id: `${partitionId}-r1`,
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: partitionId,
        node_id: staleNodeId,
        raft_role: 'leader',
        address: staleAddress,
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
    reconnectIntervalMs,
    getConnectionState: () => 'connected',
    deliver: async (address, _message, options) => {
      deliveries.push({address, timeoutMs: options?.timeoutMs});
      return {
        acknowledged: false,
        success: false,
        error: 'Message timeout',
        errorCode: 'ROUTER_MESSAGE_TIMEOUT',
        retryAfterMs: reconnectIntervalMs,
        deferRetry: true,
      };
    },
  };
  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
  });
  executor.readRetryAttempts = 1;
  executor.leaderRetryDelayMs = 1;

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT * FROM nodes',
    [],
    true,
    false,
    false,
    {
      timeoutMs: queryTimeoutMs,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.equal(result.success, false,
    'read should defer when the connected recovery candidate does not ack');
  t.same(
    deliveries,
    [{address: staleAddress, timeoutMs: reconnectIntervalMs}],
    'connected stale recovery candidate should receive a bounded ack budget',
  );
  t.equal(
    result.errorCode,
    'ROUTER_MESSAGE_TIMEOUT',
    'the failure should preserve the router timeout code',
  );
});

registerQueryExecutorRecoveryRoutingTests();
