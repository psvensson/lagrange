/**
 * Property Test: Pending Move Tracking
 * **Property 80: Pending Move Tracking**
 * **Validates: Requirements 10.23, 10.24**
 *
 * *For any* replica move operation, the system should:
 * 1. Track the move in pendingMoves Map
 * 2. Update move status on completion via CDC events
 * 3. Remove completed/failed moves from tracking
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  UnifiedRebalancer,
  EntityType,
  MoveType,
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

test('Property 80: Pending Move Tracking', async (t) => {
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
   * Property: For any addReplica call, the move is tracked in pendingMoves.
   */
  t.test('addReplica tracks move in pendingMoves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // node_id
        async (entityId, nodeId) => {
          const mockCache = createMockCache({
            nodes: [{node_id: nodeId, status: 'active'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          const initialPendingCount = rebalancer.pendingMoves.size;

          const result = await rebalancer.addReplica(nodeId);

          const finalPendingCount = rebalancer.pendingMoves.size;
          const pendingMove = rebalancer.pendingMoves.get(result.requestId);

          rebalancer.shutdown();

          return finalPendingCount === initialPendingCount + 1 &&
            pendingMove !== undefined &&
            pendingMove.type === MoveType.ADD &&
            pendingMove.nodeId === nodeId &&
            pendingMove.status === 'pending';
        },
      ),
      {numRuns: 10},
    );

    t.pass('addReplica tracks move in pendingMoves');
  });

  /**
   * Property: For any removeReplica call, the move is tracked in pendingMoves.
   */
  t.test('removeReplica tracks move in pendingMoves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // replica_id
        fc.uuid(), // node_id
        async (entityId, replicaId, nodeId) => {
          const mockCache = createMockCache({
            nodes: [{node_id: nodeId, status: 'active'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          const initialPendingCount = rebalancer.pendingMoves.size;

          const result = await rebalancer.removeReplica(replicaId, nodeId);

          const finalPendingCount = rebalancer.pendingMoves.size;
          const pendingMove = rebalancer.pendingMoves.get(result.requestId);

          rebalancer.shutdown();

          return finalPendingCount === initialPendingCount + 1 &&
            pendingMove !== undefined &&
            pendingMove.type === MoveType.REMOVE &&
            pendingMove.replicaId === replicaId &&
            pendingMove.nodeId === nodeId &&
            pendingMove.status === 'pending';
        },
      ),
      {numRuns: 10},
    );

    t.pass('removeReplica tracks move in pendingMoves');
  });

  /**
   * Property: For any CDC event with status 'active', ADD move is completed.
   */
  t.test('CDC active status completes ADD move', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // node_id
        async (entityId, nodeId) => {
          const mockCache = createMockCache({
            nodes: [{node_id: nodeId, status: 'active'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Add a replica
          const result = await rebalancer.addReplica(nodeId);
          const replicaId = result.replicaId;

          // Verify move is pending
          const moveBefore = rebalancer.pendingMoves.get(result.requestId);
          const wasPending = moveBefore?.status === 'pending';

          // Simulate CDC event for completion
          rebalancer.handleServicesCDCEvent({
            operation: 'UPDATE',
            data: {
              service_id: replicaId,
              status: 'active',
            },
          });

          // Verify move is completed
          const moveAfter = rebalancer.pendingMoves.get(result.requestId);
          const isCompleted = moveAfter?.status === 'completed';

          rebalancer.shutdown();

          return wasPending && isCompleted;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC active status completes ADD move');
  });

  /**
   * Property: For any CDC DELETE event, REMOVE move is completed.
   */
  t.test('CDC DELETE completes REMOVE move', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // replica_id
        fc.uuid(), // node_id
        async (entityId, replicaId, nodeId) => {
          const mockCache = createMockCache({
            nodes: [{node_id: nodeId, status: 'active'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Remove a replica
          const result = await rebalancer.removeReplica(replicaId, nodeId);

          // Verify move is pending
          const moveBefore = rebalancer.pendingMoves.get(result.requestId);
          const wasPending = moveBefore?.status === 'pending';

          // Simulate CDC DELETE event
          rebalancer.handleServicesCDCEvent({
            operation: 'DELETE',
            data: {
              service_id: replicaId,
            },
          });

          // Verify move is completed
          const moveAfter = rebalancer.pendingMoves.get(result.requestId);
          const isCompleted = moveAfter?.status === 'completed';

          rebalancer.shutdown();

          return wasPending && isCompleted;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC DELETE completes REMOVE move');
  });

  /**
   * Property: For any CDC event with status 'failed', move is marked failed.
   */
  t.test('CDC failed status marks move as failed', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // node_id
        fc.string({minLength: 1, maxLength: 50}), // error_message
        async (entityId, nodeId, errorMessage) => {
          const mockCache = createMockCache({
            nodes: [{node_id: nodeId, status: 'active'}],
          });

          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            systemTableCache: mockCache,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Add a replica
          const result = await rebalancer.addReplica(nodeId);
          const replicaId = result.replicaId;

          // Simulate CDC event for failure
          rebalancer.handleServicesCDCEvent({
            operation: 'UPDATE',
            data: {
              service_id: replicaId,
              status: 'failed',
              error_message: errorMessage,
            },
          });

          // Verify move is marked as failed
          const moveAfter = rebalancer.pendingMoves.get(result.requestId);

          rebalancer.shutdown();

          return moveAfter?.status === 'failed' &&
            moveAfter?.error === errorMessage;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC failed status marks move as failed');
  });

  /**
   * Property: cleanupExpiredMoves removes old completed/failed moves.
   */
  t.test('cleanupExpiredMoves removes old moves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.integer({min: 1, max: 5}), // number of moves
        async (entityId, moveCount) => {
          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            nodeId: 'test-node',
          });

          rebalancer.initialize();

          // Add some old completed moves directly
          const oldTime = Date.now() - 400000; // 400 seconds ago
          for (let i = 0; i < moveCount; i++) {
            rebalancer.pendingMoves.set(`old-move-${i}`, {
              type: MoveType.ADD,
              replicaId: `replica-${i}`,
              nodeId: `node-${i}`,
              entityId,
              startedAt: oldTime,
              status: 'completed',
              completedAt: oldTime + 1000,
            });
          }

          const countBefore = rebalancer.pendingMoves.size;

          // Cleanup with 300 second max age
          rebalancer.cleanupExpiredMoves(300000);

          const countAfter = rebalancer.pendingMoves.size;

          rebalancer.shutdown();

          // All old moves should be removed
          return countBefore === moveCount && countAfter === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cleanupExpiredMoves removes old moves');
  });

  /**
   * Property: hasPendingMove correctly identifies pending moves.
   */
  t.test('hasPendingMove identifies pending moves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // entity_id
        fc.uuid(), // replica_id
        fc.uuid(), // node_id
        async (entityId, replicaId, nodeId) => {
          const rebalancer = new UnifiedRebalancer({
            entityId,
            entityType: EntityType.PARTITION,
            nodeId: 'test-node',
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Initially no pending move
          const hasPendingBefore = rebalancer.hasPendingMove(replicaId);

          // Add a pending move
          rebalancer.pendingMoves.set('test-request', {
            type: MoveType.REMOVE,
            replicaId,
            nodeId,
            entityId,
            startedAt: Date.now(),
            status: 'pending',
          });

          // Now should have pending move
          const hasPendingAfter = rebalancer.hasPendingMove(replicaId);

          // Mark as completed
          rebalancer.completePendingMove('test-request', 'completed');

          // Should no longer be pending
          const hasPendingCompleted = rebalancer.hasPendingMove(replicaId);

          rebalancer.shutdown();

          return !hasPendingBefore && hasPendingAfter && !hasPendingCompleted;
        },
      ),
      {numRuns: 10},
    );

    t.pass('hasPendingMove identifies pending moves');
  });
});
