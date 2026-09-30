/**
 * Owner decision D1, constraint 6: while a REPLACE is active its partition
 * carries one voter more than its replica count - the source stays a
 * committed member until the group commits its removal, and the target has
 * been admitted beside it. The generic planner must not treat either side of
 * that temporary extra voter as independently removable surplus.
 *
 * The planner is the production one, reached through a real UnifiedRebalancer
 * whose move-state provider is itself: its current replicas are the
 * services rows projected by getCurrentReplicas, its in-flight operations
 * are the replica_operations rows, and the pending-move rule is the
 * rebalancer's own. The control case removes only the in-flight REPLACE, so
 * the same topology planned without it shows which replica the planner would
 * otherwise take away.
 */

import {test} from '../../src/test-helpers/tap.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {REBALANCER_MOVE_TYPE} from '../../src/rebalancer/rebalancer-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createMockCache, createTestRebalancer} from './test-helpers.js';

const PARTITION_ID = 'd1-extra-voter';
const REPLICA_COUNT = 3;
const MEMBERS = Object.freeze({
  a: ['d1-extra-voter-r1', 'node-1'],
  source: ['d1-extra-voter-r2', 'node-2'],
  b: ['d1-extra-voter-r3', 'node-3'],
  target: ['d1-extra-voter-r4', 'node-4'],
});

function serviceRow([replicaId, nodeId]) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: EntityType.PARTITION,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
  };
}

function activeReplace() {
  const [sourceReplicaId] = MEMBERS.source;
  const [targetReplicaId, targetNodeId] = MEMBERS.target;
  return {
    operation_id: 'd1-extra-voter-replace',
    type: OperationType.REPLACE,
    partition_id: PARTITION_ID,
    entity_type: EntityType.PARTITION,
    entity_id: PARTITION_ID,
    replica_id: targetReplicaId,
    sourceReplicaId,
    target_node_id: targetNodeId,
    status: ReplicaStatus.ACTIVE,
    workflow_step: WORKFLOW_STEP.ACTIVE,
    stepsHistory: [{step: WORKFLOW_STEP.PENDING, sourceReplicaId}],
  };
}

// The replicas the production planner removes from the four-voter topology
// for a placement of REPLICA_COUNT nodes.
function plannedRemoves({replicaOperations, placementNodes}) {
  const rebalancer = createTestRebalancer({
    entityId: PARTITION_ID,
    entityType: EntityType.PARTITION,
    systemTableCache: createMockCache({
      services: Object.values(MEMBERS).map(serviceRow),
      replicaOperations,
    }),
    nodeId: 'planner-node',
  });
  rebalancer.initialize();
  try {
    const currentReplicas = rebalancer.getCurrentReplicas();
    return rebalancer.movePlanner.calculateMoves(currentReplicas, {
      targetReplicaCount: REPLICA_COUNT,
      targetNodes: placementNodes,
      degraded: false,
    }).filter((move) => move.type === REBALANCER_MOVE_TYPE.REMOVE)
      .map((move) => move.replicaId);
  } finally {
    rebalancer.shutdown();
  }
}

test('D1 constraint 6: the temporary extra voter of an active REPLACE is ' +
  'not independently removable surplus', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  // Either side of the REPLACE is the one a placement of REPLICA_COUNT
  // nodes can leave out: the source's node (the placement after the
  // REPLACE) or the target's node (the placement before it).
  for (const side of ['source', 'target']) {
    const [replicaId, excludedNode] = MEMBERS[side];
    const placementNodes = Object.values(MEMBERS)
      .map(([, nodeId]) => nodeId)
      .filter((nodeId) => nodeId !== excludedNode);

    await t.test(`placement without the ${side}'s node`, async (t) => {
      const control = plannedRemoves({replicaOperations: [], placementNodes});
      t.ok(control.includes(replicaId),
        'control: with no REPLACE in flight the planner removes the ' +
          `${side} as surplus (${JSON.stringify(control)})`);

      const whileActive = plannedRemoves({
        replicaOperations: [activeReplace()],
        placementNodes,
      });
      t.same(whileActive, [],
        'while the REPLACE is active the planner removes no replica of ' +
          'the four-voter topology');
    });
  }
});
