/**
 * Property Test: Placement Policy Compliance
 * **Property 12: Placement Policy Compliance**
 * **Validates: Requirements 6.5**
 *
 * Feature: simplified-cluster-architecture, Property 12: Placement Policy Compliance
 *
 * *For any* rebalancing proposal, no partition SHALL have multiple replicas
 * assigned to the same node.
 *
 * This property test verifies:
 * 1. calculateMoves never produces assignments with duplicate nodes per partition
 * 2. proposedAssignments maintain unique node lists for each partition
 * 3. The placement policy is respected regardless of input configuration
 */

import {test} from 'tap';
import fc from 'fast-check';
import {StateAwareRebalancer} from '../../src/rebalancer/state-aware-rebalancer.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';

/**
 * Generator for valid node IDs.
 */
const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{1,8}$/);

/**
 * Generator for valid partition IDs.
 */
const partitionIdArb = fc.stringMatching(/^partition-[a-z0-9]{1,8}$/);

/**
 * Generator for a set of unique node IDs.
 */
const uniqueNodeIdsArb = (minLength, maxLength) =>
  fc.array(nodeIdArb, {minLength, maxLength})
    .map((ids) => [...new Set(ids)])
    .filter((ids) => ids.length >= minLength);

/**
 * Generator for a set of unique partition IDs.
 */
const uniquePartitionIdsArb = (minLength, maxLength) =>
  fc.array(partitionIdArb, {minLength, maxLength})
    .map((ids) => [...new Set(ids)])
    .filter((ids) => ids.length >= minLength);

/**
 * Helper function to check if a node list has duplicates.
 * @param {string[]} nodeList - Array of node IDs.
 * @return {boolean} True if there are duplicates.
 */
function hasDuplicates(nodeList) {
  const nodeSet = new Set(nodeList);
  return nodeSet.size !== nodeList.length;
}

/**
 * Helper function to verify all partitions have unique node assignments.
 * @param {Object} assignments - Partition to node list mapping.
 * @return {{valid: boolean, violations: string[]}} Validation result.
 */
