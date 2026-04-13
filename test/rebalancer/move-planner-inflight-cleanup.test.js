import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function createMoveStateProvider(options = {}) {
  const {
    currentReplicas = [],
    inFlightOperations = [],
  } = options;
  return {
    getAvailableNodes: () => [],
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) => {
      return replicas.filter((replica) =>
        replica?.status === ReplicaStatus.ACTIVE,
      );
    },
    getInFlightOperations: () => inFlightOperations,
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
}

test('MovePlanner in-flight cleanup semantics', async (t) => {
  t.beforeEach(initEnv);
  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  await t.test(
    'continues cleanup-only REMOVE planning for above-target active replicas',
    async (t) => {
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-3', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r4', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
      ];
      const planner = new MovePlanner({
        entityId: 'partition-1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({
          currentReplicas,
          inFlightOperations: [
            {
              operation_id: 'op-1',
              partition_id: 'partition-1',
              target_node_id: 'node-5',
              status: 'pending',
            },
          ],
        }),
      });

      const moves = planner.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
        degraded: false,
      });

      t.same(
        moves,
        [
          {
            type: REBALANCER_MOVE_TYPE.REMOVE,
            replicaId: 'r4',
            nodeId: 'node-4',
            reason: MOVE_REASON.NODE_NOT_IN_TARGET,
            standaloneSafe: true,
          },
        ],
        'planner should keep emitting safe cleanup for an already over-target topology',
      );
    },
  );

  await t.test(
    'does not drop an at-target topology below target while adds are blocked by in-flight work',
    async (t) => {
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r3', node_id: 'node-4', status: ReplicaStatus.ACTIVE},
      ];
      const planner = new MovePlanner({
        entityId: 'partition-1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({
          currentReplicas,
          inFlightOperations: [
            {
              operation_id: 'op-1',
              partition_id: 'partition-1',
              target_node_id: 'node-3',
              status: 'pending',
            },
          ],
        }),
      });

      const moves = planner.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: ['node-1', 'node-2', 'node-3'],
        degraded: false,
      });

      t.same(
        moves,
        [],
        'planner should not remove a misplaced active replica when it cannot also schedule the replacement add',
      );
    },
  );

});
