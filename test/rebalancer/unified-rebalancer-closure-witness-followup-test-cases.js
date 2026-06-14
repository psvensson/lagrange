export function registerUnifiedRebalancerClosureWitnessFollowupTests(context) {
  const {
    createMockCache,
    createMockCoordinator,
    createMockMembershipPublicationService,
    createMockReadinessService,
    createTestRebalancer,
    EntityType,
    initializeTestEnvironment,
    MOVE_REASON,
    MoveType,
    NO_GLOBAL_IN_FLIGHT_OPERATIONS,
    NodeStatus,
    OperationType,
    PRIORITY_FOLLOW_UP_NODE_ID_A,
    PRIORITY_FOLLOW_UP_NODE_ID_B,
    PRIORITY_FOLLOW_UP_NODE_ID_C,
    PRIORITY_FOLLOW_UP_NODE_ID_D,
    PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
    PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX,
    PRIORITY_PROGRESS_PARTITION_ID,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_BLOCKING_BOUNDARY_REBALANCER_HANDOFF,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_CREATE_RECOVERY_OPERATION,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_SCHEDULE_FOLLOWUP_REBALANCE,
    PRIORITY_RECOVERY_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SPREAD_GAP,
    PRIORITY_SURROGATE_CREATED_OPERATION_ID,
    PRIORITY_SURROGATE_OWNER_REPLICA_ID,
    PRIORITY_SURROGATE_STALE_OPERATION_ID,
    ReplicaStatus,
    SERVICE_TYPE,
    SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
    SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
    SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
    SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
    SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_B,
    SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_C,
    SYSTEM_TABLE_NAME,
    test,
    TriggerType,
    WORKFLOW_STEP,
  } = context;

  test('UnifiedRebalancer trusts needs_operation closure witness over stale ' +
  'cache-visible topology rows for the same blocked partition', async (t) => {
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
      partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
      type: OperationType.REPLACE,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
      target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
    }];
    const priorityPartitionSummary = {
      satisfied: false,
      blockedPartitions: [{
        partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        readyReplicaCount: PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
        readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
        requiredDistinctNodeCount:
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
      }],
    };
    const priorityRecoveryClosureWitness = {
      blockedPartitionIds: [
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
      priorityPartitionSummary,
      publicationRecoveryGate: {
        prioritySpreadPending: true,
        priorityPartitionSummary,
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
          priorityPartitionSummary,
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
        'needs_operation witness should schedule one surrogate follow-up move',
      );
      t.equal(
        createdOperations.length,
        1,
        'stale cache-visible operation row should not suppress persistence',
      );
      t.equal(
        createdOperations[0].partitionId,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        'surrogate follow-up should target the canonical blocked partition',
      );
      t.equal(
        createdOperations[0].nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        'follow-up should use the first eligible recovery target',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer advances closure-witness needs_operation work past ' +
  'topology-blocked priority candidates', async (t) => {
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
        service_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
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
      {
        partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      },
    ];
    const replicaOperations = [{
      operation_id: PRIORITY_SURROGATE_STALE_OPERATION_ID,
      partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
      type: OperationType.ADD,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
      target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
    }];
    const priorityPartitionSummary = {
      satisfied: false,
      blockedPartitions: [
        {
          partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          readyReplicaCount: PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
          readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
        },
        {
          partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
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
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
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
      priorityPartitionSummary,
      publicationRecoveryGate: {
        prioritySpreadPending: true,
        priorityPartitionSummary,
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
          priorityPartitionSummary,
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
        'closure witness should schedule an unblocked surrogate follow-up move',
      );
      t.equal(
        createdOperations.length,
        1,
        'unblocked closure-witness work should persist one operation',
      );
      t.equal(
        createdOperations[0].partitionId,
        SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        'surrogate follow-up should advance to the unblocked closure candidate',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer preempts current priority moves with a closure-witness ' +
  'no-operation surrogate under a one-slot budget', async (t) => {
    initializeTestEnvironment();

    const nodeRows = [
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_A, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_B, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_C, status: NodeStatus.ACTIVE},
      {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
    ];
    const serviceRows = [
      {
        service_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
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
        partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      },
      {
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
      },
    ];
    const priorityPartitionSummary = {
      satisfied: false,
      blockedPartitions: [
        {
          partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
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
        SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
      ],
      unresolvedSemanticStateIds: [
        PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
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
      priorityPartitionSummary,
      publicationRecoveryGate: {
        prioritySpreadPending: true,
        priorityPartitionSummary,
        priorityRecoveryClosureWitness,
      },
      priorityRecoveryClosureWitness,
      priorityRecoveryDecisionSnapshots: {
        snapshots: [
          {
            partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
            semanticState:
            PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
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
          priorityPartitionSummary,
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
      entityId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
      systemTableCache: cache,
      rebalanceCoordinator: coordinator,
      controlPlaneReadinessService: readinessService,
    });

    rebalancer.setLeader(true);
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () => PRIORITY_RECOVERY_SPREAD_GAP;
    rebalancer.getGlobalInFlightOperationCount = async () =>
      NO_GLOBAL_IN_FLIGHT_OPERATIONS;
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    });
    rebalancer.movePlanner.calculateMoves = () => ([
      {
        type: MoveType.REPLACE,
        partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        entityId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_B,
        sourceNodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
        replicaId: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
        reason: MOVE_REASON.REPLACE_REPLICA,
      },
    ]);
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
    rebalancer.movePlanner.isCriticalState = () => false;

    try {
      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT},
      );

      t.equal(
        result.moves.length,
        PRIORITY_RECOVERY_SPREAD_GAP,
        'one-slot budget should execute only one priority move',
      );
      t.equal(
        createdOperations.length,
        PRIORITY_RECOVERY_SPREAD_GAP,
        'one priority operation should be persisted',
      );
      t.equal(
        createdOperations[0].partitionId,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        'closure-witness no-operation surrogate should preempt current owner moves',
      );
      t.equal(
        createdOperations[0].entityId,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        'surrogate operation should keep the blocked entity identity',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer treats rebalancer-handoff progress contracts as ' +
  'priority follow-up work', async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: PRIORITY_PROGRESS_PARTITION_ID,
      entityType: EntityType.PARTITION,
      partitions: [{
        partition_id: PRIORITY_PROGRESS_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      }],
    });

    try {
      const required =
      rebalancer.isPriorityRecoveryFollowUpOperationRequired({
        partitionId: PRIORITY_PROGRESS_PARTITION_ID,
        semanticState:
          PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
        progress: {
          nextRequiredAction:
            PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_SCHEDULE_FOLLOWUP_REBALANCE,
          blockingBoundary:
            PRIORITY_RECOVERY_BLOCKING_BOUNDARY_REBALANCER_HANDOFF,
        },
      });

      t.equal(
        required,
        true,
        'terminal blocked priority recovery should re-enter follow-up planning',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer uses target-sized endpoint visibility for ' +
  'post-published publication-owner trim overflow', async (t) => {
    initializeTestEnvironment();
    const PUBLICATION_REPLICA_ID_B = 'control_plane_publications-p1-r2';
    const PUBLICATION_REPLICA_ID_C = 'control_plane_publications-p1-r3';
    const PUBLICATION_REPLICA_ID_D = 'control_plane_publications-p1-r4';

    const rebalancer = createTestRebalancer({
      entityId: PRIORITY_PROGRESS_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
      nodes: [
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_B, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_C, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: PRIORITY_PROGRESS_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      }],
    });

    try {
      rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
          PRIORITY_FOLLOW_UP_NODE_ID_C,
          PRIORITY_FOLLOW_UP_NODE_ID_D,
        ],
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitions: [{
              partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
              readyDistinctNodeCount:
                PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
              requiredDistinctNodeCount:
                PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
            }],
          },
        },
      );
      rebalancer.getCurrentReplicas = () => ([
        {
          replica_id: PRIORITY_SURROGATE_OWNER_REPLICA_ID,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: PUBLICATION_REPLICA_ID_B,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: PUBLICATION_REPLICA_ID_C,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_C,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: PUBLICATION_REPLICA_ID_D,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_D,
          status: ReplicaStatus.ACTIVE,
        },
      ]);

      const endpointVisibilityPolicy =
      rebalancer.getCriticalSystemEndpointVisibilityPolicy([
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
      ]);

      t.equal(
        rebalancer.isPriorityControlPlaneRecoveryActive(),
        true,
        'stale publication priority summary should still report recovery active',
      );
      t.equal(
        rebalancer.shouldRequireFullControlPlanePublicationEndpointVisibility(),
        false,
        'published over-target publication owner should enter bounded trim visibility',
      );
      t.equal(
        endpointVisibilityPolicy.requiredReadyNodeCount,
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        'bounded trim should require target-sized endpoint visibility',
      );
    } finally {
      rebalancer.shutdown();
    }
  });
}
