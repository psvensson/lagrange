export async function registerPriorityRecoveryFollowUpTestCases(t, context) {
  const {
    createMockCache,
    createMockCoordinator,
    createMockReadinessService,
    createTestRebalancer,
    EntityType,
    MoveType,
    NodeStatus,
    OperationType,
    PRIORITY_FOLLOW_UP_NODE_ID_A,
    PRIORITY_FOLLOW_UP_NODE_ID_B,
    PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
    PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX,
    PRIORITY_RECOVERY_ABSENT_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON,
    PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
    PRIORITY_RECOVERY_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING,
    PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKER_REASON,
    PRIORITY_RECOVERY_SPREAD_GAP,
    PRIORITY_RECOVERY_WAIT_FOR_OPERATION_PROGRESS,
    PRIORITY_SURROGATE_CREATED_OPERATION_ID,
    PRIORITY_SURROGATE_PENDING_OPERATION_ID,
    REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
    REPLICA_OPERATIONS_PRIORITY_REPLICA_ID_A,
    ReplicaStatus,
    SERVICE_TYPE,
    SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
    SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
    SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
    SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
    SYSTEM_TABLE_NAME,
    TEST_MESSAGE,
    TEST_NAME,
    TEST_NUMBER,
    TEST_SCALAR,
    TriggerType,
    WORKFLOW_STEP,
  } = context;

  await t.test(
    TEST_NAME.RECLAIMS_CURRENT_NEEDS_OPERATION,
    async (t) => {
      const nodeRows = [
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          status: NodeStatus.ACTIVE,
        },
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          status: NodeStatus.ACTIVE,
        },
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
      const replicaOperations = [{
        operation_id: PRIORITY_SURROGATE_PENDING_OPERATION_ID,
        partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        type: OperationType.REPLACE,
        status: ReplicaStatus.PENDING,
        workflow_step: WORKFLOW_STEP.PENDING,
        target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
      }];
      const priorityPartitionSummary = {
        satisfied: PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
        blockedPartitions: [
          {
            partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          },
          {
            partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
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
        ],
        priorityPartitionSummary,
        publicationRecoveryGate: {
          prioritySpreadPending: PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING,
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
              coordinator: {
                operationCount: TEST_NUMBER.ONE,
                operationIds: [PRIORITY_SURROGATE_PENDING_OPERATION_ID],
                operation: {
                  operationId: PRIORITY_SURROGATE_PENDING_OPERATION_ID,
                  partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
                  targetNodeId: PRIORITY_FOLLOW_UP_NODE_ID_B,
                },
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
            },
            {
              partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
              blockerReasons: [PRIORITY_RECOVERY_SERIAL_WAIT_BLOCKER_REASON],
              planner: {
                requiredDistinctNodeCount:
                  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount:
                  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
                spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
              },
              progress: {
                nextRequiredAction:
                  PRIORITY_RECOVERY_WAIT_FOR_OPERATION_PROGRESS,
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              coordinator: {
                operationCount: TEST_NUMBER.ZERO,
                operationIds: [],
                operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
              },
            },
          ],
        },
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
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              priorityPartitionSummary,
            };
          },
        },
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
        entityId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
        rebalanceCoordinator: coordinator,
        controlPlaneReadinessService: readinessService,
        nodes: nodeRows,
        services: serviceRows,
        partitions: partitionRows,
        replicaOperations,
      });

      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getConfiguredRebalanceBudget = async () =>
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
      rebalancer.getGlobalInFlightOperationCount = async () => TEST_NUMBER.ZERO;
      rebalancer.scheduleNextCheck = () => {};
      rebalancer.movePlanner.calculateTargetState = async () => ({
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        targetNodes: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
      });
      rebalancer.movePlanner.calculateMoves = () => [];
      rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

      const result = await rebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        result.moves.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.CURRENT_NEEDS_OPERATION_SCHEDULES_FOLLOW_UP,
      );
      t.equal(
        createdOperations.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.FALLBACK_PERSISTS_ONE_RECOVERY_OPERATION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO].partitionId,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        TEST_MESSAGE.FALLBACK_RETARGETS_CURRENT_BLOCKED_PARTITION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO].nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        TEST_MESSAGE.FALLBACK_USES_REMAINING_ELIGIBLE_TARGET,
      );
    },
  );

  await t.test(
    TEST_NAME.SCHEDULES_CURRENT_REPLICA_OPERATIONS_NEEDS_OPERATION,
    async (t) => {
      const nodeRows = [
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          status: NodeStatus.ACTIVE,
        },
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          status: NodeStatus.ACTIVE,
        },
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
          service_id: REPLICA_OPERATIONS_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
          replica_id: REPLICA_OPERATIONS_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            REPLICA_OPERATIONS_PRIORITY_REPLICA_ID_A,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const partitionRows = [
        {
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
        },
        {
          partition_id: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        },
      ];
      const priorityPartitionSummary = {
        satisfied: PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
        blockedPartitions: [
          {
            partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          },
          {
            partitionId: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          },
        ],
      };
      const priorityRecoveryClosureWitness = {
        blockedPartitionIds: [
          SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
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
        ],
        priorityPartitionSummary,
        publicationRecoveryGate: {
          prioritySpreadPending: PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING,
          priorityPartitionSummary,
          priorityRecoveryClosureWitness,
        },
        priorityRecoveryClosureWitness,
        priorityRecoveryDecisionSnapshots: {
          snapshots: [
            {
              partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
              blockerReasons: [
                PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
              ],
              planner: {
                requiredDistinctNodeCount:
                  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount:
                  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
                spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
              },
              progress: {
                nextRequiredAction:
                  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                    .CREATE_RECOVERY_OPERATION,
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              coordinator: {
                operationCount: TEST_NUMBER.ZERO,
                operationIds: [],
              },
            },
            {
              partitionId: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
              blockerReasons: [
                PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
              ],
              planner: {
                requiredDistinctNodeCount:
                  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount:
                  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
                spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
              },
              progress: {
                nextRequiredAction:
                  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                    .CREATE_RECOVERY_OPERATION,
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              coordinator: {
                operationCount: TEST_NUMBER.ZERO,
                operationIds: [],
              },
            },
          ],
        },
      };
      const cache = createMockCache(
        nodeRows,
        serviceRows,
        partitionRows,
      );
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningSnapshotBestEffort() {
          return planningSnapshot;
        },
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              priorityPartitionSummary,
            };
          },
        },
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
        entityId: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
        rebalanceCoordinator: coordinator,
        controlPlaneReadinessService: readinessService,
        nodes: nodeRows,
        services: serviceRows,
        partitions: partitionRows,
      });

      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getConfiguredRebalanceBudget = async () =>
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
      rebalancer.getGlobalInFlightOperationCount = async () =>
        TEST_NUMBER.ZERO;
      rebalancer.scheduleNextCheck = () => {};
      rebalancer.movePlanner.calculateTargetState = async () => ({
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        targetNodes: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
      });
      rebalancer.movePlanner.calculateMoves = () => [];
      rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

      const result = await rebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        result.moves.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.CURRENT_REPLICA_NEEDS_OPERATION_RUNS_ONE_MOVE,
      );
      t.equal(
        createdOperations.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.CURRENT_REPLICA_NEEDS_OPERATION_PERSISTS_OPERATION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO].partitionId,
        REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
        TEST_MESSAGE.CURRENT_REPLICA_NEEDS_OPERATION_RETARGETS_PARTITION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO].nodeId,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        TEST_MESSAGE.CURRENT_REPLICA_NEEDS_OPERATION_USES_ELIGIBLE_TARGET,
      );
    },
  );

  await t.test(
    TEST_NAME.PREPENDS_CURRENT_REPLICA_OPERATIONS_BEFORE_NON_LOCAL_MOVES,
    async (t) => {
      const nodeRows = [
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          status: NodeStatus.ACTIVE,
        },
        {
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
          status: NodeStatus.ACTIVE,
        },
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
          service_id: REPLICA_OPERATIONS_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
          replica_id: REPLICA_OPERATIONS_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            REPLICA_OPERATIONS_PRIORITY_REPLICA_ID_A,
          raft_role: PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
          status: ReplicaStatus.ACTIVE,
        },
      ];
      const partitionRows = [
        {
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
        },
        {
          partition_id: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        },
      ];
      const priorityPartitionSummary = {
        satisfied: PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
        blockedPartitions: [
          {
            partitionId: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
            readyReplicaCount:
              PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
            readyDistinctNodeCount:
              PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
            requiredDistinctNodeCount:
              PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
            spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
          },
        ],
      };
      const planningSnapshot = {
        publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        publishedActiveNodeIds: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
        priorityPartitionSummary,
        priorityRecoveryDecisionSnapshots: {
          snapshots: [
            {
              partitionId: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
              blockerReasons: [
                PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
              ],
              planner: {
                requiredDistinctNodeCount:
                  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
                readyDistinctNodeCount:
                  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
                spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
              },
              progress: {
                nextRequiredAction:
                  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                    .CREATE_RECOVERY_OPERATION,
              },
              admission: {
                effectiveEligibleNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              publication: {
                recoveryActiveNodeIds: [
                  PRIORITY_FOLLOW_UP_NODE_ID_A,
                  PRIORITY_FOLLOW_UP_NODE_ID_B,
                ],
              },
              coordinator: {
                operationCount: TEST_NUMBER.ZERO,
                operationIds: [],
              },
            },
          ],
        },
      };
      const cache = createMockCache(
        nodeRows,
        serviceRows,
        partitionRows,
      );
      const readinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningSnapshotBestEffort() {
          return planningSnapshot;
        },
        getPriorityRecoveryPlanningAnswerSync() {
          return planningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              priorityPartitionSummary,
            };
          },
        },
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
        entityId: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
        rebalanceCoordinator: coordinator,
        controlPlaneReadinessService: readinessService,
        nodes: nodeRows,
        services: serviceRows,
        partitions: partitionRows,
      });

      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.getConfiguredRebalanceBudget = async () =>
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
      rebalancer.getGlobalInFlightOperationCount = async () =>
        TEST_NUMBER.ZERO;
      rebalancer.scheduleNextCheck = () => {};
      rebalancer.movePlanner.calculateTargetState = async () => ({
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        targetNodes: [
          PRIORITY_FOLLOW_UP_NODE_ID_A,
          PRIORITY_FOLLOW_UP_NODE_ID_B,
        ],
      });
      rebalancer.movePlanner.calculateMoves = () => [{
        type: MoveType.ADD,
        partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        entityId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_B,
        reason: TEST_SCALAR.PRIORITY_NON_LOCAL_MOVE_REASON,
      }];
      rebalancer.movePlanner.applyPressureGating = async (moves) => moves;

      await rebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        createdOperations[TEST_NUMBER.ZERO]?.partitionId,
        REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
        TEST_MESSAGE.CURRENT_REPLICA_PREPENDED_BEFORE_NON_LOCAL_MOVE,
      );
    },
  );

}
