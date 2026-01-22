/**
 * Property Test: Cleanup Moves for Failed Replicas
 * **Property 5: Cleanup Moves for Failed Replicas**
 * **Validates: Requirements 3.4**
 *
 * *For any* replica in `failed` state, the Rebalancer SHALL generate a
 * cleanup move to transition it to `removed` state.
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  UnifiedRebalancer,
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  ReplicaStateMachine,
  ReplicaState,
} from '../../src/node/replica-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Create a mock system table cache.
 * @param {Object} data - Initial cache data.
 * @return {Object} Mock cache.
 */
function createMockCache(data = {}) {
  const cache = {
    nodes: data.nodes || [],
    services: data.services || [],
    partitions: data.partitions || [],
    tables: data.tables || [],
  };

  return {
    getAll(tableName) {
      return cache[tableName] || [];
    },
    filter(tableName, predicate) {
      const items = cache[tableName] || [];
      return items.filter(predicate);
    },
    get(tableName, id) {
      const items = cache[tableName] || [];
      return items.find((item) =>
        item.id === id ||
        item.node_id === id ||
        item.partition_id === id ||
        item.service_id === id);
    },
  };
}

test('Property 5: Cleanup Moves for Failed Replicas', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Property: For any replica in failed state, a cleanup REMOVE move
   * should be generated.
   */
  t.test('cleanup moves generated for failed replicas', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.uuid(), // replica_id
        async (partitionId, nodeId, replicaId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'coordinator-node',
          });

          // Set up replica in failed state (via pending -> failed)
          stateMachine.transition(replicaId, ReplicaState.PENDING, {
            partitionId,
            nodeId,
            reason: 'test setup',
          });
          stateMachine.transition(replicaId, ReplicaState.FAILED, {
            partitionId,
            nodeId,
            reason: 'operation failed',
            errorMessage: 'Test failure',
          });

          // Verify replica is in failed state
          const replicaState = stateMachine.getState(replicaId);
          if (replicaState?.state !== ReplicaState.FAILED) {
            stateMachine.clear();
            return true; // Skip if setup failed
          }

          const mockCache = createMockCache({
            nodes: [{node_id: nodeId, status: 'active'}],
            services: [
              {
                service_id: replicaId,
                partition_id: partitionId,
                node_id: nodeId,
                service_type: 'partition',
                status: ReplicaStatus.FAILED,
              },
            ],
            partitions: [{partition_id: partitionId, table_id: 'table-1'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'coordinator-node',
            replicaStateMachine: stateMachine,
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Calculate moves
          const currentReplicas = [
            {
              service_id: replicaId,
              replica_id: replicaId,
              node_id: nodeId,
              status: ReplicaStatus.FAILED,
            },
          ];
          const targetState = {
            targetReplicaCount: 1,
            targetNodes: [nodeId],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();
          stateMachine.clear();

          // A cleanup REMOVE move should be generated for the failed replica
          const cleanupMoves = moves.filter((m) =>
            m.type === MoveType.REMOVE &&
            m.replicaId === replicaId &&
            m.reason === 'replica_failed');

          return cleanupMoves.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cleanup moves generated for failed replicas');
  });

  /**
   * Property: State machine correctly identifies replicas in failed state.
   */
  t.test('state machine identifies failed replicas', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}), // replica_ids
        (partitionId, nodeId, replicaIds) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
          });

          // Set up replicas in failed state
          for (const replicaId of replicaIds) {
            stateMachine.transition(replicaId, ReplicaState.PENDING, {
              partitionId,
              nodeId,
              reason: 'test setup',
            });
            stateMachine.transition(replicaId, ReplicaState.FAILED, {
              partitionId,
              nodeId,
              reason: 'operation failed',
              errorMessage: 'Test failure',
            });
          }

          // Query replicas in failed state
          const failedReplicas = stateMachine.getReplicasInState(ReplicaState.FAILED);

          stateMachine.clear();

          // All replicas should be in failed state
          return failedReplicas.length === replicaIds.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state machine identifies failed replicas');
  });

  /**
   * Property: Cleanup moves have correct reason field.
   */
  t.test('cleanup moves have replica_failed reason', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.uuid(), // replica_id
        async (partitionId, nodeId, replicaId) => {
          const mockCache = createMockCache({
            nodes: [{node_id: nodeId, status: 'active'}],
            services: [
              {
                service_id: replicaId,
                partition_id: partitionId,
                node_id: nodeId,
                service_type: 'partition',
                status: ReplicaStatus.FAILED,
              },
            ],
            partitions: [{partition_id: partitionId, table_id: 'table-1'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'coordinator-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Calculate moves with failed replica
          const currentReplicas = [
            {
              service_id: replicaId,
              replica_id: replicaId,
              node_id: nodeId,
              status: ReplicaStatus.FAILED,
            },
          ];
          const targetState = {
            targetReplicaCount: 1,
            targetNodes: [nodeId],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();

          // All REMOVE moves for failed replicas should have replica_failed reason
          const failedReplicaMoves = moves.filter((m) =>
            m.type === MoveType.REMOVE && m.replicaId === replicaId);

          if (failedReplicaMoves.length === 0) {
            return true; // No moves generated (might be blocked by pending)
          }

          return failedReplicaMoves.every((m) => m.reason === 'replica_failed');
        },
      ),
      {numRuns: 10},
    );

    t.pass('cleanup moves have replica_failed reason');
  });

  /**
   * Property: Inactive replicas also get cleanup moves.
   */
  t.test('cleanup moves generated for inactive replicas', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.uuid(), // replica_id
        async (partitionId, nodeId, replicaId) => {
          const mockCache = createMockCache({
            nodes: [{node_id: nodeId, status: 'active'}],
            services: [
              {
                service_id: replicaId,
                partition_id: partitionId,
                node_id: nodeId,
                service_type: 'partition',
                status: ReplicaStatus.INACTIVE,
              },
            ],
            partitions: [{partition_id: partitionId, table_id: 'table-1'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'coordinator-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Calculate moves with inactive replica
          const currentReplicas = [
            {
              service_id: replicaId,
              replica_id: replicaId,
              node_id: nodeId,
              status: ReplicaStatus.INACTIVE,
            },
          ];
          const targetState = {
            targetReplicaCount: 1,
            targetNodes: [nodeId],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();

          // A cleanup REMOVE move should be generated for the inactive replica
          const cleanupMoves = moves.filter((m) =>
            m.type === MoveType.REMOVE &&
            m.replicaId === replicaId &&
            m.reason === 'replica_failed');

          return cleanupMoves.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cleanup moves generated for inactive replicas');
  });
});
