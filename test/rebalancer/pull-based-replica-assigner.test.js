/**
 * Unit tests for PullBasedReplicaAssigner.
 * Tests pull-based replica assignment from joining node's perspective.
 * Requirements: 4.2, 4.3, 4.4, 4.5
 */

import {beforeEach, test} from '../../src/test-helpers/tap.js';
import {PullBasedReplicaAssigner} from '../../src/rebalancer/pull-based-replica-assigner.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';
import {createMockReplicaHandler, createMockRpcClient} from './test-helpers.js';

let assigner;

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

beforeEach(() => {
  assigner = createAssigner({nodeId: 'joining-node', maxReplicasToPull: 10});
});

test('PullBasedReplicaAssigner', (t) => {
  t.test('constructor', (t) => {
    t.test('should create assigner with valid nodeId', (t) => {
      const a = createAssigner({nodeId: 'test-node'});
      t.equal(a.getNodeId(), 'test-node');
      t.end();
    });

    t.test('should throw error when nodeId is missing', (t) => {
      t.throws(() => new PullBasedReplicaAssigner({
        replicaHandler: createMockReplicaHandler(),
        rpcClient: createMockRpcClient(),
      }), /nodeId is required/);
      t.end();
    });

    t.test('should throw error when nodeId is empty string', (t) => {
      t.throws(() => new PullBasedReplicaAssigner({
        nodeId: '',
        replicaHandler: createMockReplicaHandler(),
        rpcClient: createMockRpcClient(),
      }), /nodeId is required/);
      t.end();
    });

    t.test('should throw error when replicaHandler is missing', (t) => {
      t.throws(() => new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        rpcClient: createMockRpcClient(),
      }), /ReplicaHandler is required/);
      t.end();
    });

    t.test('should throw error when rpcClient is missing', (t) => {
      t.throws(() => new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        replicaHandler: createMockReplicaHandler(),
      }), /RPCClient is required/);
      t.end();
    });

    t.test('should use default maxReplicasToPull when not specified', (t) => {
      const a = createAssigner({nodeId: 'test-node'});
      t.equal(a.getMaxReplicasToPull(), 10);
      t.end();
    });

    t.test('should use custom maxReplicasToPull when specified', (t) => {
      const a = createAssigner({nodeId: 'test-node', maxReplicasToPull: 5});
      t.equal(a.getMaxReplicasToPull(), 5);
      t.end();
    });

    t.end();
  });

  t.test('calculateReplicasToPull', (t) => {
    t.test('should return empty array when no assignments exist', (t) => {
      const result = assigner.calculateReplicasToPull(
        {}, 'joining-node', ['node1', 'node2', 'joining-node']);
      t.same(result, []);
      t.end();
    });

    t.test('should return empty array when assignments is null', (t) => {
      const result = assigner.calculateReplicasToPull(
        null, 'joining-node', ['node1', 'node2']);
      t.same(result, []);
      t.end();
    });

    t.test('should return empty array when thisNodeId is invalid', (t) => {
      const result = assigner.calculateReplicasToPull(
        {'partition-1': ['node1', 'node2']}, '', ['node1', 'node2']);
      t.same(result, []);
      t.end();
    });

    t.test('should return empty array when nodes is invalid', (t) => {
      const result = assigner.calculateReplicasToPull(
        {'partition-1': ['node1', 'node2']}, 'joining-node', null);
      t.same(result, []);
      t.end();
    });

    t.test('should return empty array when this node is not in cluster nodes list', (t) => {
      const result = assigner.calculateReplicasToPull(
        {'partition-1': ['node1', 'node2']}, 'joining-node', ['node1', 'node2']);
      t.same(result, []);
      t.end();
    });

    t.test('should pull replicas from nodes that have more than average', (t) => {
      const assignments = {
        'partition-1': ['node1', 'node2', 'node3'],
        'partition-2': ['node1', 'node2', 'node3'],
        'partition-3': ['node1', 'node2', 'node3'],
        'partition-4': ['node1', 'node2', 'joining-node'],
      };
      const nodes = ['node1', 'node2', 'node3', 'joining-node'];
      const result = assigner.calculateReplicasToPull(assignments, 'joining-node', nodes);

      // Ensure it pulls some replicas to balance distribution
      t.ok(Array.isArray(result));
      t.ok(result.length > 0);
      t.ok(result.length <= 10);
      t.end();
    });

    t.test('should respect maxReplicasToPull', (t) => {
      const a = createAssigner({
        nodeId: 'joining-node',
        maxReplicasToPull: 2,
      });

      const assignments = {};
      for (let i = 1; i <= 20; i++) {
        assignments[`partition-${i}`] = ['node1', 'node2', 'node3'];
      }
      const nodes = ['node1', 'node2', 'node3', 'joining-node'];
      const result = a.calculateReplicasToPull(assignments, 'joining-node', nodes);

      t.ok(result.length <= 2);
      t.end();
    });

    t.test('should return deterministic selection for a fixed assignment set', (t) => {
      const assignments = {
        'partition-1': ['node1', 'node2'],
        'partition-2': ['node1', 'node2'],
        'partition-3': ['node1', 'node2'],
      };
      const nodes = ['node1', 'node2', 'joining-node'];
      const r1 = assigner.calculateReplicasToPull(assignments, 'joining-node', nodes);
      const r2 = assigner.calculateReplicasToPull(assignments, 'joining-node', nodes);
      t.same(r1, r2);
      t.end();
    });

    t.end();
  });

  t.test('AssignmentEpoch integration', (t) => {
    t.test('should handle AssignmentEpoch as input', (t) => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2', 'node3'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const nodes = ['node1', 'node2', 'node3', 'joining-node'];
      const result = assigner.calculateReplicasToPull(epoch.assignments, 'joining-node', nodes);
      t.ok(Array.isArray(result));
      t.end();
    });

    t.end();
  });

  t.end();
});
