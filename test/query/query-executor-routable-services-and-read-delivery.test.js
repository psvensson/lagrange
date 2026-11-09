/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
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
import {
  createCommittedServeEligibilityOwner,
  serveEligibilityAnswer,
} from '../control-plane/serve-eligibility-test-support.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock system cache with services for routing

// Helper to parse SQL


test('QueryExecutor - getRoutablePartitionServices excludes services on ' +
  'non-serve-eligible nodes', (t) => {
  // The committed-epoch serve answer is the routing input (quest
  // serve-eligibility-committed-epoch-read).
  const readinessService = createCommittedServeEligibilityOwner({
    answers: {'node-down': serveEligibilityAnswer(false,
      {reasons: ['ready_lease_expired']})},
  });

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

  // The owner's committed record is stale until its refresh lands: the
  // routing denial awaits that refresh once (no per-node projection repair).
  const authoritativeRefreshes = [];
  const readinessService = createCommittedServeEligibilityOwner({
    defaultAnswer: serveEligibilityAnswer('unavailable_stale'),
  });
  readinessService.readServeEligibility = async () => {
    authoritativeRefreshes.push(nodeId);
    readinessService.setDefault(serveEligibilityAnswer(true));
  };
  const unusedProjection = {
    async getNodeReadiness(targetNodeId) {
      authoritativeRefreshes.push(targetNodeId);
      return targetNodeId;
    },
  };
  t.ok(unusedProjection, 'the projection repair is not a serve input');

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
      .includes('unavailable_stale'),
    'routing snapshot should surface the typed stale serve answer',
  );

  // Trigger the repair path.
  await executor.maybeAwaitDeniedPartitionRoutingRepair(
    staleSnapshot,
  );

  t.same(
    authoritativeRefreshes,
    [nodeId],
    'routing repair should await one committed serve refresh',
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

  // The owner's committed record is stale until its refresh lands: the
  // routing denial awaits that refresh once (no per-node projection repair).
  const authoritativeRefreshes = [];
  const readinessService = createCommittedServeEligibilityOwner({
    defaultAnswer: serveEligibilityAnswer('unavailable_stale'),
  });
  readinessService.readServeEligibility = async () => {
    authoritativeRefreshes.push(nodeId);
    readinessService.setDefault(serveEligibilityAnswer(true));
  };
  const unusedProjection = {
    async getNodeReadiness(targetNodeId) {
      authoritativeRefreshes.push(targetNodeId);
      return targetNodeId;
    },
  };
  t.ok(unusedProjection, 'the projection repair is not a serve input');

  let deliveryCount = 0;
  let deliveredAddress = null;
  const executor = new QueryExecutor({
    messageRouter: {
      async deliver(address) {
        deliveryCount += 1;
        deliveredAddress = address;
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [{ok: true}],
        });
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
    answerServeEligibility: () => serveEligibilityAnswer('unavailable_stale'),
    async readServeEligibility() {
      authoritativeRefreshes.push(nodeId);
    },
  };

  let deliveryCount = 0;
  const executor = new QueryExecutor({
    messageRouter: {
      async deliver() {
        deliveryCount += 1;
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true,
          rows: [{ok: true}],
        });
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
  const readinessService = createCommittedServeEligibilityOwner({
    defaultAnswer: serveEligibilityAnswer(false,
      {reasons: ['ready_lease_expired']}),
  });
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
    ['ready_lease_expired'],
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
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false,
          error: 'Message timeout',
        });
      }
      if (address === 'node2/partition/p1') {
        // Second candidate: also transient failure
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false,
          error: 'Query execution error',
        });
      }
      // Third candidate: success
      return buildDeliveryEnvelope({acknowledged: true}, {success: true, rows: [{id: 1}]});
    },
  };

  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
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
        return buildDeliveryEnvelope(
          {
            acknowledged: false,
            error: reconnectClosedError,
            errorCode: reconnectClosedErrorCode,
            deferRetry: true,
            retryAfterMs: reconnectRetryAfterMs,
          });
      }
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: true,
        rows: [{node_id: secondNodeId}],
      });
    },
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
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
        return buildDeliveryEnvelope({acknowledged: false, error: 'Message timeout'});
      }
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: true,
        rows: [{node_id: liveNodeId}],
      });
    },
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
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
      return buildDeliveryEnvelope(
        {
          acknowledged: false,
          error: `Connection to node ${disconnectedNodeId} closed`,
          errorCode: 'ROUTER_CONNECTION_CLOSED',
          retryAfterMs: 50,
          deferRetry: true,
        });
    },
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner({
      projectedDimensions: {controlPlaneRecoveryEligible: true, repairEligible: true},
    }),
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
      return buildDeliveryEnvelope(
        {
          acknowledged: false,
          error: `Connection to node ${unobservedNodeId} closed`,
          errorCode: 'ROUTER_CONNECTION_CLOSED',
          retryAfterMs: 50,
          deferRetry: true,
        });
    },
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner({
      projectedDimensions: {controlPlaneRecoveryEligible: true, repairEligible: true},
    }),
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
      return buildDeliveryEnvelope(
        {
          acknowledged: false,
          error: 'Message timeout',
          errorCode: 'ROUTER_MESSAGE_TIMEOUT',
          retryAfterMs: reconnectIntervalMs,
          deferRetry: true,
        });
    },
  };
  const executor = new QueryExecutor({
    controlPlaneReadinessService: createCommittedServeEligibilityOwner({
      projectedDimensions: {controlPlaneRecoveryEligible: true, repairEligible: true},
    }),
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

function createSinglePartitionTestSystemCache(partitionId, nodeId) {
  return {
    partitions: [{partition_id: partitionId, leader_node_id: nodeId}],
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
      return type === TABLES.PARTITIONS ?
        this.partitions.find((p) => p.partition_id === key) || null :
        null;
    },
    filter(type, predicate) {
      if (type === TABLES.SERVICES) return this.services.filter(predicate);
      if (type === TABLES.PARTITIONS) return this.partitions.filter(predicate);
      return [];
    },
  };
}

test(
  'QueryExecutor - executeOnPartition forwards timeoutBudget and ' +
    'cancellationToken to maybeAwaitDeniedPartitionRoutingRepair',
  async (t) => {
    const partitionId = 'p-repair-budget-forward';
    const nodeId = 'node-denied-repair';
    const systemCache = createSinglePartitionTestSystemCache(partitionId, nodeId);
    const capturedRefreshCalls = [];
    const readinessService = createCommittedServeEligibilityOwner({
      defaultAnswer: serveEligibilityAnswer('unavailable_stale'),
    });
    readinessService.readServeEligibility = async (options = {}) => {
      capturedRefreshCalls.push(options);
      readinessService.setDefault(serveEligibilityAnswer(true));
    };
    const messageRouter = {
      getConnectionState: () => 'connected',
      deliver: async () =>
        buildDeliveryEnvelope(
          {acknowledged: true},
          {success: true, rows: [{ok: 1}], changes: 0},
        ),
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: readinessService,
      messageRouter,
      systemCache,
    });
    executor.readRetryAttempts = 1;
    const timeoutBudget = Object.freeze({deadlineMs: Date.now() + 2500});
    const cancellationToken = Object.freeze({
      isCancelled: () => false,
      onCancel: () => {},
    });

    const result = await executor.executeOnPartition(
      partitionId,
      'SELECT * FROM bench_accounts',
      [],
      true,
      false,
      false,
      {timeoutMs: 2500, timeoutBudget, cancellationToken},
    );

    t.equal(result.success, true, 'read should succeed after serve refresh');
    t.equal(capturedRefreshCalls.length, 1);
    t.equal(capturedRefreshCalls[0].timeoutBudget, timeoutBudget);
    t.equal(capturedRefreshCalls[0].cancellationToken, cancellationToken);
    t.ok(
      Number.isFinite(capturedRefreshCalls[0].timeoutMs) &&
        capturedRefreshCalls[0].timeoutMs > 0,
      'remaining execution timeoutMs should be forwarded to readServeEligibility',
    );
  },
);

