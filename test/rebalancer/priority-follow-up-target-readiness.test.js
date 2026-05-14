import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  EntityType,
  MoveType,
  NodeStatus,
  ReplicaStatus,
  TriggerType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createMockCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const TEST_NODE_ID_A = 'node-priority-a';
const TEST_NODE_ID_B = 'node-priority-b';
const TEST_NODE_ID_C = 'node-priority-c';
const TEST_RECOVERY_ONLY_NODE_ID = 'node-priority-d';
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_SUPPORTING_PARTITION_ID = 'replica_operations-p1';
const TEST_REPLICA_ID_A = 'sql_write_operations-p1-r1';
const TEST_REPLICA_ID_B = 'sql_write_operations-p1-r2';
const TEST_REPLICA_ID_C = 'sql_write_operations-p1-r3';
const TEST_TABLE_ID = SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS;
const TEST_SERVICE_TYPE = EntityType.PARTITION;
const TEST_PARTITION_SERVICE_TYPE = 'partition';
const TEST_ADDRESS_PREFIX = 'local/partition/';
const TEST_RAFT_ROLE_VOTER = 'voter';
const TEST_TARGET_REPLICA_COUNT = 3;
const TEST_NO_IN_FLIGHT_OPERATIONS = 0;
const TEST_READY_LEASE_EXTENSION_MS = 60000;
const TEST_EXPIRED_READY_LEASE_OFFSET_MS = -1000;
const TEST_CREATED_OPERATION_ID = 'op-priority-follow-up-ready-defer';
const TEST_PENDING_TARGET_OPERATION_ID = 'op-priority-follow-up-pending';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_NODE_ID_A},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createNodeRow(nodeId, options = {}) {
  const readyLeaseExpiresAt = Object.hasOwn(options, 'readyLeaseExpiresAt') ?
    options.readyLeaseExpiresAt :
    Date.now() + TEST_READY_LEASE_EXTENSION_MS;
  return {
    node_id: nodeId,
    status: NodeStatus.ACTIVE,
    connection_state: 'ready',
    ready_lease_expires_at: readyLeaseExpiresAt,
  };
}

function createReplicaRow(replicaId, nodeId) {
  return {
    service_id: replicaId,
    service_type: TEST_PARTITION_SERVICE_TYPE,
    node_id: nodeId,
    partition_id: TEST_PARTITION_ID,
    replica_id: replicaId,
    address: TEST_ADDRESS_PREFIX + replicaId,
    raft_role: TEST_RAFT_ROLE_VOTER,
    status: ReplicaStatus.ACTIVE,
  };
}

function createNodeReadiness(nodeId, options = {}) {
  const repairEligible = options.repairEligible !== false;
  const serveEligible = options.serveEligible !== false;
  const recoveryEligible = options.recoveryEligible !== false;
  return {
    nodeId,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION
        .METADATA_PUBLICATION_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: repairEligible,
      [CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE]: recoveryEligible,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: serveEligible,
    },
  };
}

function buildCurrentPriorityDecisionSnapshot() {
  return Object.freeze({
    planningSnapshot: Object.freeze({}),
    decisionSnapshot: Object.freeze({
      partitionId: TEST_PARTITION_ID,
      semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      progress: Object.freeze({
        nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
      }),
      admission: Object.freeze({
        effectiveEligibleNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
          TEST_RECOVERY_ONLY_NODE_ID,
        ]),
      }),
      publication: Object.freeze({
        recoveryActiveNodeIds: Object.freeze([
          TEST_NODE_ID_A,
          TEST_NODE_ID_B,
          TEST_NODE_ID_C,
          TEST_RECOVERY_ONLY_NODE_ID,
        ]),
      }),
    }),
  });
}

