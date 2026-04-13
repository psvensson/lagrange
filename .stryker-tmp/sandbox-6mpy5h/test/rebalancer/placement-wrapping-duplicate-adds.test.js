/**
 * Bug Test: MovePlanner.calculatePartitionPlacement wraps replicas onto
 * the same node when targetCount > nodes.length.
 *
 * With 2 nodes and targetCount=3, the while loop produces
 * targetNodes = ['node-2', 'node-1', 'node-2'] — giving node-2 a target
 * count of 2, which generates 2 ADD moves to the same node.
 *
 * The correct behavior is:
 * 1) keep desired targetReplicaCount at policy target (quorum semantics),
 * 2) cap targetNodes placement at available nodes (one replica per node),
 * 3) mark the placement as degraded when nodes are insufficient.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {REBALANCER_ENTITY_TYPE} from '../../src/rebalancer/rebalancer-constants.js';

test('Bug: placement wrapping generates duplicate ADDs', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({});
    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('2 nodes with targetCount=3 must not assign >1 replica per node',
    async (t) => {
      const nodes = [
        {node_id: 'node-1', cpu_usage_percent: 50},
        {node_id: 'node-2', cpu_usage_percent: 10},
      ];

      const planner = new MovePlanner({
        entityId: 'partition-1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: {
          getAvailableNodes: () => nodes,
          getHealthyReplicas: () => [],
          getInFlightOperations: () => [],
          hasPendingMove: () => false,
          hasPendingAddForNode: () => false,
        },
      });

      const policy = {
        targetReplicaCount: 3,
        placementConstraints: {
          spreadAcrossNodes: true,
          considerCpuLoad: true,
        },
      };

      const result = planner.calculatePartitionPlacement(nodes, 3, policy);

      // Count how many times each node appears
      const counts = new Map();
      for (const nodeId of result.targetNodes) {
        counts.set(nodeId, (counts.get(nodeId) || 0) + 1);
      }

      // No node should appear more than once — we only have 2 nodes,
      // so we can only place 2 replicas max
      for (const [nodeId, count] of counts) {
        t.equal(count, 1,
          `node ${nodeId} should have exactly 1 replica, got ${count}`);
      }

      // Placement should cap only node assignments, not desired target count
      t.equal(result.targetNodes.length, 2,
        'should cap target replicas at available node count');
      t.equal(result.targetReplicaCount, 3,
        'targetReplicaCount should remain the policy target');
      t.equal(result.degraded, true, 'placement should be marked degraded');
    });

  t.test('3 nodes with targetCount=3 should place 1 replica per node',
    async (t) => {
      const nodes = [
        {node_id: 'node-1', cpu_usage_percent: 10},
        {node_id: 'node-2', cpu_usage_percent: 20},
        {node_id: 'node-3', cpu_usage_percent: 30},
      ];

      const planner = new MovePlanner({
        entityId: 'partition-1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: {
          getAvailableNodes: () => nodes,
          getHealthyReplicas: () => [],
          getInFlightOperations: () => [],
          hasPendingMove: () => false,
          hasPendingAddForNode: () => false,
        },
      });

      const policy = {
        targetReplicaCount: 3,
        placementConstraints: {considerCpuLoad: true},
      };

      const result = planner.calculatePartitionPlacement(nodes, 3, policy);

      // Each node should appear exactly once
      const unique = new Set(result.targetNodes);
      t.equal(unique.size, 3, 'all 3 nodes should be used');
      t.equal(result.targetNodes.length, 3, 'should have 3 target nodes');
    });

  t.test('1 node with targetCount=3 must cap at 1 replica', async (t) => {
    const nodes = [
      {node_id: 'node-1', cpu_usage_percent: 10},
    ];

    const planner = new MovePlanner({
      entityId: 'partition-1',
      entityType: REBALANCER_ENTITY_TYPE.PARTITION,
      moveStateProvider: {
        getAvailableNodes: () => nodes,
        getHealthyReplicas: () => [],
        getInFlightOperations: () => [],
        hasPendingMove: () => false,
        hasPendingAddForNode: () => false,
      },
    });

    const policy = {
      targetReplicaCount: 3,
      placementConstraints: {considerCpuLoad: true},
    };

    const result = planner.calculatePartitionPlacement(nodes, 3, policy);

    t.equal(result.targetNodes.length, 1,
      'should cap at 1 replica for 1 node');
    t.equal(result.targetReplicaCount, 3,
      'targetReplicaCount should remain the policy target');
    t.equal(result.degraded, true, 'placement should be marked degraded');
  });
});
