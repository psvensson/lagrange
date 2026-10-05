// A create that fails terminally AFTER its target was admitted as a voter
// (the ack-loss wedge, F3 (d)): the target's SYNCING row is durable, the
// leader admitted it on that row, its port is closed and its FAILED write may
// never land. The existing owner of failed-create target cleanup - the
// planner's FAILED_REPLICA cure, fed by the terminal failed create targets of
// the rebalancer's replica state - must cover an ADD as it covers a REPLACE,
// so the closed voter is removed (REMOVE -> REMOVING -> the row-driven
// RemoveNode) instead of leaving a group leaderless with it in its ConfState.

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {UnifiedRebalancerReplicaState} from
  '../../src/rebalancer/unified-rebalancer-replica-state.js';
import {
  MOVE_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';

const PARTITION_ID = 'orders-p1';
const TARGET_ID = 'orders-p1-r4';
const TARGET_NODE = 'node-4';

function operationRow(type, status) {
  return {
    operation_id: `op-${type}-${status}`,
    type,
    partition_id: PARTITION_ID,
    replica_id: TARGET_ID,
    target_node_id: TARGET_NODE,
    status,
    workflow_step: status === ReplicaStatus.FAILED ?
      WORKFLOW_STEP.FAILED : WORKFLOW_STEP.SYNCING,
    created_at: 1,
    updated_at: 1,
    entity_type: REBALANCER_ENTITY_TYPE.PARTITION,
    entity_id: PARTITION_ID,
  };
}

// The real terminal-target read over a replica_operations projection.
function terminalFailedTargets(operations) {
  const host = Object.create(UnifiedRebalancerReplicaState.prototype);
  host.entityId = PARTITION_ID;
  host.entityType = REBALANCER_ENTITY_TYPE.PARTITION;
  host.nowFn = () => 2;
  host.systemTableCache = {
    filter: (_table, predicate) => operations.filter(predicate),
  };
  return host.getTerminalFailedReplaceTargetReplicaIds();
}

test('a terminally failed ADD leaves no admitted-but-closed target', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  for (const type of [OperationType.ADD, OperationType.REPLACE]) {
    await t.test(`a FAILED ${type} names its target for cleanup`, async (t) => {
      t.same([...terminalFailedTargets(
        [operationRow(type, ReplicaStatus.FAILED)])], [TARGET_ID]);
    });
  }

  await t.test('an in-flight ADD does not', async (t) => {
    t.same([...terminalFailedTargets(
      [operationRow(OperationType.ADD, ReplicaStatus.SYNCING)])], []);
  });

  await t.test('the planner removes the SYNCING target of a FAILED ADD',
    async (t) => {
      const currentReplicas = ['node-1', 'node-2', 'node-3'].map(
        (nodeId, index) => ({replica_id: `orders-p1-r${index + 1}`,
          node_id: nodeId, status: ReplicaStatus.ACTIVE}));
      currentReplicas.push({replica_id: TARGET_ID, node_id: TARGET_NODE,
        status: ReplicaStatus.SYNCING});
      const targets = terminalFailedTargets(
        [operationRow(OperationType.ADD, ReplicaStatus.FAILED)]);
      const planner = new MovePlanner({
        entityId: PARTITION_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: {
          getAvailableNodes: () => [],
          getCurrentReplicas: () => currentReplicas,
          getHealthyReplicas: (replicas) => replicas.filter((replica) =>
            replica.status === ReplicaStatus.ACTIVE),
          getInFlightOperations: () => [],
          getGlobalTopologyBlockingInFlightOperations: () => [],
          getTerminalFailedReplaceTargetReplicaIds: () => targets,
          hasPendingMove: () => false,
          hasPendingAddForNode: () => false,
        },
      });
      const moves = planner.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
        degraded: false,
      });
      t.same(moves, [{type: REBALANCER_MOVE_TYPE.REMOVE, replicaId: TARGET_ID,
        nodeId: TARGET_NODE, reason: MOVE_REASON.REPLICA_FAILED}]);
    });
});
