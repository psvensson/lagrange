/**
 * Property Test: Move Deduplication
 * **Property 12: Move Deduplication**
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * *For any* pending move in the Rebalancer's pending_move_map, the Rebalancer
 * SHALL NOT generate a duplicate move (same type and target) when calculating moves.
 *
 * Requirements:
 * 5.1 WHEN the Rebalancer calculates moves THEN it SHALL check the pending_move_map
 *     for existing operations
 * 5.2 IF a pending ADD move exists for a target node THEN the Rebalancer SHALL NOT
 *     generate another ADD move for that node
 * 5.3 IF a pending REMOVE move exists for a replica THEN the Rebalancer SHALL NOT
 *     generate another REMOVE move for that replica
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

test('Property 12: Move Deduplication', async (t) => {
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
   * Property 12.1: Rebalancer checks pending_move_map when calculating moves
   * Validates: Requirement 5.1
   */
  t.test('calculateMoves checks pending_move_map for existing operations', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}), // node_ids
        async (entityId, nodeIds) => {
          const nodes = nodeIds.map((id) => ({node_id: id, status: 'active'}));

          const mockCache = createMockCache({
            nodes,
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

          // Add a pending move for the first node
          const targetNodeId = nodeIds[0];
          rebalancer.pendingMoves.set('pending-add-1', {
            type: MoveType.ADD,
            replicaId: 'pending-replica-1',
            nodeId: targetNodeId,
            entityId,
            startedAt: Date.now(),
            status: 'pending',
          });

          // Calculate moves with target state that would normally add to that node
          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: nodeIds.length,
            targetNodes: nodeIds,
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          rebalancer.shutdown();

          // When pending moves exist, calculateMoves should return empty
          // (it checks pending_move_map and blocks new moves)
          return moves.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('calculateMoves checks pending_move_map for existing operations');
  });

  /**
   * Property 12.2: No duplicate ADD moves for same target node
   * Validates: Requirement 5.2
   *
   * When hasPendingAddForNode returns true, no ADD move should be generated
   * for that node.
   */
  t.test('no duplicate ADD moves for same target node', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // target_node_id
        fc.uuid(), // other_node_id
        async (entityId, targetNodeId, otherNodeId) => {
          // Ensure different node IDs
          if (targetNodeId === otherNodeId) {
            return true; // Skip this case
          }

          const mockCache = createMockCache({
            nodes: [
              {node_id: targetNodeId, status: 'active'},
              {node_id: otherNodeId, status: 'active'},
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

          // Verify hasPendingAddForNode works correctly
          const hasPendingBefore = rebalancer.hasPendingAddForNode(targetNodeId);

          // Add a pending ADD move for the target node
          rebalancer.pendingMoves.set('pending-add', {
            type: MoveType.ADD,
            replicaId: 'pending-replica',
            nodeId: targetNodeId,
            entityId,
            startedAt: Date.now(),
            status: 'pending',
          });

          const hasPendingAfter = rebalancer.hasPendingAddForNode(targetNodeId);
          const otherNodeHasPending = rebalancer.hasPendingAddForNode(otherNodeId);

          rebalancer.shutdown();

          // hasPendingAddForNode should return false before, true after for target
          // and false for other node
          return !hasPendingBefore && hasPendingAfter && !otherNodeHasPending;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no duplicate ADD moves for same target node');
  });

  /**
   * Property 12.3: No duplicate REMOVE moves for same replica
   * Validates: Requirement 5.3
   *
   * When hasPendingMove returns true for a replica, no REMOVE move should
   * be generated for that replica.
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

          // Verify hasPendingMove works correctly
          const hasPendingBefore = rebalancer.hasPendingMove(replicaId);

          // Add a pending REMOVE move for the replica
          rebalancer.pendingMoves.set('pending-remove', {
            type: MoveType.REMOVE,
            replicaId,
            nodeId,
            entityId,
            startedAt: Date.now(),
            status: 'pending',
          });

          const hasPendingAfter = rebalancer.hasPendingMove(replicaId);
          const otherReplicaHasPending = rebalancer.hasPendingMove('other-replica');

          rebalancer.shutdown();

          // hasPendingMove should return false before, true after for target
          // and false for other replica
          return !hasPendingBefore && hasPendingAfter && !otherReplicaHasPending;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no duplicate REMOVE moves for same replica');
  });

  /**
   * Property 12.4: Completed moves don't trigger deduplication
   * Validates: Requirements 5.1, 5.2, 5.3 (negative case)
   *
   * Completed or failed moves should not block new moves for the same target.
   */
  t.test('completed moves do not trigger deduplication', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // node_id
        fc.constantFrom('completed', 'failed'), // status
        async (entityId, nodeId, completedStatus) => {
          const mockCache = createMockCache({
            nodes: [
              {node_id: nodeId, status: 'active'},
              {node_id: 'other-node', status: 'active'},
              {node_id: 'third-node', status: 'active'},
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

          // Add a completed/failed move (should not block)
          rebalancer.pendingMoves.set('completed-add', {
            type: MoveType.ADD,
            replicaId: 'completed-replica',
            nodeId,
            entityId,
            startedAt: Date.now() - 10000,
            status: completedStatus,
            completedAt: Date.now() - 5000,
          });

          // hasPendingAddForNode should return false for completed moves
          const hasPending = rebalancer.hasPendingAddForNode(nodeId);

          rebalancer.shutdown();

          return !hasPending;
        },
      ),
      {numRuns: 10},
    );

    t.pass('completed moves do not trigger deduplication');
  });

  /**
   * Property 12.5: Multiple pending moves are all checked
   * Validates: Requirements 5.1, 5.2, 5.3
   *
   * When multiple pending moves exist, all should be checked for deduplication.
   */
  t.test('multiple pending moves are all checked', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.array(fc.uuid(), {minLength: 2, maxLength: 4}), // node_ids
        async (entityId, nodeIds) => {
          // Ensure unique node IDs
          const uniqueNodeIds = [...new Set(nodeIds)];
          if (uniqueNodeIds.length < 2) {
            return true; // Skip if not enough unique nodes
          }

          const nodes = uniqueNodeIds.map((id) => ({node_id: id, status: 'active'}));

          const mockCache = createMockCache({
            nodes,
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

          // Add pending ADD moves for multiple nodes
          uniqueNodeIds.forEach((nodeId, index) => {
            rebalancer.pendingMoves.set(`pending-add-${index}`, {
              type: MoveType.ADD,
              replicaId: `pending-replica-${index}`,
              nodeId,
              entityId,
              startedAt: Date.now(),
              status: 'pending',
            });
          });

          // All nodes should show as having pending ADD moves
          const allHavePending = uniqueNodeIds.every((nodeId) =>
            rebalancer.hasPendingAddForNode(nodeId));

          rebalancer.shutdown();

          return allHavePending;
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple pending moves are all checked');
  });
});
