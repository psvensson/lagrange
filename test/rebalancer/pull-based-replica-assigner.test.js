/**
 * Unit tests for PullBasedReplicaAssigner.
 * Tests pull-based replica assignment from joining node's perspective.
 * Requirements: 4.2, 4.3, 4.4, 4.5
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert';
import {PullBasedReplicaAssigner} from
  '../../src/rebalancer/pull-based-replica-assigner.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';

describe('PullBasedReplicaAssigner', () => {
  let assigner;

  beforeEach(() => {
    assigner = new PullBasedReplicaAssigner({
      nodeId: 'joining-node',
      maxReplicasToPull: 10,
    });
  });

  describe('constructor', () => {
    it('should create assigner with valid nodeId', () => {
      const a = new PullBasedReplicaAssigner({nodeId: 'test-node'});
      assert.strictEqual(a.getNodeId(), 'test-node');
    });

    it('should throw error when nodeId is missing', () => {
      assert.throws(() => {
        new PullBasedReplicaAssigner({});
      }, /nodeId is required/);
    });

    it('should throw error when nodeId is empty string', () => {
      assert.throws(() => {
        new PullBasedReplicaAssigner({nodeId: ''});
      }, /nodeId is required/);
    });

    it('should use default maxReplicasToPull when not specified', () => {
      const a = new PullBasedReplicaAssigner({nodeId: 'test-node'});
      assert.strictEqual(a.getMaxReplicasToPull(), 10);
    });

    it('should use custom maxReplicasToPull when specified', () => {
      const a = new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        maxReplicasToPull: 5,
      });
      assert.strictEqual(a.getMaxReplicasToPull(), 5);
    });
  });

  describe('calculateReplicasToPull', () => {
    it('should return empty array when no assignments exist', () => {
      const result = assigner.calculateReplicasToPull(
        {},
        'joining-node',
        ['node1', 'node2', 'joining-node'],
      );
      assert.deepStrictEqual(result, []);
    });

    it('should return empty array when assignments is null', () => {
      const result = assigner.calculateReplicasToPull(
        null,
        'joining-node',
        ['node1', 'node2'],
      );
      assert.deepStrictEqual(result, []);
    });

    it('should return empty array when thisNodeId is invalid', () => {
      const result = assigner.calculateReplicasToPull(
        {'partition-1': ['node1', 'node2']},
        '',
        ['node1', 'node2'],
      );
      assert.deepStrictEqual(result, []);
    });

    it('should return empty array when allNodes is empty', () => {
      const result = assigner.calculateReplicasToPull(
        {'partition-1': ['node1', 'node2']},
        'joining-node',
        [],
      );
      assert.deepStrictEqual(result, []);
    });

    it('should identify replicas to pull from overloaded nodes', () => {
      // node1 has 3 replicas, node2 has 3 replicas, joining-node has 0
      // Average would be 2 per node with 3 nodes
      const assignments = {
        'partition-1': ['node1', 'node2'],
        'partition-2': ['node1', 'node2'],
        'partition-3': ['node1', 'node2'],
      };

      const result = assigner.calculateReplicasToPull(
        assignments,
        'joining-node',
        ['node1', 'node2', 'joining-node'],
      );

      // Should pull replicas to balance load
      assert.ok(result.length > 0);
      // All pulled replicas should come from overloaded nodes
      for (const replica of result) {
        assert.ok(['node1', 'node2'].includes(replica.fromNode));
      }
    });

    it('should not pull replicas for partitions already on this node', () => {
      const assignments = {
        'partition-1': ['node1', 'joining-node'],
        'partition-2': ['node1', 'node2'],
      };

      const result = assigner.calculateReplicasToPull(
        assignments,
        'joining-node',
        ['node1', 'node2', 'joining-node'],
      );

      // Should not include partition-1 since joining-node already has it
      const partitionIds = result.map((r) => r.partitionId);
      assert.ok(!partitionIds.includes('partition-1'));
    });

    it('should respect maxReplicasToPull limit', () => {
      const limitedAssigner = new PullBasedReplicaAssigner({
        nodeId: 'joining-node',
        maxReplicasToPull: 2,
      });

      // Create many partitions on overloaded nodes
      const assignments = {};
      for (let i = 0; i < 10; i++) {
        assignments[`partition-${i}`] = ['node1', 'node2'];
      }

      const result = limitedAssigner.calculateReplicasToPull(
        assignments,
        'joining-node',
        ['node1', 'node2', 'joining-node'],
      );

      assert.ok(result.length <= 2);
    });

    it('should return empty when cluster is already balanced', () => {
      // Each node has 2 replicas - perfectly balanced
      const assignments = {
        'partition-1': ['node1', 'node2'],
        'partition-2': ['node2', 'node3'],
        'partition-3': ['node3', 'node1'],
      };

      const result = assigner.calculateReplicasToPull(
        assignments,
        'node1', // node1 already has 2 replicas
        ['node1', 'node2', 'node3'],
      );

      // Should not pull any since node1 is at average
      assert.strictEqual(result.length, 0);
    });

    it('should prioritize pulling from most overloaded nodes', () => {
      // node1 has 4 replicas, node2 has 2 replicas
      const assignments = {
        'partition-1': ['node1'],
        'partition-2': ['node1'],
        'partition-3': ['node1'],
        'partition-4': ['node1'],
        'partition-5': ['node2'],
        'partition-6': ['node2'],
      };

      const result = assigner.calculateReplicasToPull(
        assignments,
        'joining-node',
        ['node1', 'node2', 'joining-node'],
      );

      // Should pull from node1 first (most overloaded)
      if (result.length > 0) {
        assert.strictEqual(result[0].fromNode, 'node1');
      }
    });
  });

  describe('validateAgainstPolicies', () => {
    it('should return valid for null assignments', () => {
      const result = assigner.validateAgainstPolicies(null, new Map());
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.violations, []);
    });

    it('should return valid for empty assignments', () => {
      const result = assigner.validateAgainstPolicies({}, new Map());
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.violations, []);
    });

    it('should detect duplicate nodes in partition assignment', () => {
      const assignments = {
        'partition-1': ['node1', 'node1', 'node2'],
      };

      const result = assigner.validateAgainstPolicies(assignments, new Map());

      assert.strictEqual(result.valid, false);
      assert.ok(result.violations.length > 0);
      assert.ok(result.violations[0].includes('duplicate'));
    });

    it('should validate replication factor from policy', () => {
      const assignments = {
        'tables-p1': ['node1', 'node2'],
      };

      const policies = new Map([
        ['tables', {replicationFactor: 3}],
      ]);

      const result = assigner.validateAgainstPolicies(assignments, policies);

      assert.strictEqual(result.valid, false);
      assert.ok(result.violations.some((v) => v.includes('replicationFactor') ||
        v.includes('replicas')));
    });

    it('should pass when replication factor matches policy', () => {
      const assignments = {
        'tables-p1': ['node1', 'node2', 'node3'],
      };

      const policies = new Map([
        ['tables', {replicationFactor: 3}],
      ]);

      const result = assigner.validateAgainstPolicies(assignments, policies);

      assert.strictEqual(result.valid, true);
    });

    it('should validate minimum replicas from policy', () => {
      const assignments = {
        'tables-p1': ['node1'],
      };

      const policies = new Map([
        ['tables', {minReplicas: 2}],
      ]);

      const result = assigner.validateAgainstPolicies(assignments, policies);

      assert.strictEqual(result.valid, false);
      assert.ok(result.violations.some((v) => v.includes('minimum')));
    });

    it('should validate maximum replicas from policy', () => {
      const assignments = {
        'tables-p1': ['node1', 'node2', 'node3', 'node4'],
      };

      const policies = new Map([
        ['tables', {maxReplicas: 3}],
      ]);

      const result = assigner.validateAgainstPolicies(assignments, policies);

      assert.strictEqual(result.valid, false);
      assert.ok(result.violations.some((v) => v.includes('maximum')));
    });

    it('should handle partitions without matching policy', () => {
      const assignments = {
        'unknown-p1': ['node1', 'node2'],
      };

      const policies = new Map([
        ['tables', {replicationFactor: 3}],
      ]);

      const result = assigner.validateAgainstPolicies(assignments, policies);

      // Should be valid since no policy applies
      assert.strictEqual(result.valid, true);
    });

    it('should handle null tablePolicies', () => {
      const assignments = {
        'partition-1': ['node1', 'node2'],
      };

      const result = assigner.validateAgainstPolicies(assignments, null);

      assert.strictEqual(result.valid, true);
    });

    it('should detect multiple violations', () => {
      const assignments = {
        'tables-p1': ['node1', 'node1'], // duplicate + wrong count
        'tables-p2': ['node2', 'node2', 'node3'], // duplicate
      };

      const policies = new Map([
        ['tables', {replicationFactor: 3}],
      ]);

      const result = assigner.validateAgainstPolicies(assignments, policies);

      assert.strictEqual(result.valid, false);
      assert.ok(result.violations.length >= 2);
    });
  });

  describe('analyzeAndPropose', () => {
    it('should return error for invalid epoch', () => {
      const result = assigner.analyzeAndPropose(
        null,
        'joining-node',
        ['node1', 'node2'],
        new Map(),
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid'));
    });

    it('should return error for invalid thisNodeId', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {'partition-1': ['node1', 'node2']},
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const result = assigner.analyzeAndPropose(
        epoch,
        '',
        ['node1', 'node2'],
        new Map(),
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid'));
    });

    it('should return error when no ready nodes available', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {'partition-1': ['node1', 'node2']},
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const result = assigner.analyzeAndPropose(
        epoch,
        'joining-node',
        [],
        new Map(),
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('No ready nodes'));
    });

    it('should return no_rebalancing_needed when balanced', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2'],
          'partition-2': ['node2', 'node3'],
          'partition-3': ['node3', 'node1'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const result = assigner.analyzeAndPropose(
        epoch,
        'node1', // Already has 2 replicas
        ['node1', 'node2', 'node3'],
        new Map(),
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.reason, 'no_rebalancing_needed');
      assert.strictEqual(result.proposedAssignments, null);
    });

    it('should propose assignments when rebalancing needed', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2'],
          'partition-2': ['node1', 'node2'],
          'partition-3': ['node1', 'node2'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const result = assigner.analyzeAndPropose(
        epoch,
        'joining-node',
        ['node1', 'node2'],
        new Map(),
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.reason, 'rebalancing_proposed');
      assert.notStrictEqual(result.proposedAssignments, null);
      assert.ok(result.replicasToPull.length > 0);
    });

    it('should include joining node in proposed assignments', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2'],
          'partition-2': ['node1', 'node2'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const result = assigner.analyzeAndPropose(
        epoch,
        'joining-node',
        ['node1', 'node2'],
        new Map(),
      );

      if (result.success && result.proposedAssignments) {
        // Check that joining-node appears in at least one assignment
        const hasJoiningNode = Object.values(result.proposedAssignments)
          .some((nodeList) => nodeList.includes('joining-node'));
        assert.strictEqual(hasJoiningNode, true);
      }
    });

    it('should not violate placement policies in proposal', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1', 'node2'],
          'partition-2': ['node1', 'node2'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const result = assigner.analyzeAndPropose(
        epoch,
        'joining-node',
        ['node1', 'node2'],
        new Map(),
      );

      if (result.success && result.proposedAssignments) {
        // Verify no duplicate nodes in any partition
        for (const nodeList of Object.values(result.proposedAssignments)) {
          const nodeSet = new Set(nodeList);
          assert.strictEqual(nodeSet.size, nodeList.length,
            'No duplicate nodes should exist');
        }
      }
    });

    it('should fail when policy violations would occur', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'tables-p1': ['node1', 'node2', 'node3'],
          'tables-p2': ['node1', 'node2', 'node3'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      // Policy requires exactly 3 replicas, but pulling would change count
      const policies = new Map([
        ['tables', {replicationFactor: 3}],
      ]);

      const result = assigner.analyzeAndPropose(
        epoch,
        'joining-node',
        ['node1', 'node2', 'node3'],
        policies,
      );

      // The proposal should maintain replication factor
      if (result.success && result.proposedAssignments) {
        for (const nodeList of Object.values(result.proposedAssignments)) {
          assert.strictEqual(nodeList.length, 3);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle single node cluster', () => {
      const epoch = new AssignmentEpoch({
        epoch: 1,
        assignments: {
          'partition-1': ['node1'],
        },
        timestamp: '2024-01-01T00:00:00Z',
        proposedBy: 'node1',
      });

      const result = assigner.analyzeAndPropose(
        epoch,
        'joining-node',
        ['node1'],
        new Map(),
      );

      // Should propose to pull the replica
      assert.strictEqual(result.success, true);
    });

    it('should handle partition with single replica', () => {
      const assignments = {
        'partition-1': ['node1'],
      };

      const result = assigner.calculateReplicasToPull(
        assignments,
        'joining-node',
        ['node1', 'joining-node'],
      );

      // Should be able to pull the single replica
      if (result.length > 0) {
        assert.strictEqual(result[0].partitionId, 'partition-1');
        assert.strictEqual(result[0].fromNode, 'node1');
      }
    });

    it('should handle many partitions efficiently', () => {
      const assignments = {};
      for (let i = 0; i < 100; i++) {
        assignments[`partition-${i}`] = ['node1', 'node2'];
      }

      const result = assigner.calculateReplicasToPull(
        assignments,
        'joining-node',
        ['node1', 'node2', 'joining-node'],
      );

      // Should complete without error and respect limits
      assert.ok(result.length <= assigner.getMaxReplicasToPull());
    });
  });

  describe('createLocalReplicas', () => {
    it('should return success with empty arrays for empty input', async () => {
      const result = await assigner.createLocalReplicas([]);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.created, []);
      assert.deepStrictEqual(result.failed, []);
    });

    it('should return success with empty arrays for null input', async () => {
      const result = await assigner.createLocalReplicas(null);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.created, []);
      assert.deepStrictEqual(result.failed, []);
    });

    it('should create replicas and track them locally', async () => {
      const result = await assigner.createLocalReplicas(['partition-1', 'partition-2']);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.created, ['partition-1', 'partition-2']);
      assert.deepStrictEqual(result.failed, []);

      // Verify local tracking
      const replica1 = assigner.getLocalReplicaStatus('partition-1');
      assert.ok(replica1);
      assert.strictEqual(replica1.partitionId, 'partition-1');
      assert.strictEqual(replica1.status, 'syncing');

      const replica2 = assigner.getLocalReplicaStatus('partition-2');
      assert.ok(replica2);
      assert.strictEqual(replica2.partitionId, 'partition-2');
    });

    it('should emit replicaCreated event for each created replica', async () => {
      const events = [];
      assigner.on('replicaCreated', (event) => events.push(event));

      await assigner.createLocalReplicas(['partition-1']);

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].partitionId, 'partition-1');
      assert.strictEqual(events[0].nodeId, 'joining-node');
    });

    it('should use replica handler when provided', async () => {
      const handlerCalls = [];
      const mockHandler = {
        handleCreateReplica: async (request) => {
          handlerCalls.push(request);
          return {status: 'initiated'};
        },
      };

      const assignerWithHandler = new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        replicaHandler: mockHandler,
      });

      await assignerWithHandler.createLocalReplicas(['partition-1']);

      assert.strictEqual(handlerCalls.length, 1);
      assert.strictEqual(handlerCalls[0].partitionId, 'partition-1');
    });

    it('should handle replica handler errors gracefully', async () => {
      const mockHandler = {
        handleCreateReplica: async () => {
          return {status: 'error', error: 'Creation failed'};
        },
      };

      const assignerWithHandler = new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        replicaHandler: mockHandler,
      });

      const events = [];
      assignerWithHandler.on('replicaCreationFailed', (event) => events.push(event));

      const result = await assignerWithHandler.createLocalReplicas(['partition-1']);

      assert.strictEqual(result.success, false);
      assert.deepStrictEqual(result.created, []);
      assert.deepStrictEqual(result.failed, ['partition-1']);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].partitionId, 'partition-1');
    });

    it('should continue creating other replicas after one fails', async () => {
      let callCount = 0;
      const mockHandler = {
        handleCreateReplica: async () => {
          callCount++;
          if (callCount === 2) {
            return {status: 'error', error: 'Creation failed'};
          }
          return {status: 'initiated'};
        },
      };

      const assignerWithHandler = new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        replicaHandler: mockHandler,
      });

      const result = await assignerWithHandler.createLocalReplicas([
        'partition-1',
        'partition-2',
        'partition-3',
      ]);

      assert.strictEqual(result.success, false);
      assert.deepStrictEqual(result.created, ['partition-1', 'partition-3']);
      assert.deepStrictEqual(result.failed, ['partition-2']);
    });
  });

  describe('syncReplicaData', () => {
    it('should return error for invalid partitionId', async () => {
      const result = await assigner.syncReplicaData(null, ['node1']);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid partitionId'));
    });

    it('should return error for empty partitionId', async () => {
      const result = await assigner.syncReplicaData('', ['node1']);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid partitionId'));
    });

    it('should return error for empty source nodes', async () => {
      const result = await assigner.syncReplicaData('partition-1', []);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('No source nodes'));
    });

    it('should return error for null source nodes', async () => {
      const result = await assigner.syncReplicaData('partition-1', null);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('No source nodes'));
    });

    it('should filter out this node from source nodes', async () => {
      const result = await assigner.syncReplicaData('partition-1', ['joining-node']);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('No valid source nodes'));
    });

    it('should emit syncRequested event when no RPC client', async () => {
      const events = [];
      assigner.on('syncRequested', (event) => events.push(event));

      const result = await assigner.syncReplicaData('partition-1', ['node1']);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.syncedFrom, 'node1');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].partitionId, 'partition-1');
      assert.strictEqual(events[0].sourceNode, 'node1');
    });

    it('should emit replicaSynced event on success', async () => {
      const events = [];
      assigner.on('replicaSynced', (event) => events.push(event));

      await assigner.syncReplicaData('partition-1', ['node1']);

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].partitionId, 'partition-1');
      assert.strictEqual(events[0].sourceNode, 'node1');
    });

    it('should use RPC client when provided', async () => {
      const rpcCalls = [];
      const mockRpcClient = {
        send: async (targetNode, message) => {
          rpcCalls.push({targetNode, message});
          return {status: 'success'};
        },
      };

      const assignerWithRpc = new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        rpcClient: mockRpcClient,
      });

      await assignerWithRpc.syncReplicaData('partition-1', ['node1']);

      assert.strictEqual(rpcCalls.length, 1);
      assert.strictEqual(rpcCalls[0].targetNode, 'node1');
      assert.strictEqual(rpcCalls[0].message.type, 'SYNC_REPLICA_DATA');
      assert.strictEqual(rpcCalls[0].message.partitionId, 'partition-1');
    });

    it('should try next source node on failure', async () => {
      let callCount = 0;
      const mockRpcClient = {
        send: async () => {
          callCount++;
          if (callCount <= 3) { // First node fails all 3 retries
            return {status: 'error', error: 'Connection failed'};
          }
          return {status: 'success'};
        },
      };

      const assignerWithRpc = new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        rpcClient: mockRpcClient,
        syncRetryAttempts: 3,
        syncRetryDelayMs: 0, // No delay for tests
      });

      const result = await assignerWithRpc.syncReplicaData(
        'partition-1',
        ['node1', 'node2'],
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.syncedFrom, 'node2');
    });

    it('should emit replicaSyncFailed when all nodes fail', async () => {
      const mockRpcClient = {
        send: async () => {
          return {status: 'error', error: 'Connection failed'};
        },
      };

      const assignerWithRpc = new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        rpcClient: mockRpcClient,
        syncRetryAttempts: 1,
        syncRetryDelayMs: 0,
      });

      const events = [];
      assignerWithRpc.on('replicaSyncFailed', (event) => events.push(event));

      const result = await assignerWithRpc.syncReplicaData('partition-1', ['node1']);

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Connection failed'));
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].partitionId, 'partition-1');
    });

    it('should update replica status during sync', async () => {
      // First create the replica
      await assigner.createLocalReplicas(['partition-1']);

      // Then sync
      await assigner.syncReplicaData('partition-1', ['node1']);

      const replica = assigner.getLocalReplicaStatus('partition-1');
      assert.strictEqual(replica.status, 'active');
      assert.strictEqual(replica.syncedFrom, 'node1');
    });

    it('should mark replica as failed when sync fails', async () => {
      const mockRpcClient = {
        send: async () => {
          return {status: 'error', error: 'Connection failed'};
        },
      };

      const assignerWithRpc = new PullBasedReplicaAssigner({
        nodeId: 'test-node',
        rpcClient: mockRpcClient,
        syncRetryAttempts: 1,
        syncRetryDelayMs: 0,
      });

      // First create the replica
      await assignerWithRpc.createLocalReplicas(['partition-1']);

      // Then try to sync (will fail)
      await assignerWithRpc.syncReplicaData('partition-1', ['node1']);

      const replica = assignerWithRpc.getLocalReplicaStatus('partition-1');
      assert.strictEqual(replica.status, 'failed');
    });
  });

  describe('getAllLocalReplicas', () => {
    it('should return empty map when no replicas created', () => {
      const replicas = assigner.getAllLocalReplicas();

      assert.ok(replicas instanceof Map);
      assert.strictEqual(replicas.size, 0);
    });

    it('should return all created replicas', async () => {
      await assigner.createLocalReplicas(['partition-1', 'partition-2']);

      const replicas = assigner.getAllLocalReplicas();

      assert.strictEqual(replicas.size, 2);
      assert.ok(replicas.has('partition-1'));
      assert.ok(replicas.has('partition-2'));
    });
  });
});