test(
  'QueryExecutor - changing failure reasons across retry attempts from ' +
    'readiness denial to no_service_rows replaces lastFailureDetails and ' +
    'lastError atomically without leaking Attempt 1 denial fields',
  async (t) => {
    const partitionId = 'p-denial-to-missing';
    const staleNodeId = 'node-stale-attempt-1';
    const systemCache = createSinglePartitionTestSystemCache(
      partitionId,
      staleNodeId,
    );
    const readinessService = createCommittedServeEligibilityOwner({
      answers: {
        [staleNodeId]: serveEligibilityAnswer(false, {
          reasons: ['ready_lease_expired', 'unavailable_stale'],
        }),
      },
    });
    let simulatedNowMs = 1000;
    const executor = new QueryExecutor({
      controlPlaneReadinessService: readinessService,
      messageRouter: createMockMessageRouter(),
      systemCache,
      nowFn: () => simulatedNowMs,
    });
    executor.leaderRetryDelayMs = 10;
    let delayCalls = 0;
    executor.delay = async (ms) => {
      delayCalls += 1;
      if (delayCalls === 1) {
        systemCache.services = [];
        simulatedNowMs += ms;
        return;
      }
      simulatedNowMs += 100;
    };

    const result = await executor.executeOnPartition(
      partitionId,
      'UPDATE bench_accounts SET balance = ? WHERE id = ?',
      [50, 1],
      false,
      true,
      false,
      {timeoutMs: 30},
    );

    t.equal(result.success, false);
    t.equal(
      result.routingReasonCode,
      QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
      'Attempt 2 should replace routingReasonCode with no_service_rows',
    );
    t.equal(
      result.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      'Attempt 2 should preserve the active routingReadinessDimension',
    );
    t.equal(result.routingDenialReasonCodes, undefined);
    t.equal(result.deniedByNodeId, undefined);
    t.equal(result.error, 'Partition service not found');
    t.equal(result.deliveryDisposition, 'pre_submission_route_unavailable');
  },
);

