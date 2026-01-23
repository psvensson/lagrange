/**
 * Unit tests for StateAwareRebalancer.
 * Tests state-aware rebalancing that respects node lifecycle states.
 * Requirements: 5.3, 5.6, 5.8
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert';
import {StateAwareRebalancer} from '../../src/rebalancer/state-aware-rebalancer.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';

describe('StateAwareRebalancer', () => {
  let rebalancer;

  beforeEach(() => {
    rebalancer = new StateAwareRebalancer({
      nodeId: 'test-node',
      maxMovesPerEpoch: 10,
    });
  });

  describe('shouldConsiderNode', () => {
    it('should return true for READY nodes', () => {
      const result = rebalancer.shouldConsiderNode('node1', NodeState.READY);
      assert.strictEqual(result, true);
    });

    it('should return false for STARTING nodes', () => {
      const result = rebalancer.shouldConsiderNode('node1', NodeState.STARTING);
      assert.strictEqual(result, false);
    });

    it('should return false for CONNECTING nodes', () => {
      const result = rebalancer.shouldConsiderNode('node1', NodeState.CONNECTING);
      assert.strictEqual(result, false);
    });

    it('should return false for DISCOVERING nodes', () => {
      const result = rebalancer.shouldConsiderNode('node1', NodeState.DISCOVERING);
      assert.strictEqual(result, false);
    });

    it('should return false for JOINING nodes', () => {
      const result = rebalancer.shouldConsiderNode('node1', NodeState.JOINING);
      assert.strictEqual(result, false);
    });

    it('should return false for SYNCING nodes', () => {
      const result = rebalancer.shouldConsiderNode('node1', NodeState.SYNCING);
      assert.strictEqual(result, false);
    });

    it('should return false for DRAINING nodes', () => {
      const result = rebalancer.shouldConsiderNode('node1', NodeState.DRAINING);
      assert.strictEqual(result, false);
    });

    it('should return false for STOPPED nodes', () => {
      const result = rebalancer.shouldConsiderNode('node1', NodeState.STOPPED);
      assert.strictEqual(result, false);
    });
  });

  describe('calculateMoves', () => {
    it('should return no moves when all replicas are on READY nodes', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2', 'node3'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.READY],
        ['node3', NodeState.READY],
      ]);

      const result = rebalancer.calculateMoves(epoch, nodeStates);

      assert.strictEqual(result.moves.length, 0);
      assert.strictEqual(result.proposedAssignments, null);
      assert.strictEqual(result.reason, 'no_moves_needed');
    });

    it('should propose moves for replicas on DRAINING nodes', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2', 'node3'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.DRAINING],
        ['node3', NodeState.READY],
        ['node4', NodeState.READY],
      ]);

      const result = rebalancer.calculateMoves(epoch, nodeStates);

      assert.strictEqual(result.moves.length, 1);
      assert.strictEqual(result.moves[0].type, 'relocate');
      assert.strictEqual(result.moves[0].fromNode, 'node2');
      assert.strictEqual(result.moves[0].toNode, 'node4');
      assert.strictEqual(result.moves[0].reason, 'draining_node');
      assert.notStrictEqual(result.proposedAssignments, null);
    });

    it('should propose moves for replicas on JOINING nodes', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2', 'node3'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.JOINING],
        ['node3', NodeState.READY],
        ['node4', NodeState.READY],
      ]);

      const result = rebalancer.calculateMoves(epoch, nodeStates);

      assert.strictEqual(result.moves.length, 1);
      assert.strictEqual(result.moves[0].fromNode, 'node2');
      assert.strictEqual(result.moves[0].reason, 'node_not_ready');
    });

    it('should return no_ready_nodes when no READY nodes available', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2', 'node3'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodeStates = new Map([
        ['node1', NodeState.DRAINING],
        ['node2', NodeState.DRAINING],
        ['node3', NodeState.STOPPED],
      ]);

      const result = rebalancer.calculateMoves(epoch, nodeStates);

      assert.strictEqual(result.moves.length, 0);
      assert.strictEqual(result.reason, 'no_ready_nodes');
    });

    it('should not place multiple replicas on the same node', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2', 'node3'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      // Only node1 is ready, so we can't move replicas from node2/node3
      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.DRAINING],
        ['node3', NodeState.DRAINING],
      ]);

      const result = rebalancer.calculateMoves(epoch, nodeStates);

      // Should not propose moves since we can't place on node1 (already has replica)
      assert.strictEqual(result.moves.length, 0);
    });

    it('should handle multiple partitions', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2', 'node3'],
          'partition-2': ['node2', 'node3', 'node4'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.DRAINING],
        ['node3', NodeState.READY],
        ['node4', NodeState.READY],
        ['node5', NodeState.READY],
      ]);

      const result = rebalancer.calculateMoves(epoch, nodeStates);

      // Should have moves for both partitions
      assert.ok(result.moves.length >= 1);

      // All moves should be from node2 (draining)
      for (const move of result.moves) {
        assert.strictEqual(move.fromNode, 'node2');
      }
    });

    it('should limit moves per epoch', () => {
      const limitedRebalancer = new StateAwareRebalancer({
        nodeId: 'test-node',
        maxMovesPerEpoch: 2,
      });

      // Create many partitions with replicas on draining node
      const assignments = {};
      for (let i = 0; i < 5; i++) {
        assignments[`partition-${i}`] = ['node1', 'node2', 'node3'];
      }

      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments,
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.DRAINING],
        ['node3', NodeState.READY],
        ['node4', NodeState.READY],
      ]);

      const result = limitedRebalancer.calculateMoves(epoch, nodeStates);

      assert.strictEqual(result.moves.length, 2);
      assert.strictEqual(result.truncated, true);
      assert.strictEqual(result.totalMoves, 5);
    });
  });

  describe('onNodeStateChange', () => {
    it('should emit rebalanceNeeded when node becomes READY', () => {
      let emittedEvent = null;
      rebalancer.on('rebalanceNeeded', (event) => {
        emittedEvent = event;
      });

      rebalancer.onNodeStateChange('node1', NodeState.SYNCING, NodeState.READY);

      assert.notStrictEqual(emittedEvent, null);
      assert.strictEqual(emittedEvent.nodeId, 'node1');
      assert.strictEqual(emittedEvent.reason, 'node_became_ready');
    });

    it('should emit rebalanceNeeded when node starts DRAINING', () => {
      let emittedEvent = null;
      rebalancer.on('rebalanceNeeded', (event) => {
        emittedEvent = event;
      });

      rebalancer.onNodeStateChange('node1', NodeState.READY, NodeState.DRAINING);

      assert.notStrictEqual(emittedEvent, null);
      assert.strictEqual(emittedEvent.nodeId, 'node1');
      assert.strictEqual(emittedEvent.reason, 'node_draining');
    });

    it('should emit rebalanceNeeded when node becomes STOPPED', () => {
      let emittedEvent = null;
      rebalancer.on('rebalanceNeeded', (event) => {
        emittedEvent = event;
      });

      rebalancer.onNodeStateChange('node1', NodeState.DRAINING, NodeState.STOPPED);

      assert.notStrictEqual(emittedEvent, null);
      assert.strictEqual(emittedEvent.nodeId, 'node1');
      assert.strictEqual(emittedEvent.reason, 'node_stopped');
    });

    it('should emit nodeStateChange for all state changes', () => {
      let emittedEvent = null;
      rebalancer.on('nodeStateChange', (event) => {
        emittedEvent = event;
      });

      rebalancer.onNodeStateChange('node1', NodeState.STARTING, NodeState.CONNECTING);

      assert.notStrictEqual(emittedEvent, null);
      assert.strictEqual(emittedEvent.nodeId, 'node1');
      assert.strictEqual(emittedEvent.oldState, NodeState.STARTING);
      assert.strictEqual(emittedEvent.newState, NodeState.CONNECTING);
    });

    it('should not emit rebalanceNeeded for non-impactful transitions', () => {
      let emittedEvent = null;
      rebalancer.on('rebalanceNeeded', (event) => {
        emittedEvent = event;
      });

      // STARTING -> CONNECTING doesn't affect rebalancing
      rebalancer.onNodeStateChange('node1', NodeState.STARTING, NodeState.CONNECTING);

      assert.strictEqual(emittedEvent, null);
    });
  });

  describe('getReadyNodes', () => {
    it('should return only READY nodes', () => {
      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.DRAINING],
        ['node3', NodeState.READY],
        ['node4', NodeState.JOINING],
      ]);

      const readyNodes = rebalancer.getReadyNodes(nodeStates);

      assert.deepStrictEqual(readyNodes.sort(), ['node1', 'node3']);
    });

    it('should return empty array when no READY nodes', () => {
      const nodeStates = new Map([
        ['node1', NodeState.DRAINING],
        ['node2', NodeState.STOPPED],
      ]);

      const readyNodes = rebalancer.getReadyNodes(nodeStates);

      assert.deepStrictEqual(readyNodes, []);
    });
  });

  describe('getDrainingNodes', () => {
    it('should return only DRAINING nodes', () => {
      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.DRAINING],
        ['node3', NodeState.DRAINING],
        ['node4', NodeState.STOPPED],
      ]);

      const drainingNodes = rebalancer.getDrainingNodes(nodeStates);

      assert.deepStrictEqual(drainingNodes.sort(), ['node2', 'node3']);
    });
  });

  describe('hasDrainingNodeReplicas', () => {
    it('should return true when replicas exist on draining nodes', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2', 'node3'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.DRAINING],
        ['node3', NodeState.READY],
      ]);

      const result = rebalancer.hasDrainingNodeReplicas(epoch, nodeStates);

      assert.strictEqual(result, true);
    });

    it('should return false when no replicas on draining nodes', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node3', 'node4'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.DRAINING],
        ['node3', NodeState.READY],
        ['node4', NodeState.READY],
      ]);

      const result = rebalancer.hasDrainingNodeReplicas(epoch, nodeStates);

      assert.strictEqual(result, false);
    });

    it('should return false when no draining nodes', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2', 'node3'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodeStates = new Map([
        ['node1', NodeState.READY],
        ['node2', NodeState.READY],
        ['node3', NodeState.READY],
      ]);

      const result = rebalancer.hasDrainingNodeReplicas(epoch, nodeStates);

      assert.strictEqual(result, false);
    });
  });
});
