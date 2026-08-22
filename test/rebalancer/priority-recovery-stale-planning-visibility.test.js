import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  createMockControlPlaneReadinessService,
  createMockCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const TEST_OWNER_NODE_ID = 'node-priority-owner';
const TEST_SOURCE_NODE_ID = 'node-priority-source';
const TEST_TARGET_NODE_ID = 'node-priority-target';
const TEST_SUPPORTING_NODE_ID = 'node-priority-support';
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r1';
const TEST_CREATED_OPERATION_ID = 'op-priority-recovery-created';
const TEST_OPERATION_ID = 'op-priority-recovery-live';
const TEST_PUBLICATION_EPOCH = 4;
const TEST_BLOCKER_ELIGIBLE_NO_OPERATION =
  'eligible_but_no_operation_created';
const TEST_WAIT_FOR_OPERATION_PROGRESS =
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS;
const TEST_CREATE_RECOVERY_OPERATION =
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION;
const TEST_OPERATION_VISIBILITY_NONE =
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE;
const TEST_OPERATION_STATUS_UNAVAILABLE =
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.UNAVAILABLE;
const TEST_OPERATION_VISIBILITY_CACHE_VISIBLE = 'cache_visible';
const TEST_OPERATION_WORKFLOW_IN_FLIGHT = 'in_flight';
const TEST_NODE_STATUS_ACTIVE = 'active';
const TEST_SERVICE_TYPE_PARTITION = 'partition';
const TEST_RAFT_ROLE_FOLLOWER = 'follower';
const TEST_NOW_MS = 1780622700000;
const TEST_SYNCING_STALE_AGE_MS = 360000;
const TEST_STALE_OPERATION_UPDATED_AT_MS =
  TEST_NOW_MS - TEST_SYNCING_STALE_AGE_MS;
const TEST_ANCIENT_STALE_OPERATION_UPDATED_AT_MS =
  TEST_NOW_MS - 90000000;
const TEST_PRIORITY_RECOVERY_OPERATION_CREATION_SCOPE_CURRENT_PARTITION =
  'current_partition';
const TEST_PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
]);

function expectedPlanningGateSnapshot({required, partitionId = null}) {
  return Object.freeze({
    operationCreationRequired: required,
    operationCreationPartitionId: partitionId,
    operationCreationScope: required ?
      TEST_PRIORITY_RECOVERY_OPERATION_CREATION_SCOPE_CURRENT_PARTITION :
      null,
    ledgerSurplusDrainPlanningCapability: null,
  });
}

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_OWNER_NODE_ID},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function buildInFlightReplaceOperation() {
  return Object.freeze({
    operation_id: TEST_OPERATION_ID,
    operationId: TEST_OPERATION_ID,
    type: 'REPLACE',
    entity_type: EntityType.PARTITION,
    entity_id: TEST_PARTITION_ID,
    partition_id: TEST_PARTITION_ID,
    partitionId: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    replicaId: TEST_REPLICA_ID,
    source_node_id: TEST_SOURCE_NODE_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.SYNCING,
    workflow_step: WORKFLOW_STEP.SYNCING,
    workflowStep: WORKFLOW_STEP.SYNCING,
    steps_history: JSON.stringify([
      {step: WORKFLOW_STEP.PENDING, status: 'pending', inFlight: true},
      {step: WORKFLOW_STEP.SENDING, status: 'pending', inFlight: true},
      {step: WORKFLOW_STEP.CREATING, status: 'creating', inFlight: true},
      {step: WORKFLOW_STEP.SYNCING, status: 'syncing', inFlight: true},
    ]),
  });
}

function buildStaleInFlightReplaceOperation() {
  return Object.freeze({
    ...buildInFlightReplaceOperation(),
    updated_at: TEST_STALE_OPERATION_UPDATED_AT_MS,
    updatedAt: TEST_STALE_OPERATION_UPDATED_AT_MS,
  });
}

function buildAncientStaleInFlightReplaceOperation() {
  return Object.freeze({
    ...buildInFlightReplaceOperation(),
    updated_at: TEST_ANCIENT_STALE_OPERATION_UPDATED_AT_MS,
    updatedAt: TEST_ANCIENT_STALE_OPERATION_UPDATED_AT_MS,
  });
}

