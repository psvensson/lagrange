import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  EntityType,
  MoveType,
  UnifiedRebalancer,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  MOVE_REASON,
  READINESS_SKIP_DETAIL,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';

const PRE_EXECUTION_HANDOFF_TEST = Object.freeze({
  NAME:
    'UnifiedRebalancer logs pre-execution handoff before executeMove skips',
  ENTITY_ID: 'nodes-p1',
  SEED_NODE_ID: 'seed-node',
  UNREADY_NODE_ID: 'node-unready',
  REPLICA_ID: 'nodes-p1-r1',
  OPERATION_ID: 'unexpected-operation',
  NODES_TABLE: 'nodes',
  READY_CONNECTION_STATE: 'ready',
  CONNECTED_STATE: 'connected',
  ACTIVE_STATUS: 'active',
  COMPLETED_STATUS: 'completed',
  ERROR_LOG_LEVEL: 'error',
  MISSING_RECORD: false,
  NO_SAFETY_ERROR: '',
  TARGET_REPLICA_COUNT: 3,
  READY_LEASE_EXTENSION_MS: 60000,
  LIMITED_MOVE_COUNT: 2,
  EXECUTABLE_MOVE_COUNT: 0,
  PRE_EXECUTE_SKIPPED_MOVE_COUNT: 2,
  READINESS_GROUP_COUNT: 2,
  BLOCKED_READINESS_GROUP_COUNT: 1,
  READY_READINESS_GROUP_COUNT: 1,
  READY_READINESS_STATE: 'ready',
  BLOCKED_READINESS_STATE: 'blocked',
  PRE_EXECUTION_SKIPS_ONLY: 'pre_execution_skips_only',
  RETURN_PRE_EXECUTION_SKIPS: 'return_pre_execution_skips',
});

function createReadyNode(nodeId) {
  return {
    node_id: nodeId,
    connection_state: PRE_EXECUTION_HANDOFF_TEST.READY_CONNECTION_STATE,
    ready_lease_expires_at:
      Date.now() + PRE_EXECUTION_HANDOFF_TEST.READY_LEASE_EXTENSION_MS,
    status: PRE_EXECUTION_HANDOFF_TEST.ACTIVE_STATUS,
  };
}

function createMockCache(nodes = []) {
  const nodeMap = new Map(nodes.map((node) => [node.node_id, node]));
  return {
    get: (tableName, key) => {
      if (tableName === PRE_EXECUTION_HANDOFF_TEST.NODES_TABLE) {
        return nodeMap.get(key);
      }
      return PRE_EXECUTION_HANDOFF_TEST.MISSING_RECORD;
    },
    filter: (tableName, predicate) => {
      if (tableName === PRE_EXECUTION_HANDOFF_TEST.NODES_TABLE) {
        return Array.from(nodeMap.values()).filter(predicate);
      }
      return [];
    },
    getAll: (tableName) => {
      if (tableName === PRE_EXECUTION_HANDOFF_TEST.NODES_TABLE) {
        return Array.from(nodeMap.values());
      }
      return [];
    },
  };
}

function createExplicitReadinessService() {
  return {
    getNodeReadinessSync(nodeId) {
      const eligible =
        nodeId !== PRE_EXECUTION_HANDOFF_TEST.UNREADY_NODE_ID;
      return {
        nodeId,
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE]: eligible,
          [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: eligible,
          [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: eligible,
        },
      };
    },
    projectNodeLiveness() {
      return {
        readyNow: true,
        leaseSemantics: {state: 'valid'},
      };
    },
  };
}