test(
  'UnifiedRebalancer waits instead of creating priority follow-up for a ' +
    'locally lease-incomplete target',
  async (t) => {
    initializeTestEnvironment();

    const expiredReadyLeaseExpiresAt =
      Date.now() + TEST_EXPIRED_READY_LEASE_OFFSET_MS;
    const systemTableCache = createMockCache({
      nodes: [
        createNodeRow(TEST_NODE_ID_A),
        createNodeRow(TEST_NODE_ID_B, {
          readyLeaseExpiresAt: expiredReadyLeaseExpiresAt,
        }),
      ],
      services: [
        createReplicaRow(TEST_REPLICA_ID_A, TEST_NODE_ID_A),
      ],
      partitions: [{
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      }],
    });
    const controlPlaneReadinessService =
      createMockControlPlaneReadinessService({
        systemTableCache,
        readinessByNodeId: {
          [TEST_NODE_ID_A]: createNodeReadiness(TEST_NODE_ID_A),
          [TEST_NODE_ID_B]: createNodeReadiness(TEST_NODE_ID_B),
        },
      });
    const createdOperations = [];
    const rebalanceCoordinator = {
      ...createMockCoordinator(),
      createOperation: async (move) => {
        createdOperations.push(move);
        return {
          operationId: TEST_CREATED_OPERATION_ID,
          type: move.type,
          partitionId: move.partitionId,
          targetNodeId: move.nodeId,
          replicaId: move.replicaId,
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.PENDING,
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: TEST_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_ID_A,
      systemTableCache,
      rebalanceCoordinator,
      controlPlaneReadinessService,
    });

    rebalancer.initialize();
    rebalancer.controlPlaneReadinessService = controlPlaneReadinessService;
    rebalancer.rebalanceCoordinator.controlPlaneReadinessService =
      controlPlaneReadinessService;
    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.evaluateState = async () => true;
    rebalancer.getConfiguredRebalanceBudget = async () =>
      TEST_TARGET_REPLICA_COUNT;
    rebalancer.getGlobalInFlightOperationCount = async () =>
      TEST_NO_IN_FLIGHT_OPERATIONS;
    rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot =
      async () =>
        Object.freeze({
          planningSnapshot: Object.freeze({}),
          decisionSnapshot: Object.freeze({
            partitionId: TEST_PARTITION_ID,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            progress: Object.freeze({
              nextRequiredAction:
                PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                  .CREATE_RECOVERY_OPERATION,
            }),
            admission: Object.freeze({
              effectiveEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
              ]),
            }),
            publication: Object.freeze({
              recoveryActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
              ]),
            }),
          }),
        });
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
      targetNodes: [
        TEST_NODE_ID_A,
        TEST_NODE_ID_B,
      ],
    });
    rebalancer.movePlanner.calculateMoves = () => [];
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

    try {
      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
          placementConstraints: {
            spreadAcrossNodes: true,
          },
        },
      );

      t.equal(
        createdOperations.length,
        0,
        'known lease-incomplete target should not create a handoff operation',
      );
      t.equal(
        result.moves.length,
        0,
        'rebalance should wait when every follow-up target is locally not ready',
      );
    } finally {
      rebalancer.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'UnifiedRebalancer skips locally lease-incomplete priority follow-up ' +
    'targets while preserving ready alternatives',
  async (t) => {
    initializeTestEnvironment();

    const expiredReadyLeaseExpiresAt =
      Date.now() + TEST_EXPIRED_READY_LEASE_OFFSET_MS;
    const systemTableCache = createMockCache({
      nodes: [
        createNodeRow(TEST_NODE_ID_A),
        createNodeRow(TEST_NODE_ID_B, {
          readyLeaseExpiresAt: expiredReadyLeaseExpiresAt,
        }),
        createNodeRow(TEST_NODE_ID_C),
      ],
      services: [
        createReplicaRow(TEST_REPLICA_ID_A, TEST_NODE_ID_A),
      ],
      partitions: [{
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      }],
    });
    const controlPlaneReadinessService =
      createMockControlPlaneReadinessService({
        systemTableCache,
        readinessByNodeId: {
          [TEST_NODE_ID_A]: createNodeReadiness(TEST_NODE_ID_A),
          [TEST_NODE_ID_B]: createNodeReadiness(TEST_NODE_ID_B),
          [TEST_NODE_ID_C]: createNodeReadiness(TEST_NODE_ID_C),
        },
      });
    const createdOperations = [];
    const rebalanceCoordinator = {
      ...createMockCoordinator(),
      createOperation: async (move) => {
        createdOperations.push(move);
        return {
          operationId: TEST_CREATED_OPERATION_ID,
          type: move.type,
          partitionId: move.partitionId,
          targetNodeId: move.nodeId,
          replicaId: move.replicaId,
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.PENDING,
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: TEST_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_ID_A,
      systemTableCache,
      rebalanceCoordinator,
      controlPlaneReadinessService,
    });

    rebalancer.initialize();
    rebalancer.controlPlaneReadinessService = controlPlaneReadinessService;
    rebalancer.rebalanceCoordinator.controlPlaneReadinessService =
      controlPlaneReadinessService;
    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.evaluateState = async () => true;
    rebalancer.getConfiguredRebalanceBudget = async () =>
      TEST_TARGET_REPLICA_COUNT;
    rebalancer.getGlobalInFlightOperationCount = async () =>
      TEST_NO_IN_FLIGHT_OPERATIONS;
    rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot =
      async () =>
        Object.freeze({
          planningSnapshot: Object.freeze({}),
          decisionSnapshot: Object.freeze({
            partitionId: TEST_PARTITION_ID,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            progress: Object.freeze({
              nextRequiredAction:
                PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                  .CREATE_RECOVERY_OPERATION,
            }),
            admission: Object.freeze({
              effectiveEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
            publication: Object.freeze({
              recoveryActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
          }),
        });
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
      targetNodes: [
        TEST_NODE_ID_A,
        TEST_NODE_ID_B,
        TEST_NODE_ID_C,
      ],
    });
    rebalancer.movePlanner.calculateMoves = () => [];
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

    try {
      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
          placementConstraints: {
            spreadAcrossNodes: true,
          },
        },
      );

      t.equal(
        createdOperations.length,
        1,
        'ready alternative target should still create a handoff operation',
      );
      t.equal(
        createdOperations[0]?.nodeId,
        TEST_NODE_ID_C,
        'direct follow-up should bypass the lease-incomplete target',
      );
      t.equal(
        result.moves[0]?.success,
        true,
        'rebalance should schedule the follow-up on the ready alternative',
      );
    } finally {
      rebalancer.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'UnifiedRebalancer preserves deferred target readiness for planner-created ' +
    'priority follow-up moves',
  async (t) => {
    initializeTestEnvironment();

    const systemTableCache = createMockCache({
      nodes: [
        createNodeRow(TEST_NODE_ID_A),
        createNodeRow(TEST_NODE_ID_B),
        createNodeRow(TEST_NODE_ID_C),
        createNodeRow(TEST_RECOVERY_ONLY_NODE_ID),
      ],
      services: [
        createReplicaRow(TEST_REPLICA_ID_A, TEST_NODE_ID_A),
        createReplicaRow(TEST_REPLICA_ID_B, TEST_NODE_ID_B),
        createReplicaRow(TEST_REPLICA_ID_C, TEST_NODE_ID_C),
      ],
      partitions: [{
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      }],
    });
    const controlPlaneReadinessService =
      createMockControlPlaneReadinessService({
        systemTableCache,
        readinessByNodeId: {
          [TEST_NODE_ID_A]: createNodeReadiness(TEST_NODE_ID_A),
          [TEST_NODE_ID_B]: createNodeReadiness(TEST_NODE_ID_B),
          [TEST_NODE_ID_C]: createNodeReadiness(TEST_NODE_ID_C),
          [TEST_RECOVERY_ONLY_NODE_ID]: createNodeReadiness(
            TEST_RECOVERY_ONLY_NODE_ID,
            {
              repairEligible: false,
              recoveryEligible: false,
              serveEligible: false,
            },
          ),
        },
      });
    const createdOperations = [];
    const rebalanceCoordinator = {
      ...createMockCoordinator(),
      createOperation: async (move) => {
        createdOperations.push(move);
        return {
          operationId: TEST_CREATED_OPERATION_ID,
          type: move.type,
          partitionId: move.partitionId,
          targetNodeId: move.nodeId,
          replicaId: move.replicaId,
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.PENDING,
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: TEST_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_ID_A,
      systemTableCache,
      rebalanceCoordinator,
      controlPlaneReadinessService,
    });

    rebalancer.initialize();
    rebalancer.controlPlaneReadinessService = controlPlaneReadinessService;
    rebalancer.rebalanceCoordinator.controlPlaneReadinessService =
      controlPlaneReadinessService;
    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () =>
      TEST_TARGET_REPLICA_COUNT;
    rebalancer.getGlobalInFlightOperationCount = async () =>
      TEST_NO_IN_FLIGHT_OPERATIONS;
    rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot = async () =>
      buildCurrentPriorityDecisionSnapshot();
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
      targetNodes: [
        TEST_NODE_ID_A,
        TEST_NODE_ID_B,
        TEST_NODE_ID_C,
      ],
    });
    rebalancer.movePlanner.calculateMoves = () => ([
      {
        type: MoveType.REPLACE,
        nodeId: TEST_RECOVERY_ONLY_NODE_ID,
        sourceNodeId: TEST_NODE_ID_A,
        replicaId: TEST_REPLICA_ID_A,
        reason: MOVE_REASON.REPLACE_REPLICA,
      },
    ]);
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

    try {
      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
          placementConstraints: {
            spreadAcrossNodes: true,
          },
        },
      );

      t.equal(
        createdOperations.length,
        1,
        'planner-created current-entity follow-up move should still be scheduled through the coordinator',
      );
      t.equal(
        createdOperations[0]?.nodeId,
        TEST_RECOVERY_ONLY_NODE_ID,
        'scheduled follow-up should keep the recovery-only target node',
      );
      t.equal(
        createdOperations[0]?.partitionId,
        TEST_PARTITION_ID,
        'raw planner-created follow-up should resolve to the current priority partition',
      );
      t.equal(
        result.moves[0]?.success,
        true,
        'pre-execution should not drop the planner-created follow-up on repair readiness',
      );
    } finally {
      rebalancer.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'UnifiedRebalancer keeps priority follow-up re-entry on feasible targets ' +
    'after routing-not-ready candidate rejection',
  async (t) => {
    initializeTestEnvironment();

    const systemTableCache = createMockCache({
      nodes: [
        createNodeRow(TEST_NODE_ID_A),
        createNodeRow(TEST_NODE_ID_B),
        createNodeRow(TEST_NODE_ID_C),
      ],
      services: [
        createReplicaRow(TEST_REPLICA_ID_A, TEST_NODE_ID_A),
      ],
      partitions: [{
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      }],
    });
    const controlPlaneReadinessService =
      createMockControlPlaneReadinessService({
        systemTableCache,
        readinessByNodeId: {
          [TEST_NODE_ID_A]: createNodeReadiness(TEST_NODE_ID_A),
          [TEST_NODE_ID_B]: createNodeReadiness(TEST_NODE_ID_B),
          [TEST_NODE_ID_C]: createNodeReadiness(TEST_NODE_ID_C),
        },
      });
    const createdOperations = [];
    const rebalanceCoordinator = {
      ...createMockCoordinator(),
      createOperation: async (move) => {
        createdOperations.push(move);
        return {
          operationId: TEST_CREATED_OPERATION_ID,
          type: move.type,
          partitionId: move.partitionId,
          targetNodeId: move.nodeId,
          replicaId: move.replicaId,
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.PENDING,
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: TEST_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_ID_A,
      systemTableCache,
      rebalanceCoordinator,
      controlPlaneReadinessService,
    });

    rebalancer.initialize();
    rebalancer.controlPlaneReadinessService = controlPlaneReadinessService;
    rebalancer.rebalanceCoordinator.controlPlaneReadinessService =
      controlPlaneReadinessService;
    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.evaluateState = async () => true;
    rebalancer.getConfiguredRebalanceBudget = async () =>
      TEST_TARGET_REPLICA_COUNT;
    rebalancer.getGlobalInFlightOperationCount = async () =>
      TEST_NO_IN_FLIGHT_OPERATIONS;
    rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot =
      async () =>
        Object.freeze({
          planningSnapshot: Object.freeze({}),
          decisionSnapshot: Object.freeze({
            partitionId: TEST_PARTITION_ID,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            progress: Object.freeze({
              nextRequiredAction:
                PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                  .CREATE_RECOVERY_OPERATION,
            }),
            admission: Object.freeze({
              effectiveEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
            publication: Object.freeze({
              recoveryActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
          }),
        });
    rebalancer.getTopologyBlockingInFlightOperations = () => ([
      Object.freeze({
        operation_id: TEST_PENDING_TARGET_OPERATION_ID,
        type: 'ADD',
        target_node_id: TEST_NODE_ID_B,
      }),
    ]);
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
      targetNodes: [
        TEST_NODE_ID_A,
        TEST_NODE_ID_B,
      ],
    });
    rebalancer.movePlanner.calculateMoves = () => [];
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

    try {
      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
          placementConstraints: {
            spreadAcrossNodes: true,
          },
        },
      );

      t.equal(
        createdOperations.length,
        0,
        'follow-up should not fall back to a routing-rejected target outside the feasible target set',
      );
      t.equal(
        result.moves.length,
        0,
        'rebalance should keep waiting when every feasible recovery target is already occupied or in flight',
      );
    } finally {
      rebalancer.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'UnifiedRebalancer ignores supporting other-partition target reservations ' +
    'for direct priority follow-up creation',
  async (t) => {
    initializeTestEnvironment();

    const systemTableCache = createMockCache({
      nodes: [
        createNodeRow(TEST_NODE_ID_A),
        createNodeRow(TEST_NODE_ID_B),
        createNodeRow(TEST_NODE_ID_C),
      ],
      services: [
        createReplicaRow(TEST_REPLICA_ID_A, TEST_NODE_ID_A),
      ],
      partitions: [{
        partition_id: TEST_PARTITION_ID,
        table_id: TEST_TABLE_ID,
      }],
    });
    const controlPlaneReadinessService =
      createMockControlPlaneReadinessService({
        systemTableCache,
        readinessByNodeId: {
          [TEST_NODE_ID_A]: createNodeReadiness(TEST_NODE_ID_A),
          [TEST_NODE_ID_B]: createNodeReadiness(TEST_NODE_ID_B),
          [TEST_NODE_ID_C]: createNodeReadiness(TEST_NODE_ID_C),
        },
      });
    const createdOperations = [];
    const rebalanceCoordinator = {
      ...createMockCoordinator(),
      createOperation: async (move) => {
        createdOperations.push(move);
        return {
          operationId: TEST_CREATED_OPERATION_ID,
          type: move.type,
          partitionId: move.partitionId,
          targetNodeId: move.nodeId,
          replicaId: move.replicaId,
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.PENDING,
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: TEST_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_NODE_ID_A,
      systemTableCache,
      rebalanceCoordinator,
      controlPlaneReadinessService,
    });

    rebalancer.initialize();
    rebalancer.controlPlaneReadinessService = controlPlaneReadinessService;
    rebalancer.rebalanceCoordinator.controlPlaneReadinessService =
      controlPlaneReadinessService;
    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.evaluateState = async () => true;
    rebalancer.getConfiguredRebalanceBudget = async () =>
      TEST_TARGET_REPLICA_COUNT;
    rebalancer.getGlobalInFlightOperationCount = async () =>
      TEST_NO_IN_FLIGHT_OPERATIONS;
    rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot =
      async () =>
        Object.freeze({
          planningSnapshot: Object.freeze({}),
          decisionSnapshot: Object.freeze({
            partitionId: TEST_PARTITION_ID,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
            progress: Object.freeze({
              nextRequiredAction:
                PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                  .CREATE_RECOVERY_OPERATION,
            }),
            admission: Object.freeze({
              effectiveEligibleNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
            publication: Object.freeze({
              recoveryActiveNodeIds: Object.freeze([
                TEST_NODE_ID_A,
                TEST_NODE_ID_B,
                TEST_NODE_ID_C,
              ]),
            }),
          }),
        });
    rebalancer.getTopologyBlockingInFlightOperations = () => ([
      Object.freeze({
        operation_id: TEST_PENDING_TARGET_OPERATION_ID,
        partition_id: TEST_SUPPORTING_PARTITION_ID,
        type: 'ADD',
        target_node_id: TEST_NODE_ID_B,
      }),
    ]);
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
      targetNodes: [
        TEST_NODE_ID_A,
        TEST_NODE_ID_B,
      ],
    });
    rebalancer.movePlanner.calculateMoves = () => [];
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

    try {
      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
          placementConstraints: {
            spreadAcrossNodes: true,
          },
        },
      );

      t.equal(
        createdOperations.length,
        1,
        'supporting other-partition workflow progress should not suppress direct operation creation',
      );
      t.equal(
        createdOperations[0]?.nodeId,
        TEST_NODE_ID_B,
        'direct follow-up should still target the feasible recovery node',
      );
      t.equal(
        result.moves[0]?.success,
        true,
        'rebalance should schedule the direct follow-up instead of deferring it',
      );
    } finally {
      rebalancer.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);