function buildStalePlanningSnapshot() {
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publishedActiveNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
      TEST_SUPPORTING_NODE_ID,
    ]),
    projectedServingNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
      TEST_SUPPORTING_NODE_ID,
    ]),
    locallyEligibleNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
      TEST_SUPPORTING_NODE_ID,
    ]),
    priorityPartitionSummary: Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount: 3,
      missingPartitionIds: Object.freeze([TEST_PARTITION_ID]),
      blockedPartitions: Object.freeze([Object.freeze({
        partitionId: TEST_PARTITION_ID,
        readyDistinctNodeCount: 2,
        requiredDistinctNodeCount: 3,
        spreadGap: 1,
      })]),
    }),
    priorityRecoveryDecisionSnapshots: Object.freeze({
      snapshots: Object.freeze([Object.freeze({
        partitionId: TEST_PARTITION_ID,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
        blockerReasons: Object.freeze([
          TEST_BLOCKER_ELIGIBLE_NO_OPERATION,
        ]),
        progress: Object.freeze({
          nextRequiredAction: TEST_CREATE_RECOVERY_OPERATION,
        }),
        planner: Object.freeze({
          readyDistinctNodeCount: 2,
          requiredDistinctNodeCount: 3,
          spreadGap: 1,
        }),
        admission: Object.freeze({
          effectiveEligibleNodeIds: Object.freeze([
            TEST_SOURCE_NODE_ID,
            TEST_TARGET_NODE_ID,
            TEST_SUPPORTING_NODE_ID,
          ]),
        }),
        publication: Object.freeze({
          recoveryActiveNodeIds: Object.freeze([
            TEST_SOURCE_NODE_ID,
            TEST_TARGET_NODE_ID,
            TEST_SUPPORTING_NODE_ID,
          ]),
        }),
      })]),
    }),
  });
}

function buildStickySatisfiedPlanningSnapshot() {
  return Object.freeze({
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    publishedActiveNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
      TEST_SUPPORTING_NODE_ID,
    ]),
    projectedServingNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
      TEST_SUPPORTING_NODE_ID,
    ]),
    locallyEligibleNodeIds: Object.freeze([
      TEST_SOURCE_NODE_ID,
      TEST_TARGET_NODE_ID,
      TEST_SUPPORTING_NODE_ID,
    ]),
    priorityPartitionSummary: Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
    }),
    priorityRecoveryDecisionSnapshots: Object.freeze({
      snapshots: Object.freeze([]),
    }),
  });
}

function buildPriorityPlacementCacheData({
  currentPartitionNodeIds,
}) {
  const spreadNodeIds = [
    TEST_SOURCE_NODE_ID,
    TEST_TARGET_NODE_ID,
    TEST_SUPPORTING_NODE_ID,
  ];
  const partitions = TEST_PRIORITY_TABLE_IDS.map((tableId) => ({
    partition_id: INITIAL_PARTITION_IDS[tableId],
    table_id: tableId,
  }));
  const services = TEST_PRIORITY_TABLE_IDS.flatMap((tableId) => {
    const partitionId = INITIAL_PARTITION_IDS[tableId];
    const nodeIds =
      partitionId === TEST_PARTITION_ID ?
        currentPartitionNodeIds :
        spreadNodeIds;
    return nodeIds.map((nodeId, index) => {
      const replicaId = `${partitionId}-fixture-r${index + 1}`;
      return {
        service_id: replicaId,
        service_type: TEST_SERVICE_TYPE_PARTITION,
        node_id: nodeId,
        partition_id: partitionId,
        replica_id: replicaId,
        address: `partition://${replicaId}`,
        raft_role: TEST_RAFT_ROLE_FOLLOWER,
        status: ReplicaStatus.ACTIVE,
      };
    });
  });
  return {
    nodes: spreadNodeIds.map((nodeId) => ({
      node_id: nodeId,
      status: TEST_NODE_STATUS_ACTIVE,
    })),
    partitions,
    services,
  };
}

function createPlanningReadinessService(planningSnapshot) {
  const readinessService = createMockControlPlaneReadinessService();
  readinessService.getPriorityRecoveryPlanningSnapshotBestEffort = async () =>
    planningSnapshot;
  readinessService.getPriorityRecoveryPlanningAnswerSync = () =>
    planningSnapshot;
  return readinessService;
}

