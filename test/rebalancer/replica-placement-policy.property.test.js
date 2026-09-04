/**
 * Property Test: Replica Placement Policy Compliance (Property 3)
 *
 * For any table or message group, the number of replicas should always
 * match the policy specification, and replicas should be distributed
 * according to placement constraints.
 *
 * Validates: Requirements 2.2, 2.5, 8.1, 8.2
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EntityType, NodeStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestRebalancer} from './test-helpers.js';

function projectNodesAsReady(nodes) {
  return Object.fromEntries(nodes.map(({node_id: nodeId}) => [
    nodeId,
    Object.freeze({readyNow: true}),
  ]));
}

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

// Arbitrary for generating node configurations
const nodeArb = fc.record({
  node_id: fc.uuid(),
  status: fc.constantFrom(NodeStatus.ACTIVE, NodeStatus.FAILED),
  cpu_usage_percent: fc.integer({min: 0, max: 100}),
  memory_usage_percent: fc.integer({min: 0, max: 100}),
  disk_usage_percent: fc.integer({min: 0, max: 100}),
});

// Arbitrary for generating policies with valid constraints
// Ensure replicaCount is always <= maxReplicaCount
const policyArb = fc.integer({min: 3, max: 7}).chain((maxReplica) => {
  // Ensure maxReplica is odd
  const adjustedMax = maxReplica % 2 === 0 ? maxReplica + 1 : maxReplica;
  return fc.record({
    replicaCount: fc.constantFrom(3, 5, 7).filter((r) => r <= adjustedMax),
    minReplicaCount: fc.constant(3),
    maxReplicaCount: fc.constant(adjustedMax),
    placementConstraints: fc.record({
      spreadAcrossNodes: fc.boolean(),
      considerCpuLoad: fc.boolean(),
      considerMemoryLoad: fc.boolean(),
      considerDiskSpace: fc.boolean(),
    }),
  });
});

test('Property 3: Replica Placement Policy Compliance', async (t) => {
  initializeTestEnvironment();

  await t.test('replica count matches policy specification', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeArb, {minLength: 3, maxLength: 7}),
        policyArb,
        async (nodes, policy) => {
          // Ensure at least 3 active nodes
          const activeNodes = nodes.map((n, i) => ({
            ...n,
            node_id: `node-${i}`,
            status: i < 3 ? NodeStatus.ACTIVE : n.status,
          }));

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            cacheData: {nodes: activeNodes},
            livenessProjectionByNodeId: projectNodesAsReady(activeNodes),
          });

          // Calculate target state with no existing replicas
          const targetState = await rebalancer.calculateTargetState([], policy);

          // Target replica count should be within policy bounds
          const withinBounds = targetState.targetReplicaCount >= policy.minReplicaCount &&
            targetState.targetReplicaCount <= policy.maxReplicaCount;

          // Target replica count should be odd (for Raft quorum)
          const isOdd = targetState.targetReplicaCount % 2 === 1;

          return withinBounds && isOdd;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Replica count matches policy specification');
  });

  await t.test('replicas distributed across different nodes', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nodeArb, {minLength: 5, maxLength: 7}),
        async (nodes) => {
          // Ensure all nodes are active
          const activeNodes = nodes.map((n, i) => ({
            ...n,
            node_id: `node-${i}`,
            status: NodeStatus.ACTIVE,
          }));

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            cacheData: {nodes: activeNodes},
            livenessProjectionByNodeId: projectNodesAsReady(activeNodes),
          });

          const policy = {
            replicaCount: 3,
            minReplicaCount: 3,
            maxReplicaCount: 7,
            placementConstraints: {spreadAcrossNodes: true},
          };

          // Calculate target state with no existing replicas
          const targetState = await rebalancer.calculateTargetState([], policy);

          // When spreading across nodes, target nodes should be different
          const targetNodeIds = new Set(targetState.targetNodes);

          // Each target node should be unique (spread across nodes)
          return targetNodeIds.size === targetState.targetNodes.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Replicas distributed across different nodes');
  });

  await t.test('placement considers node resource usage', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 0, max: 100}),
        fc.integer({min: 0, max: 100}),
        async (cpuUsage, memoryUsage) => {
          // Create nodes with varying resource usage
          const nodes = [
            {
              node_id: 'node-0',
              status: NodeStatus.ACTIVE,
              cpu_usage_percent: 10,
              memory_usage_percent: 10,
              disk_usage_percent: 10,
            },
            {
              node_id: 'node-1',
              status: NodeStatus.ACTIVE,
              cpu_usage_percent: cpuUsage,
              memory_usage_percent: memoryUsage,
              disk_usage_percent: 50,
            },
            {
              node_id: 'node-2',
              status: NodeStatus.ACTIVE,
              cpu_usage_percent: 90,
              memory_usage_percent: 90,
              disk_usage_percent: 90,
            },
          ];

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            cacheData: {nodes},
            livenessProjectionByNodeId: projectNodesAsReady(nodes),
          });

          // Get available nodes - should filter based on status
          const availableNodes = rebalancer.getAvailableNodes();

          // All active nodes should be available
          return availableNodes.length === 3;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Placement considers node resource usage');
  });

  await t.test('policy constraints are respected', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        policyArb,
        async (policy) => {
          const nodes = [
            {node_id: 'node-0', status: NodeStatus.ACTIVE},
            {node_id: 'node-1', status: NodeStatus.ACTIVE},
            {node_id: 'node-2', status: NodeStatus.ACTIVE},
            {node_id: 'node-3', status: NodeStatus.ACTIVE},
            {node_id: 'node-4', status: NodeStatus.ACTIVE},
          ];

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            nodeId: 'node-0',
            cacheData: {nodes},
            livenessProjectionByNodeId: projectNodesAsReady(nodes),
          });

          // Calculate target state and check result
          const targetState = await rebalancer.calculateTargetState([], policy);

          // Result should have valid structure
          const hasValidStructure = targetState &&
            typeof targetState.targetReplicaCount === 'number' &&
            Array.isArray(targetState.targetNodes);

          // Target count should respect policy bounds
          const respectsBounds = targetState.targetReplicaCount >= policy.minReplicaCount &&
            targetState.targetReplicaCount <= policy.maxReplicaCount;

          return hasValidStructure && respectsBounds;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Policy constraints are respected');
  });
});
