/**
 * Property Test: Join Assignment Relieves Overloaded Nodes
 * **Property 14: Join Assignment Relieves Overloaded Nodes**
 * **Validates: Requirements 4.2, 4.3, 4.4**
 *
 * Feature: simplified-cluster-architecture, Property 14: Join Assignment Relieves
 * Overloaded Nodes
 *
 * *For any* joining node analyzing current assignments where some nodes are overloaded
 * (above average replica count), the proposed assignments SHALL reduce the replica count
 * on at least one overloaded node while respecting table replication policies.
 *
 * This property test verifies:
 * 1. When overloaded nodes exist, proposed assignments reduce replica count on at least
 *    one overloaded node
 * 2. The joining node receives replicas
 * 3. No partition has duplicate replicas on the same node
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PullBasedReplicaAssigner} from
  '../../src/rebalancer/pull-based-replica-assigner.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';
import {createMockReplicaHandler, createMockRpcClient} from './test-helpers.js';

/**
 * Create a PullBasedReplicaAssigner with all required dependencies.
 * @param {Object} options - Options for the assigner.
 * @return {PullBasedReplicaAssigner} Assigner instance.
 */
function createAssigner(options = {}) {
  return new PullBasedReplicaAssigner({
    nodeId: options.nodeId || 'joining-node',
    maxReplicasToPull: options.maxReplicasToPull || 10,
    replicaHandler: options.replicaHandler || createMockReplicaHandler(),
    rpcClient: options.rpcClient || createMockRpcClient(),
  });
}

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
 * @param {number} minLength - Minimum number of nodes.
 * @param {number} maxLength - Maximum number of nodes.
 * @return {fc.Arbitrary<string[]>} Arbitrary for unique node IDs.
 */
const uniqueNodeIdsArb = (minLength, maxLength) =>
  fc.array(nodeIdArb, {minLength, maxLength})
    .map((ids) => [...new Set(ids)])
    .filter((ids) => ids.length >= minLength);

/**
 * Generator for a set of unique partition IDs.
 * @param {number} minLength - Minimum number of partitions.
 * @param {number} maxLength - Maximum number of partitions.
 * @return {fc.Arbitrary<string[]>} Arbitrary for unique partition IDs.
 */
const uniquePartitionIdsArb = (minLength, maxLength) =>
  fc.array(partitionIdArb, {minLength, maxLength})
    .map((ids) => [...new Set(ids)])
    .filter((ids) => ids.length >= minLength);

/**
 * Calculate replica count per node from assignments.
 * @param {Object} assignments - Partition to node list mapping.
 * @param {string[]} allNodes - All nodes to consider.
 * @return {Object} Map of nodeId to replica count.
 */
function calculateNodeReplicaCounts(assignments, allNodes) {
  const counts = {};
  for (const nodeId of allNodes) {
    counts[nodeId] = 0;
  }
  for (const nodeList of Object.values(assignments)) {
    for (const nodeId of nodeList) {
      if (counts[nodeId] !== undefined) {
        counts[nodeId]++;
      }
    }
  }
  return counts;
}

/**
 * Calculate average replica count per node.
 * @param {Object} assignments - Partition to node list mapping.
 * @param {number} nodeCount - Number of nodes.
 * @return {number} Average replicas per node.
 */
function calculateAverageReplicas(assignments, nodeCount) {
  const totalReplicas = Object.values(assignments)
    .reduce((sum, nodeList) => sum + nodeList.length, 0);
  return totalReplicas / nodeCount;
}

/**
 * Identify overloaded nodes (above average replica count).
 * @param {Object} assignments - Partition to node list mapping.
 * @param {string[]} allNodes - All nodes to consider.
 * @param {string} excludeNode - Node to exclude from overloaded list.
 * @return {string[]} Array of overloaded node IDs.
 */
