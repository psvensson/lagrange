/**
 * Unit tests for StateAwareRebalancer.
 * Tests state-aware rebalancing that respects node lifecycle states.
 * Requirements: 5.3, 5.6, 5.8
 */

import {test} from '../../src/test-helpers/tap.js';
import {StateAwareRebalancer} from '../../src/rebalancer/state-aware-rebalancer.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';

test('StateAwareRebalancer', (t) => {
  t.test('shouldConsiderNode', (t) => {
    const rebalancer = new StateAwareRebalancer({
      nodeId: 'test-node',
      maxMovesPerEpoch: 10,
    });
    t.equal(rebalancer.shouldConsiderNode('node1', NodeState.READY), true, 'READY nodes are eligible');
    t.equal(rebalancer.shouldConsiderNode('node1', NodeState.STARTING), false);
    t.equal(rebalancer.shouldConsiderNode('node1', NodeState.CONNECTING), false);
    t.equal(rebalancer.shouldConsiderNode('node1', NodeState.DISCOVERING), false);
    t.equal(rebalancer.shouldConsiderNode('node1', NodeState.JOINING), false);
    t.equal(rebalancer.shouldConsiderNode('node1', NodeState.SYNCING), false);
    t.equal(rebalancer.shouldConsiderNode('node1', NodeState.DRAINING), false);
    t.equal(rebalancer.shouldConsiderNode('node1', NodeState.STOPPED), false);
    t.end();
  });

  t.test('calculateMoves', (t) => {
    t.test('should return no moves when all replicas are on READY nodes', (t) => {
      const rebalancer = new StateAwareRebalancer({
        nodeId: 'test-node',
        maxMovesPerEpoch: 10,
      });
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
      t.same(result.moves, []);
      t.equal(result.reason, 'no_moves_needed');
      t.end();
    });

    t.test('should propose moves away from non-ready nodes', (t) => {
      const rebalancer = new StateAwareRebalancer({
        nodeId: 'test-node',
        maxMovesPerEpoch: 10,
      });
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
      t.ok(Array.isArray(result.moves));
      // At least one move should be proposed because a replica sits on a draining node.
      t.ok(result.moves.length >= 1);
      t.equal(result.reason, 'rebalancing_needed');
      t.end();
    });

    t.end();
  });

  t.end();
});