function createRecoveryOnlyTargetPlanningReadinessService(
  planningSnapshot,
  recoveryOnlyNodeId,
) {
  const readinessService = createPlanningReadinessService(planningSnapshot);
  const getDefaultNodeReadiness =
    readinessService.getNodeReadinessSync.bind(readinessService);
  readinessService.getNodeReadinessSync = (nodeId) => {
    const readiness = getDefaultNodeReadiness(nodeId);
    if (nodeId !== recoveryOnlyNodeId) {
      return readiness;
    }
    return Object.freeze({
      ...readiness,
      dimensions: Object.freeze({
        ...readiness.dimensions,
        [CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
      }),
    });
  };
  return readinessService;
}

function createBlockedLocalServePlanningReadinessService(planningSnapshot) {
  const readinessService = createPlanningReadinessService(planningSnapshot);
  readinessService.getNodeReadinessSync = (nodeId) => Object.freeze({
    nodeId,
    dimensions: Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
        true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    }),
    reasons: Object.freeze([
      Object.freeze({
        code: CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
      }),
      Object.freeze({
        code: CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
      }),
    ]),
  });
  return readinessService;
}

function createPriorityRebalancer(options = {}) {
  const planningSnapshot = options.planningSnapshot || buildStalePlanningSnapshot();
  const readinessService =
    options.controlPlaneReadinessService ||
    createPlanningReadinessService(planningSnapshot);
  const rebalanceCoordinator =
    options.rebalanceCoordinator || createMockCoordinator();
  rebalanceCoordinator.controlPlaneReadinessService = readinessService;
  const cacheData = options.cacheData || {};
  return createTestRebalancer({
    entityId: TEST_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: TEST_OWNER_NODE_ID,
    cacheData: {
      ...cacheData,
      partitions: cacheData.partitions || [{
        partition_id: TEST_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
      }],
      replicaOperations:
        options.replicaOperations || cacheData.replicaOperations || [],
    },
    controlPlaneReadinessService: readinessService,
    rebalanceCoordinator,
    nowFn: options.nowFn,
  });
}

test(
  'UnifiedRebalancer planning gate reopens sticky published convergence from current priority placement debt',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStickySatisfiedPlanningSnapshot();
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      cacheData: buildPriorityPlacementCacheData({
        currentPartitionNodeIds: [
          TEST_SOURCE_NODE_ID,
          TEST_SOURCE_NODE_ID,
          TEST_TARGET_NODE_ID,
        ],
      }),
    });

    const currentPlanningSnapshot =
      rebalancer.buildCurrentPriorityRecoveryPlanningSnapshot(
        planningSnapshot,
      );
    const currentPartition =
      currentPlanningSnapshot.priorityPartitionSummary.blockedPartitions.find(
        (partition) => partition.partitionId === TEST_PARTITION_ID,
      );
    const planningGateSnapshot =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        TEST_PARTITION_ID,
      );

    t.equal(
      currentPartition?.spreadGap,
      1,
      'actuator planning should observe the current two-node placement instead of the monotonic satisfied publication',
    );
    t.same(
      planningGateSnapshot,
      expectedPlanningGateSnapshot({
        required: true,
        partitionId: TEST_PARTITION_ID,
      }),
      'current physical spread debt should reopen operation creation for its priority owner',
    );
  },
);

