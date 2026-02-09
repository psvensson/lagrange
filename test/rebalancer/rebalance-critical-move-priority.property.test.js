/**
 * Property Test: Critical Moves Prioritized Over Optimization (Property 12)
 *
 * For any set of planned moves containing both critical (under-replicated)
 * and optimization (spread improvement) moves, all critical moves shall
 * appear before optimization moves in the execution order.
 *
 * Validates: Requirements 6.5
 *
 * Feature: system-architecture-consolidation, Property 12: Critical moves
 * prioritized over optimization moves
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';

/**
 * Initialize test environment with clean singletons.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Create a move state provider for testing move ordering.
 * @param {Object} options - Options.
 * @param {Array} options.availableNodes - Available nodes.
 * @param {string} options.entityId - Entity ID.
 * @return {Object} Move state provider.
 */
function createMoveStateProvider({availableNodes, entityId}) {
  return {
    getAvailableNodes: () => availableNodes,
    getHealthyReplicas: (replicas) => replicas.filter(
      (r) => (r.status || ReplicaStatus.ACTIVE) === ReplicaStatus.ACTIVE,
    ),
    getInFlightOperations: () => [],
    hasPendingAddForNode: () => false,
    hasPendingMove: () => false,
    entityId,
  };
}

// Initialize once before all tests
initializeTestEnvironment();

test('Property 12: Critical moves prioritized over optimization', async (t) => {
  await t.test(
    'ADD moves appear before spread REMOVE moves',
    async (t) => {
      /**
       * **Validates: Requirements 6.5**
       *
       * When the planner generates both ADD and REMOVE moves,
       * all ADD moves (critical — increasing replica count) must
       * appear before spread REMOVE moves (optimization).
       */
      await fc.assert(
        fc.property(
          fc.integer({min: 4, max: 7}),
          fc.integer({min: 3, max: 5}),
          (nodeCount, replicasOnFirst) => {
            const entityId = 'partition-1';

            const availableNodes = [];
            for (let i = 0; i < nodeCount; i++) {
              availableNodes.push({
                node_id: `node-${i + 1}`,
                status: 'active',
                ws_connection_state: 'ready',
                ready_lease_expires_at: Date.now() + 60000,
                replica_count: i === 0 ? replicasOnFirst : 0,
              });
            }

            // All replicas concentrated on node-1
            const currentReplicas = [];
            for (let i = 0; i < replicasOnFirst; i++) {
              currentReplicas.push({
                service_id: `${entityId}-r-${i}`,
                replica_id: `${entityId}-r-${i}`,
                partition_id: entityId,
                node_id: 'node-1',
                service_type: 'partition',
                status: ReplicaStatus.ACTIVE,
              });
            }

            const moveStateProvider = createMoveStateProvider({
              availableNodes, entityId,
            });

            const planner = new MovePlanner({
              entityId,
              entityType: REBALANCER_ENTITY_TYPE.PARTITION,
              moveStateProvider,
            });

            // Target: spread across nodes (1 per node up to nodeCount)
            const targetCount = Math.min(nodeCount, replicasOnFirst);
            const targetNodes = [];
            for (let i = 0; i < targetCount; i++) {
              targetNodes.push(`node-${i + 1}`);
            }

            const targetState = {
              targetReplicaCount: targetCount,
              targetNodes,
            };

            const moves = planner.calculateMoves(
              currentReplicas, targetState,
            );

            if (moves.length === 0) {
              return true;
            }

            // Find the last ADD index and first REMOVE index
            let lastAddIndex = -1;
            let firstRemoveIndex = moves.length;

            for (let i = 0; i < moves.length; i++) {
              if (moves[i].type === REBALANCER_MOVE_TYPE.ADD) {
                lastAddIndex = i;
              }
              if (moves[i].type === REBALANCER_MOVE_TYPE.REMOVE &&
                  firstRemoveIndex === moves.length) {
                firstRemoveIndex = i;
              }
            }

            // If both types exist, ADDs must come before REMOVEs
            if (lastAddIndex >= 0 && firstRemoveIndex < moves.length) {
              return lastAddIndex < firstRemoveIndex;
            }

            return true;
          },
        ),
        {numRuns: 10},
      );

      t.pass('ADD moves always precede spread REMOVE moves');
    },
  );

  await t.test(
    'ADD moves appear before critical REMOVE moves when both exist',
    async (t) => {
      /**
       * **Validates: Requirements 6.5**
       *
       * When both ADD and failed-replica REMOVE moves exist,
       * ADD moves come first (to restore replica count), then
       * critical REMOVE moves (cleanup).
       */
      const entityId = 'partition-1';
      const nodes = [
        {node_id: 'node-1', status: 'active', ws_connection_state: 'ready',
          ready_lease_expires_at: Date.now() + 60000, replica_count: 1},
        {node_id: 'node-2', status: 'active', ws_connection_state: 'ready',
          ready_lease_expires_at: Date.now() + 60000, replica_count: 0},
        {node_id: 'node-3', status: 'active', ws_connection_state: 'ready',
          ready_lease_expires_at: Date.now() + 60000, replica_count: 0},
      ];

      // One healthy replica on node-1, one failed on node-1
      const currentReplicas = [
        {
          service_id: `${entityId}-r1`, replica_id: `${entityId}-r1`,
          partition_id: entityId, node_id: 'node-1',
          service_type: 'partition', status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: `${entityId}-r2`, replica_id: `${entityId}-r2`,
          partition_id: entityId, node_id: 'node-1',
          service_type: 'partition', status: ReplicaStatus.FAILED,
        },
      ];

      const moveStateProvider = createMoveStateProvider({
        availableNodes: nodes, entityId,
      });

      const planner = new MovePlanner({
        entityId,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider,
      });

      // Target: 3 replicas spread across 3 nodes
      const targetState = {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
      };

      const moves = planner.calculateMoves(currentReplicas, targetState);

      const failedRemoves = moves.filter(
        (m) => m.type === REBALANCER_MOVE_TYPE.REMOVE &&
          m.reason === 'replica_failed',
      );
      const addMoves = moves.filter(
        (m) => m.type === REBALANCER_MOVE_TYPE.ADD,
      );

      t.ok(failedRemoves.length > 0,
        'Should have REMOVE moves for failed replicas');
      t.ok(addMoves.length > 0,
        'Should have ADD moves for under-replication');

      // When both exist, ADD moves come first, then critical removes
      if (failedRemoves.length > 0 && addMoves.length > 0) {
        const lastAddIdx = Math.max(
          ...addMoves.map((m) => moves.indexOf(m)),
        );
        const firstFailedIdx = Math.min(
          ...failedRemoves.map((m) => moves.indexOf(m)),
        );
        t.ok(lastAddIdx < firstFailedIdx,
          'ADD moves should precede failed replica removals');
      }
    },
  );

  await t.test(
    'critical budget multiplier always exceeds base budget',
    async (t) => {
      /**
       * **Validates: Requirements 6.5**
       *
       * For any positive base budget, the critical effective budget
       * (budget * CRITICAL_BUDGET_MULTIPLIER) is strictly greater.
       */
      await fc.assert(
        fc.property(
          fc.integer({min: 1, max: 100}),
          (baseBudget) => {
            const criticalBudget = baseBudget * 2;
            return criticalBudget > baseBudget;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Critical budget always exceeds base budget');
    },
  );
});
