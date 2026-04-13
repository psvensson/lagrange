/**
 * Property Tests: Rebalancer Gating
 *
 * Feature: bootstrap-lifecycle-hardening, Property 10: No rebalancer
 * planning while cluster not ready
 * **Validates: Requirements 4.3, 4.4**
 *
 * *For any* rebalancer instance where the ClusterReadinessSignal
 * reports `ready: false`, the rebalancer SHALL not execute any
 * planning cycle. Once the signal reports `ready: true`, the
 * rebalancer SHALL proceed with normal stabilization-based planning.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
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

/**
 * Arbitrary: generates a sequence of not-ready evaluations followed
 * by an optional ready evaluation. The notReadyCount is 1..5 and
 * becomesReady is a boolean controlling whether the signal eventually
 * reports ready.
 */
const readinessSequenceArb = fc.record({
  notReadyCount: fc.integer({min: 1, max: 5}),
  becomesReady: fc.boolean(),
  unmetConditions: fc.subarray(
    ['cdcPipelineReady', 'nodesRegistered', 'cacheHydrated'],
    {minLength: 1, maxLength: 3},
  ),
});

test(
  'Feature: bootstrap-lifecycle-hardening, ' +
  'Property 10: No rebalancer planning while cluster not ready',
  async (t) => {
    initializeTestEnvironment();

    /**
     * **Validates: Requirements 4.3, 4.4**
     */
    await t.test(
      'no planning while not ready, proceeds when ready',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            readinessSequenceArb,
            async ({notReadyCount, becomesReady, unmetConditions}) => {
              let callIndex = 0;
              let evaluateCount = 0;

              const signal = {
                evaluate: () => {
                  evaluateCount++;
                  callIndex++;
                  if (callIndex <= notReadyCount) {
                    return {ready: false, unmetConditions};
                  }
                  return {ready: true, unmetConditions: []};
                },
              };

              const rebalancer = createRebalancerWithSignal(signal);
              rebalancer.initialize();
              rebalancer.setLeader(true);
              rebalancer.cancelScheduledCheck();

              try {
                // Phase 1: not-ready checks — planning must be deferred
                for (let i = 0; i < notReadyCount; i++) {
                  rebalancer.cancelScheduledCheck();
                  await rebalancer.checkRebalance();
                  if (rebalancer.clusterReadinessConfirmed) {
                    return false;
                  }
                }

                // Phase 2: if becomesReady, the next check should
                // confirm readiness and proceed past the gate
                if (becomesReady) {
                  rebalancer.cancelScheduledCheck();
                  // Ensure stabilization passes so planning proceeds
                  rebalancer.lastStateChangeTime = Date.now() - 20000;
                  await rebalancer.checkRebalance();

                  if (!rebalancer.clusterReadinessConfirmed) {
                    return false;
                  }

                  // Signal should not be evaluated again on next check
                  const evalCountBefore = evaluateCount;
                  rebalancer.cancelScheduledCheck();
                  await rebalancer.checkRebalance();
                  if (evaluateCount !== evalCountBefore) {
                    return false;
                  }
                }

                return true;
              } finally {
                rebalancer.shutdown();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );

    await t.test(
      'timeout forces readiness confirmation even when not ready',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.subarray(
              ['cdcPipelineReady', 'nodesRegistered', 'cacheHydrated'],
              {minLength: 1, maxLength: 3},
            ),
            async (unmetConditions) => {
              const signal = {
                evaluate: () => ({ready: false, unmetConditions}),
              };

              const rebalancer = createRebalancerWithSignal(signal);
              rebalancer.initialize();
              rebalancer.setLeader(true);
              rebalancer.cancelScheduledCheck();

              try {
                // First check — starts the timeout clock
                await rebalancer.checkRebalance();
                rebalancer.cancelScheduledCheck();
                if (rebalancer.clusterReadinessConfirmed) {
                  return false;
                }

                // Force the start time past the timeout
                rebalancer.clusterReadinessStartMs =
                  Date.now() - CLUSTER_READINESS_TIMEOUT_MS - 1;
                rebalancer.lastStateChangeTime = Date.now() - 20000;
                await rebalancer.checkRebalance();

                // Must have confirmed despite not-ready signal
                return rebalancer.clusterReadinessConfirmed === true;
              } finally {
                rebalancer.shutdown();
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);
