export function registerUnifiedRebalancerCore04Tests(context) {
  const {
    createMockCache,
    createMockCoordinator,
    createMockMembershipPublicationService,
    createMockReadinessService,
    createTestRebalancer,
    EntityType,
    initializeTestEnvironment,
    NO_GLOBAL_IN_FLIGHT_OPERATIONS,
    NodeStatus,
    OperationType,
    PRIORITY_FOLLOW_UP_CREATED_OPERATION_ID,
    PRIORITY_FOLLOW_UP_NODE_ID_A,
    PRIORITY_FOLLOW_UP_NODE_ID_B,
    PRIORITY_FOLLOW_UP_NODE_ID_C,
    PRIORITY_FOLLOW_UP_NODE_ID_D,
    PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
    PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX,
    PRIORITY_PROGRESS_PARTITION_ID,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_CREATE_RECOVERY_OPERATION,
    PRIORITY_RECOVERY_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
    PRIORITY_RECOVERY_SPREAD_GAP,
    PRIORITY_SURROGATE_CREATED_OPERATION_ID,
    PRIORITY_SURROGATE_OWNER_REPLICA_ID,
    PRIORITY_SURROGATE_STALE_OPERATION_ID,
    ReplicaStatus,
    SERVICE_TYPE,
    SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
    SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
    SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
    SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
    SYSTEM_TABLE_NAME,
    test,
    TriggerType,
    WORKFLOW_STEP,
  } = context;

  test('UnifiedRebalancer synthesizes priority follow-up work from publication ' +
  'summary evidence when decision snapshots are absent', async (t) => {
    initializeTestEnvironment();

    const nodeRows = [
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_A, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_B, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_C, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
    ];
    const serviceRows = [
      {
        service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_C,
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
    ];
    const partitionRows = [{
      partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
      table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
    }];
    const planningSnapshot = {
      publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
      publishedActiveNodeIds: [
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
      ],
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitions: [{
          partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          readyReplicaCount:
          PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
          readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
        }],
      },
    };
    const cache = createMockCache(nodeRows, serviceRows, partitionRows);
    const readinessService = {
      ...createMockReadinessService(cache),
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return planningSnapshot;
      },
      getPriorityRecoveryPlanningAnswerSync() {
        return planningSnapshot;
      },
      membershipPublicationService: createMockMembershipPublicationService(
        planningSnapshot.publishedActiveNodeIds,
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary: planningSnapshot.priorityPartitionSummary,
        },
      ),
    };
    const createdOperations = [];
    const coordinator = {
      ...createMockCoordinator(),
      createOperation: async (move) => {
        createdOperations.push(move);
        return {
          operationId: PRIORITY_FOLLOW_UP_CREATED_OPERATION_ID,
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
      entityId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
      systemTableCache: cache,
      rebalanceCoordinator: coordinator,
      controlPlaneReadinessService: readinessService,
    });

    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () =>
      PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
    rebalancer.getGlobalInFlightOperationCount = async () =>
      NO_GLOBAL_IN_FLIGHT_OPERATIONS;
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
      targetNodes: [
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
      ],
    });
    rebalancer.movePlanner.calculateMoves = () => [];
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

    try {
      const needsRebalance = await rebalancer.evaluateState();
      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          placementConstraints: {
            spreadAcrossNodes: true,
          },
        },
      );

      t.equal(
        needsRebalance,
        true,
        'publication summary spread gaps should force follow-up planning',
      );
      t.equal(
        result.moves.length,
        1,
        'rebalance should schedule one synthesized follow-up move',
      );
      t.equal(
        createdOperations.length,
        1,
        'synthesized follow-up move should be persisted through the coordinator',
      );
      t.equal(
        createdOperations[0].nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
        'synthesized follow-up should target an unused eligible node',
      );
      t.equal(
        createdOperations[0].type,
        OperationType.REPLACE,
        'full topology should still produce a replacement follow-up',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer creates priority follow-up work for an ownerless ' +
  'blocked priority partition from another priority owner', async (t) => {
    initializeTestEnvironment();

    const nodeRows = [
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_A, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_B, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_C, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
    ];
    const serviceRows = [
      {
        service_id: PRIORITY_SURROGATE_OWNER_REPLICA_ID,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: PRIORITY_PROGRESS_PARTITION_ID,
        replica_id: PRIORITY_SURROGATE_OWNER_REPLICA_ID,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        PRIORITY_SURROGATE_OWNER_REPLICA_ID,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
    ];
    const partitionRows = [
      {
        partition_id: PRIORITY_PROGRESS_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      },
      {
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
      },
    ];
    const planningSnapshot = {
      publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
      publishedActiveNodeIds: [
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
      ],
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitions: [{
          partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          readyReplicaCount:
          PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
          readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
        }],
      },
      priorityRecoveryDecisionSnapshots: {
        snapshots: [
          {
            partitionId: PRIORITY_PROGRESS_PARTITION_ID,
            semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_SPREAD_SATISFIED_IN_FLIGHT,
            blockerReasons: [],
          },
          {
            partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
            semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
            blockerReasons: [
              PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
            ],
            planner: {
              requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            },
            progress: {
              nextRequiredAction:
              PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_CREATE_RECOVERY_OPERATION,
            },
            admission: {
              effectiveEligibleNodeIds: [
                PRIORITY_FOLLOW_UP_NODE_ID_A,
                PRIORITY_FOLLOW_UP_NODE_ID_B,
                PRIORITY_FOLLOW_UP_NODE_ID_C,
                PRIORITY_FOLLOW_UP_NODE_ID_D,
              ],
            },
            publication: {
              recoveryActiveNodeIds: [
                PRIORITY_FOLLOW_UP_NODE_ID_A,
                PRIORITY_FOLLOW_UP_NODE_ID_B,
                PRIORITY_FOLLOW_UP_NODE_ID_C,
                PRIORITY_FOLLOW_UP_NODE_ID_D,
              ],
            },
            coordinator: {
              operationCount: NO_GLOBAL_IN_FLIGHT_OPERATIONS,
              operation: null,
            },
          },
        ],
      },
    };
    const cache = createMockCache(nodeRows, serviceRows, partitionRows);
    const readinessService = {
      ...createMockReadinessService(cache),
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return planningSnapshot;
      },
      getPriorityRecoveryPlanningAnswerSync() {
        return planningSnapshot;
      },
      membershipPublicationService: createMockMembershipPublicationService(
        planningSnapshot.publishedActiveNodeIds,
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary: planningSnapshot.priorityPartitionSummary,
        },
      ),
    };
    const createdOperations = [];
    const coordinator = {
      ...createMockCoordinator(),
      createOperation: async (move) => {
        createdOperations.push(move);
        return {
          operationId: PRIORITY_SURROGATE_CREATED_OPERATION_ID,
          type: move.type,
          partitionId: move.partitionId,
          entityId: move.entityId,
          targetNodeId: move.nodeId,
          replicaId: move.replicaId,
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.PENDING,
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: PRIORITY_PROGRESS_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
      systemTableCache: cache,
      rebalanceCoordinator: coordinator,
      controlPlaneReadinessService: readinessService,
    });

    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () =>
      PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
    rebalancer.getGlobalInFlightOperationCount = async () =>
      NO_GLOBAL_IN_FLIGHT_OPERATIONS;
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
      targetNodes: [
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
      ],
    });
    rebalancer.movePlanner.calculateMoves = () => [];
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

    try {
      const needsRebalance = await rebalancer.evaluateState();
      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          placementConstraints: {
            spreadAcrossNodes: true,
          },
        },
      );

      t.equal(
        needsRebalance,
        true,
        'surrogate priority owner should evaluate owner-gap follow-up work',
      );
      t.equal(
        result.moves.length,
        1,
        'surrogate priority owner should schedule one follow-up move',
      );
      t.equal(
        createdOperations.length,
        1,
        'surrogate follow-up should persist one operation',
      );
      t.equal(
        createdOperations[0].partitionId,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        'surrogate follow-up should preserve the blocked partition identity',
      );
      t.equal(
        createdOperations[0].entityId,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        'surrogate follow-up should preserve the blocked entity identity',
      );
      t.equal(
        createdOperations[0].type,
        OperationType.REPLACE,
        'surrogate follow-up should use a replacement when source replicas exist',
      );
      t.equal(
        createdOperations[0].nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        'surrogate follow-up should target an unused recovery node',
      );
      t.equal(
        createdOperations[0].replicaId,
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        'surrogate replacement should carry a concrete source replica',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer prefers closure-witness priority follow-up over stale ' +
  'summary ordering', async (t) => {
    initializeTestEnvironment();

    const nodeRows = [
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_A, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_B, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_C, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
    ];
    const serviceRows = [
      {
        service_id: PRIORITY_SURROGATE_OWNER_REPLICA_ID,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: PRIORITY_PROGRESS_PARTITION_ID,
        replica_id: PRIORITY_SURROGATE_OWNER_REPLICA_ID,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        PRIORITY_SURROGATE_OWNER_REPLICA_ID,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
    ];
    const partitionRows = [
      {
        partition_id: PRIORITY_PROGRESS_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      },
      {
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
      },
    ];
    const replicaOperations = [{
      operation_id: PRIORITY_SURROGATE_STALE_OPERATION_ID,
      partition_id: PRIORITY_PROGRESS_PARTITION_ID,
      type: OperationType.REPLACE,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
      target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
    }];
    const stalePrioritySummary = {
      satisfied: false,
      blockedPartitions: [
        {
          partitionId: PRIORITY_PROGRESS_PARTITION_ID,
          readyReplicaCount: PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
          readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
        },
        {
          partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          readyReplicaCount: PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
          readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
        },
      ],
    };
    const priorityRecoveryClosureWitness = {
      blockedPartitionIds: [
        PRIORITY_PROGRESS_PARTITION_ID,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
      ],
      unresolvedSemanticStateIds: [
        PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
      ],
    };
    const planningSnapshot = {
      publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
      publishedActiveNodeIds: [
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
      ],
      priorityPartitionSummary: stalePrioritySummary,
      publicationRecoveryGate: {
        prioritySpreadPending: true,
        priorityPartitionSummary: stalePrioritySummary,
        priorityRecoveryClosureWitness,
      },
      priorityRecoveryClosureWitness,
    };
    const cache = createMockCache(
      nodeRows,
      serviceRows,
      partitionRows,
      [],
      replicaOperations,
    );
    const readinessService = {
      ...createMockReadinessService(cache),
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return planningSnapshot;
      },
      getPriorityRecoveryPlanningAnswerSync() {
        return planningSnapshot;
      },
      membershipPublicationService: createMockMembershipPublicationService(
        planningSnapshot.publishedActiveNodeIds,
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary: stalePrioritySummary,
        },
      ),
    };
    const createdOperations = [];
    const coordinator = {
      ...createMockCoordinator(),
      createOperation: async (move) => {
        createdOperations.push(move);
        return {
          operationId: PRIORITY_SURROGATE_CREATED_OPERATION_ID,
          type: move.type,
          partitionId: move.partitionId,
          entityId: move.entityId,
          targetNodeId: move.nodeId,
          replicaId: move.replicaId,
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.PENDING,
        };
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: PRIORITY_PROGRESS_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
      systemTableCache: cache,
      rebalanceCoordinator: coordinator,
      controlPlaneReadinessService: readinessService,
    });

    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () =>
      PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
    rebalancer.getGlobalInFlightOperationCount = async () =>
      NO_GLOBAL_IN_FLIGHT_OPERATIONS;
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
      targetNodes: [
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
      ],
    });
    rebalancer.movePlanner.calculateMoves = () => [];
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

    try {
      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {
          targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          placementConstraints: {
            spreadAcrossNodes: true,
          },
        },
      );

      t.equal(
        result.moves.length,
        1,
        'closure witness should still schedule one surrogate follow-up move',
      );
      t.equal(
        createdOperations.length,
        1,
        'closure-witness follow-up should persist one operation',
      );
      t.equal(
        createdOperations[0].partitionId,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        'closure witness should beat stale summary ordering',
      );
      t.equal(
        createdOperations[0].nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
        'closure follow-up should skip the in-flight stale-summary target node',
      );
    } finally {
      rebalancer.shutdown();
    }
  });
}
