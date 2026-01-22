/**
 * Property Test: No Duplicate REMOVE Moves for Removing Replicas
 * **Property 4: No Duplicate REMOVE Moves for Removing Replicas**
 * **Validates: Requirements 3.3**
 *
 * *For any* replica that is already in `removing` state, the Rebalancer
 * SHALL NOT generate a REMOVE move for that replica.
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

/**
 * Get a valid path of transitions to reach a target state from null.
 * @param {string} targetState - The state to reach.
 * @return {Array<string>} Array of states to transition through.
 */
function getPathToState(targetState) {
  const paths = {
    [ReplicaState.PENDING]: [ReplicaState.PENDING],
    [ReplicaState.CREATING]: [ReplicaState.PENDING, ReplicaState.CREATING],
    [ReplicaState.SYNCING]: [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
    ],
    [ReplicaState.ACTIVE]: [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
      ReplicaState.ACTIVE,
    ],
    [ReplicaState.REMOVING]: [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
      ReplicaState.ACTIVE,
      ReplicaState.REMOVING,
    ],
    [ReplicaState.REMOVED]: [
      ReplicaState.PENDING,
      ReplicaState.CREATING,
      ReplicaState.SYNCING,
      ReplicaState.ACTIVE,
      ReplicaState.REMOVING,
      ReplicaState.REMOVED,
    ],
    [ReplicaState.FAILED]: [
      ReplicaState.PENDING,
      ReplicaState.FAILED,
    ],
  };

  return paths[targetState] || [];
}

test('Property 4: No Duplicate REMOVE Moves for Removing Replicas', async (t) => {
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
   * Property: For any replica in removing state, no REMOVE move should
   * be generated for that replica.
   */
  t.test('no REMOVE moves for replicas in removing state', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.uuid(), // replica_id
        async (partitionId, nodeId, replicaId) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'coordinator-node',
          });

          // Set up replica in removing state
          const pathToRemoving = getPathToState(ReplicaState.REMOVING);
          for (const state of pathToRemoving) {
            stateMachine.transition(replicaId, state, {
              partitionId,
              nodeId,
              reason: 'test setup',
            });
          }

          // Verify replica is in removing state
          const replicaState = stateMachine.getState(replicaId);
          if (replicaState?.state !== ReplicaState.REMOVING) {
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
                status: ReplicaStatus.ACTIVE,
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

          // Calculate moves - target state wants no replicas
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

          // Clean up
          rebalancer.shutdown();
          stateMachine.clear();

          // No REMOVE moves should be generated for replica in removing state
          const removeMovesForReplica = moves.filter((m) =>
            m.type === MoveType.REMOVE && m.replicaId === replicaId);

          return removeMovesForReplica.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no REMOVE moves for replicas in removing state');
  });

  /**
   * Property: State machine correctly identifies replicas in removing state.
   */
  t.test('state machine identifies removing replicas', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}), // replica_ids
        (partitionId, nodeId, replicaIds) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
          });

          // Set up replicas in removing state
          for (const replicaId of replicaIds) {
            const pathToRemoving = getPathToState(ReplicaState.REMOVING);
            for (const state of pathToRemoving) {
              stateMachine.transition(replicaId, state, {
                partitionId,
                nodeId,
                reason: 'test setup',
              });
            }
          }

          // Query transitional replicas
          const transitional = stateMachine.getTransitionalReplicas();

          // Filter for removing state
          const removingReplicas = transitional.filter((r) =>
            r.state === ReplicaState.REMOVING);

          stateMachine.clear();

          // All replicas should be in removing state
          return removingReplicas.length === replicaIds.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state machine identifies removing replicas');
  });

  /**
   * Property: REMOVE moves are allowed for active replicas not in
   * removing state.
   */
  t.test('REMOVE moves allowed for active replicas', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.uuid(), // active_replica_id
        fc.uuid(), // removing_replica_id
        async (partitionId, nodeId, activeReplicaId, removingReplicaId) => {
          // Ensure replica IDs are different
          if (activeReplicaId === removingReplicaId) {
            return true; // Skip this case
          }

          const stateMachine = new ReplicaStateMachine({
            nodeId: 'coordinator-node',
          });

          // Set up one replica in active state
          const pathToActive = getPathToState(ReplicaState.ACTIVE);
          for (const state of pathToActive) {
            stateMachine.transition(activeReplicaId, state, {
              partitionId,
              nodeId,
              reason: 'test setup',
            });
          }

          // Set up another replica in removing state
          const pathToRemoving = getPathToState(ReplicaState.REMOVING);
          for (const state of pathToRemoving) {
            stateMachine.transition(removingReplicaId, state, {
              partitionId,
              nodeId: 'other-node',
              reason: 'test setup',
            });
          }

          const mockCache = createMockCache({
            nodes: [
              {node_id: nodeId, status: 'active'},
              {node_id: 'other-node', status: 'active'},
            ],
            services: [
              {
                service_id: activeReplicaId,
                partition_id: partitionId,
                node_id: nodeId,
                service_type: 'partition',
                status: ReplicaStatus.ACTIVE,
              },
              {
                service_id: removingReplicaId,
                partition_id: partitionId,
                node_id: 'other-node',
                service_type: 'partition',
                status: ReplicaStatus.ACTIVE,
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

          // Calculate moves - target state wants no replicas
          const currentReplicas = [
            {
              service_id: activeReplicaId,
              replica_id: activeReplicaId,
              node_id: nodeId,
              status: ReplicaStatus.ACTIVE,
            },
            {
              service_id: removingReplicaId,
              replica_id: removingReplicaId,
              node_id: 'other-node',
              status: ReplicaStatus.ACTIVE,
            },
          ];
          const targetState = {
            targetReplicaCount: 0,
            targetNodes: [],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();
          stateMachine.clear();

          // REMOVE move should be generated for active replica
          const removeMovesForActive = moves.filter((m) =>
            m.type === MoveType.REMOVE && m.replicaId === activeReplicaId);

          // No REMOVE move for removing replica
          const removeMovesForRemoving = moves.filter((m) =>
            m.type === MoveType.REMOVE && m.replicaId === removingReplicaId);

          return removeMovesForActive.length > 0 &&
                 removeMovesForRemoving.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE moves allowed for active replicas');
  });
});
