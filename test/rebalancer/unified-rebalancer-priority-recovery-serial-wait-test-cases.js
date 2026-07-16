export async function registerPriorityRecoverySerialWaitTestCases(t, context) {
  const {
    CONTROL_PLANE_PUBLICATIONS_PRIORITY_PARTITION_ID,
    createMockCache,
    createMockCoordinator,
    createMockReadinessService,
    createTestRebalancer,
    EntityType,
    NodeStatus,
    OperationType,
    PRIORITY_FOLLOW_UP_NODE_ID_A,
    PRIORITY_FOLLOW_UP_NODE_ID_B,
    PRIORITY_FOLLOW_UP_RAFT_ROLE_VOTER,
    PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX,
    PRIORITY_RECOVERY_ABSENT_OPERATION,
    PRIORITY_RECOVERY_BLOCKER_REASON,
    PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
    PRIORITY_RECOVERY_EXISTING_ORDINARY_OPERATION_ID,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
    PRIORITY_RECOVERY_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING,
    PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SEMANTIC_STATE,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
    PRIORITY_RECOVERY_SPREAD_GAP,
    PRIORITY_RECOVERY_WAIT_FOR_OPERATION_PROGRESS,
    PRIORITY_SERIAL_WAIT_PUBLICATION_OPERATION_ID,
    PRIORITY_SERIAL_WAIT_REPLICA_OPERATION_ID,
    PRIORITY_SERIAL_WAIT_TRANSACTION_OPERATION_ID,
    PRIORITY_SURROGATE_CREATED_OPERATION_ID,
    PRIORITY_SURROGATE_PENDING_OPERATION_ID,
    REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
    ReplicaStatus,
    SERVICE_TYPE,
    SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
    SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
    SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
    SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
    SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
    SQL_WRITE_OPERATION_PRIORITY_REPLICA_ID_A,
    SYSTEM_TABLE_NAME,
    TEST_MESSAGE,
    TEST_NAME,
    TEST_NUMBER,
    TriggerType,
    WORKFLOW_STEP,
  } = context;

  await t.test(
    TEST_NAME.SCHEDULES_SQL_TRANSACTIONS_WITHOUT_SERIAL_WAIT,
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
          service_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
          replica_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
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
          partition_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
        },
        {
          partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
        },
      ];
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
        ],
      };
      const priorityRecoveryClosureWitness = {
        blockedPartitionIds: [
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
        ],
        priorityPartitionSummary,
        priorityRecoveryClosureWitness,
        publicationRecoveryGate: {
          prioritySpreadPending: PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING,
          priorityPartitionSummary,
          priorityRecoveryClosureWitness,
        },
        priorityRecoveryDecisionSnapshots: {
          snapshots: [
            {
              partitionId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
              schedulingOwner: {
                partitionId:
                  SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
                mode: 'surrogate_owner',
              },
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
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
                operation: PRIORITY_RECOVERY_ABSENT_OPERATION,
                serialWaitOperationCount: TEST_NUMBER.ZERO,
                serialWaitOperationIds: [],
                serialWaitPartitionIds: [],
              },
            },
          ],
        },
      };
      const missingSerialWaitPlanningSnapshot = {
        ...planningSnapshot,
        priorityRecoveryDecisionSnapshots: {
          snapshots: [
            {
              ...planningSnapshot.priorityRecoveryDecisionSnapshots
                .snapshots[TEST_NUMBER.ZERO],
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
      );
      const createdOperationsWithMissingSerialWait = [];
      const missingSerialWaitReadinessService = {
        ...createMockReadinessService(cache),
        getPriorityRecoveryPlanningSnapshotBestEffort() {
          return missingSerialWaitPlanningSnapshot;
        },
        getPriorityRecoveryPlanningAnswerSync() {
          return missingSerialWaitPlanningSnapshot;
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              priorityPartitionSummary,
              priorityRecoveryClosureWitness,
            };
          },
        },
      };
      const missingSerialWaitCoordinator = {
        ...createMockCoordinator(),
        getConcurrentAddCountByPriorityClass: async () => ({
          priorityCount: TEST_NUMBER.ONE,
          ordinaryPriorityCount: TEST_NUMBER.ONE,
          emergencyPriorityCount: TEST_NUMBER.ZERO,
          nonPriorityCount: TEST_NUMBER.ZERO,
        }),
        createOperation: async (move) => {
          createdOperationsWithMissingSerialWait.push(move);
          return {
            operationId: PRIORITY_RECOVERY_EXISTING_ORDINARY_OPERATION_ID,
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
      const missingSerialWaitRebalancer = createTestRebalancer({
        entityId: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
        rebalanceCoordinator: missingSerialWaitCoordinator,
        controlPlaneReadinessService: missingSerialWaitReadinessService,
        nodes: nodeRows,
        services: serviceRows,
        partitions: partitionRows,
      });

      missingSerialWaitRebalancer.setLeader(true);
      missingSerialWaitRebalancer.clusterReadinessConfirmed = true;
      missingSerialWaitRebalancer.isStabilized = () => true;
      missingSerialWaitRebalancer.getConfiguredRebalanceBudget = async () =>
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT;
      missingSerialWaitRebalancer.getGlobalInFlightOperationCount = async () =>
        TEST_NUMBER.ZERO;
      missingSerialWaitRebalancer.scheduleNextCheck = () => {};
      missingSerialWaitRebalancer.movePlanner.calculateTargetState =
        async () => ({
          targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
          targetNodes: [
            PRIORITY_FOLLOW_UP_NODE_ID_A,
            PRIORITY_FOLLOW_UP_NODE_ID_B,
          ],
        });
      missingSerialWaitRebalancer.movePlanner.calculateMoves = () => [];
      missingSerialWaitRebalancer.movePlanner.applyPressureGating =
        async (moves) => moves;

      await missingSerialWaitRebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        createdOperationsWithMissingSerialWait.length,
        TEST_NUMBER.ZERO,
        TEST_MESSAGE.SQL_TRANSACTIONS_MISSING_SERIAL_WAIT_BLOCKS_OPERATION,
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
              priorityRecoveryClosureWitness,
            };
          },
        },
      };
      const createdOperations = [];
      const coordinator = {
        ...createMockCoordinator(),
        getConcurrentAddCountByPriorityClass: async () => ({
          priorityCount: TEST_NUMBER.ONE,
          ordinaryPriorityCount: TEST_NUMBER.ONE,
          emergencyPriorityCount: TEST_NUMBER.ZERO,
          nonPriorityCount: TEST_NUMBER.ZERO,
        }),
        createOperation: async (move) => {
          createdOperations.push(move);
          return {
            operationId: PRIORITY_RECOVERY_EXISTING_ORDINARY_OPERATION_ID,
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
        entityId: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
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

      await rebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        createdOperations.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.SQL_TRANSACTIONS_NO_SERIAL_WAIT_PERSISTS_OPERATION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO]?.partitionId,
        SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        TEST_MESSAGE.SQL_TRANSACTIONS_NO_SERIAL_WAIT_RETARGETS_PARTITION,
      );
    },
  );

  await t.test(
    TEST_NAME.SCHEDULES_RECONSTRUCTED_SQL_WRITE_WITHOUT_SERIAL_WAIT,
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
      ];
      const partitionRows = [
        {
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
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
        ],
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
        ],
        priorityPartitionSummary,
        priorityRecoveryClosureWitness,
        publicationRecoveryGate: {
          prioritySpreadPending: PRIORITY_RECOVERY_PUBLICATION_SPREAD_PENDING,
          priorityPartitionSummary,
          priorityRecoveryClosureWitness,
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
              priorityRecoveryClosureWitness,
            };
          },
        },
      };
      const createdOperations = [];
      const coordinator = {
        ...createMockCoordinator(),
        getConcurrentAddCountByPriorityClass: async () => ({
          priorityCount: TEST_NUMBER.ONE,
          ordinaryPriorityCount: TEST_NUMBER.ONE,
          emergencyPriorityCount: TEST_NUMBER.ZERO,
          nonPriorityCount: TEST_NUMBER.ZERO,
        }),
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

      await rebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        createdOperations.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE
          .SQL_WRITE_RECONSTRUCTED_NO_SERIAL_WAIT_PERSISTS_OPERATION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO]?.partitionId,
        SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
        TEST_MESSAGE
          .SQL_WRITE_RECONSTRUCTED_NO_SERIAL_WAIT_RETARGETS_PARTITION,
      );
    },
  );

  await t.test(
    TEST_NAME.RECONSTRUCTS_CURRENT_NEEDS_OPERATION,
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
          service_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_A,
          partition_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
          replica_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
          address:
            PRIORITY_FOLLOW_UP_SERVICE_ADDRESS_PREFIX +
            SQL_TRANSACTION_PARTICIPANTS_PRIORITY_REPLICA_ID_A,
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
          partition_id: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
        },
        {
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
        },
      ];
      const replicaOperations = [
        {
          operation_id: PRIORITY_SERIAL_WAIT_PUBLICATION_OPERATION_ID,
          partition_id: CONTROL_PLANE_PUBLICATIONS_PRIORITY_PARTITION_ID,
          type: OperationType.REPLACE,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
          target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        },
        {
          operation_id: PRIORITY_SERIAL_WAIT_REPLICA_OPERATION_ID,
          partition_id: REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
          type: OperationType.REPLACE,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
          target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        },
        {
          operation_id: PRIORITY_SERIAL_WAIT_TRANSACTION_OPERATION_ID,
          partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
          type: OperationType.REPLACE,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
          target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        },
        {
          operation_id: PRIORITY_SURROGATE_PENDING_OPERATION_ID,
          partition_id: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
          type: OperationType.REPLACE,
          status: ReplicaStatus.PENDING,
          workflow_step: WORKFLOW_STEP.PENDING,
          target_node_id: PRIORITY_FOLLOW_UP_NODE_ID_B,
        },
      ];
      const priorityPartitionSummary = {
        satisfied: PRIORITY_RECOVERY_CLOSURE_WITNESS_SATISFIED,
        blockedPartitions: [
          {
            partitionId: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
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
              partitionId:
                SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
              semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
              blockerReasons: [
                PRIORITY_RECOVERY_BLOCKER_REASON.SERIAL_OPERATION_WAIT,
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
                serialWaitOperationCount:
                  PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
                serialWaitOperationIds: [
                  PRIORITY_SERIAL_WAIT_PUBLICATION_OPERATION_ID,
                  PRIORITY_SERIAL_WAIT_REPLICA_OPERATION_ID,
                  PRIORITY_SERIAL_WAIT_TRANSACTION_OPERATION_ID,
                ],
                serialWaitPartitionIds: [
                  CONTROL_PLANE_PUBLICATIONS_PRIORITY_PARTITION_ID,
                  REPLICA_OPERATIONS_PRIORITY_PARTITION_ID,
                  SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
                ],
              },
            },
            {
              partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
              semanticState:
                PRIORITY_RECOVERY_SEMANTIC_STATE_RECOVERING_IN_FLIGHT,
              blockerReasons: [],
              coordinator: {
                operationCount: TEST_NUMBER.ONE,
                operationIds: [PRIORITY_SURROGATE_PENDING_OPERATION_ID],
                operation: {
                  operationId: PRIORITY_SURROGATE_PENDING_OPERATION_ID,
                  partitionId: SQL_WRITE_OPERATION_PRIORITY_PARTITION_ID,
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
        entityId: SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
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

      await rebalancer.rebalance(TriggerType.PERIODIC, {
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      });

      t.equal(
        createdOperations.length,
        TEST_NUMBER.ONE,
        TEST_MESSAGE.RECONSTRUCTED_FOLLOW_UP_PERSISTS_OPERATION,
      );
      t.equal(
        createdOperations[TEST_NUMBER.ZERO]?.partitionId,
        SQL_TRANSACTION_PARTICIPANTS_PRIORITY_PARTITION_ID,
        TEST_MESSAGE.RECONSTRUCTED_FOLLOW_UP_RETARGETS_CURRENT_PARTITION,
      );
    },
  );
}
