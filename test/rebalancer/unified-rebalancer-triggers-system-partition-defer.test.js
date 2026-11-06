import {createMockCoordinator, createMockControlPlaneReadinessService} from './test-helpers.js';
/**
 * Unit tests for UnifiedRebalancer.
 * Tests the core rebalancing logic for partitions and message groups.
 * Requirements: 8.1, 8.2, 8.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';

import {
  createMockCache,
  createMockCdcService,
  createMockMessageRouter,
  createMockPolicyService,
  createNodeEndpoint,
  createPostgresWireEndpoint,
  initializeTestEnvironment,
} from './unified-rebalancer-test-support.js';

// Initialize test environment
// Create a mock system table cache
// Create mock CDC integration service
// Create mock table policy service
// Create mock message router
// Create mock rebalance coordinator
// Create mock readiness service backed by the same cache


// Create a fully configured rebalancer for testing
function createTestRebalancer(options = {}) {
  const {
    entityId = 'partition-1',
    entityType = EntityType.PARTITION,
    nodeId = 'node-1',
    nodes = [],
    services = [],
    partitions = [],
    tables = [],
    replicaOperations = [],
    nodeEndpoints = [],
    serviceEndpoints = [],
    connectionState = 'connected',
    sqlQueryEngine = null,
    controlPlaneSystemTableGateway = null,
    cdcIntegrationService = null,
    messageRouter = null,
    rebalanceCoordinator = null,
    controlPlaneReadinessService = null,
    bootstrapReadinessState = null,
    nowFn = null,
    priorityRecoveryActivityStaleGraceMs = null,
  } = options;

  const mockCache = createMockCache(
    nodes,
    services,
    partitions,
    tables,
    replicaOperations,
    nodeEndpoints,
    serviceEndpoints,
  );
  const mockCdcService = cdcIntegrationService || createMockCdcService();
  const mockPolicyService = createMockPolicyService({partitions: partitions, tables: tables});
  const mockMessageRouter = messageRouter ||
    createMockMessageRouter(connectionState);
  const mockSqlQueryEngine = sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: []};
    },
  };
  const mockReadinessService = controlPlaneReadinessService ||
    createMockControlPlaneReadinessService({systemTableCache: mockCache});
  const mockCoordinator = rebalanceCoordinator || createMockCoordinator({
    controlPlaneReadinessService: mockReadinessService,
  });

  return new UnifiedRebalancer({
    entityId,
    entityType,
    nodeId,
    systemTableCache: mockCache,
    cdcIntegrationService: mockCdcService,
    tablePolicyService: mockPolicyService,
    messageRouter: mockMessageRouter,
    rebalanceCoordinator: mockCoordinator,
    sqlQueryEngine: mockSqlQueryEngine,
    controlPlaneSystemTableGateway,
    controlPlaneReadinessService: mockReadinessService,
    bootstrapReadinessState,
    nowFn,
    priorityRecoveryActivityStaleGraceMs,
  });
}

test('UnifiedRebalancer - Rebalancing Triggers chunk 5', async (t) => {
  initializeTestEnvironment();
  await t.test(
    'checkRebalance defers system partitions when explicit ' +
    'non-zero start delay is configured',
    async (t) => {
      const explicitDelayMs = 600000;
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.systemPartitionStartDelayMs = explicitDelayMs;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now();

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return true;
      };

      const UNSCHEDULED = Symbol('unscheduled');
      let scheduledDelayMs = UNSCHEDULED;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        0,
        'system partition should not evaluate before explicit delay',
      );
      t.equal(
        typeof scheduledDelayMs,
        'number',
        'start-delay gate should schedule a delayed recheck',
      );
      t.ok(
        scheduledDelayMs >= 599000,
        'scheduled delay should be close to explicit start delay',
      );
    });

  await t.test(
    'checkRebalance defers system partitions with default ' +
    '0ms start delay',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE, ready_lease_expires_at: Date.now() + 600000},
          {node_id: 'node-2', status: NodeStatus.ACTIVE, ready_lease_expires_at: Date.now() + 600000},
          {node_id: 'node-3', status: NodeStatus.ACTIVE, ready_lease_expires_at: Date.now() + 600000},
        ],
        nodeEndpoints: [
          createNodeEndpoint('node-1'),
          createNodeEndpoint('node-2'),
          createNodeEndpoint('node-3'),
        ],
        serviceEndpoints: [
          createPostgresWireEndpoint('node-1'),
          createPostgresWireEndpoint('node-2'),
          createPostgresWireEndpoint('node-3'),
        ],
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.rebalanceStartAtMs = Date.now();

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };

      const UNSCHEDULED = Symbol('unscheduled');
      let scheduledDelayMs = UNSCHEDULED;
      rebalancer.scheduleNextCheck = (overrideDelayMs = null) => {
        scheduledDelayMs = overrideDelayMs;
      };

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'system partition should evaluate immediately with zero default delay',
      );
      t.equal(
        scheduledDelayMs,
        null,
        'zero default delay should not schedule a deferred start-delay check',
      );
    });

  await t.test('checkRebalance does not defer user partitions with zero start delay',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
        ],
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.userPartitionStartDelayMs = 0;
      rebalancer.rebalanceStartAtMs = Date.now();

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls++;
        return false;
      };
      rebalancer.scheduleNextCheck = () => {};

      await rebalancer.checkRebalance();

      t.equal(
        evaluateCalls,
        1,
        'user partition should evaluate immediately when start delay is zero',
      );
    });
});
