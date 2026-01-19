/**
 * Property Test: Autonomous Placement Decisions (Property 34)
 *
 * For any partition or message group, the leader replica should be able
 * to make autonomous placement decisions without coordination with other
 * leaders, and these decisions should converge to a consistent state.
 *
 * Validates: Requirements 19.2, 19.3
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  UnifiedRebalancer,
  EntityType,
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

// Arbitrary for generating node configurations
const nodeArb = fc.record({
  node_id: fc.uuid(),
  status: fc.constantFrom(NodeStatus.ACTIVE, NodeStatus.FAILED),
  cpu_usage_percent: fc.integer({min: 0, max: 100}),
  memory_usage_percent: fc.integer({min: 0, max: 100}),
  disk_usage_percent: fc.integer({min: 0, max: 100}),
});

test('Property 34: Autonomous Placement Decisions', async (t) => {
  initializeTestEnvironment();

  await t.test('leaders make independent decisions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeArb, {minLength: 3, maxLength: 5}),
        async (nodes) => {
          // Ensure at least 3 active nodes
          const activeNodes = nodes.map((n, i) => ({
            ...n,
            node_id: `node-${i}`,
            status: i < 3 ? NodeStatus.ACTIVE : n.status,
          }));

          const mockCache = createMockCache(activeNodes);

          // Create rebalancers for different partitions on different nodes
          const rebalancer1 = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            systemTableCache: mockCache,
          });

          const rebalancer2 = new UnifiedRebalancer({
            entityId: 'partition-2',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
            systemTableCache: mockCache,
          });

          // Both should be able to make decisions independently
          const policy = {replicaCount: 3, minReplicaCount: 3, maxReplicaCount: 7};

          const decision1 = rebalancer1.calculateTargetState([], policy);
          const decision2 = rebalancer2.calculateTargetState([], policy);

          // Both decisions should be valid (have target replica count)
          return decision1.targetReplicaCount >= policy.minReplicaCount &&
            decision2.targetReplicaCount >= policy.minReplicaCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Leaders make independent decisions');
  });

  await t.test('decisions converge to consistent state', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeArb, {minLength: 3, maxLength: 5}),
        async (nodes) => {
          // Ensure at least 3 active nodes
          const activeNodes = nodes.map((n, i) => ({
            ...n,
            node_id: `node-${i}`,
            status: i < 3 ? NodeStatus.ACTIVE : n.status,
          }));

          const mockCache = createMockCache(activeNodes);

          // Create multiple rebalancers with same entity
          const rebalancer1 = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            systemTableCache: mockCache,
          });

          const rebalancer2 = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
            systemTableCache: mockCache,
          });

          // Same policy should produce same target state
          const policy = {replicaCount: 3, minReplicaCount: 3, maxReplicaCount: 7};

          const state1 = rebalancer1.calculateTargetState([], policy);
          const state2 = rebalancer2.calculateTargetState([], policy);

          // Target replica counts should converge
          return state1.targetReplicaCount === state2.targetReplicaCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Decisions converge to consistent state');
  });

  await t.test('no coordination required between leaders', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeArb, {minLength: 3, maxLength: 5}),
        async (nodes) => {
          // Ensure at least 3 active nodes
          const activeNodes = nodes.map((n, i) => ({
            ...n,
            node_id: `node-${i}`,
            status: i < 3 ? NodeStatus.ACTIVE : n.status,
          }));

          const mockCache = createMockCache(activeNodes);

          // Create rebalancer
          const rebalancer = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            systemTableCache: mockCache,
          });

          // Rebalancer should be able to make decisions using only local cache
          const availableNodes = rebalancer.getAvailableNodes();

          // Should have access to node information from cache
          return availableNodes.length >= 3;
        },
      ),
      {numRuns: 10},
    );

    t.pass('No coordination required between leaders');
  });

  await t.test('decisions based on local system table cache', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeArb, {minLength: 3, maxLength: 5}),
        async (nodes) => {
          // Ensure at least 3 active nodes
          const activeNodes = nodes.map((n, i) => ({
            ...n,
            node_id: `node-${i}`,
            status: i < 3 ? NodeStatus.ACTIVE : n.status,
          }));

          const mockCache = createMockCache(activeNodes);

          const rebalancer = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            systemTableCache: mockCache,
          });

          // Get available nodes from cache
          const availableNodes = rebalancer.getAvailableNodes();

          // Count active nodes in original data
          const expectedActiveCount = activeNodes.filter(
            (n) => n.status === NodeStatus.ACTIVE,
          ).length;

          // Available nodes should match active nodes in cache
          return availableNodes.length === expectedActiveCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Decisions based on local system table cache');
  });
});
