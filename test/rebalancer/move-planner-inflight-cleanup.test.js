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
    availableNodes = [],
    currentReplicas = [],
    inFlightOperations = [],
    globalInFlightOperations = inFlightOperations,
  } = options;
  return {
    getAvailableNodes: () => availableNodes,
    getCurrentReplicas: () => currentReplicas,
    getHealthyReplicas: (replicas) => {
      return replicas.filter((replica) =>
        replica?.status === ReplicaStatus.ACTIVE,
      );
    },
    getInFlightOperations: () => inFlightOperations,
    getGlobalTopologyBlockingInFlightOperations: () =>
      globalInFlightOperations,
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
    'keeps a pending add target inside target placement while bootstrap is still converging',
    async (t) => {
      const currentReplicas = [
        {replica_id: 'r1', node_id: 'node-1', status: ReplicaStatus.ACTIVE},
        {replica_id: 'r2', node_id: 'node-2', status: ReplicaStatus.ACTIVE},
      ];
      const availableNodes = [
        {node_id: 'node-1', status: ReplicaStatus.ACTIVE, cpu_usage_percent: 0},
        {node_id: 'node-2', status: ReplicaStatus.ACTIVE, cpu_usage_percent: 1},
        {node_id: 'node-3', status: ReplicaStatus.ACTIVE, cpu_usage_percent: 90},
        {node_id: 'node-4', status: ReplicaStatus.ACTIVE, cpu_usage_percent: 5},
      ];
      const planner = new MovePlanner({
        entityId: 'partition-1',
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({
          availableNodes,
          currentReplicas,
          inFlightOperations: [
            {
              operation_id: 'op-bootstrap-add-1',
              partition_id: 'partition-1',
              target_node_id: 'node-3',
              status: ReplicaStatus.PENDING,
            },
          ],
        }),
      });

      const targetState = await planner.calculateTargetState(currentReplicas, {
        targetReplicaCount: 3,
        replicaCount: 3,
        minReplicaCount: 3,
        maxReplicaCount: 7,
        placementConstraints: {
          spreadAcrossNodes: true,
          considerCpuLoad: true,
        },
      });

      t.same(
        targetState.targetNodes,
        ['node-1', 'node-2', 'node-3'],
        'target selection should keep the pending add node inside the canonical target cohort even when another node is currently ranked higher',
      );

      const moves = planner.calculateMoves(currentReplicas, targetState);
      t.same(
        moves,
        [],
        'planner should not create a second bootstrap add while the original add target is still transitional',
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

  await t.test(
    'priority system partitions treat cross-entity add transitions as occupied target capacity',
    async (t) => {
      const ENTITY_ID = 'replica_operations-p1';
      const TARGET_BLOCKED_NODE_ID = 'node-2';
      const TARGET_AVAILABLE_NODE_ID = 'node-3';
      const TARGET_SOURCE_NODE_ID = 'node-1';
      const OTHER_PARTITION_ID = 'control_plane_publications-p1';
      const GLOBAL_OPERATION_ID = 'op-global-target-occupancy-1';
      const GLOBAL_REPLICA_ID = 'control_plane_publications-p1-r4';

      const currentReplicas = [
        {
          replica_id: 'replica_operations-p1-r1',
          node_id: TARGET_SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: 'replica_operations-p1-r2',
          node_id: TARGET_SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: 'replica_operations-p1-r3',
          node_id: TARGET_SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const planner = new MovePlanner({
        entityId: ENTITY_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({
          availableNodes: [
            {node_id: TARGET_SOURCE_NODE_ID, status: ReplicaStatus.ACTIVE},
            {node_id: TARGET_BLOCKED_NODE_ID, status: ReplicaStatus.ACTIVE},
            {node_id: TARGET_AVAILABLE_NODE_ID, status: ReplicaStatus.ACTIVE},
          ],
          currentReplicas,
          inFlightOperations: [],
          globalInFlightOperations: [
            {
              operation_id: GLOBAL_OPERATION_ID,
              partition_id: OTHER_PARTITION_ID,
              replica_id: GLOBAL_REPLICA_ID,
              target_node_id: TARGET_BLOCKED_NODE_ID,
              status: ReplicaStatus.PENDING,
            },
          ],
        }),
      });

      const moves = planner.calculateMoves(currentReplicas, {
        targetReplicaCount: 3,
        targetNodes: [
          TARGET_SOURCE_NODE_ID,
          TARGET_BLOCKED_NODE_ID,
          TARGET_AVAILABLE_NODE_ID,
        ],
        degraded: false,
      });

      t.same(
        moves,
        [
          {
            type: REBALANCER_MOVE_TYPE.REPLACE,
            nodeId: TARGET_AVAILABLE_NODE_ID,
            sourceNodeId: TARGET_SOURCE_NODE_ID,
            replicaId: 'replica_operations-p1-r1',
            reason: MOVE_REASON.REPLACE_REPLICA,
          },
        ],
        'planner should keep the globally occupied target node reserved for the in-flight system add and only schedule the remaining spread move',
      );
    },
  );

  await t.test(
    'priority system partitions prefer unoccupied nodes when target selection encounters globally transitional system-add targets',
    async (t) => {
      const ENTITY_ID = 'replica_operations-p1';
      const SOURCE_NODE_ID = 'node-1';
      const BLOCKED_TARGET_NODE_ID = 'node-2';
      const AVAILABLE_TARGET_NODE_ID_A = 'node-3';
      const AVAILABLE_TARGET_NODE_ID_B = 'node-4';
      const OTHER_PARTITION_ID = 'control_plane_publications-p1';
      const GLOBAL_OPERATION_ID = 'op-global-target-selection-1';

      const currentReplicas = [
        {
          replica_id: 'replica_operations-p1-r1',
          node_id: SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: 'replica_operations-p1-r2',
          node_id: SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: 'replica_operations-p1-r3',
          node_id: SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const availableNodes = [
        {
          node_id: SOURCE_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          cpu_usage_percent: 0,
        },
        {
          node_id: BLOCKED_TARGET_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          cpu_usage_percent: 1,
        },
        {
          node_id: AVAILABLE_TARGET_NODE_ID_A,
          status: ReplicaStatus.ACTIVE,
          cpu_usage_percent: 2,
        },
        {
          node_id: AVAILABLE_TARGET_NODE_ID_B,
          status: ReplicaStatus.ACTIVE,
          cpu_usage_percent: 3,
        },
      ];
      const planner = new MovePlanner({
        entityId: ENTITY_ID,
        entityType: REBALANCER_ENTITY_TYPE.PARTITION,
        moveStateProvider: createMoveStateProvider({
          availableNodes,
          currentReplicas,
          inFlightOperations: [],
          globalInFlightOperations: [
            {
              operation_id: GLOBAL_OPERATION_ID,
              partition_id: OTHER_PARTITION_ID,
              target_node_id: BLOCKED_TARGET_NODE_ID,
              status: ReplicaStatus.PENDING,
            },
          ],
        }),
      });

      const targetState = await planner.calculateTargetState(currentReplicas, {
        targetReplicaCount: 3,
        replicaCount: 3,
        minReplicaCount: 3,
        maxReplicaCount: 7,
        placementConstraints: {
          spreadAcrossNodes: true,
          considerCpuLoad: true,
        },
      });

      t.same(
        targetState.targetNodes,
        [
          SOURCE_NODE_ID,
          AVAILABLE_TARGET_NODE_ID_A,
          AVAILABLE_TARGET_NODE_ID_B,
        ],
        'target selection should prefer unoccupied eligible nodes before globally transitional system-add targets',
      );

      const moves = planner.calculateMoves(currentReplicas, targetState);

      t.same(
        moves,
        [
          {
            type: REBALANCER_MOVE_TYPE.REPLACE,
            nodeId: AVAILABLE_TARGET_NODE_ID_A,
            sourceNodeId: SOURCE_NODE_ID,
            replicaId: 'replica_operations-p1-r1',
            reason: MOVE_REASON.REPLACE_REPLICA,
          },
          {
            type: REBALANCER_MOVE_TYPE.REPLACE,
            nodeId: AVAILABLE_TARGET_NODE_ID_B,
            sourceNodeId: SOURCE_NODE_ID,
            replicaId: 'replica_operations-p1-r2',
            reason: MOVE_REASON.REPLACE_REPLICA,
          },
        ],
        'planner should schedule the remaining spread moves instead of targeting the globally occupied node',
      );
    },
  );

});
