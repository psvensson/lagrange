/**
 * Tests for first-class REPLACE replica workflow.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationMessageType} from '../../src/rebalancer/replica-operation-constants.js';
import {MoveType} from '../../src/rebalancer/unified-rebalancer.js';
import {createTestCoordinator, createTestRebalancer} from './test-helpers.js';

test('REPLACE replica workflow', async (t) => {
  await t.test('MovePlanner emits REPLACE moves for spread correction',
    async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'nodes-p1',
        cacheData: {
          nodes: [
            {node_id: 'node-1', status: 'active'},
            {node_id: 'node-2', status: 'active'},
            {node_id: 'node-3', status: 'active'},
          ],
        },
      });

      const currentReplicas = [
        {
          replica_id: 'nodes-p1-r1',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          address: 'node-1/partition/nodes-p1-r1',
          raft_role: 'leader',
        },
        {
          replica_id: 'nodes-p1-r2',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          address: 'node-1/partition/nodes-p1-r2',
          raft_role: 'follower',
        },
        {
          replica_id: 'nodes-p1-r3',
          node_id: 'node-1',
          status: ReplicaStatus.ACTIVE,
          address: 'node-1/partition/nodes-p1-r3',
          raft_role: 'follower',
        },
      ];

      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
        degraded: false,
        availableNodeCount: 3,
      };

      const moves = rebalancer.calculateMoves(currentReplicas, targetState);
      const replaceMoves = moves.filter((move) => move.type === MoveType.REPLACE);
      const addMoves = moves.filter((move) => move.type === MoveType.ADD);
      const nonFailedRemoves = moves.filter(
        (move) => move.type === MoveType.REMOVE && move.reason !== 'replica_failed',
      );

      t.equal(
        replaceMoves.length,
        2,
        'should emit two REPLACE moves to rebalance three replicas across three nodes',
      );
      t.equal(addMoves.length, 0, 'REPLACE moves should avoid standalone ADD growth');
      t.equal(nonFailedRemoves.length, 0, 'REPLACE moves should avoid standalone REMOVE churn');
      t.same(
        replaceMoves.map((move) => move.nodeId).sort(),
        ['node-2', 'node-3'],
        'REPLACE targets should be underrepresented nodes',
      );
    });

  await t.test('RebalanceCoordinator executes REPLACE in create then remove phases',
    async (t) => {
      const deliveries = [];
      const messageRouter = {
        async deliver(target, payload) {
          deliveries.push({target, payload});
          return {
            acknowledged: true,
            status: 'initiated',
          };
        },
      };

      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        messageRouter,
        cacheData: {
          services: [
            {
              service_id: 'nodes-p1-r1',
              replica_id: 'nodes-p1-r1',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/nodes-p1-r1',
            },
            {
              service_id: 'nodes-p1-r2',
              replica_id: 'nodes-p1-r2',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/nodes-p1-r2',
            },
            {
              service_id: 'nodes-p1-r3',
              replica_id: 'nodes-p1-r3',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'seed-node',
              status: 'active',
              address: 'seed-node/partition/nodes-p1-r3',
            },
          ],
        },
      });
      coordinator.initialize();

      try {
        const operation = await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-2',
          sourceNodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
        });

        await coordinator.executeOperation(operation);

        t.equal(
          operation.replicaId,
          'nodes-p1-r4',
          'REPLACE create phase should allocate canonical replica id on target',
        );
        t.equal(
          deliveries[0]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'first REPLACE phase should issue CREATE_REPLICA to target node',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'REPLACE operation should transition into CREATING after create dispatch',
        );

        operation.workflowStep = WORKFLOW_STEP.ACTIVE;
        operation.status = ReplicaStatus.ACTIVE;

        await coordinator.executeOperation(operation);

        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'second REPLACE phase should issue REMOVE_REPLICA to source node',
        );
        t.equal(
          deliveries[1]?.payload?.replicaId,
          'nodes-p1-r1',
          'source replica should be removed in second REPLACE phase',
        );
        t.equal(
          deliveries[1]?.target,
          'seed-node/service/replica-handler',
          'source removal should be routed to source node handler',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'REPLACE operation should transition into STOPPING after remove dispatch',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('RebalanceCoordinator allocates canonical replica IDs for ADD',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
        cacheData: {
          services: [
            {
              service_id: 'nodes-p1-r1',
              replica_id: 'nodes-p1-r1',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-1',
              status: 'active',
              address: 'node-1/partition/nodes-p1-r1',
            },
            {
              service_id: 'nodes-p1-r2',
              replica_id: 'nodes-p1-r2',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-2',
              status: 'active',
              address: 'node-2/partition/nodes-p1-r2',
            },
            {
              service_id: 'nodes-p1-r3',
              replica_id: 'nodes-p1-r3',
              service_type: 'partition',
              partition_id: 'nodes-p1',
              node_id: 'node-3',
              status: 'active',
              address: 'node-3/partition/nodes-p1-r3',
            },
          ],
        },
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'nodes-p1',
          entityType: 'partition',
          entityId: 'nodes-p1',
          nodeId: 'node-4',
        });

        t.equal(
          operation.replicaId,
          'nodes-p1-r4',
          'ADD should allocate next canonical replica id instead of UUID',
        );
      } finally {
        await coordinator.shutdown();
      }
    });
});