test(
  'UnifiedRebalancer current placement debt supersedes terminal history and uses a recovery-cohort target outside the collapsed ready set',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStickySatisfiedPlanningSnapshot();
    const coordinator = createMockCoordinator();
    coordinator.workflowOwner = {
      async getPriorityRecoveryDecisionSnapshotForPartitionOperations() {
        return Object.freeze({
          partitionId: TEST_PARTITION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED,
          blockerReasons: Object.freeze([]),
          observation: Object.freeze({
            workflowState: 'terminal',
            visibilityState: TEST_OPERATION_VISIBILITY_CACHE_VISIBLE,
          }),
          conditions: Object.freeze({
            latestOperationStatus: ReplicaStatus.ACTIVE,
          }),
          progress: Object.freeze({
            nextRequiredAction: TEST_WAIT_FOR_OPERATION_PROGRESS,
          }),
        });
      },
    };
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      rebalanceCoordinator: coordinator,
      controlPlaneReadinessService:
        createRecoveryOnlyTargetPlanningReadinessService(
          planningSnapshot,
          TEST_SUPPORTING_NODE_ID,
        ),
      cacheData: buildPriorityPlacementCacheData({
        currentPartitionNodeIds: [
          TEST_SOURCE_NODE_ID,
          TEST_SOURCE_NODE_ID,
          TEST_TARGET_NODE_ID,
        ],
      }),
    });

    const decision =
      await rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot();
    const move = rebalancer.buildPriorityRecoveryFollowUpMove({
      decision,
      currentReplicas: rebalancer.getCurrentReplicas(),
      targetState: {
        targetReplicaCount: 3,
        // The late formation trace had only the seed in the ordinary
        // serve-ready set even though all three publication-cohort nodes were
        // explicitly recovery eligible.
        targetNodes: [TEST_SOURCE_NODE_ID],
      },
    });

    t.equal(
      decision?.decisionSnapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      'a terminal historical operation must not hide newer current placement debt',
    );
    t.equal(
      decision?.decisionSnapshot?.planner?.spreadGap,
      1,
      'the selected current decision should retain the physical spread gap',
    );
    t.equal(
      move.type,
      MoveType.REPLACE,
      'the current at-count duplicate placement should create a replacement cure',
    );
    t.equal(
      move.nodeId,
      TEST_SUPPORTING_NODE_ID,
      'the cure may use a recovery-cohort node outside the collapsed ordinary target set',
    );
  },
);

test(
  'UnifiedRebalancer current actuator overlay keeps genuinely spread priority placement converged',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStickySatisfiedPlanningSnapshot();
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      cacheData: buildPriorityPlacementCacheData({
        currentPartitionNodeIds: [
          TEST_SOURCE_NODE_ID,
          TEST_TARGET_NODE_ID,
          TEST_SUPPORTING_NODE_ID,
        ],
      }),
    });

    const planningGateSnapshot =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        TEST_PARTITION_ID,
      );

    t.same(
      planningGateSnapshot,
      expectedPlanningGateSnapshot({required: false}),
      'current actuals should not re-mint recovery work once every priority partition is physically spread',
    );
  },
);

test(
  'UnifiedRebalancer current priority follow-up snapshot prefers the coordinator decision over stale planning reconstruction',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStalePlanningSnapshot();
    const coordinator = createMockCoordinator();
    coordinator.workflowOwner = {
      async getPriorityRecoveryDecisionSnapshotForPartitionOperations() {
        return Object.freeze({
          partitionId: TEST_PARTITION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
          blockerReasons: Object.freeze([]),
          observation: Object.freeze({
            workflowState: TEST_OPERATION_WORKFLOW_IN_FLIGHT,
            visibilityState: TEST_OPERATION_VISIBILITY_CACHE_VISIBLE,
          }),
          conditions: Object.freeze({
            latestOperationStatus: ReplicaStatus.SYNCING,
          }),
          progress: Object.freeze({
            nextRequiredAction: TEST_WAIT_FOR_OPERATION_PROGRESS,
          }),
        });
      },
    };
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      replicaOperations: [buildInFlightReplaceOperation()],
      rebalanceCoordinator: coordinator,
    });

    const decision =
      await rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot();

    t.equal(
      decision?.decisionSnapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      'the async follow-up reader should expose the coordinator-owned workflow-progress state instead of the stale planning-only needs_operation witness',
    );
    t.equal(
      decision?.decisionSnapshot?.progress?.nextRequiredAction,
      TEST_WAIT_FOR_OPERATION_PROGRESS,
      'the async follow-up reader should route the successor boundary to workflow progress',
    );
  },
);

test(
  'UnifiedRebalancer current priority follow-up snapshot keeps planning operation creation when coordinator visibility has no operation',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStalePlanningSnapshot();
    const coordinator = createMockCoordinator();
    coordinator.workflowOwner = {
      async getPriorityRecoveryDecisionSnapshotForPartitionOperations() {
        return Object.freeze({
          partitionId: TEST_PARTITION_ID,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
          blockerReasons: Object.freeze([]),
          observation: Object.freeze({
            workflowState: TEST_OPERATION_VISIBILITY_NONE,
            visibilityState: TEST_OPERATION_VISIBILITY_NONE,
          }),
          conditions: Object.freeze({
            latestOperationStatus: TEST_OPERATION_STATUS_UNAVAILABLE,
          }),
          progress: Object.freeze({
            nextRequiredAction: TEST_WAIT_FOR_OPERATION_PROGRESS,
          }),
        });
      },
    };
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      rebalanceCoordinator: coordinator,
    });

    const decision =
      await rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot();

    t.equal(
      decision?.decisionSnapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
      'missing authoritative operation visibility should let planning re-enter the operation-creation lane',
    );
    t.equal(
      decision?.decisionSnapshot?.progress?.nextRequiredAction,
      TEST_CREATE_RECOVERY_OPERATION,
      'the current priority owner should preserve the create recovery operation action',
    );
    t.equal(
      rebalancer.isPriorityRecoveryFollowUpOperationRequired(
        decision?.decisionSnapshot,
      ),
      true,
      'the selected follow-up decision should be actionable for operation scheduling',
    );
  },
);

