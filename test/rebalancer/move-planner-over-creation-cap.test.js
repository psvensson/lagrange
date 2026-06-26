/**
 * Falsifier: MovePlanner in-flight-aware over-creation cap.
 *
 * Pins the rolling-restart over-replication drain stall (gate 144654Z run3:
 * replica_operations-p1 driven to 4 voters/target 3 with an unpromotable
 * surplus learner r6, while blocked source removals never drain). A priority
 * control-plane partition whose pending-operation guard is bypassed kept
 * minting REPLACE replacements on HOPPING target nodes while a prior
 * replacement was still being created (its row had not materialized, so the
 * per-node guard did not see it and committed-row counts under-counted the
 * in-flight work). Each extra replacement pushed the partition past target and
 * dead-locked learner promotion (replica-count-limit).
 *
 * Policy under test: once in-flight creation already accounts for
 * target + 1 replicas (the single temporary replacement overshoot the
 * learner-promotion path itself permits), the planner must NOT mint another
 * add-like move for that partition. Provisioning and the FIRST replacement are
 * unaffected.
 *
 * RED before the cap (emits a 2nd REPLACE); GREEN after (no new add-like move).
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {REBALANCER_ENTITY_TYPE, REBALANCER_MOVE_TYPE} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

// A priority control-plane partition (the over-creation victim class) so the
// pending-bypass is in force and the cap applies.
const PRIORITY_PARTITION_ID = 'sql_transaction_participants-p1';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createMoveStateProvider({currentReplicas = [], inFlightOperations = []} = {}) {
  return {
    getAvailableNodes: () => [],
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica?.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => inFlightOperations,
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
}

function inFlightReplace(replicaId, targetNodeId) {
  return {
    operation_id: `op-${replicaId}-${targetNodeId}`,
    type: REBALANCER_MOVE_TYPE.REPLACE,
    partition_id: PRIORITY_PARTITION_ID,
    replica_id: replicaId, // the SOURCE being replaced
    target_node_id: targetNodeId,
    workflow_step: 'creating',
  };
}

function plannerFor(provider) {
  return new MovePlanner({
    entityId: PRIORITY_PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: provider,
  });
}

const TARGET_STATE = {
  targetReplicaCount: 3,
  targetNodes: ['node-1', 'node-2', 'node-3'],
  degraded: false,
};

test('MovePlanner in-flight-aware over-creation cap', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(resetEnv);

  await t.test(
    'defers a SECOND replacement while a prior REPLACE (hopped to another ' +
    'node) is still being created and the partition is already at target',
    async (t) => {
      // 3 active concentrated on 2 nodes (spread-unsatisfied) -> the planner
      // wants to place a replica on node-3. A prior REPLACE is already creating
      // a replacement on node-4 (a HOPPED target the per-node guard does not
      // cover), so in-flight creation already accounts for target + 1.
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      ];
      const planner = plannerFor(createMoveStateProvider({
        currentReplicas,
        inFlightOperations: [inFlightReplace('r3', 'node-4')],
      }));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      const addLike = moves.filter(
        (m) =>
          m.type === REBALANCER_MOVE_TYPE.ADD ||
          m.type === REBALANCER_MOVE_TYPE.REPLACE,
      );
      t.same(addLike, [],
        'no new ADD/REPLACE while in-flight creation already reaches target+1');
    },
  );

  await t.test(
    'still emits the FIRST replacement when nothing is in flight',
    async (t) => {
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      ];
      const planner = plannerFor(createMoveStateProvider({currentReplicas}));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      t.equal(
        moves.some((m) => m.type === REBALANCER_MOVE_TYPE.REPLACE),
        true,
        'the first replacement (no in-flight creation yet) is allowed');
    },
  );

  await t.test(
    'still provisions a genuine deficit even with one replacement in flight',
    async (t) => {
      // Only 1 active (genuine under-target). One ADD is already in flight; the
      // partition is still below target, so further provisioning is allowed
      // (deficit fill, not over-creation).
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
      ];
      const planner = plannerFor(createMoveStateProvider({
        currentReplicas,
        inFlightOperations: [{
          operation_id: 'op-add-r2',
          type: REBALANCER_MOVE_TYPE.ADD,
          partition_id: PRIORITY_PARTITION_ID,
          replica_id: 'r2',
          target_node_id: 'node-2',
          workflow_step: 'creating',
        }],
      }));

      const moves = planner.calculateMoves(currentReplicas, TARGET_STATE);

      t.equal(
        moves.some((m) => m.type === REBALANCER_MOVE_TYPE.ADD),
        true,
        'genuine deficit still provisions (active 1 + inFlightAdd 1 < target 3)');
    },
  );
});
