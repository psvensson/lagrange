/**
 * Unit tests for cluster readiness gate integration in UnifiedRebalancer.
 * Validates that the rebalancer defers planning until the cluster is ready,
 * proceeds after timeout, and skips checks once confirmed.
 * Requirements: 4.1, 4.3, 4.4, 4.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CLUSTER_READINESS_TIMEOUT_MS,
} from '../../src/constants/cdc-lifecycle-constants.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createMockCache(nodes = [], services = []) {
  const now = Date.now();
  const normalizedNodes = nodes.map((node) => ({
    connection_state: 'ready',
    ready_lease_expires_at: now + 10000,
    ...node,
  }));
  const cache = {
    nodes: new Map(normalizedNodes.map((n) => [n.node_id, n])),
    services: new Map(services.map((s) => [s.service_id, s])),
    partitions: new Map(),
    tables: new Map(),
    message_groups: new Map(),
    replica_operations: new Map(),
  };

  return {
    get: (tableName, key) => cache[tableName]?.get(key),
    filter: (tableName, predicate) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values()).filter(predicate);
    },
    getAll: (tableName) => {
      const table = cache[tableName];
      if (!table) return [];
      return Array.from(table.values());
    },
  };
}

function createMockCdcService() {
  return {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };
}

function createMockPolicyService() {
  return {
    getPolicyForPartition: () => ({targetReplicaCount: 3}),
    getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
  };
}

function createMockMessageRouter() {
  return {
    getConnectionState: () => 'connected',
    deliver: async () => ({acknowledged: true, status: 'completed'}),
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

function createMockCoordinator() {
  return {
    getMoveSafetyError: () => null,
    createOperation: async (move) => ({
      operationId: 'op-' + Date.now(),
      type: move.type,
      status: 'pending',
      workflowStep: 'pending',
    }),
    executeOperation: async () => ({success: true}),
    canStartAddOperation: async () => true,
    canStartRemoveOperation: async () => true,
    getStats: () => ({
      operationsCreated: 0,
      operationsCompleted: 0,
      operationsFailed: 0,
      inFlightOperations: 0,
    }),
  };
}

function createRebalancerWithSignal(signal, options = {}) {
  const mockCache = createMockCache(
    options.nodes || [],
    options.services || [],
  );
  return new UnifiedRebalancer({
    entityId: options.entityId || 'partition-1',
    entityType: options.entityType || EntityType.PARTITION,
    nodeId: options.nodeId || 'node-1',
    systemTableCache: mockCache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: createMockCoordinator(),
    clusterReadinessSignal: signal,
  });
}

test('UnifiedRebalancer - Cluster Readiness Gate', async (t) => {
  initializeTestEnvironment();

  await t.test('no signal provided — skips readiness check entirely',
    async (t) => {
      const rebalancer = createRebalancerWithSignal(null);
      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.cancelScheduledCheck();

      // clusterReadinessConfirmed should be true when no signal
      t.equal(rebalancer.clusterReadinessConfirmed, true);

      // checkRebalance should proceed to stabilization, not block
      await rebalancer.checkRebalance();
      rebalancer.shutdown();
    });

  await t.test('signal reports ready on first check — confirms and proceeds',
    async (t) => {
      const signal = {
        evaluate: () => ({ready: true, unmetConditions: []}),
      };
      const rebalancer = createRebalancerWithSignal(signal);
      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.cancelScheduledCheck();

      t.equal(rebalancer.clusterReadinessConfirmed, false);

      // Force stabilization to pass so we can observe the full flow
      rebalancer.lastStateChangeTime = Date.now() - 20000;
      await rebalancer.checkRebalance();

      t.equal(rebalancer.clusterReadinessConfirmed, true);
      rebalancer.shutdown();
    });

  await t.test('signal reports not ready — defers planning',
    async (t) => {
      let evaluateCount = 0;
      const signal = {
        evaluate: () => {
          evaluateCount++;
          return {
            ready: false,
            unmetConditions: ['nodesRegistered'],
          };
        },
      };
      const rebalancer = createRebalancerWithSignal(signal);
      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.cancelScheduledCheck();

      await rebalancer.checkRebalance();

      t.equal(rebalancer.clusterReadinessConfirmed, false);
      t.equal(evaluateCount, 1);
      t.ok(rebalancer.clusterReadinessStartMs !== null);
      rebalancer.shutdown();
    });

  await t.test('signal not ready then ready — confirms on second check',
    async (t) => {
      let callCount = 0;
      const signal = {
        evaluate: () => {
          callCount++;
          if (callCount === 1) {
            return {ready: false, unmetConditions: ['cacheHydrated']};
          }
          return {ready: true, unmetConditions: []};
        },
      };
      const rebalancer = createRebalancerWithSignal(signal);
      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.cancelScheduledCheck();

      // First check — not ready, defers
      await rebalancer.checkRebalance();
      rebalancer.cancelScheduledCheck();
      t.equal(rebalancer.clusterReadinessConfirmed, false);

      // Second check — ready, confirms
      rebalancer.lastStateChangeTime = Date.now() - 20000;
      await rebalancer.checkRebalance();
      t.equal(rebalancer.clusterReadinessConfirmed, true);
      rebalancer.shutdown();
    });

  await t.test('timeout reached — logs warning and proceeds',
    async (t) => {
      const signal = {
        evaluate: () => ({
          ready: false,
          unmetConditions: ['cdcPipelineReady', 'nodesRegistered'],
        }),
      };
      const rebalancer = createRebalancerWithSignal(signal);
      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.cancelScheduledCheck();

      // Simulate that the first check happened long ago
      await rebalancer.checkRebalance();
      rebalancer.cancelScheduledCheck();
      t.equal(rebalancer.clusterReadinessConfirmed, false);

      // Force the start time to be past the timeout
      rebalancer.clusterReadinessStartMs =
        Date.now() - CLUSTER_READINESS_TIMEOUT_MS - 1;
      rebalancer.lastStateChangeTime = Date.now() - 20000;
      await rebalancer.checkRebalance();

      t.equal(rebalancer.clusterReadinessConfirmed, true);
      rebalancer.shutdown();
    });

  await t.test('once confirmed — skips future signal evaluations',
    async (t) => {
      let evaluateCount = 0;
      const signal = {
        evaluate: () => {
          evaluateCount++;
          return {ready: true, unmetConditions: []};
        },
      };
      const rebalancer = createRebalancerWithSignal(signal);
      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.cancelScheduledCheck();
      rebalancer.lastStateChangeTime = Date.now() - 20000;

      // First check — evaluates and confirms
      await rebalancer.checkRebalance();
      rebalancer.cancelScheduledCheck();
      t.equal(evaluateCount, 1);
      t.equal(rebalancer.clusterReadinessConfirmed, true);

      // Second check — should not evaluate again
      await rebalancer.checkRebalance();
      t.equal(evaluateCount, 1);
      rebalancer.shutdown();
    });

  await t.test('uses CLUSTER_READINESS_TIMEOUT_MS as default timeout',
    async (t) => {
      const signal = {
        evaluate: () => ({ready: true, unmetConditions: []}),
      };
      const rebalancer = createRebalancerWithSignal(signal);

      t.equal(
        rebalancer.clusterReadinessTimeoutMs,
        CLUSTER_READINESS_TIMEOUT_MS,
      );
      rebalancer.shutdown();
    });

  await t.test('not leader — skips readiness check entirely',
    async (t) => {
      let evaluateCount = 0;
      const signal = {
        evaluate: () => {
          evaluateCount++;
          return {ready: false, unmetConditions: ['nodesRegistered']};
        },
      };
      const rebalancer = createRebalancerWithSignal(signal);
      rebalancer.initialize();
      // Do not set leader

      await rebalancer.checkRebalance();

      t.equal(evaluateCount, 0);
      t.equal(rebalancer.clusterReadinessConfirmed, false);
      rebalancer.shutdown();
    });

  await t.test('distinguishes evidence-confirmed, intentionally-relaxed, and degraded-timeout readiness states',
    async (t) => {
      // 1. Intentionally relaxed readiness
      const relaxedRebalancer = createRebalancerWithSignal(null);
      relaxedRebalancer.initialize();
      t.equal(relaxedRebalancer.clusterReadinessState, 'intentionally_relaxed');
      relaxedRebalancer.shutdown();

      // 2. Evidence confirmed readiness
      const readySignal = {
        evaluate: () => ({ready: true, unmetConditions: []}),
      };
      const confirmedRebalancer = createRebalancerWithSignal(readySignal);
      confirmedRebalancer.initialize();
      confirmedRebalancer.setLeader(true);
      confirmedRebalancer.cancelScheduledCheck();
      confirmedRebalancer.lastStateChangeTime = Date.now() - 20000;
      await confirmedRebalancer.checkRebalance();
      t.equal(confirmedRebalancer.clusterReadinessState, 'evidence_confirmed');
      confirmedRebalancer.shutdown();

      // 3. Degraded timeout readiness
      const unreadySignal = {
        evaluate: () => ({ready: false, unmetConditions: ['nodesRegistered']}),
      };
      const degradedRebalancer = createRebalancerWithSignal(unreadySignal);
      degradedRebalancer.initialize();
      degradedRebalancer.setLeader(true);
      degradedRebalancer.cancelScheduledCheck();
      degradedRebalancer.clusterReadinessStartMs = Date.now() - CLUSTER_READINESS_TIMEOUT_MS - 1;
      degradedRebalancer.lastStateChangeTime = Date.now() - 20000;
      await degradedRebalancer.checkRebalance();
      t.equal(degradedRebalancer.clusterReadinessState, 'degraded_timeout');
      degradedRebalancer.shutdown();
    });

  await t.test('passes real evidence and requirePropagationLeader policy down to the signal',
    async (t) => {
      let passedContext = null;
      const signal = {
        evaluate: (ctx) => {
          passedContext = ctx;
          return {ready: true, unmetConditions: []};
        },
      };

      const customPartitionServices = new Map([['p1', {}]]);
      const customMessageGroupServices = new Map([['mg1', {}]]);

      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        systemTableCache: createMockCache(),
        cdcIntegrationService: createMockCdcService(),
        tablePolicyService: createMockPolicyService(),
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: createMockCoordinator(),
        clusterReadinessSignal: signal,
        partitionServices: customPartitionServices,
        messageGroupServices: customMessageGroupServices,
        requirePropagationLeader: false,
      });

      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.cancelScheduledCheck();
      rebalancer.lastStateChangeTime = Date.now() - 20000;
      await rebalancer.checkRebalance();

      t.ok(passedContext);
      t.equal(passedContext.partitionServices, customPartitionServices);
      t.equal(passedContext.messageGroupServices, customMessageGroupServices);
      t.equal(passedContext.requirePropagationLeader, false);
      rebalancer.shutdown();
    });
});