test(
  'QueryExecutor - changing failure reasons across retry attempts from ' +
    'candidate failure to no_service_rows replaces lastFailureDetails and ' +
    'lastError atomically while preserving unknownOutcome and candidateDeliveryAttempted',
  async (t) => {
    const partitionId = 'p-candidate-to-missing';
    const candidateNodeId = 'node-candidate-attempt-1';
    const readSystemCache = createSinglePartitionTestSystemCache(
      partitionId,
      candidateNodeId,
    );
    const readExecutor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => {
          readSystemCache.services = [];
          return buildDeliveryEnvelope({
            acknowledged: false,
            error: `Connection to ${candidateNodeId} reset`,
            errorCode: 'ROUTER_CONNECTION_CLOSED',
          });
        },
      },
      systemCache: readSystemCache,
    });
    readExecutor.readRetryAttempts = 2;
    readExecutor.leaderRetryDelayMs = 1;

    const readResult = await readExecutor.executeOnPartition(
      partitionId,
      'SELECT * FROM bench_accounts',
      [],
      true,
      false,
      false,
      {timeoutMs: 500},
    );

    t.equal(readResult.success, false);
    t.equal(
      readResult.routingReasonCode,
      QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
    );
    t.equal(readResult.participantNodeId, null);
    t.equal(readResult.participantAddress, null);
    t.equal(readResult.errorCode, null);
    t.equal(readResult.error, 'Partition service not found');
    t.equal(readResult.deliveryDisposition, undefined);

    const writeSystemCache = createSinglePartitionTestSystemCache(
      partitionId,
      candidateNodeId,
    );
    let writeNowMs = 5000;
    const writeExecutor = new QueryExecutor({
      controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () => {
          writeSystemCache.services = [];
          return buildDeliveryEnvelope({
            acknowledged: false,
            recoverableBeforeSend: false,
            error: 'Message timeout after send',
            errorCode: 'ROUTER_MESSAGE_TIMEOUT',
          });
        },
      },
      systemCache: writeSystemCache,
      nowFn: () => writeNowMs,
    });
    writeExecutor.leaderRetryDelayMs = 10;
    let writeDelays = 0;
    writeExecutor.delay = async (ms) => {
      writeDelays += 1;
      if (writeDelays === 1) {
        writeNowMs += ms;
        return;
      }
      writeNowMs += 500;
    };

    const writeResult = await writeExecutor.executeOnPartition(
      partitionId,
      'UPDATE bench_accounts SET balance = ? WHERE id = ?',
      [200, 1],
      false,
      true,
      false,
      {entryId: 'entry-atomic-unknown-1', timeoutMs: 100},
    );

    t.equal(writeResult.success, false);
    t.equal(
      writeResult.routingReasonCode,
      QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
    );
    t.equal(writeResult.participantNodeId, null);
    t.equal(writeResult.participantAddress, null);
    t.equal(writeResult.errorCode, null);
    t.equal(writeResult.failureCode, 'partition_write_outcome_unknown');
    t.equal(writeResult.entryId, 'entry-atomic-unknown-1');
    t.ok(writeResult.spentWait && typeof writeResult.spentWait === 'object');
    t.equal(writeResult.deliveryDisposition, undefined);
  },
);

test(
  'QueryExecutor - executeOnPartition re-awaits readServeEligibility across ' +
    'retry attempts when first refresh remains unavailable_stale',
  async (t) => {
    const partitionId = 'p-unavailable-stale-retry';
    const nodeId = 'node-stale-refresh';
    const systemCache = createSinglePartitionTestSystemCache(
      partitionId,
      nodeId,
    );
    const readinessService = createCommittedServeEligibilityOwner({
      defaultAnswer: serveEligibilityAnswer(false, {
        state: 'unavailable',
        reason: 'unavailable_stale',
        reasons: ['unavailable_stale'],
      }),
    });
    let refreshCount = 0;
    readinessService.readServeEligibility = async () => {
      refreshCount += 1;
      if (refreshCount >= 2) {
        readinessService.setDefault(serveEligibilityAnswer(true));
      }
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: readinessService,
      messageRouter: {
        getConnectionState: () => 'connected',
        deliver: async () =>
          buildDeliveryEnvelope(
            {acknowledged: true},
            {success: true, rows: [{ok: 1}], changes: 0},
          ),
      },
      systemCache,
    });
    executor.readRetryAttempts = 1;
    executor.leaderRetryDelayMs = 1;

    const result = await executor.executeOnPartition(
      partitionId,
      'SELECT * FROM bench_accounts',
      [],
      true,
      false,
      false,
      {timeoutMs: 1000},
    );

    t.equal(result.success, true, 'read succeeds once second refresh adopts epoch');
    t.equal(refreshCount, 2, 'second attempt re-awaited readServeEligibility');
  },
);

registerQueryExecutorRecoveryRoutingTests();
