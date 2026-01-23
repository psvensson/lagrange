/**
 * Property Test: Rebalancer Batches Moves
 * **Property 15: Rebalancer Batches Moves**
 * **Validates: Requirements 6.4**
 *
 * Feature: simplified-cluster-architecture, Property 15: Rebalancer Batches Moves
 *
 * *For any* rebalancing calculation that identifies multiple necessary moves,
 * the Rebalancer SHALL produce a single epoch proposal containing all moves
 * rather than multiple proposals.
 *
 * This property test verifies:
 * 1. When multiple moves are needed, a single proposal contains all moves
 * 2. The result is a single object with all proposed assignment changes
 * 3. No separate proposals for individual moves
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

test('Property 15: Rebalancer Batches Moves', async (t) => {
  /**
   * Property: When multiple partitions need moves, calculateMoves returns
   * a single result object containing all moves batched together.
   */
  t.test('calculateMoves returns single batched result for multiple moves', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 6),
        uniquePartitionIdsArb(2, 5),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 3 || partitionIds.length < 2) return true;

          const rebalancer = new StateAwareRebalancer({
            nodeId: 'test-node',
            maxMovesPerEpoch: 100, // High limit to not truncate
          });

          // Make first node DRAINING, rest READY
          const drainingNodeId = nodeIds[0];
          const readyNodeIds = nodeIds.slice(1);

          const nodeStates = new Map();
          nodeStates.set(drainingNodeId, NodeState.DRAINING);
          for (const nodeId of readyNodeIds) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          // Create assignments where draining node has multiple partitions
          // This ensures multiple moves are needed
          const assignments = {};
          for (const partitionId of partitionIds) {
            // Assign only to draining node so each partition needs a move
            assignments[partitionId] = [drainingNodeId];
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          // Call calculateMoves once
          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Verify we get a single result object (not multiple calls)
          if (typeof result !== 'object' || result === null) {
            return false;
          }

          // Verify the result contains all moves in a single batch
          if (!Array.isArray(result.moves)) {
            return false;
          }

          // Should have multiple moves (one per partition)
          if (result.moves.length < 2) {
            return false;
          }

          // Verify proposedAssignments is a single object containing all changes
          if (result.proposedAssignments === null) {
            return false;
          }

          // All partitions should be in the single proposed assignments object
          for (const partitionId of partitionIds) {
            if (!(partitionId in result.proposedAssignments)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('calculateMoves returns single batched result for multiple moves');
  });

  /**
   * Property: The proposedAssignments object contains all partition changes
   * in a single structure, not separate proposals per partition.
   */
  t.test('proposedAssignments contains all changes in single structure', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(4, 8),
        uniquePartitionIdsArb(3, 6),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 4 || partitionIds.length < 3) return true;

          const rebalancer = new StateAwareRebalancer({
            nodeId: 'test-node',
            maxMovesPerEpoch: 100,
          });

          // Make multiple nodes DRAINING to force multiple moves
          const drainingNodes = nodeIds.slice(0, 2);
          const readyNodes = nodeIds.slice(2);

          const nodeStates = new Map();
          for (const nodeId of drainingNodes) {
            nodeStates.set(nodeId, NodeState.DRAINING);
          }
          for (const nodeId of readyNodes) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          // Distribute partitions across draining nodes
          const assignments = {};
          for (let i = 0; i < partitionIds.length; i++) {
            const drainingNode = drainingNodes[i % drainingNodes.length];
            assignments[partitionIds[i]] = [drainingNode];
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Verify single proposedAssignments object
          if (!result.proposedAssignments) {
            return false;
          }

          // Count how many partitions are in the single proposal
          const proposedPartitions = Object.keys(result.proposedAssignments);

          // Should contain all partitions that needed moves
          if (proposedPartitions.length !== partitionIds.length) {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('proposedAssignments contains all changes in single structure');
  });

  /**
   * Property: The moves array contains all individual moves batched together,
   * and each move corresponds to an entry in proposedAssignments.
   */
  t.test('moves array and proposedAssignments are consistent', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 6),
        uniquePartitionIdsArb(2, 4),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 3 || partitionIds.length < 2) return true;

          const rebalancer = new StateAwareRebalancer({
            nodeId: 'test-node',
            maxMovesPerEpoch: 100,
          });

          const drainingNodeId = nodeIds[0];
          const readyNodeIds = nodeIds.slice(1);

          const nodeStates = new Map();
          nodeStates.set(drainingNodeId, NodeState.DRAINING);
          for (const nodeId of readyNodeIds) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          const assignments = {};
          for (const partitionId of partitionIds) {
            assignments[partitionId] = [drainingNodeId];
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          if (!result.proposedAssignments || result.moves.length === 0) {
            return false;
          }

          // Each move should have a corresponding entry in proposedAssignments
          for (const move of result.moves) {
            const partitionId = move.partitionId;
            if (!(partitionId in result.proposedAssignments)) {
              return false;
            }

            // The proposed assignment should reflect the move
            const proposedNodes = result.proposedAssignments[partitionId];
            if (!proposedNodes.includes(move.toNode)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('moves array and proposedAssignments are consistent');
  });

  /**
   * Property: A single call to calculateMoves handles all necessary moves,
   * not requiring multiple calls to process all partitions.
   */
  t.test('single calculateMoves call handles all partitions', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 5),
        uniquePartitionIdsArb(3, 6),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 3 || partitionIds.length < 3) return true;

          const rebalancer = new StateAwareRebalancer({
            nodeId: 'test-node',
            maxMovesPerEpoch: 100,
          });

          const drainingNodeId = nodeIds[0];
          const readyNodeIds = nodeIds.slice(1);

          const nodeStates = new Map();
          nodeStates.set(drainingNodeId, NodeState.DRAINING);
          for (const nodeId of readyNodeIds) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          const assignments = {};
          for (const partitionId of partitionIds) {
            assignments[partitionId] = [drainingNodeId];
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          // Single call to calculateMoves
          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Verify all partitions are handled in this single call
          const movedPartitions = new Set(result.moves.map((m) => m.partitionId));

          // All partitions should have moves
          for (const partitionId of partitionIds) {
            if (!movedPartitions.has(partitionId)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('single calculateMoves call handles all partitions');
  });

  /**
   * Property: When moves are batched, the result contains exactly one
   * reason field (not multiple reasons for each move).
   */
  t.test('batched result has single reason field', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(3, 5),
        uniquePartitionIdsArb(2, 4),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 3 || partitionIds.length < 2) return true;

          const rebalancer = new StateAwareRebalancer({
            nodeId: 'test-node',
            maxMovesPerEpoch: 100,
          });

          const drainingNodeId = nodeIds[0];
          const readyNodeIds = nodeIds.slice(1);

          const nodeStates = new Map();
          nodeStates.set(drainingNodeId, NodeState.DRAINING);
          for (const nodeId of readyNodeIds) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          const assignments = {};
          for (const partitionId of partitionIds) {
            assignments[partitionId] = [drainingNodeId];
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Result should have exactly one top-level reason
          if (typeof result.reason !== 'string') {
            return false;
          }

          // The reason should indicate rebalancing is needed
          if (result.reason !== 'rebalancing_needed') {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('batched result has single reason field');
  });

  /**
   * Property: Mixed node states (DRAINING and non-READY) produce
   * a single batched proposal for all necessary moves.
   */
  t.test('mixed node states produce single batched proposal', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(4, 7),
        uniquePartitionIdsArb(2, 5),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          if (nodeIds.length < 4 || partitionIds.length < 2) return true;

          const rebalancer = new StateAwareRebalancer({
            nodeId: 'test-node',
            maxMovesPerEpoch: 100,
          });

          // Mix of states: DRAINING, JOINING, READY
          const nodeStates = new Map();
          nodeStates.set(nodeIds[0], NodeState.DRAINING);
          nodeStates.set(nodeIds[1], NodeState.JOINING);
          for (let i = 2; i < nodeIds.length; i++) {
            nodeStates.set(nodeIds[i], NodeState.READY);
          }

          // Assign partitions to non-ready nodes
          const assignments = {};
          for (let i = 0; i < partitionIds.length; i++) {
            // Alternate between DRAINING and JOINING nodes
            const nonReadyNode = nodeIds[i % 2];
            assignments[partitionIds[i]] = [nonReadyNode];
          }

          const epoch = new AssignmentEpoch({
            epoch: epochNum,
            assignments,
            timestamp: '2024-01-01T00:00:00Z',
            proposedBy: 'test-node',
          });

          const result = rebalancer.calculateMoves(epoch, nodeStates);

          // Should produce a single batched result
          if (!result.proposedAssignments) {
            return false;
          }

          // All moves should be in a single array
          if (!Array.isArray(result.moves)) {
            return false;
          }

          // Should have moves for all partitions
          if (result.moves.length < partitionIds.length) {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('mixed node states produce single batched proposal');
  });

  /**
   * Property: When no moves are needed, the result is still a single
   * object (not multiple empty results).
   */
  t.test('no moves needed returns single result object', async (t) => {
    fc.assert(
      fc.property(
        uniqueNodeIdsArb(2, 5),
        uniquePartitionIdsArb(1, 3),
        fc.nat({max: 1000}),
        (nodeIds, partitionIds, epochNum) => {
          const rebalancer = new StateAwareRebalancer({
            nodeId: 'test-node',
            maxMovesPerEpoch: 100,
          });

          // All nodes are READY
          const nodeStates = new Map();
          for (const nodeId of nodeIds) {
            nodeStates.set(nodeId, NodeState.READY);
          }

          // Assign partitions to READY nodes only
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

          // Should return a single result object
          if (typeof result !== 'object' || result === null) {
            return false;
          }

          // Should have empty moves array
          if (!Array.isArray(result.moves) || result.moves.length !== 0) {
            return false;
          }

          // Should have reason indicating no moves needed
          if (result.reason !== 'no_moves_needed') {
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no moves needed returns single result object');
  });
});