test(
  'UnifiedRebalancer checkRebalance schedules recovery work when coordinator visibility has no operation',
  async (t) => {
    initializeTestEnvironment();

    const createdOperations = [];
    const planningSnapshot = buildStalePlanningSnapshot();
    const coordinator = createMockCoordinator();
    coordinator.workflowOwner = {
      async getPriorityRecoveryDecisionSnapshotForPartitionOperations() {
        return Object.freeze({
          partitionId: TEST_PARTITION_ID,
          semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
          blockerReasons: Object.freeze([]),
          observation: Object.freeze({
            workflowState: TEST_OPERATION_VISIBILITY_NONE,
            visibilityState: TEST_OPERATION_VISIBILITY_NONE,
          }),
          conditions: Object.freeze({
            latestOperationStatus: TEST_OPERATION_STATUS_UNAVAILABLE,
          }),
          progress: Object.freeze({
            nextRequiredAction: TEST_WAIT_FOR_OPERATION_PROGRESS,
          }),
        });
      },
    };
    coordinator.createOperation = async (operationRequest) => {
      createdOperations.push(operationRequest);
      return {
        operationId: TEST_CREATED_OPERATION_ID,
        replicaId: operationRequest.replicaId,
        targetNodeId: operationRequest.nodeId,
      };
    };
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      rebalanceCoordinator: coordinator,
      cacheData: {
        nodes: [
          {node_id: TEST_SOURCE_NODE_ID, status: TEST_NODE_STATUS_ACTIVE},
          {node_id: TEST_TARGET_NODE_ID, status: TEST_NODE_STATUS_ACTIVE},
          {node_id: TEST_SUPPORTING_NODE_ID, status: TEST_NODE_STATUS_ACTIVE},
        ],
        services: [{
          service_id: TEST_REPLICA_ID,
          service_type: TEST_SERVICE_TYPE_PARTITION,
          node_id: TEST_SOURCE_NODE_ID,
          partition_id: TEST_PARTITION_ID,
          replica_id: TEST_REPLICA_ID,
          raft_role: TEST_RAFT_ROLE_FOLLOWER,
          status: ReplicaStatus.ACTIVE,
        }],
        partitions: [{
          partition_id: TEST_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
        }],
      },
    });

    rebalancer.initialize();
    rebalancer.isLeader = true;
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.getCriticalSystemTopologySettlingBlocker = () => null;
    rebalancer.getCriticalSystemTrafficReadinessBlocker = () => null;
    rebalancer.getCriticalSystemLocalServeReadinessBlocker = () => null;
    rebalancer.getLocalControlPlaneMutationReadinessBlocker = () => null;
    rebalancer.scheduleNextCheck = () => {};

    await rebalancer.checkRebalance();

    t.equal(
      createdOperations.length,
      1,
      'missing authoritative operation visibility should schedule one recovery operation',
    );
    t.equal(
      createdOperations[0]?.partitionId,
      TEST_PARTITION_ID,
      'scheduled recovery work should target the blocked priority partition',
    );
    t.ok(
      [
        TEST_TARGET_NODE_ID,
        TEST_SUPPORTING_NODE_ID,
      ].includes(createdOperations[0]?.nodeId),
      'scheduled recovery work should choose an eligible missing node',
    );
  },
);

