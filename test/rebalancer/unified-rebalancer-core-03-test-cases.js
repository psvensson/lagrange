export function registerUnifiedRebalancerCore03Tests(context) {
  const {
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    CONTROL_PLANE_READINESS_DIMENSION,
    createMockCache,
    createMockCdcService,
    createMockCoordinator,
    createMockMembershipPublicationService,
    createMockMessageRouter,
    createMockReadinessService,
    createTestRebalancer,
    EntityType,
    initializeTestEnvironment,
    LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
    MoveType,
    NO_GLOBAL_IN_FLIGHT_OPERATIONS,
    NodeStatus,
    OperationType,
    PRIORITY_FOLLOW_UP_CREATED_OPERATION_ID,
    PRIORITY_FOLLOW_UP_NODE_ID_A,
    PRIORITY_FOLLOW_UP_NODE_ID_B,
    PRIORITY_FOLLOW_UP_NODE_ID_C,
    PRIORITY_FOLLOW_UP_NODE_ID_D,
    PRIORITY_FOLLOW_UP_NODE_ID_E,
    PRIORITY_FOLLOW_UP_OCCUPIED_REPLICA_ID,
    PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
    PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX,
    PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_CREATE_RECOVERY_OPERATION,
    PRIORITY_RECOVERY_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SPREAD_GAP,
    PRIORITY_RECOVERY_WORKFLOW_STATE_TERMINAL,
    PRIORITY_VISIBILITY_OPERATION_STATUS_FAILED,
    REBALANCER_CONCURRENT_BUDGET_READ_MODE,
    REPLICA_OPERATION_PRIORITY_PARTITION_ID,
    REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
    REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
    ReplicaStatus,
    SERVICE_TYPE,
    SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
    SYSTEM_TABLE_NAME,
    test,
    TriggerType,
    WORKFLOW_STEP,
  } = context;

  test('UnifiedRebalancer budget queries use gateway authoritative owner reads',
    async (t) => {
      initializeTestEnvironment();

      const cdcCalls = [];
      const gatewayCalls = [];
      const cdcIntegrationService = {
        ...createMockCdcService(),
        async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
          cdcCalls.push({tableName, sql, params, options});
          if (tableName === 'config') {
            return {success: true, rows: [{config_value: '6'}]};
          }
          return {success: true, rows: [{total_count: 2}]};
        },
      };
      const rebalancer = createTestRebalancer({
        entityId: 'replica_operations-p1',
        entityType: EntityType.PARTITION,
        cdcIntegrationService,
        controlPlaneSystemTableGateway: {
          async readAuthoritativeRows(tableName, sql, params, options) {
            gatewayCalls.push({tableName, sql, params, options});
            return cdcIntegrationService.executeAuthoritativeSystemTableRead(
              tableName,
              sql,
              params,
              options,
            );
          },
          async executeQuery(sql, params, queryOptions) {
            throw new Error(
              'budget reads should use authoritative gateway rows',
              {cause: {sql, params, queryOptions}},
            );
          },
        },
      });

      const configuredBudget = await rebalancer.getConfiguredRebalanceBudget();
      const inFlightCount = await rebalancer.getGlobalInFlightOperationCount();

      t.equal(configuredBudget, 6,
        'authoritative gateway reads should provide config-backed budget');
      t.equal(inFlightCount, 2,
        'authoritative gateway reads should provide in-flight count');
      t.equal(gatewayCalls.length, 2,
        'budget probes should use the authoritative gateway owner path');
      t.equal(cdcCalls.length, 2,
        'the gateway owner should delegate into the CDC owner implementation');
      t.equal(
        cdcCalls[0]?.options?.localReadConsistency,
        LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
        'budget probes should allow any local authoritative replica for config reads',
      );
      t.equal(
        cdcCalls[0]?.options?.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
        'budget probes should report the canonical local-only authoritative read mode',
      );
      t.equal(
        cdcCalls[1]?.options?.queryOptions?.deliveryPriority,
        'critical',
        'priority control-plane budget probes should preserve critical delivery priority on owner reads',
      );
    });

  test('UnifiedRebalancer allows priority spread scheduling when global budget is ' +
  'saturated by non-priority work', async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'control_plane_publications-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });

    const priorityBudgetLaneChecks = [];
    rebalancer.rebalanceCoordinator.canStartPriorityAddOperation = async (options) => {
      priorityBudgetLaneChecks.push(options || null);
      return true;
    };

    rebalancer.setLeader(true);
    rebalancer.getCurrentReplicas = () => [];
    rebalancer.getAvailableNodes = () => ([
      {node_id: 'node-1'},
      {node_id: 'node-2'},
    ]);
    rebalancer.movePlanner.calculateTargetState = async () => ({
      targetReplicaCount: 2,
    });
    rebalancer.movePlanner.calculateMoves = () => ([
      {
        type: MoveType.ADD,
        nodeId: 'node-2',
        replicaId: 'control-plane-publications-r2',
      },
    ]);
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
    rebalancer.movePlanner.isCriticalState = () => true;
    rebalancer.getConfiguredRebalanceBudget = async () => 1;
    rebalancer.getGlobalInFlightOperationCount = async () => 2;
    rebalancer.executeRebalancingMoves = async (moves) => moves.map((move) => ({
      success: true,
      skipped: false,
      operation: move.type,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
    }));

    const result = await rebalancer.rebalance(
      TriggerType.PERIODIC,
      {targetReplicaCount: 2, placementConstraints: {}},
    );

    t.equal(result.success, true, 'priority partition should still schedule recovery work');
    t.equal(result.moves.length, 1, 'priority partition should schedule one move');
    t.equal(
      result.moves[0]?.operation,
      MoveType.ADD,
      'scheduled move should remain an add-like spread operation',
    );
    t.equal(
      priorityBudgetLaneChecks.length,
      1,
      'rebalancer should consult coordinator priority add lane before bypassing global budget',
    );
    t.same(
      priorityBudgetLaneChecks[0],
      {
        concurrentBudgetReadMode:
        REBALANCER_CONCURRENT_BUDGET_READ_MODE
          .OWNER_RPC_RECHECK_ON_SATURATION,
        bypassEmptyQueryDelay: true,
        partitionId: 'control_plane_publications-p1',
      },
      'priority bypass should use authoritative coordinator lane checks',
    );

    rebalancer.shutdown();
  });

  test('UnifiedRebalancer creates a priority follow-up operation when the ' +
  'canonical decision is needs_operation', async (t) => {
    initializeTestEnvironment();

    const priorityRecoveryPlanningSnapshot = {
      publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
      publishedActiveNodeIds: [
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
      ],
      publicationRecoveryGate: {
        prioritySpreadPending: true,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitions: [{
            partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
            readyReplicaCount:
            PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
            PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          }],
        },
      },
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitions: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          readyReplicaCount:
          PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
          readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
        }],
      },
      priorityRecoveryDecisionSnapshots: {
        snapshots: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
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
            operation: {
              targetNodeId: PRIORITY_FOLLOW_UP_NODE_ID_B,
              status: ReplicaStatus.FAILED,
            },
          },
        }],
      },
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
    const readinessService = {
      ...createMockReadinessService(createMockCache()),
      getNodeReadinessSync(nodeId) {
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
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId) {
        return this.getNodeReadinessSync(nodeId);
      },
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return priorityRecoveryPlanningSnapshot;
      },
      getPriorityRecoveryPlanningAnswerSync() {
        return priorityRecoveryPlanningSnapshot;
      },
      membershipPublicationService: createMockMembershipPublicationService(
        priorityRecoveryPlanningSnapshot.publishedActiveNodeIds,
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary:
          priorityRecoveryPlanningSnapshot.priorityPartitionSummary,
        },
      ),
    };
    const rebalancer = createTestRebalancer({
      entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
      nodes: [
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_B, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_C, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      }],
      services: [
        {
          service_id: PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          replica_id: PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
          address:
          PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
          PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          replica_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
          address:
          PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
          REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_C,
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          replica_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
          address:
          PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
          REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
      ],
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
        'canonical needs_operation should force evaluation into rebalance',
      );
      t.equal(
        result.moves.length,
        1,
        'rebalance should schedule one canonical follow-up move',
      );
      t.equal(
        createdOperations.length,
        1,
        'follow-up move should be persisted through the coordinator',
      );
      t.equal(
        createdOperations[0].type,
        OperationType.REPLACE,
        'full cache topology should produce a replacement follow-up',
      );
      t.equal(
        createdOperations[0].nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
        'follow-up should target an eligible unused recovery node',
      );
      t.equal(
        createdOperations[0].replicaId,
        PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
        'replacement follow-up should carry a concrete source replica',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer persists needs_operation follow-up work even when the ' +
  'recovery-eligible target is transport-unready', async (t) => {
    initializeTestEnvironment();

    const priorityRecoveryPlanningSnapshot = {
      publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
      publishedActiveNodeIds: [
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
      ],
      publicationRecoveryGate: {
        prioritySpreadPending: true,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitions: [{
            partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
            readyReplicaCount:
            PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
            PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
            PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          }],
        },
      },
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitions: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          readyReplicaCount:
          PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
          readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
        }],
      },
      priorityRecoveryDecisionSnapshots: {
        snapshots: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
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
        }],
      },
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
    const readinessService = {
      ...createMockReadinessService(createMockCache()),
      getNodeReadinessSync(nodeId) {
        const recoveryOnlyTarget = nodeId === PRIORITY_FOLLOW_UP_NODE_ID_D;
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
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
            recoveryOnlyTarget !== true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
            recoveryOnlyTarget !== true,
          },
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId) {
        return this.getNodeReadinessSync(nodeId);
      },
      getPriorityRecoveryPlanningSnapshotBestEffort() {
        return priorityRecoveryPlanningSnapshot;
      },
      getPriorityRecoveryPlanningAnswerSync() {
        return priorityRecoveryPlanningSnapshot;
      },
      membershipPublicationService: createMockMembershipPublicationService(
        priorityRecoveryPlanningSnapshot.publishedActiveNodeIds,
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary:
          priorityRecoveryPlanningSnapshot.priorityPartitionSummary,
        },
      ),
    };
    const messageRouter = {
      ...createMockMessageRouter(),
      getConnectionState(nodeId) {
        return nodeId === PRIORITY_FOLLOW_UP_NODE_ID_D ?
          'disconnected' :
          'connected';
      },
    };
    const rebalancer = createTestRebalancer({
      entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
      nodes: [
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_B, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_C, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      }],
      services: [
        {
          service_id: PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          replica_id: PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
          address:
          PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
          PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          replica_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
          address:
          PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
          REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
        {
          service_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_C,
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          replica_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
          address:
          PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
          REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
      ],
      messageRouter,
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
        'rebalance should still schedule one canonical follow-up move',
      );
      t.equal(
        createdOperations.length,
        1,
        'priority recovery should persist the follow-up before workflow transport catches up',
      );
      t.equal(
        createdOperations[0].nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
        'follow-up should target the recovery-eligible node even while transport is behind',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer skips occupied non-healthy priority follow-up ' +
  'targets', async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
      nodes: [
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_B, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_C, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_E, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      }],
    });
    const decision = {
      decisionSnapshot: {
        partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        progress: {
          nextRequiredAction:
          PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_CREATE_RECOVERY_OPERATION,
        },
        planner: {
          requiredDistinctNodeCount:
          PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        },
        admission: {
          effectiveEligibleNodeIds: [
            PRIORITY_FOLLOW_UP_NODE_ID_A,
            PRIORITY_FOLLOW_UP_NODE_ID_B,
            PRIORITY_FOLLOW_UP_NODE_ID_C,
            PRIORITY_FOLLOW_UP_NODE_ID_D,
            PRIORITY_FOLLOW_UP_NODE_ID_E,
          ],
        },
        publication: {
          recoveryActiveNodeIds: [
            PRIORITY_FOLLOW_UP_NODE_ID_A,
            PRIORITY_FOLLOW_UP_NODE_ID_B,
            PRIORITY_FOLLOW_UP_NODE_ID_C,
            PRIORITY_FOLLOW_UP_NODE_ID_D,
            PRIORITY_FOLLOW_UP_NODE_ID_E,
          ],
        },
      },
    };
    const currentReplicas = [
      {
        service_id: PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        REPLICA_OPERATION_PRIORITY_REPLICA_ID_B,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_C,
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        REPLICA_OPERATION_PRIORITY_REPLICA_ID_C,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.ACTIVE,
      },
      {
        service_id: PRIORITY_FOLLOW_UP_OCCUPIED_REPLICA_ID,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: PRIORITY_FOLLOW_UP_NODE_ID_D,
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        replica_id: PRIORITY_FOLLOW_UP_OCCUPIED_REPLICA_ID,
        address:
        PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
        PRIORITY_FOLLOW_UP_OCCUPIED_REPLICA_ID,
        raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
        status: ReplicaStatus.SYNCING,
      },
    ];

    try {
      const move = rebalancer.buildPriorityRecoveryFollowUpMove({
        decision,
        currentReplicas,
      });

      t.equal(
        move.type,
        MoveType.REPLACE,
        'full healthy topology should still choose replacement follow-up',
      );
      t.equal(
        move.nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_E,
        'follow-up should skip occupied non-healthy service-row targets',
      );
      t.equal(
        move.replicaId,
        PRIORITY_FOLLOW_UP_SOURCE_REPLICA_ID,
        'replacement should retain a concrete healthy source replica',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer treats needs_operation blocker reasons as ' +
  'priority follow-up work', async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      partitions: [{
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
      }],
    });

    try {
      const required =
      rebalancer.isPriorityRecoveryFollowUpOperationRequired({
        partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
        blockerReasons: [
          PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
        ],
      });

      t.equal(
        required,
        true,
        'eligible-but-no-operation is enough to create follow-up work when progress details are absent',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer treats terminal failed priority recovery as ' +
  'follow-up work while spread remains blocked', async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      partitions: [{
        partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
      }],
    });

    try {
      const required =
      rebalancer.isPriorityRecoveryFollowUpOperationRequired({
        partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        semanticStateId:
          PRIORITY_RECOVERY_SEMANTIC_STATE_BLOCKED_UNCLASSIFIED,
        workflowState: PRIORITY_RECOVERY_WORKFLOW_STATE_TERMINAL,
        latestOperationStatus: PRIORITY_VISIBILITY_OPERATION_STATUS_FAILED,
        eligibleNodeIds: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
      });

      t.equal(
        required,
        true,
        'terminal failed recovery operation should not strand a blocked priority partition',
      );
    } finally {
      rebalancer.shutdown();
    }
  });
}
