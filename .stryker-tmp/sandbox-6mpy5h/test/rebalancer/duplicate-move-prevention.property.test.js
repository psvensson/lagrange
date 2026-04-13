/**
 * Property Test: Duplicate Move Prevention
 * **Property 81: Duplicate Move Prevention**
 * **Validates: Requirements 10.25**
 *
 * *For any* replica with a pending move, the system should:
 * 1. Not generate duplicate ADD moves for the same node
 * 2. Not generate duplicate REMOVE moves for the same replica
 * 3. Skip move generation when transitioning replicas exist
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  EntityType,
  MoveType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestRebalancer} from './test-helpers.js';

/**
 * Build a replica operation row.
 * @param {Object} data - Operation data.
 * @return {Object} Operation row.
 */
function createOperation(data) {
  return {
    operation_id: data.operationId,
    type: data.type || 'ADD',
    partition_id: data.partitionId,
    replica_id: data.replicaId,
    target_node_id: data.targetNodeId,
    status: data.status || ReplicaStatus.PENDING,
    workflow_step: data.workflowStep || 'PENDING',
  };
}

test('Property 81: Duplicate Move Prevention', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('no duplicate ADD moves for same node', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (entityId, nodeId) => {
          const rebalancer = createTestRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            nodeId: 'test-node',
            cacheData: {
              nodes: [
                {node_id: nodeId, status: 'active'},
                {node_id: 'other-node', status: 'active'},
              ],
              partitions: [{partition_id: entityId, table_id: 'table-1'}],
              replicaOperations: [
                createOperation({
                  operationId: 'op-1',
                  partitionId: entityId,
                  replicaId: 'pending-replica',
                  targetNodeId: nodeId,
                  type: 'ADD',
                }),
              ],
            },
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: 3,
            targetNodes: [nodeId, nodeId, 'other-node'],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          rebalancer.shutdown();

          const addMovesForNode = moves.filter((m) =>
            m.type === MoveType.ADD && m.nodeId === nodeId);

          return addMovesForNode.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no duplicate ADD moves for same node');
  });

  t.test('no duplicate REMOVE moves for same replica', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (entityId, replicaId, nodeId) => {
          const rebalancer = createTestRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            nodeId: 'test-node',
            cacheData: {
              nodes: [{node_id: nodeId, status: 'active'}],
              services: [
                {
                  service_id: replicaId,
                  partition_id: entityId,
                  node_id: nodeId,
                  service_type: 'partition',
                  status: ReplicaStatus.ACTIVE,
                },
              ],
              partitions: [{partition_id: entityId, table_id: 'table-1'}],
              replicaOperations: [
                createOperation({
                  operationId: 'op-1',
                  partitionId: entityId,
                  replicaId,
                  targetNodeId: nodeId,
                  type: 'REMOVE',
                }),
              ],
            },
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          const currentReplicas = [
            {
              service_id: replicaId,
              replica_id: replicaId,
              node_id: nodeId,
              status: ReplicaStatus.ACTIVE,
            },
          ];
          const targetState = {
            targetReplicaCount: 0,
            targetNodes: [],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          rebalancer.shutdown();

          const removeMovesForReplica = moves.filter((m) =>
            m.type === MoveType.REMOVE && m.replicaId === replicaId);

          return removeMovesForReplica.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no duplicate REMOVE moves for same replica');
  });

  t.test('pending operations block new move generation', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({min: 1, max: 3}),
        async (entityId, pendingCount) => {
          const replicaOperations = [];
          for (let i = 0; i < pendingCount; i++) {
            replicaOperations.push(createOperation({
              operationId: `pending-${i}`,
              partitionId: entityId,
              replicaId: `replica-${i}`,
              targetNodeId: `node-${i + 1}`,
              type: 'ADD',
            }));
          }

          const rebalancer = createTestRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            nodeId: 'test-node',
            cacheData: {
              nodes: [
                {node_id: 'node-1', status: 'active'},
                {node_id: 'node-2', status: 'active'},
                {node_id: 'node-3', status: 'active'},
              ],
              partitions: [{partition_id: entityId, table_id: 'table-1'}],
              replicaOperations,
            },
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: 3,
            targetNodes: ['node-1', 'node-2', 'node-3'],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          rebalancer.shutdown();

          return moves.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('pending operations block new move generation');
  });

  t.test('service-row transitioning replicas do not block move generation',
    async (t) => {
      const transitioningStatuses = [
        ReplicaStatus.CREATING,
        ReplicaStatus.SYNCING,
        ReplicaStatus.REMOVING,
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom(...transitioningStatuses),
          async (entityId, transitionStatus) => {
            const rebalancer = createTestRebalancer({
              entityId,
              entityType: EntityType.PARTITION,
              nodeId: 'test-node',
              cacheData: {
                nodes: [
                  {node_id: 'node-1', status: 'active'},
                  {node_id: 'node-2', status: 'active'},
                ],
                partitions: [{partition_id: entityId, table_id: 'table-1'}],
              },
            });

            rebalancer.initialize();
            rebalancer.setLeader(true);

            const currentReplicas = [
              {
                service_id: 'replica-1',
                replica_id: 'replica-1',
                node_id: 'node-1',
                status: transitionStatus,
              },
            ];

            const targetState = {
              targetReplicaCount: 3,
              targetNodes: ['node-1', 'node-2', 'node-2'],
            };

            const moves = rebalancer.calculateMoves(currentReplicas, targetState);

            rebalancer.shutdown();

            return moves.length > 0;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'service-row transitioning replicas do not block move generation',
      );
    });

  t.test('completed operations do not block new moves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (entityId) => {
          const rebalancer = createTestRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            nodeId: 'test-node',
            cacheData: {
              nodes: [
                {node_id: 'node-1', status: 'active'},
                {node_id: 'node-2', status: 'active'},
                {node_id: 'node-3', status: 'active'},
              ],
              partitions: [{partition_id: entityId, table_id: 'table-1'}],
              replicaOperations: [
                createOperation({
                  operationId: 'completed-1',
                  partitionId: entityId,
                  replicaId: 'replica-1',
                  targetNodeId: 'node-1',
                  status: ReplicaStatus.ACTIVE,
                  type: 'ADD',
                }),
              ],
            },
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: 3,
            targetNodes: ['node-1', 'node-2', 'node-3'],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          rebalancer.shutdown();

          return moves.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('completed operations do not block new moves');
  });

  t.test('hasPendingAddForNode identifies pending ADD moves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (entityId, nodeId) => {
          const rebalancer = createTestRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            nodeId: 'test-node',
            cacheData: {
              replicaOperations: [
                createOperation({
                  operationId: 'op-1',
                  partitionId: entityId,
                  replicaId: 'replica-1',
                  targetNodeId: nodeId,
                  type: 'ADD',
                }),
              ],
            },
          });

          rebalancer.initialize();

          const hasPendingBefore = rebalancer.hasPendingAddForNode('other-node');
          const hasPendingAfter = rebalancer.hasPendingAddForNode(nodeId);

          rebalancer.shutdown();

          return !hasPendingBefore && hasPendingAfter;
        },
      ),
      {numRuns: 10},
    );

    t.pass('hasPendingAddForNode identifies pending ADD moves');
  });
});
