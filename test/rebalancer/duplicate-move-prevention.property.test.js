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

import {test} from 'tap';
import fc from 'fast-check';
import {
  UnifiedRebalancer,
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
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

test('Property 81: Duplicate Move Prevention', async (t) => {
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
   * Property: For any replica with pending ADD move, no duplicate ADD
   * is generated for the same node.
   */
  t.test('no duplicate ADD moves for same node', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // node_id
        async (entityId, nodeId) => {
          const mockCache = createMockCache({
            nodes: [
              {node_id: nodeId, status: 'active'},
              {node_id: 'other-node', status: 'active'},
            ],
            services: [],
            partitions: [{partition_id: entityId, table_id: 'table-1'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Add a pending ADD move for the node
          rebalancer.pendingMoves.set('pending-add', {
            type: MoveType.ADD,
            replicaId: 'pending-replica',
            nodeId,
            entityId,
            startedAt: Date.now(),
            status: 'pending',
          });

          // Calculate moves - should not generate ADD for same node
          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: 3,
            targetNodes: [nodeId, nodeId, 'other-node'],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          rebalancer.shutdown();

          // Should not have any ADD moves for the node with pending move
          const addMovesForNode = moves.filter((m) =>
            m.type === MoveType.ADD && m.nodeId === nodeId);

          return addMovesForNode.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no duplicate ADD moves for same node');
  });

  /**
   * Property: For any replica with pending REMOVE move, no duplicate
   * REMOVE is generated.
   */
  t.test('no duplicate REMOVE moves for same replica', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // replica_id
        fc.uuid(), // node_id
        async (entityId, replicaId, nodeId) => {
          const mockCache = createMockCache({
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
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Add a pending REMOVE move for the replica
          rebalancer.pendingMoves.set('pending-remove', {
            type: MoveType.REMOVE,
            replicaId,
            nodeId,
            entityId,
            startedAt: Date.now(),
            status: 'pending',
          });

          // Calculate moves - should not generate REMOVE for same replica
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

          // Should not have any REMOVE moves for the replica with pending move
          const removeMovesForReplica = moves.filter((m) =>
            m.type === MoveType.REMOVE && m.replicaId === replicaId);

          return removeMovesForReplica.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no duplicate REMOVE moves for same replica');
  });

  /**
   * Property: When any pending moves exist, calculateMoves returns empty.
   */
  t.test('pending moves block new move generation', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.integer({min: 1, max: 3}), // pending move count
        async (entityId, pendingCount) => {
          const mockCache = createMockCache({
            nodes: [
              {node_id: 'node-1', status: 'active'},
              {node_id: 'node-2', status: 'active'},
              {node_id: 'node-3', status: 'active'},
            ],
            services: [],
            partitions: [{partition_id: entityId, table_id: 'table-1'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Add pending moves
          for (let i = 0; i < pendingCount; i++) {
            rebalancer.pendingMoves.set(`pending-${i}`, {
              type: MoveType.ADD,
              replicaId: `replica-${i}`,
              nodeId: `node-${i + 1}`,
              entityId,
              startedAt: Date.now(),
              status: 'pending',
            });
          }

          // Calculate moves - should return empty due to pending moves
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

    t.pass('pending moves block new move generation');
  });

  /**
   * Property: Transitioning replicas (starting/stopping/syncing) block
   * move generation.
   */
  t.test('transitioning replicas block move generation', async (t) => {
    const transitioningStatuses = [
      ReplicaStatus.STARTING,
      ReplicaStatus.STOPPING,
      'syncing',
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.constantFrom(...transitioningStatuses),
        async (entityId, transitionStatus) => {
          const mockCache = createMockCache({
            nodes: [
              {node_id: 'node-1', status: 'active'},
              {node_id: 'node-2', status: 'active'},
            ],
            services: [],
            partitions: [{partition_id: entityId, table_id: 'table-1'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Current replicas include one in transitioning state
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

          // Should return empty due to transitioning replicas
          return moves.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('transitioning replicas block move generation');
  });

  /**
   * Property: Completed pending moves don't block new move generation.
   */
  t.test('completed moves do not block new moves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        async (entityId) => {
          const mockCache = createMockCache({
            nodes: [
              {node_id: 'node-1', status: 'active'},
              {node_id: 'node-2', status: 'active'},
              {node_id: 'node-3', status: 'active'},
            ],
            services: [],
            partitions: [{partition_id: entityId, table_id: 'table-1'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Add completed moves (should not block)
          rebalancer.pendingMoves.set('completed-1', {
            type: MoveType.ADD,
            replicaId: 'replica-1',
            nodeId: 'node-1',
            entityId,
            startedAt: Date.now() - 10000,
            status: 'completed',
            completedAt: Date.now() - 5000,
          });

          // Calculate moves - should generate moves since no pending
          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: 3,
            targetNodes: ['node-1', 'node-2', 'node-3'],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          rebalancer.shutdown();

          // Should generate ADD moves since completed moves don't block
          return moves.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('completed moves do not block new moves');
  });

  /**
   * Property: hasPendingAddForNode correctly identifies pending ADD moves.
   */
  t.test('hasPendingAddForNode identifies pending ADD moves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // node_id
        async (entityId, nodeId) => {
          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            nodeId: 'test-node',
          });

          rebalancer.initialize();

          // Initially no pending ADD
          const hasPendingBefore = rebalancer.hasPendingAddForNode(nodeId);

          // Add a pending ADD move
          rebalancer.pendingMoves.set('test-add', {
            type: MoveType.ADD,
            replicaId: 'replica-1',
            nodeId,
            entityId,
            startedAt: Date.now(),
            status: 'pending',
          });

          // Now should have pending ADD
          const hasPendingAfter = rebalancer.hasPendingAddForNode(nodeId);

          // Different node should not have pending ADD
          const hasPendingOther = rebalancer.hasPendingAddForNode('other-node');

          rebalancer.shutdown();

          return !hasPendingBefore && hasPendingAfter && !hasPendingOther;
        },
      ),
      {numRuns: 10},
    );

    t.pass('hasPendingAddForNode identifies pending ADD moves');
  });
});