test(
  'UnifiedRebalancer planning reconstruction does not recreate needs_operation after a live replace is cache-visible',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStalePlanningSnapshot();
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      replicaOperations: [buildInFlightReplaceOperation()],
    });

    const decisionSnapshot =
      rebalancer.buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {
          partitionId: TEST_PARTITION_ID,
          includeNonRequiredSnapshot: true,
        },
      );

    t.equal(
      decisionSnapshot?.semanticState,
      PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
      'planning reconstruction should reflect the cache-visible in-flight replace instead of recreating needs_operation',
    );
    t.notOk(
      decisionSnapshot?.blockerReasons?.includes(
        TEST_BLOCKER_ELIGIBLE_NO_OPERATION,
      ),
      'the cache-refreshed reconstruction should drop the stale eligible_but_no_operation_created blocker',
    );
    t.equal(
      rebalancer.isPriorityRecoveryFollowUpOperationRequired(
        decisionSnapshot,
      ),
      false,
      'the refreshed decision should stop the follow-up path from requesting another recovery operation',
    );
  },
);

test(
  'UnifiedRebalancer planning-gate snapshot stops advertising operation creation once live replace progress exists',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createPriorityRebalancer({
      replicaOperations: [buildInFlightReplaceOperation()],
    });

    const planningGateSnapshot =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        TEST_PARTITION_ID,
      );

    t.same(
      planningGateSnapshot,
      expectedPlanningGateSnapshot({required: false}),
      'the sync planning gate should not recreate eligible_but_no_operation_created after move execution has already advanced the same partition',
    );
  },
);

test(
  'UnifiedRebalancer planning-gate snapshot reopens operation creation when cache-visible replace progress is stale',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createPriorityRebalancer({
      replicaOperations: [buildStaleInFlightReplaceOperation()],
      nowFn: () => TEST_NOW_MS,
    });

    const planningGateSnapshot =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        TEST_PARTITION_ID,
      );

    t.same(
      planningGateSnapshot,
      expectedPlanningGateSnapshot({
        required: true,
        partitionId: TEST_PARTITION_ID,
      }),
      'stale in-flight progress should not suppress a fresh priority recovery operation while spread is still open',
    );
  },
);

test(
  'UnifiedRebalancer ancient cache-visible stale progress also reopens priority recovery creation',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createPriorityRebalancer({
      replicaOperations: [buildAncientStaleInFlightReplaceOperation()],
      nowFn: () => TEST_NOW_MS,
    });

    const planningGateSnapshot =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        TEST_PARTITION_ID,
      );

    t.same(
      planningGateSnapshot,
      expectedPlanningGateSnapshot({
        required: true,
        partitionId: TEST_PARTITION_ID,
      }),
      'very old cache-visible progress should not remain a live context that suppresses fresh priority recovery',
    );
  },
);

test(
  'UnifiedRebalancer stale priority operation progress bypasses local serve readiness for fresh recovery creation',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStalePlanningSnapshot();
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      controlPlaneReadinessService:
        createBlockedLocalServePlanningReadinessService(planningSnapshot),
      replicaOperations: [buildStaleInFlightReplaceOperation()],
      nowFn: () => TEST_NOW_MS,
    });

    const planningGateSnapshot =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        TEST_PARTITION_ID,
      );
    const localServeDecision =
      rebalancer.resolveLocalServePlanningGateDecision();

    t.equal(
      planningGateSnapshot?.operationCreationRequired,
      true,
      'stale operation progress should reopen the recovery operation-creation proof',
    );
    t.equal(
      localServeDecision,
      null,
      'local serve readiness should not strand a reopened priority recovery operation',
    );
  },
);

test(
  'UnifiedRebalancer live priority operation progress still defers behind local serve readiness',
  async (t) => {
    initializeTestEnvironment();

    const planningSnapshot = buildStalePlanningSnapshot();
    const rebalancer = createPriorityRebalancer({
      planningSnapshot,
      controlPlaneReadinessService:
        createBlockedLocalServePlanningReadinessService(planningSnapshot),
      replicaOperations: [buildInFlightReplaceOperation()],
      nowFn: () => TEST_NOW_MS,
    });

    const planningGateSnapshot =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        TEST_PARTITION_ID,
      );
    const localServeDecision =
      rebalancer.resolveLocalServePlanningGateDecision();

    t.equal(
      planningGateSnapshot?.operationCreationRequired,
      false,
      'live operation progress should keep duplicate creation suppressed',
    );
    t.equal(
      localServeDecision?.gate,
      'local_serve_readiness',
      'live operation progress should not bypass local serve readiness',
    );
  },
);
