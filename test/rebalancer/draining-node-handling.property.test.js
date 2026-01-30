/**
 * Property Test: Rebalancer Moves From Draining Nodes
 * **Property 9: Rebalancer Moves From Draining Nodes**
 * **Validates: Requirements 5.8**
 *
 * Feature: simplified-cluster-architecture, Property 9: Rebalancer Moves From Draining Nodes
 *
 * *For any* node in DRAINING state that hosts replicas, the Rebalancer SHALL
 * propose moves to relocate those replicas to READY nodes.
 *
 * This property test verifies:
 * 1. Replicas on DRAINING nodes are identified for relocation
 * 2. Moves are proposed to relocate replicas from DRAINING to READY nodes
 * 3. hasDrainingNodeReplicas correctly detects replicas on draining nodes
 */

import {test} from '../../src/test-helpers/tap.js';
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

test('Property 9: Rebalancer Moves From Draining Nodes', async (t) => {
  /**
   * Property: For any node in DRAINING state that hosts replicas,
   * hasDrainingNodeReplicas returns true.
   */
  t.test('hasDrainingNodeReplicas detects replicas on draining nodes', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 6),
        uniquePartitionIdsArb(1, 4),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 2) return true;

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

          const hasDraining = rebalancer.hasDrainingNodeReplicas(epoch, nodeStates);

          // Should detect replicas on draining node
          return hasDraining === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('hasDrainingNodeReplicas detects replicas on draining nodes');
  });

  /**
   * Property: When no nodes are draining, hasDrainingNodeReplicas returns false.
   */
  t.test('hasDrainingNodeReplicas returns false when no draining nodes', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(1, 5),
        uniquePartitionIdsArb(1, 3),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // All nodes are READY
          const nodeStates = new Map();
          for (const nodeId of nodeIds) {
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

          const hasDraining = rebalancer.hasDrainingNodeReplicas(epoch, nodeStates);

          // Should return false when no draining nodes
          return hasDraining === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('hasDrainingNodeReplicas returns false when no draining nodes');
  });

  /**
   * Property: For any draining node with replicas and available READY nodes,
   * calculateMoves proposes moves to relocate those replicas.
   */
  t.test('calculateMoves proposes moves from draining to ready nodes', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 6),
        uniquePartitionIdsArb(1, 4),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 2) return true;

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
            // Assign only to draining node (so moves are definitely needed)
            assignments[partitionId] = [drainingNodeId];
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Should propose moves to relocate replicas from draining node
          if (result.moves.length === 0) {
            return false;
          }

          // All moves should be from the draining node
          for (const move of result.moves) {
            if (move.fromNode !== drainingNodeId) {
              return false;
            }
            // Target should be a READY node
            if (!readyNodeIds.includes(move.toNode)) {
              return false;
            }
            // Reason should indicate draining
            if (move.reason !== 'draining_node') {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('calculateMoves proposes moves from draining to ready nodes');
  });

  /**
   * Property: After applying proposed moves, no replicas remain on draining nodes
   * (when sufficient READY nodes are available).
   */
  t.test('proposed assignments relocate all replicas from draining nodes', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 6),
        uniquePartitionIdsArb(1, 3),
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
          // Use fewer replicas than ready nodes to ensure moves are possible
          const assignments = {};
          for (const partitionId of partitionIds) {
            // Assign to draining node and one ready node
            assignments[partitionId] = [drainingNodeId, readyNodeIds[0]];
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // If proposed assignments exist, verify no replicas on draining node
          if (result.proposedAssignments) {
            for (const nodeList of Object.values(result.proposedAssignments)) {
              if (nodeList.includes(drainingNodeId)) {
                return false;
              }
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('proposed assignments relocate all replicas from draining nodes');
  });

  /**
   * Property: getDrainingNodes returns exactly the nodes in DRAINING state.
   */
  t.test('getDrainingNodes returns exactly draining nodes', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(1, 6),
        fc.array(fc.boolean(), {minLength: 1, maxLength: 6}),
        (nodeIds, drainingFlags) => {
          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // Assign states based on flags
          const nodeStates = new Map();
          const expectedDraining = [];

          for (let i = 0; i < nodeIds.length; i++) {
            const isDraining = drainingFlags[i % drainingFlags.length];
            if (isDraining) {
              nodeStates.set(nodeIds[i], NodeState.DRAINING);
              expectedDraining.push(nodeIds[i]);
            } else {
              nodeStates.set(nodeIds[i], NodeState.READY);
            }
          }

          const drainingNodes = rebalancer.getDrainingNodes(nodeStates);

          // Sort for comparison
          const sortedActual = [...drainingNodes].sort();
          const sortedExpected = [...expectedDraining].sort();

          if (sortedActual.length !== sortedExpected.length) {
            return false;
          }

          for (let i = 0; i < sortedActual.length; i++) {
            if (sortedActual[i] !== sortedExpected[i]) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getDrainingNodes returns exactly draining nodes');
  });

  /**
   * Property: When draining node has replicas but no READY nodes available,
   * moves cannot be proposed (graceful handling).
   */
  t.test('handles case when no ready nodes available for relocation', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(1, 3),
        uniquePartitionIdsArb(1, 2),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          // All nodes are DRAINING (no READY nodes)
          const nodeStates = new Map();
          for (const nodeId of nodeIds) {
            nodeStates.set(nodeId, NodeState.DRAINING);
          }

          // Create assignments
          const assignments = {};
          for (const partitionId of partitionIds) {
            assignments[partitionId] = [nodeIds[0]];
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Should return no_ready_nodes reason
          return result.reason === 'no_ready_nodes' &&
                 result.moves.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('handles case when no ready nodes available for relocation');
  });

  /**
   * Property: Move targets respect placement policy (no duplicate replicas on same node).
   */
  t.test('moves respect placement policy - no duplicate replicas', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 6),
        uniquePartitionIdsArb(1, 3),
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

          // Create assignments with multiple replicas per partition
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

          // If proposed assignments exist, verify no duplicate replicas
          if (result.proposedAssignments) {
            for (const [_partitionId, nodeList] of
              Object.entries(result.proposedAssignments)) {
              const nodeSet = new Set(nodeList);
              // If there are duplicates, set size will be smaller
              if (nodeSet.size !== nodeList.length) {
                return false;
              }
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('moves respect placement policy - no duplicate replicas');
  });

  /**
   * Property: onNodeStateChange emits rebalanceNeeded when node starts draining.
   */
  t.test('onNodeStateChange triggers rebalance when node starts draining', async (t) => {
    fc.assert(
      fc.property(
        nodeIdArb,
        (nodeId) => {
          const rebalancer = new StateAwareRebalancer({nodeId: 'test-node'});

          let rebalanceEvent = null;
          rebalancer.on('rebalanceNeeded', (event) => {
            rebalanceEvent = event;
          });

          // Transition from READY to DRAINING
          rebalancer.onNodeStateChange(nodeId, NodeState.READY, NodeState.DRAINING);

          // Should emit rebalanceNeeded event
          if (!rebalanceEvent) {
            return false;
          }

          return rebalanceEvent.nodeId === nodeId &&
                 rebalanceEvent.oldState === NodeState.READY &&
                 rebalanceEvent.newState === NodeState.DRAINING &&
                 rebalanceEvent.reason === 'node_draining';
        },
      ),
      {numRuns: 10},
    );

    t.pass('onNodeStateChange triggers rebalance when node starts draining');
  });
});