function createRebalancer({infoLogs, mockCoordinator}) {
  const rebalancer = new UnifiedRebalancer({
    entityId: PRE_EXECUTION_HANDOFF_TEST.ENTITY_ID,
    entityType: EntityType.PARTITION,
    nodeId: PRE_EXECUTION_HANDOFF_TEST.SEED_NODE_ID,
    systemTableCache: createMockCache([
      createReadyNode(PRE_EXECUTION_HANDOFF_TEST.SEED_NODE_ID),
      createReadyNode(PRE_EXECUTION_HANDOFF_TEST.UNREADY_NODE_ID),
    ]),
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({
        targetReplicaCount: PRE_EXECUTION_HANDOFF_TEST.TARGET_REPLICA_COUNT,
        minReplicaCount: PRE_EXECUTION_HANDOFF_TEST.TARGET_REPLICA_COUNT,
      }),
    },
    messageRouter: {
      getConnectionState: () => PRE_EXECUTION_HANDOFF_TEST.CONNECTED_STATE,
      deliver: async () => ({
        acknowledged: true,
        status: PRE_EXECUTION_HANDOFF_TEST.COMPLETED_STATUS,
      }),
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    rebalanceCoordinator: mockCoordinator,
    controlPlaneReadinessService: createExplicitReadinessService(),
  });

  rebalancer.initialize();
  rebalancer.logger = {
    info: (message, fields) => infoLogs.push({message, ...fields}),
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
  rebalancer.isNodeReady = async (nodeId) =>
    nodeId !== PRE_EXECUTION_HANDOFF_TEST.UNREADY_NODE_ID;
  return rebalancer;
}

test(PRE_EXECUTION_HANDOFF_TEST.NAME, async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({
    level: PRE_EXECUTION_HANDOFF_TEST.ERROR_LOG_LEVEL,
  });

  let createdOperations = PRE_EXECUTION_HANDOFF_TEST.EXECUTABLE_MOVE_COUNT;
  const infoLogs = [];
  const mockCoordinator = {
    getMoveSafetyError: () => PRE_EXECUTION_HANDOFF_TEST.NO_SAFETY_ERROR,
    createOperation: async () => {
      createdOperations++;
      return {operationId: PRE_EXECUTION_HANDOFF_TEST.OPERATION_ID};
    },
    getStats: () => ({
      operationsCreated: createdOperations,
      operationsCompleted: 0,
      operationsFailed: 0,
      operationsTimedOut: 0,
      inFlightOperations: 0,
      totalOperations: createdOperations,
    }),
  };
  const rebalancer = createRebalancer({infoLogs, mockCoordinator});

  try {
    const results = await rebalancer.executeRebalancingMoves([
      {
        type: MoveType.ADD,
        nodeId: PRE_EXECUTION_HANDOFF_TEST.UNREADY_NODE_ID,
        reason: MOVE_REASON.INCREASE_REPLICA_COUNT,
      },
      {
        type: MoveType.REMOVE,
        nodeId: PRE_EXECUTION_HANDOFF_TEST.SEED_NODE_ID,
        replicaId: PRE_EXECUTION_HANDOFF_TEST.REPLICA_ID,
        reason: MOVE_REASON.SPREAD_REPLICAS,
      },
    ], {
      plannedMoveCount: PRE_EXECUTION_HANDOFF_TEST.LIMITED_MOVE_COUNT,
      moveLimit: PRE_EXECUTION_HANDOFF_TEST.LIMITED_MOVE_COUNT,
    });

    const handoffLog = infoLogs.find((entry) =>
      entry.message === REBALANCER_LOG_MSG.PRE_EXECUTION_HANDOFF,
    );
    if (!handoffLog) {
      t.fail(PRE_EXECUTION_HANDOFF_TEST.NAME);
      return;
    }

    const unreadyGroup = handoffLog.readinessGroups.find((group) =>
      group.nodeId === PRE_EXECUTION_HANDOFF_TEST.UNREADY_NODE_ID,
    );
    const seedGroup = handoffLog.readinessGroups.find((group) =>
      group.nodeId === PRE_EXECUTION_HANDOFF_TEST.SEED_NODE_ID,
    );

    t.equal(
      handoffLog.moveLimit,
      PRE_EXECUTION_HANDOFF_TEST.LIMITED_MOVE_COUNT,
    );
    t.equal(
      handoffLog.limitedMoveCount,
      PRE_EXECUTION_HANDOFF_TEST.LIMITED_MOVE_COUNT,
    );
    t.equal(
      handoffLog.executableMoveCount,
      PRE_EXECUTION_HANDOFF_TEST.EXECUTABLE_MOVE_COUNT,
    );
    t.equal(
      handoffLog.preExecuteSkippedMoveCount,
      PRE_EXECUTION_HANDOFF_TEST.PRE_EXECUTE_SKIPPED_MOVE_COUNT,
    );
    t.equal(
      handoffLog.readinessGroupCount,
      PRE_EXECUTION_HANDOFF_TEST.READINESS_GROUP_COUNT,
    );
    t.equal(
      handoffLog.blockedReadinessGroupCount,
      PRE_EXECUTION_HANDOFF_TEST.BLOCKED_READINESS_GROUP_COUNT,
    );
    t.equal(
      handoffLog.readyReadinessGroupCount,
      PRE_EXECUTION_HANDOFF_TEST.READY_READINESS_GROUP_COUNT,
    );
    t.same(
      handoffLog.preExecuteSkipReasons,
      [
        REBALANCER_SKIP_REASON.AWAITING_READY_ADD_CAPACITY,
        REBALANCER_SKIP_REASON.NODE_NOT_READY,
      ],
    );
    t.equal(
      handoffLog.preExecutionHandoffState,
      PRE_EXECUTION_HANDOFF_TEST.PRE_EXECUTION_SKIPS_ONLY,
    );
    t.equal(
      handoffLog.preExecuteReturnState,
      PRE_EXECUTION_HANDOFF_TEST.RETURN_PRE_EXECUTION_SKIPS,
    );
    t.equal(
      unreadyGroup?.readinessState,
      PRE_EXECUTION_HANDOFF_TEST.BLOCKED_READINESS_STATE,
    );
    t.equal(
      unreadyGroup?.skipDetail,
      READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE,
    );
    t.equal(
      seedGroup?.readinessState,
      PRE_EXECUTION_HANDOFF_TEST.READY_READINESS_STATE,
    );
    t.equal(createdOperations, PRE_EXECUTION_HANDOFF_TEST.EXECUTABLE_MOVE_COUNT);
    t.equal(results.length, PRE_EXECUTION_HANDOFF_TEST.LIMITED_MOVE_COUNT);
  } finally {
    rebalancer.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
