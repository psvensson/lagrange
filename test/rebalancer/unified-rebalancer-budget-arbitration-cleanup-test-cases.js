export function registerUnifiedRebalancerBudgetArbitrationCleanupTests(context) {
  const {
    CONTROL_PLANE_READINESS_DIMENSION,
    createMockMembershipPublicationService,
    createTestRebalancer,
    EntityType,
    initializeTestEnvironment,
    MOVE_REASON,
    MoveType,
    NO_GLOBAL_IN_FLIGHT_OPERATIONS,
    NodeStatus,
    PRIORITY_FOLLOW_UP_NODE_ID_D,
    PRIORITY_RECOVERY_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SPREAD_GAP,
    REBALANCER_SKIP_REASON,
    REBALANCER_TEST_NODE_ID_A,
    REBALANCER_TEST_NODE_ID_B,
    REBALANCER_TEST_NODE_ID_C,
    ReplicaStatus,
    SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
    SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
    SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_B,
    SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_C,
    SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_D,
    SYSTEM_TABLE_NAME,
    test,
    TriggerType,
  } = context;

  test('UnifiedRebalancer puts the concentrated ledger cure through the move limit',
    async (t) => {
      initializeTestEnvironment();

      const ledgerPartitionId = 'replica_operations-p1';
      const nodeIds = [
        REBALANCER_TEST_NODE_ID_A,
        REBALANCER_TEST_NODE_ID_B,
        REBALANCER_TEST_NODE_ID_C,
        PRIORITY_FOLLOW_UP_NODE_ID_D,
        'node-e',
      ];
      const rebalancer = createTestRebalancer({
        entityId: ledgerPartitionId,
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        nodes: nodeIds.map((nodeId) => ({
          node_id: nodeId,
          status: NodeStatus.ACTIVE,
        })),
        partitions: [{
          partition_id: ledgerPartitionId,
          table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        }],
      });
      const executedMoves = [];
      const blockedMoves = Array.from({length: 5}, (_, index) => ({
        type: MoveType.REPLACE,
        partitionId: `other-critical-p${index + 1}`,
        replicaId: `other-critical-p${index + 1}-r1`,
      }));
      const cureMove = {
        type: MoveType.REPLACE,
        replicaId: 'replica_operations-p1-r2',
      };

      try {
        rebalancer.controlPlaneReadinessService.membershipPublicationService =
          createMockMembershipPublicationService(
            nodeIds,
            PRIORITY_RECOVERY_PUBLICATION_EPOCH,
            {priorityPartitionSummary: {satisfied: true}},
          );
        rebalancer.setLeader(true);
        rebalancer.rebalanceCoordinator
          .isOperationLedgerQuorumConcentratedForPartition = (partitionId) =>
            partitionId === ledgerPartitionId;
        rebalancer.getCurrentReplicas = () => nodeIds.slice(0, 3).map(
          (nodeId, index) => ({
            replica_id: `replica_operations-p1-r${index + 1}`,
            node_id: nodeId,
            status: ReplicaStatus.ACTIVE,
          }),
        );
        rebalancer.getAvailableNodes = () => nodeIds.map(
          (nodeId) => ({node_id: nodeId}),
        );
        rebalancer.movePlanner.calculateTargetState = async () => ({
          targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        });
        rebalancer.movePlanner.calculateMoves = () => ([
          ...blockedMoves,
          cureMove,
        ]);
        rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
        rebalancer.movePlanner.isCriticalState = () => false;
        rebalancer.maxConcurrentMoves = 5;
        rebalancer.getConfiguredRebalanceBudget = async () => 5;
        rebalancer.getGlobalInFlightOperationCount = async () =>
          NO_GLOBAL_IN_FLIGHT_OPERATIONS;
        rebalancer.executeRebalancingMoves = async (moves) => {
          executedMoves.push(...moves);
          return moves.map((move) => ({success: true, operation: move.type}));
        };

        await rebalancer.rebalance(TriggerType.PERIODIC, {
          targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        });
        t.equal(
          executedMoves[0],
          cureMove,
          'the sixth self REPLACE must cross the five-move slice boundary',
        );
        t.same(
          executedMoves.slice(1),
          blockedMoves.slice(0, 4),
          'non-cure planning order remains stable',
        );
      } finally {
        rebalancer.shutdown();
      }
    });

  test('UnifiedRebalancer prioritizes safe priority cleanup removes when ' +
  'the global budget is saturated', async (t) => {
    initializeTestEnvironment();

    const executedMoves = [];
    const rebalancer = createTestRebalancer({
      entityId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: REBALANCER_TEST_NODE_ID_A,
      nodes: [
        {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_C, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      }],
    });

    try {
      rebalancer.rebalanceCoordinator
        .isOperationLedgerQuorumConcentratedForPartition = () => true;
      rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        [
          REBALANCER_TEST_NODE_ID_A,
          REBALANCER_TEST_NODE_ID_B,
          REBALANCER_TEST_NODE_ID_C,
          PRIORITY_FOLLOW_UP_NODE_ID_D,
        ],
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary: {
            satisfied: true,
          },
        },
      );
      rebalancer.setLeader(true);
      rebalancer.getCurrentReplicas = () => ([
        {
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          node_id: REBALANCER_TEST_NODE_ID_A,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_B,
          node_id: REBALANCER_TEST_NODE_ID_B,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_C,
          node_id: REBALANCER_TEST_NODE_ID_C,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_D,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_D,
          status: ReplicaStatus.ACTIVE,
        },
      ]);
      rebalancer.getAvailableNodes = () => ([
        {node_id: REBALANCER_TEST_NODE_ID_A},
        {node_id: REBALANCER_TEST_NODE_ID_B},
        {node_id: REBALANCER_TEST_NODE_ID_C},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D},
      ]);
      rebalancer.movePlanner.calculateTargetState = async () => ({
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
      });
      rebalancer.movePlanner.calculateMoves = () => ([
        {
          type: MoveType.REPLACE,
          nodeId: REBALANCER_TEST_NODE_ID_C,
          sourceNodeId: REBALANCER_TEST_NODE_ID_A,
          replicaId: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          reason: MOVE_REASON.REPLACE_REPLICA,
        },
        {
          type: MoveType.REMOVE,
          nodeId: PRIORITY_FOLLOW_UP_NODE_ID_D,
          replicaId: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_D,
          reason: MOVE_REASON.NODE_NOT_IN_TARGET,
          standaloneSafe: true,
        },
      ]);
      rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
      rebalancer.movePlanner.isCriticalState = () => false;
      rebalancer.getConfiguredRebalanceBudget = async () =>
        PRIORITY_RECOVERY_SPREAD_GAP;
      rebalancer.getGlobalInFlightOperationCount = async () =>
        PRIORITY_RECOVERY_SPREAD_GAP;
      rebalancer.executeRebalancingMoves = async (moves) => {
        executedMoves.push(...moves);
        return moves.map((move) => ({
          success: true,
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
        }));
      };

      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT},
      );

      t.equal(result.success, true, 'cleanup pass should be accepted');
      t.equal(
        executedMoves.length,
        PRIORITY_RECOVERY_SPREAD_GAP,
        'saturated global budget should still allow one cleanup move',
      );
      t.equal(
        executedMoves[0]?.type,
        MoveType.REMOVE,
        'safe over-target cleanup remove should run before add-like work',
      );
      t.equal(
        executedMoves[0]?.replicaId,
        SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_D,
        'cleanup should target the standalone-safe over-target replica',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer prioritizes safe priority cleanup removes when ' +
  'budget is available', async (t) => {
    initializeTestEnvironment();

    const executedMoves = [];
    const rebalancer = createTestRebalancer({
      entityId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: REBALANCER_TEST_NODE_ID_A,
      nodes: [
        {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_C, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      }],
    });

    try {
      rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        [
          REBALANCER_TEST_NODE_ID_A,
          REBALANCER_TEST_NODE_ID_B,
          REBALANCER_TEST_NODE_ID_C,
          PRIORITY_FOLLOW_UP_NODE_ID_D,
        ],
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary: {
            satisfied: true,
          },
        },
      );
      rebalancer.setLeader(true);
      rebalancer.getCurrentReplicas = () => ([
        {
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          node_id: REBALANCER_TEST_NODE_ID_A,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_B,
          node_id: REBALANCER_TEST_NODE_ID_B,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_C,
          node_id: REBALANCER_TEST_NODE_ID_C,
          status: ReplicaStatus.ACTIVE,
        },
        {
          replica_id: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_D,
          node_id: PRIORITY_FOLLOW_UP_NODE_ID_D,
          status: ReplicaStatus.ACTIVE,
        },
      ]);
      rebalancer.getAvailableNodes = () => ([
        {node_id: REBALANCER_TEST_NODE_ID_A},
        {node_id: REBALANCER_TEST_NODE_ID_B},
        {node_id: REBALANCER_TEST_NODE_ID_C},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D},
      ]);
      rebalancer.movePlanner.calculateTargetState = async () => ({
        targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
      });
      rebalancer.movePlanner.calculateMoves = () => ([
        {
          type: MoveType.REPLACE,
          nodeId: REBALANCER_TEST_NODE_ID_C,
          sourceNodeId: REBALANCER_TEST_NODE_ID_A,
          replicaId: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_A,
          reason: MOVE_REASON.REPLACE_REPLICA,
        },
        {
          type: MoveType.REMOVE,
          nodeId: PRIORITY_FOLLOW_UP_NODE_ID_D,
          replicaId: SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_D,
          reason: MOVE_REASON.NODE_NOT_IN_TARGET,
          standaloneSafe: true,
        },
      ]);
      rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
      rebalancer.movePlanner.isCriticalState = () => false;
      rebalancer.getConfiguredRebalanceBudget = async () =>
        PRIORITY_RECOVERY_SPREAD_GAP;
      rebalancer.getGlobalInFlightOperationCount = async () =>
        NO_GLOBAL_IN_FLIGHT_OPERATIONS;
      rebalancer.executeRebalancingMoves = async (moves) => {
        executedMoves.push(...moves);
        return moves.map((move) => ({
          success: true,
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
        }));
      };

      const result = await rebalancer.rebalance(
        TriggerType.PERIODIC,
        {targetReplicaCount: PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT},
      );

      t.equal(result.success, true, 'cleanup pass should be accepted');
      t.equal(
        executedMoves.length,
        PRIORITY_RECOVERY_SPREAD_GAP,
        'available one-slot budget should still allow one cleanup move',
      );
      t.equal(
        executedMoves[0]?.type,
        MoveType.REMOVE,
        'safe over-target cleanup remove should spend the available slot first',
      );
      t.equal(
        executedMoves[0]?.replicaId,
        SQL_TRANSACTIONS_PRIORITY_REPLICA_ID_D,
        'cleanup should target the standalone-safe over-target replica',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer reserves one global move slot for priority recovery ' +
  'while priority spread is still unsatisfied', async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: 'tables-p1',
      entityType: EntityType.PARTITION,
      nodeId: 'node-1',
      nodes: [
        {node_id: 'node-1', status: NodeStatus.ACTIVE},
        {node_id: 'node-2', status: NodeStatus.ACTIVE},
      ],
    });
    rebalancer.controlPlaneReadinessService.membershipPublicationService =
    createMockMembershipPublicationService(
      ['node-1', 'node-2'],
      1,
      {
        priorityPartitionSummary: {
          satisfied: false,
        },
      },
    );

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
        replicaId: 'tables-p1-r2',
      },
    ]);
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
    rebalancer.movePlanner.isCriticalState = () => false;
    rebalancer.getConfiguredRebalanceBudget = async () => 1;
    rebalancer.getGlobalInFlightOperationCount = async () => 0;
    rebalancer.executeRebalancingMoves = async () => {
      t.fail(
        'non-priority system rebalancing should not consume the reserved global priority recovery slot',
      );
    };

    const result = await rebalancer.rebalance(
      TriggerType.PERIODIC,
      {targetReplicaCount: 2, placementConstraints: {}},
    );

    t.equal(
      result.success,
      true,
      'reserved-slot deferral should remain a clean skip, not a rebalance failure',
    );
    t.equal(
      result.skipped,
      true,
      'non-priority system rebalancing should yield while the reserved priority slot is held back',
    );
    t.equal(
      result.reason,
      REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
      'reserved global slot should surface through the existing budget skip reason',
    );

    rebalancer.shutdown();
  });

  test('UnifiedRebalancer constrains priority placement to published membership after published satisfied recovery', async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: REBALANCER_TEST_NODE_ID_A,
      nodes: [
        {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
        {node_id: REBALANCER_TEST_NODE_ID_C, status: NodeStatus.ACTIVE},
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_D, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: SQL_TRANSACTIONS_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      }],
    });

    try {
      rebalancer.controlPlaneReadinessService.membershipPublicationService =
      createMockMembershipPublicationService(
        [
          REBALANCER_TEST_NODE_ID_A,
          REBALANCER_TEST_NODE_ID_B,
          REBALANCER_TEST_NODE_ID_C,
        ],
        PRIORITY_RECOVERY_PUBLICATION_EPOCH,
        {
          priorityPartitionSummary: {
            satisfied: true,
          },
        },
      );
      rebalancer.controlPlaneReadinessService.getNodeReadinessSync = () => ({
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
          true,
        },
      });
      rebalancer.isGlobalPriorityControlPlaneRecoveryActive = () => true;

      const availableNodeIds = rebalancer.getAvailableNodes()
        .map((node) => node.node_id)
        .sort();

      t.same(
        availableNodeIds,
        [
          REBALANCER_TEST_NODE_ID_A,
          REBALANCER_TEST_NODE_ID_B,
          REBALANCER_TEST_NODE_ID_C,
        ].sort(),
        'published satisfied recovery must exclude stale unpublished recovery-cohort nodes from placement',
      );
    } finally {
      rebalancer.shutdown();
    }
  });
}
