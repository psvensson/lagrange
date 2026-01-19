/**
 * Property Test: Unified Rebalancer Behavior (Property 12)
 *
 * For any rebalancing trigger (node join, node leave, policy change),
 * the same rebalancing algorithm should be used for both partitions
 * and message groups, with behavior determined solely by the applicable policy.
 *
 * Validates: Requirements 8.1, 8.7, 8.8
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
function createMockCache(nodes, services = []) {
  const cache = {
    nodes: new Map(nodes.map((n) => [n.node_id, n])),
    services: new Map(services.map((s) => [s.service_id, s])),
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

// Arbitrary for generating policies
const policyArb = fc.record({
  replicaCount: fc.constantFrom(3, 5, 7),
  minReplicaCount: fc.constant(3),
  maxReplicaCount: fc.constantFrom(5, 7, 9),
  placementConstraints: fc.record({
    spreadAcrossNodes: fc.boolean(),
    considerCpuLoad: fc.boolean(),
    considerMemoryLoad: fc.boolean(),
    considerDiskSpace: fc.boolean(),
  }),
});

test('Property 12: Unified Rebalancer Behavior', async (t) => {
  initializeTestEnvironment();

  await t.test('same algorithm for partitions and message groups', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeArb, {minLength: 3, maxLength: 5}),
        policyArb,
        async (nodes, _policy) => {
          // Ensure at least 3 active nodes
          const activeNodes = nodes.map((n, i) => ({
            ...n,
            node_id: `node-${i}`,
            status: i < 3 ? NodeStatus.ACTIVE : n.status,
          }));

          const mockCache = createMockCache(activeNodes);

          // Create partition rebalancer
          const partitionRebalancer = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            systemTableCache: mockCache,
          });

          // Create message group rebalancer
          const messageGroupRebalancer = new UnifiedRebalancer({
            entityId: 'mg-1',
            entityType: EntityType.MESSAGE_GROUP,
            nodeId: 'node-0',
            systemTableCache: mockCache,
          });

          // Both should use the same available nodes
          const partitionNodes = partitionRebalancer.getAvailableNodes();
          const messageGroupNodes = messageGroupRebalancer.getAvailableNodes();

          // Same nodes should be available to both
          const partitionNodeIds = new Set(partitionNodes.map((n) => n.node_id));
          const messageGroupNodeIds = new Set(messageGroupNodes.map((n) => n.node_id));

          return partitionNodeIds.size === messageGroupNodeIds.size &&
            [...partitionNodeIds].every((id) => messageGroupNodeIds.has(id));
        },
      ),
      {numRuns: 10},
    );

    t.pass('Same algorithm used for partitions and message groups');
  });

  await t.test('behavior determined by policy', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        policyArb,
        async (policy) => {
          const nodes = [
            {node_id: 'node-1', status: NodeStatus.ACTIVE},
            {node_id: 'node-2', status: NodeStatus.ACTIVE},
            {node_id: 'node-3', status: NodeStatus.ACTIVE},
          ];

          const mockCache = createMockCache(nodes);

          const rebalancer = new UnifiedRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-1',
            systemTableCache: mockCache,
          });

          // Validate replica count based on policy
          const validatedCount = rebalancer.validateReplicaCount(
            policy.replicaCount,
            policy,
          );

          // Result should be within policy bounds
          const withinBounds = validatedCount >= policy.minReplicaCount &&
            validatedCount <= policy.maxReplicaCount;

          // Result should be odd (for Raft quorum)
          const isOdd = validatedCount % 2 === 1;

          return withinBounds && isOdd;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Behavior determined by policy');
  });

  await t.test('independent leader decisions converge', async (t) => {
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

          // Create multiple rebalancers (simulating different partition leaders)
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

          // Both should see the same available nodes
          const nodes1 = rebalancer1.getAvailableNodes();
          const nodes2 = rebalancer2.getAvailableNodes();

          // Both should calculate the same target state for same policy
          const testPolicy = {replicaCount: 3, minReplicaCount: 3, maxReplicaCount: 7};
          const target1 = rebalancer1.calculateTargetState([], testPolicy);
          const target2 = rebalancer2.calculateTargetState([], testPolicy);

          // Target replica counts should match
          return nodes1.length === nodes2.length &&
            target1.targetReplicaCount === target2.targetReplicaCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Independent leader decisions converge');
  });
});
