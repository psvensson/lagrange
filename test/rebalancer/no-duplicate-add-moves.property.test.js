/**
 * Property Test: No Duplicate ADD Moves for Transitional Replicas
 * **Property 3: No Duplicate ADD Moves for Transitional Replicas**
 * **Validates: Requirements 3.2**
 *
 * *For any* partition that has a replica in `pending`, `creating`, or `syncing`
 * state on a target node, the Rebalancer SHALL NOT generate an ADD move for
 * that partition on that node.
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  UnifiedRebalancer,
  EntityType,
  MoveType,
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

// Transitional states for ADD operations
const ADD_TRANSITIONAL_STATES = [
  ReplicaState.PENDING,
  ReplicaState.CREATING,
  ReplicaState.SYNCING,
];

test('Property 3: No Duplicate ADD Moves for Transitional Replicas', async (t) => {
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
   * Property: For any partition with a replica in pending state on a node,
   * no ADD move should be generated for that node.
   */
  t.test('no ADD moves for nodes with pending replicas', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id with transitional replica
        fc.uuid(), // replica_id
        fc.constantFrom(...ADD_TRANSITIONAL_STATES),
        async (partitionId, nodeId, replicaId, transitionalState) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'coordinator-node',
          });

          // Set up replica in transitional state
          // First transition to pending
          stateMachine.transition(replicaId, ReplicaState.PENDING, {
            partitionId,
            nodeId,
            reason: 'rebalancer ADD decision',
          });

          // If target state is not pending, continue transitions
          if (transitionalState === ReplicaState.CREATING) {
            stateMachine.transition(replicaId, ReplicaState.CREATING, {
              partitionId,
              nodeId,
              reason: 'CREATE_REPLICA sent',
            });
          } else if (transitionalState === ReplicaState.SYNCING) {
            stateMachine.transition(replicaId, ReplicaState.CREATING, {
              partitionId,
              nodeId,
              reason: 'CREATE_REPLICA sent',
            });
            stateMachine.transition(replicaId, ReplicaState.SYNCING, {
              partitionId,
              nodeId,
              reason: 'ACK received',
            });
          }

          const mockCache = createMockCache({
            nodes: [
              {node_id: nodeId, status: 'active'},
              {node_id: 'other-node', status: 'active'},
            ],
            services: [],
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

          // Get transitional replicas from state machine
          const transitionalReplicas = stateMachine.getTransitionalReplicas();

          // Filter for replicas in ADD transitional states on target node
          const addTransitionalOnNode = transitionalReplicas.filter((r) =>
            ADD_TRANSITIONAL_STATES.includes(r.state) &&
            r.nodeId === nodeId &&
            r.partitionId === partitionId);

          // Calculate moves
          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: 3,
            targetNodes: [nodeId, nodeId, 'other-node'],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();
          stateMachine.clear();

          // If there are transitional replicas on the node, no ADD moves
          // should be generated for that node
          if (addTransitionalOnNode.length > 0) {
            const addMovesForNode = moves.filter((m) =>
              m.type === MoveType.ADD && m.nodeId === nodeId);
            return addMovesForNode.length === 0;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no ADD moves for nodes with pending replicas');
  });

  /**
   * Property: For any partition, querying state machine for transitional
   * replicas correctly identifies replicas in ADD transitional states.
   */
  t.test('state machine correctly identifies ADD transitional replicas', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}), // replica_ids
        fc.constantFrom(...ADD_TRANSITIONAL_STATES),
        (partitionId, nodeId, replicaIds, targetState) => {
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
          });

          // Set up replicas in transitional states
          for (const replicaId of replicaIds) {
            stateMachine.transition(replicaId, ReplicaState.PENDING, {
              partitionId,
              nodeId,
              reason: 'test setup',
            });

            if (targetState === ReplicaState.CREATING ||
                targetState === ReplicaState.SYNCING) {
              stateMachine.transition(replicaId, ReplicaState.CREATING, {
                partitionId,
                nodeId,
                reason: 'test setup',
              });
            }

            if (targetState === ReplicaState.SYNCING) {
              stateMachine.transition(replicaId, ReplicaState.SYNCING, {
                partitionId,
                nodeId,
                reason: 'test setup',
              });
            }
          }

          // Query transitional replicas
          const transitional = stateMachine.getTransitionalReplicas();

          // All replicas should be in transitional states
          const allInTransitional = replicaIds.every((id) =>
            transitional.some((r) => r.replicaId === id));

          // Filter for ADD transitional states
          const addTransitional = transitional.filter((r) =>
            ADD_TRANSITIONAL_STATES.includes(r.state));

          stateMachine.clear();

          return allInTransitional && addTransitional.length === replicaIds.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state machine correctly identifies ADD transitional replicas');
  });

  /**
   * Property: ADD moves are allowed for nodes without transitional replicas.
   */
  t.test('ADD moves allowed for nodes without transitional replicas', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id with transitional replica
        fc.uuid(), // clean_node_id without transitional replica
        async (partitionId, transitionalNodeId, cleanNodeId) => {
          // Ensure nodes are different
          if (transitionalNodeId === cleanNodeId) {
            return true; // Skip this case
          }

          const stateMachine = new ReplicaStateMachine({
            nodeId: 'coordinator-node',
          });

          // Set up replica in transitional state on one node
          stateMachine.transition('transitional-replica', ReplicaState.PENDING, {
            partitionId,
            nodeId: transitionalNodeId,
            reason: 'test setup',
          });

          const mockCache = createMockCache({
            nodes: [
              {node_id: transitionalNodeId, status: 'active'},
              {node_id: cleanNodeId, status: 'active'},
            ],
            services: [],
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

          // Calculate moves targeting the clean node
          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: 1,
            targetNodes: [cleanNodeId],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();
          stateMachine.clear();

          // ADD moves should be generated for the clean node
          const addMovesForCleanNode = moves.filter((m) =>
            m.type === MoveType.ADD && m.nodeId === cleanNodeId);

          return addMovesForCleanNode.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('ADD moves allowed for nodes without transitional replicas');
  });
});