function identifyOverloadedNodes(assignments, allNodes, excludeNode) {
  const counts = calculateNodeReplicaCounts(assignments, allNodes);
  const avgReplicas = calculateAverageReplicas(assignments, allNodes.length);

  return Object.entries(counts)
    .filter(([nodeId, count]) => count > avgReplicas && nodeId !== excludeNode)
    .map(([nodeId]) => nodeId);
}

/**
 * Check if a node list has duplicates.
 * @param {string[]} nodeList - Array of node IDs.
 * @return {boolean} True if there are duplicates.
 */
function hasDuplicates(nodeList) {
  const nodeSet = new Set(nodeList);
  return nodeSet.size !== nodeList.length;
}

/**
 * Verify all partitions have unique node assignments.
 * @param {Object} assignments - Partition to node list mapping.
 * @return {{valid: boolean, violations: string[]}} Validation result.
 */
function validateNoDuplicateReplicas(assignments) {
  const violations = [];
  for (const [partitionId, nodeList] of Object.entries(assignments)) {
    if (hasDuplicates(nodeList)) {
      violations.push(`Partition '${partitionId}' has duplicate nodes`);
    }
  }
  return {
    valid: violations.length === 0,
    violations,
  };
}

test('Property 14: Join Assignment Relieves Overloaded Nodes', async (t) => {
  /**
   * Property: When overloaded nodes exist, proposed assignments reduce replica count
   * on at least one overloaded node.
   */
  t.test('proposed assignments relieve at least one overloaded node', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 6),
        uniquePartitionIdsArb(3, 8),
        fc.nat({max: 1000}),
        (existingNodeIds, partitionIds, epochNum) => {
          if (existingNodeIds.length < 2 || partitionIds.length < 3) return true;

          const joiningNodeId = 'joining-node-test';

          const assignments = {};
          for (const partitionId of partitionIds) {
            assignments[partitionId] = [existingNodeIds[0]];
          }

          const allNodes = [...existingNodeIds, joiningNodeId];
          const overloadedBefore = identifyOverloadedNodes(
            assignments, allNodes, joiningNodeId,
          );

          if (overloadedBefore.length === 0) return true;

          const assigner = createAssigner({
            nodeId: joiningNodeId,
            maxReplicasToPull: 10,
          });

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: existingNodeIds[0],
          });

          const result = assigner.analyzeAndPropose(
            epoch,
            joiningNodeId,
            existingNodeIds,
            new Map(),
          );

          if (!result.success || !result.proposedAssignments) {
            return true;
          }

          const countsAfter = calculateNodeReplicaCounts(
            result.proposedAssignments, allNodes,
          );

          const countsBefore = calculateNodeReplicaCounts(assignments, allNodes);
          let relievedAtLeastOne = false;

          for (const overloadedNode of overloadedBefore) {
            if (countsAfter[overloadedNode] < countsBefore[overloadedNode]) {
              relievedAtLeastOne = true;
              break;
            }
          }

          return relievedAtLeastOne;
        },
      ),
      {numRuns: 10},
    );

    t.pass('proposed assignments relieve at least one overloaded node');
  });

  t.test('joining node receives replicas in proposed assignments', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 5),
        uniquePartitionIdsArb(3, 6),
        fc.nat({max: 1000}),
        (existingNodeIds, partitionIds, epochNum) => {
          if (existingNodeIds.length < 2 || partitionIds.length < 3) return true;

          const joiningNodeId = 'joining-node-test';

          const assignments = {};
          for (let i = 0; i < partitionIds.length; i++) {
            const nodeIdx = i % existingNodeIds.length;
            assignments[partitionIds[i]] = [existingNodeIds[nodeIdx]];
          }

          const assigner = createAssigner({
            nodeId: joiningNodeId,
            maxReplicasToPull: 10,
          });

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: existingNodeIds[0],
          });

          const result = assigner.analyzeAndPropose(
            epoch,
            joiningNodeId,
            existingNodeIds,
            new Map(),
          );

          if (result.success && result.proposedAssignments) {
            const joiningNodeHasReplicas = Object.values(result.proposedAssignments)
              .some((nodeList) => nodeList.includes(joiningNodeId));
            return joiningNodeHasReplicas;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('joining node receives replicas in proposed assignments');
  });

  t.test('proposed assignments have no duplicate replicas per partition', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 6),
        uniquePartitionIdsArb(2, 8),
        fc.nat({max: 1000}),
        (existingNodeIds, partitionIds, epochNum) => {
          if (existingNodeIds.length < 2 || partitionIds.length < 2) return true;

          const joiningNodeId = 'joining-node-test';

          const assignments = {};
          for (const partitionId of partitionIds) {
            const replicaCount = Math.min(3, existingNodeIds.length);
            assignments[partitionId] = existingNodeIds.slice(0, replicaCount);
          }

          const assigner = createAssigner({
            nodeId: joiningNodeId,
            maxReplicasToPull: 10,
          });

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: existingNodeIds[0],
          });

          const result = assigner.analyzeAndPropose(
            epoch,
            joiningNodeId,
            existingNodeIds,
            new Map(),
          );

          if (result.success && result.proposedAssignments) {
            const validation = validateNoDuplicateReplicas(result.proposedAssignments);
            return validation.valid;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('proposed assignments have no duplicate replicas per partition');
  });

  t.test('proposed assignments respect table replication policies', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 6),
        fc.integer({min: 2, max: 5}),
        fc.nat({max: 1000}),
        fc.integer({min: 2, max: 3}),
        (existingNodeIds, partitionCount, epochNum, replicationFactor) => {
          if (existingNodeIds.length < 3) return true;

          const joiningNodeId = 'joining-node-test';
          const actualReplicationFactor = Math.min(
            replicationFactor, existingNodeIds.length,
          );

          const assignments = {};
          for (let i = 0; i < partitionCount; i++) {
            const partitionId = `tables-p${i}`;
            assignments[partitionId] = existingNodeIds.slice(0, actualReplicationFactor);
          }

          const tablePolicies = new Map([
            ['tables', {replicationFactor: actualReplicationFactor}],
          ]);

          const assigner = createAssigner({
            nodeId: joiningNodeId,
            maxReplicasToPull: 10,
          });

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: existingNodeIds[0],
          });

          const result = assigner.analyzeAndPropose(
            epoch,
            joiningNodeId,
            existingNodeIds,
            tablePolicies,
          );

          if (result.success && result.proposedAssignments) {
            for (const [partitionId, nodeList] of
              Object.entries(result.proposedAssignments)) {
              if (partitionId.startsWith('tables-')) {
                if (nodeList.length !== actualReplicationFactor) {
                  return false;
                }
              }
            }
          }

          if (!result.success && result.violations) {
            return true;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('proposed assignments respect table replication policies');
  });

  t.test('varying imbalance levels still relieve overloaded nodes', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 5),
        fc.integer({min: 4, max: 10}),
        fc.nat({max: 1000}),
        fc.integer({min: 1, max: 3}),
        (existingNodeIds, partitionCount, epochNum, imbalanceFactor) => {
          if (existingNodeIds.length < 2) return true;

          const joiningNodeId = 'joining-node-test';

          const assignments = {};
          for (let i = 0; i < partitionCount; i++) {
            const partitionId = `partition-${i}`;
            if (i < partitionCount * imbalanceFactor / (imbalanceFactor + 1)) {
              assignments[partitionId] = [existingNodeIds[0]];
            } else if (existingNodeIds.length > 1) {
              assignments[partitionId] = [existingNodeIds[1]];
            } else {
              assignments[partitionId] = [existingNodeIds[0]];
            }
          }

          const allNodes = [...existingNodeIds, joiningNodeId];
          const overloadedBefore = identifyOverloadedNodes(
            assignments, allNodes, joiningNodeId,
          );

          if (overloadedBefore.length === 0) return true;

          const assigner = createAssigner({
            nodeId: joiningNodeId,
            maxReplicasToPull: 10,
          });

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: existingNodeIds[0],
          });

          const result = assigner.analyzeAndPropose(
            epoch,
            joiningNodeId,
            existingNodeIds,
            new Map(),
          );

          if (!result.success || !result.proposedAssignments) {
            return true;
          }

          const countsBefore = calculateNodeReplicaCounts(assignments, allNodes);
          const countsAfter = calculateNodeReplicaCounts(
            result.proposedAssignments, allNodes,
          );

          for (const overloadedNode of overloadedBefore) {
            if (countsAfter[overloadedNode] < countsBefore[overloadedNode]) {
              return true;
            }
          }

          return false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('varying imbalance levels still relieve overloaded nodes');
  });

  t.test('single partition cluster respects placement policy', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 4),
        fc.nat({max: 1000}),
        (existingNodeIds, epochNum) => {
          if (existingNodeIds.length < 2) return true;

          const joiningNodeId = 'joining-node-test';

          const assignments = {
            'partition-0': [existingNodeIds[0]],
          };

          const assigner = createAssigner({
            nodeId: joiningNodeId,
            maxReplicasToPull: 10,
          });

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: existingNodeIds[0],
          });

          const result = assigner.analyzeAndPropose(
            epoch,
            joiningNodeId,
            existingNodeIds,
            new Map(),
          );

          if (result.success && result.proposedAssignments) {
            const validation = validateNoDuplicateReplicas(result.proposedAssignments);
            return validation.valid;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('single partition cluster respects placement policy');
  });

  t.test('multiple replicas per partition handled correctly', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 6),
        uniquePartitionIdsArb(2, 5),
        fc.nat({max: 1000}),
        (existingNodeIds, partitionIds, epochNum) => {
          if (existingNodeIds.length < 3 || partitionIds.length < 2) return true;

          const joiningNodeId = 'joining-node-test';

          const assignments = {};
          for (const partitionId of partitionIds) {
            const replicaCount = Math.min(3, existingNodeIds.length);
            assignments[partitionId] = existingNodeIds.slice(0, replicaCount);
          }

          const assigner = createAssigner({
            nodeId: joiningNodeId,
            maxReplicasToPull: 10,
          });

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: existingNodeIds[0],
          });

          const result = assigner.analyzeAndPropose(
            epoch,
            joiningNodeId,
            existingNodeIds,
            new Map(),
          );

          if (result.success && result.proposedAssignments) {
            const validation = validateNoDuplicateReplicas(result.proposedAssignments);
            if (!validation.valid) {
              return false;
            }

            const joiningNodeHasReplicas = Object.values(result.proposedAssignments)
              .some((nodeList) => nodeList.includes(joiningNodeId));

            if (result.replicasToPull && result.replicasToPull.length > 0) {
              return joiningNodeHasReplicas;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple replicas per partition handled correctly');
  });

  t.test('empty table policies allow valid rebalancing', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 5),
        uniquePartitionIdsArb(3, 6),
        fc.nat({max: 1000}),
        (existingNodeIds, partitionIds, epochNum) => {
          if (existingNodeIds.length < 2 || partitionIds.length < 3) return true;

          const joiningNodeId = 'joining-node-test';

          const assignments = {};
          for (const partitionId of partitionIds) {
            assignments[partitionId] = [existingNodeIds[0]];
          }

          const assigner = createAssigner({
            nodeId: joiningNodeId,
            maxReplicasToPull: 10,
          });

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: existingNodeIds[0],
          });

          const result = assigner.analyzeAndPropose(
            epoch,
            joiningNodeId,
            existingNodeIds,
            new Map(),
          );

          if (result.success && result.proposedAssignments) {
            const validation = validateNoDuplicateReplicas(result.proposedAssignments);
            return validation.valid;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('empty table policies allow valid rebalancing');
  });
});