function validatePlacementPolicy(assignments) {
  const violations = [];

  for (const [partitionId, nodeList] of Object.entries(assignments)) {
    if (hasDuplicates(nodeList)) {
      const duplicates = nodeList.filter(
        (node, index) => nodeList.indexOf(node) !== index,
      );
      violations.push(
        `Partition '${partitionId}' has duplicate nodes: ${duplicates.join(', ')}`,
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

test('Property 12: Placement Policy Compliance', async (t) => {
  /**
   * Property: For any rebalancing proposal with DRAINING nodes,
   * no partition has multiple replicas on the same node.
   */
  t.test('proposed assignments have no duplicate nodes per partition', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 8),
        uniquePartitionIdsArb(1, 5),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 3) return true;

          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // Make first node DRAINING, rest READY
          const drainingNodeId = nodeIds[0];
          const readyNodeIds = nodeIds.slice(1);

          const nodeStates = new Map();
          nodeStates.set(drainingNodeId, NodeState.DRAINING);
          for (const nodeId of readyNodeIds) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          // Create assignments where draining node has replicas
          const assignments = {};
          for (const partitionId of partitionIds) {
            // Assign to draining node and some ready nodes
            const replicaCount = Math.min(3, nodeIds.length);
            assignments[partitionId] = nodeIds.slice(0, replicaCount);
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // If proposed assignments exist, verify no duplicate nodes per partition
          if (result.proposedAssignments) {
            const validation = validatePlacementPolicy(result.proposedAssignments);
            if (!validation.valid) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('proposed assignments have no duplicate nodes per partition');
  });

  /**
   * Property: For any configuration with mixed node states,
   * rebalancing maintains unique node assignments per partition.
   */
  t.test('mixed node states maintain placement policy', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(4, 10),
        uniquePartitionIdsArb(2, 6),
        fc.nat({max: 1000}),
        fc.array(fc.boolean(), {minLength: 4, maxLength: 10}),
        (nodeIds, partitionIds, epochNum, drainingFlags) => {
          if (nodeIds.length < 4) return true;

          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // Assign states based on flags, ensuring at least one READY node
          const nodeStates = new Map();
          let hasReady = false;

          for (let i = 0; i < nodeIds.length; i++) {
            const isDraining = drainingFlags[i % drainingFlags.length];
            if (isDraining && hasReady) {
              nodeStates.set(nodeIds[i], NodeState.DRAINING);
            } else {
              nodeStates.set(nodeIds[i], NodeState.READY);
              hasReady = true;
            }
          }

          // Create assignments with multiple replicas per partition
          const assignments = {};
          for (const partitionId of partitionIds) {
            const replicaCount = Math.min(3, nodeIds.length);
            assignments[partitionId] = nodeIds.slice(0, replicaCount);
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Verify placement policy in proposed assignments
          if (result.proposedAssignments) {
            const validation = validatePlacementPolicy(result.proposedAssignments);
            if (!validation.valid) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('mixed node states maintain placement policy');
  });

  /**
   * Property: When all nodes are READY, original assignments
   * (which should have no duplicates) are preserved.
   */
  t.test('all READY nodes preserve valid assignments', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 6),
        uniquePartitionIdsArb(1, 4),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 3) return true;

          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // All nodes are READY
          const nodeStates = new Map();
          for (const nodeId of nodeIds) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          // Create valid assignments (no duplicates)
          const assignments = {};
          for (const partitionId of partitionIds) {
            const replicaCount = Math.min(3, nodeIds.length);
            assignments[partitionId] = nodeIds.slice(0, replicaCount);
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // No moves should be needed, but if there are proposed assignments,
          // they should still respect placement policy
          if (result.proposedAssignments) {
            const validation = validatePlacementPolicy(result.proposedAssignments);
            if (!validation.valid) {
              return false;
            }
          }

          // Original assignments should also be valid
          const originalValidation = validatePlacementPolicy(assignments);
          return originalValidation.valid;
        },
      ),
      {numRuns: 10},
    );

    t.pass('all READY nodes preserve valid assignments');
  });

  /**
   * Property: Move targets never create duplicate replicas on the same node.
   */
  t.test('individual moves do not create duplicates', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 8),
        uniquePartitionIdsArb(1, 5),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 3) return true;

          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // Make first node DRAINING, rest READY
          const drainingNodeId = nodeIds[0];
          const readyNodeIds = nodeIds.slice(1);

          const nodeStates = new Map();
          nodeStates.set(drainingNodeId, NodeState.DRAINING);
          for (const nodeId of readyNodeIds) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          // Create assignments
          const assignments = {};
          for (const partitionId of partitionIds) {
            const replicaCount = Math.min(3, nodeIds.length);
            assignments[partitionId] = nodeIds.slice(0, replicaCount);
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // For each move, verify the target node is not already in the partition
          for (const move of result.moves) {
            const originalNodeList = assignments[move.partitionId];
            // The target should not already be in the original list
            // (excluding the node being replaced)
            const otherNodes = originalNodeList.filter(
              (n) => n !== move.fromNode,
            );
            if (otherNodes.includes(move.toNode)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('individual moves do not create duplicates');
  });

  /**
   * Property: When multiple nodes are DRAINING, placement policy is still respected.
   */
  t.test('multiple draining nodes maintain placement policy', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(5, 10),
        uniquePartitionIdsArb(2, 5),
        fc.nat({max: 1000}),
        fc.integer({min: 1, max: 3}),
        (nodeIds, partitionIds, epochNum, drainingCount) => {
          if (nodeIds.length < 5) return true;

          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // Make first N nodes DRAINING, rest READY
          const actualDrainingCount = Math.min(drainingCount, nodeIds.length - 2);
          const drainingNodeIds = nodeIds.slice(0, actualDrainingCount);
          const readyNodeIds = nodeIds.slice(actualDrainingCount);

          const nodeStates = new Map();
          for (const nodeId of drainingNodeIds) {
            nodeStates.set(nodeId, NodeState.DRAINING);
          }
          for (const nodeId of readyNodeIds) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          // Create assignments with replicas on draining nodes
          const assignments = {};
          for (const partitionId of partitionIds) {
            const replicaCount = Math.min(3, nodeIds.length);
            assignments[partitionId] = nodeIds.slice(0, replicaCount);
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Verify placement policy in proposed assignments
          if (result.proposedAssignments) {
            const validation = validatePlacementPolicy(result.proposedAssignments);
            if (!validation.valid) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple draining nodes maintain placement policy');
  });

  /**
   * Property: When nodes transition through various non-READY states,
   * placement policy is maintained.
   */
  t.test('non-READY states maintain placement policy', async (t) => {
    const nonReadyStates = [
      NodeState.STARTING,
      NodeState.CONNECTING,
      NodeState.DISCOVERING,
      NodeState.JOINING,
      NodeState.SYNCING,
      NodeState.STOPPED,
    ];

    fc.assert(
      fc.property(
        uniqueNodeIdsArb(4, 8),
        uniquePartitionIdsArb(1, 4),
        fc.nat({max: 1000}),
        fc.constantFrom(...nonReadyStates),
        (nodeIds, partitionIds, epochNum, nonReadyState) => {
          if (nodeIds.length < 4) return true;

          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // Make first node in non-READY state, rest READY
          const nodeStates = new Map();
          nodeStates.set(nodeIds[0], nonReadyState);
          for (let i = 1; i < nodeIds.length; i++) {
            nodeStates.set(nodeIds[i], NodeState.READY);
          }

          // Create assignments
          const assignments = {};
          for (const partitionId of partitionIds) {
            const replicaCount = Math.min(3, nodeIds.length);
            assignments[partitionId] = nodeIds.slice(0, replicaCount);
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Verify placement policy in proposed assignments
          if (result.proposedAssignments) {
            const validation = validatePlacementPolicy(result.proposedAssignments);
            if (!validation.valid) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('non-READY states maintain placement policy');
  });

  /**
   * Property: Edge case - single replica per partition maintains policy.
   */
  t.test('single replica per partition maintains placement policy', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 5),
        uniquePartitionIdsArb(1, 4),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 2) return true;

          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // Make first node DRAINING, rest READY
          const nodeStates = new Map();
          nodeStates.set(nodeIds[0], NodeState.DRAINING);
          for (let i = 1; i < nodeIds.length; i++) {
            nodeStates.set(nodeIds[i], NodeState.READY);
          }

          // Create assignments with single replica per partition
          const assignments = {};
          for (const partitionId of partitionIds) {
            assignments[partitionId] = [nodeIds[0]]; // Single replica on draining node
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Verify placement policy in proposed assignments
          if (result.proposedAssignments) {
            const validation = validatePlacementPolicy(result.proposedAssignments);
            if (!validation.valid) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('single replica per partition maintains placement policy');
  });

  /**
   * Property: Maximum replicas per partition still maintains policy.
   */
  t.test('maximum replicas per partition maintains placement policy', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(6, 10),
        uniquePartitionIdsArb(1, 3),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 6) return true;

          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // Make first two nodes DRAINING, rest READY
          const nodeStates = new Map();
          nodeStates.set(nodeIds[0], NodeState.DRAINING);
          nodeStates.set(nodeIds[1], NodeState.DRAINING);
          for (let i = 2; i < nodeIds.length; i++) {
            nodeStates.set(nodeIds[i], NodeState.READY);
          }

          // Create assignments with maximum replicas (5 replicas per partition)
          const assignments = {};
          for (const partitionId of partitionIds) {
            const replicaCount = Math.min(5, nodeIds.length);
            assignments[partitionId] = nodeIds.slice(0, replicaCount);
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Verify placement policy in proposed assignments
          if (result.proposedAssignments) {
            const validation = validatePlacementPolicy(result.proposedAssignments);
            if (!validation.valid) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('maximum replicas per partition maintains placement policy');
  });
});
