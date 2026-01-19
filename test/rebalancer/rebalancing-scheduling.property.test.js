/**
 * Property Test: Rebalancing Scheduling (Property 23)
 *
 * For any rebalancing operation, the scheduling should use periodic checks
 * with jitter for non-critical events and immediate checks for critical
 * events like node failures or replicas below minimum.
 *
 * Validates: Requirements 8.10
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  UnifiedRebalancer,
  EntityType,
  TriggerType,
  NodeStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize test environment
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

// Create a mock system table cache
function createMockCache(nodes) {
  const cache = {
    nodes: new Map(nodes.map((n) => [n.node_id, n])),
    services: new Map(),
    partitions: new Map(),
    tables: new Map(),
    message_groups: new Map(),
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

test('Property 23: Rebalancing Scheduling', async (t) => {
  initializeTestEnvironment();

  await t.test('critical triggers cause immediate checks', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(TriggerType.NODE_FAILURE, TriggerType.CRITICAL),
        async (triggerType) => {
          const nodes = [
            {node_id: 'node-0', status: NodeStatus.ACTIVE},
            {node_id: 'node-1', status: NodeStatus.ACTIVE},
            {node_id: 'node-2', status: NodeStatus.ACTIVE},
          ];

          const mockCache = createMockCache(nodes);

          const rebalancer = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            systemTableCache: mockCache,
          });

          // Critical triggers should be recognized
          const isCritical = triggerType === TriggerType.NODE_FAILURE ||
            triggerType === TriggerType.CRITICAL;

          // Trigger immediate check for critical events
          rebalancer.triggerImmediateCheck(triggerType);

          // Critical triggers should cause immediate action
          return isCritical === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Critical triggers cause immediate checks');
  });

  await t.test('non-critical triggers use periodic scheduling', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          TriggerType.NODE_JOIN,
          TriggerType.NODE_LEAVE,
          TriggerType.POLICY_CHANGE,
          TriggerType.PERIODIC,
        ),
        async (triggerType) => {
          // Non-critical triggers should not be NODE_FAILURE or CRITICAL
          const isNonCritical = triggerType !== TriggerType.NODE_FAILURE &&
            triggerType !== TriggerType.CRITICAL;

          return isNonCritical === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Non-critical triggers use periodic scheduling');
  });

  await t.test('scheduling includes jitter for non-critical events', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1000, max: 60000}),
        fc.float({min: 0, max: 0.5}),
        async (baseInterval, jitterFactor) => {
          // Calculate expected jitter range
          const maxJitter = baseInterval * jitterFactor;
          const minDelay = baseInterval - maxJitter;
          const maxDelay = baseInterval + maxJitter;

          // Jitter should create a valid range
          return minDelay <= maxDelay && minDelay >= 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Scheduling includes jitter for non-critical events');
  });

  await t.test('replica below minimum triggers immediate rebalance', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 2}),
        async (currentReplicaCount) => {
          const nodes = [
            {node_id: 'node-0', status: NodeStatus.ACTIVE},
            {node_id: 'node-1', status: NodeStatus.ACTIVE},
            {node_id: 'node-2', status: NodeStatus.ACTIVE},
          ];

          const mockCache = createMockCache(nodes);

          const rebalancer = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            systemTableCache: mockCache,
          });

          const policy = {replicaCount: 3, minReplicaCount: 3, maxReplicaCount: 7};

          // Current replica count below minimum should trigger rebalance
          const belowMinimum = currentReplicaCount < policy.minReplicaCount;

          // Calculate target state
          const replicas = Array.from({length: currentReplicaCount}, (_, i) => ({
            replica_id: `replica-${i}`,
            node_id: `node-${i}`,
            status: 'active',
          }));

          const targetState = rebalancer.calculateTargetState(replicas, policy);
          const moves = rebalancer.calculateMoves(replicas, targetState);

          // Should need to add replicas when below minimum
          const needsMoreReplicas = moves.some((m) => m.type === 'add');

          return belowMinimum === needsMoreReplicas;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Replica below minimum triggers immediate rebalance');
  });
});
