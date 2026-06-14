export function registerUnifiedRebalancerPlanningGateDecisionsTests(context) {
  const {
    CONTROL_PLANE_READINESS_DIMENSION,
    CONTROL_PLANE_WORKLOAD_CLASS,
    createBackpressuredMessageRouter,
    createMockCache,
    createMockMembershipPublicationService,
    createMockReadinessService,
    createTestRebalancer,
    EntityType,
    initializeTestEnvironment,
    LOCAL_MUTATION_TEST_CONTROL_PLANE_WRITE_UNHEALTHY,
    LOCAL_MUTATION_TEST_METADATA_PUBLICATION_DEGRADED,
    NO_GLOBAL_IN_FLIGHT_OPERATIONS,
    NodeStatus,
    NON_PRIORITY_SYSTEM_PARTITION_ID,
    ONE_REBALANCE_EVALUATE_CALL,
    PRIORITY_FOLLOW_UP_NODE_ID_A,
    PRIORITY_FOLLOW_UP_NODE_ID_B,
    PRIORITY_FOLLOW_UP_NODE_ID_C,
    PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_CREATE_RECOVERY_OPERATION,
    PRIORITY_RECOVERY_OPERATION_CREATION_SCOPE_CURRENT_PARTITION,
    PRIORITY_RECOVERY_PUBLICATION_EPOCH,
    PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_READY_REPLICA_COUNT,
    PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
    PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
    PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
    PRIORITY_RECOVERY_SPREAD_GAP,
    REBALANCER_LOG_MSG,
    REBALANCER_TEST_NODE_ID_A,
    REBALANCER_TEST_NODE_ID_B,
    REBALANCER_TEST_NODE_ID_C,
    REPLICA_OPERATION_PRIORITY_PARTITION_ID,
    REPLICA_OPERATION_PRIORITY_REPLICA_ID,
    ReplicaStatus,
    resolveNoAsyncRebalancePlanningGateDecision,
    resolveNoRebalancePlanningGateDecision,
    SERVICE_TYPE,
    SYSTEM_TABLE_NAME,
    test,
    TEST_REBALANCE_PLANNING_GATE,
    TEST_REBALANCE_PLANNING_GATE_ACTION,
    TEST_REBALANCE_PLANNING_GATE_DECISION,
    TEST_REBALANCE_PLANNING_GATE_SCHEDULE_MODE,
  } = context;

  test('UnifiedRebalancer defers background planning when local control-plane mutation readiness is unhealthy',
    async (t) => {
      initializeTestEnvironment();

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: {
          getNodeReadinessSync() {
            return {
              nodeId: 'node-1',
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                false,
                [CONTROL_PLANE_READINESS_DIMENSION
                  .METADATA_PUBLICATION_HEALTHY]: false,
                [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
              },
              reasons: [
                {code: 'control_plane_write_unhealthy'},
                {code: 'metadata_publication_degraded'},
              ],
            };
          },
        },
      });

      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.currentInterval = 100;
      rebalancer.maxInterval = 1000;
      rebalancer.scheduleNextCheck = () => {};

      let evaluateCalls = 0;
      const waitLogs = [];
      rebalancer.evaluateState = async () => {
        evaluateCalls += 1;
        return false;
      };
      rebalancer.logger = {
        ...rebalancer.logger,
        info: (message, payload) => {
          if (message === REBALANCER_LOG_MSG.WAIT_LOCAL_MUTATION_READINESS) {
            waitLogs.push(payload);
          }
        },
        debug: () => {},
        warn: () => {},
        error: () => {},
      };

      try {
        await rebalancer.checkRebalance();

        t.equal(
          evaluateCalls,
          0,
          'background planning should not execute while local mutation readiness is unhealthy',
        );
        t.equal(waitLogs.length, 1, 'rebalancer should emit one defer diagnostic');
        t.same(
          waitLogs[0]?.reasonCodes,
          [
            'control_plane_write_unhealthy',
            'metadata_publication_degraded',
          ],
          'defer diagnostic should preserve readiness reason codes',
        );
      } finally {
        rebalancer.shutdown();
      }
    });

  test('UnifiedRebalancer exposes one explicit local mutation planning gate decision',
    async (t) => {
      initializeTestEnvironment();

      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: {
          getNodeReadinessSync() {
            return {
              nodeId: 'node-1',
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
                false,
                [CONTROL_PLANE_READINESS_DIMENSION
                  .METADATA_PUBLICATION_HEALTHY]: false,
                [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
              },
              reasons: [
                {code: 'control_plane_write_unhealthy'},
                {code: 'metadata_publication_degraded'},
              ],
            };
          },
        },
      });

      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;
      rebalancer.currentInterval = 100;
      rebalancer.maxInterval = 1000;

      try {
        const decision = await rebalancer.resolveCheckRebalanceGateDecision();

        t.equal(
          decision?.decision,
          TEST_REBALANCE_PLANNING_GATE_DECISION.DEFER_PLANNING,
          'gate resolution should emit the canonical defer-planning decision',
        );
        t.equal(
          decision?.nextAction,
          TEST_REBALANCE_PLANNING_GATE_ACTION.SCHEDULE_RETRY,
          'gate resolution should preserve the canonical retry action',
        );
        t.equal(
          decision?.gate,
          TEST_REBALANCE_PLANNING_GATE.LOCAL_MUTATION_READINESS,
          'gate resolution should name the local mutation blocker explicitly',
        );
        t.equal(
          decision?.scheduleMode,
          TEST_REBALANCE_PLANNING_GATE_SCHEDULE_MODE.PRIORITY_AWARE,
          'local mutation defers should keep the priority-aware retry cadence contract',
        );
        t.equal(
          decision?.scheduleDelayMs,
          125,
          'local mutation defers should carry the normalized retry delay explicitly',
        );
        t.same(
          decision?.blocker?.reasonCodes,
          [
            'control_plane_write_unhealthy',
            'metadata_publication_degraded',
          ],
          'gate resolution should preserve canonical blocker evidence',
        );
        t.equal(
          decision?.logMessage,
          REBALANCER_LOG_MSG.WAIT_LOCAL_MUTATION_READINESS,
          'gate resolution should preserve the matched diagnostic vocabulary',
        );
      } finally {
        rebalancer.shutdown();
      }
    });

  test('UnifiedRebalancer lets priority operation creation use the local ' +
  'mutation create lane', async (t) => {
    initializeTestEnvironment();

    const priorityPartitionSummary = {
      satisfied: false,
      blockedPartitions: [{
        partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        readyReplicaCount: PRIORITY_RECOVERY_READY_REPLICA_COUNT_CANONICAL,
        readyDistinctNodeCount: PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
        requiredDistinctNodeCount:
        PRIORITY_RECOVERY_REQUIRED_DISTINCT_NODE_COUNT,
        spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
      }],
    };
    const priorityRecoveryPlanningSnapshot = {
      publicationEpoch: PRIORITY_RECOVERY_PUBLICATION_EPOCH,
      publishedActiveNodeIds: [
        PRIORITY_FOLLOW_UP_NODE_ID_A,
        PRIORITY_FOLLOW_UP_NODE_ID_B,
        PRIORITY_FOLLOW_UP_NODE_ID_C,
      ],
      priorityPartitionSummary,
      priorityRecoveryDecisionSnapshots: {
        snapshots: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE_NEEDS_OPERATION,
          blockerReasons: [
            PRIORITY_RECOVERY_BLOCKER_REASON_ELIGIBLE_NO_OPERATION,
          ],
          progress: {
            nextRequiredAction:
            PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_CREATE_RECOVERY_OPERATION,
          },
          admission: {
            effectiveEligibleNodeIds: [
              PRIORITY_FOLLOW_UP_NODE_ID_A,
              PRIORITY_FOLLOW_UP_NODE_ID_B,
              PRIORITY_FOLLOW_UP_NODE_ID_C,
            ],
          },
          publication: {
            recoveryActiveNodeIds: [
              PRIORITY_FOLLOW_UP_NODE_ID_A,
              PRIORITY_FOLLOW_UP_NODE_ID_B,
              PRIORITY_FOLLOW_UP_NODE_ID_C,
            ],
          },
        }],
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
      ],
      partitions: [{
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      }],
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
              false,
              [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
              false,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [
              {code: LOCAL_MUTATION_TEST_CONTROL_PLANE_WRITE_UNHEALTHY},
              {code: LOCAL_MUTATION_TEST_METADATA_PUBLICATION_DEGRADED},
            ],
          };
        },
        getPriorityRecoveryPlanningAnswerSync() {
          return priorityRecoveryPlanningSnapshot;
        },
      },
    });

    rebalancer.initialize();
    rebalancer.isLeader = true;
    rebalancer.clusterReadinessConfirmed = true;
    rebalancer.isStabilized = () => true;
    rebalancer.scheduleNextCheck = () => {};
    rebalancer.evaluateClusterReadinessGateDecision =
    resolveNoRebalancePlanningGateDecision;
    rebalancer.resolveStartDelayPlanningGateDecision =
    resolveNoRebalancePlanningGateDecision;
    rebalancer.resolveStabilizationPlanningGateDecision =
    resolveNoRebalancePlanningGateDecision;
    rebalancer.resolveTopologySettlingPlanningGateDecision =
    resolveNoAsyncRebalancePlanningGateDecision;
    rebalancer.resolveTrafficReadinessPlanningGateDecision =
    resolveNoRebalancePlanningGateDecision;
    rebalancer.resolveLocalServePlanningGateDecision =
    resolveNoRebalancePlanningGateDecision;
    rebalancer.resolvePrioritySpreadPlanningGateDecision =
    resolveNoRebalancePlanningGateDecision;
    rebalancer.resolveTransportBackpressurePlanningGateDecision =
    resolveNoRebalancePlanningGateDecision;

    let evaluateCalls = NO_GLOBAL_IN_FLIGHT_OPERATIONS;
    rebalancer.evaluateState = async () => {
      evaluateCalls += ONE_REBALANCE_EVALUATE_CALL;
      return false;
    };

    try {
      const gateSnapshot =
      rebalancer.buildLocalMutationReadinessPlanningGateSnapshot();
      await rebalancer.checkRebalance();

      t.equal(
        gateSnapshot.shouldDefer,
        false,
        'local mutation readiness should allow required priority creation',
      );
      t.equal(
        gateSnapshot.priorityRecoveryOperationCreationRequired,
        true,
        'gate snapshot should retain the priority creation requirement',
      );
      t.equal(
        gateSnapshot.priorityRecoveryOperationCreationScope,
        PRIORITY_RECOVERY_OPERATION_CREATION_SCOPE_CURRENT_PARTITION,
        'gate snapshot should name the current-partition operation scope',
      );
      t.equal(
        evaluateCalls,
        ONE_REBALANCE_EVALUATE_CALL,
        'priority operation creation should evaluate through the local mutation create lane',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer keeps full local mutation readiness under startup ' +
  'priority bypass', async (t) => {
    initializeTestEnvironment();

    const rebalancer = createTestRebalancer({
      entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
      nodes: [
        {node_id: PRIORITY_FOLLOW_UP_NODE_ID_A, status: NodeStatus.ACTIVE},
      ],
      partitions: [{
        partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      }],
      startupRecoveryCoordinator: {
        evaluate() {
          return {
            shouldBypassLocalPriorityControlPlaneStartupReadiness: true,
          };
        },
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            nodeId: PRIORITY_FOLLOW_UP_NODE_ID_A,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
              false,
              [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
              true,
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [
              {code: LOCAL_MUTATION_TEST_CONTROL_PLANE_WRITE_UNHEALTHY},
            ],
          };
        },
      },
    });

    rebalancer.initialize();

    try {
      const blocker =
      rebalancer.getLocalControlPlaneMutationReadinessBlocker();

      t.same(
        blocker?.failedDimensions,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE],
        'startup bypass should not drop the local write-readiness dimension',
      );
      t.same(
        blocker?.reasonCodes,
        [LOCAL_MUTATION_TEST_CONTROL_PLANE_WRITE_UNHEALTHY],
        'startup bypass should preserve canonical local write-readiness reasons',
      );
    } finally {
      rebalancer.shutdown();
    }
  });

  test('UnifiedRebalancer exposes one explicit priority spread planning gate decision',
    async (t) => {
      initializeTestEnvironment();

      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            publicationRecoveryGate: {
              prioritySpreadPending: true,
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  readyReplicaCount: 2,
                  readyDistinctNodeCount: 1,
                  spreadGap: 1,
                }],
              },
            },
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: 'mg-node-1',
        entityType: EntityType.MESSAGE_GROUP,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;

      try {
        const decision = rebalancer.resolvePrioritySpreadPlanningGateDecision();

        t.equal(
          decision?.decision,
          TEST_REBALANCE_PLANNING_GATE_DECISION.DEFER_PLANNING,
          'priority spread waits should use the same canonical defer-planning decision',
        );
        t.equal(
          decision?.gate,
          TEST_REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
          'priority spread waits should expose a distinct planning gate name',
        );
        t.equal(
          decision?.scheduleMode,
          TEST_REBALANCE_PLANNING_GATE_SCHEDULE_MODE.NEXT,
          'non-priority work should schedule priority spread waits through the ordinary scheduler',
        );
        t.equal(
          decision?.scheduleDelayMs,
          rebalancer.getPriorityRetryDelayMs(),
          'priority spread waits should carry the bounded retry delay explicitly',
        );
        t.equal(
          decision?.logMessage,
          REBALANCER_LOG_MSG.WAIT_CONTROL_PLANE_PRIORITY,
          'priority spread waits should preserve the existing diagnostic message',
        );
        t.equal(
          decision?.blocker?.blockedPartitions?.length,
          1,
          'priority spread waits should preserve the blocked-partition evidence',
        );
        t.equal(
          decision?.blocker?.blockedPartitions?.[0]?.partitionId,
          'replica_operations-p1',
          'priority spread waits should retain the canonical blocked partition id',
        );
      } finally {
        rebalancer.shutdown();
      }
    });

  test('UnifiedRebalancer defers non-priority system planning while priority spread is pending',
    async (t) => {
      initializeTestEnvironment();

      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
          {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
          {node_id: REBALANCER_TEST_NODE_ID_C, status: NodeStatus.ACTIVE},
        ])),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIds: [
              REBALANCER_TEST_NODE_ID_A,
              REBALANCER_TEST_NODE_ID_B,
              REBALANCER_TEST_NODE_ID_C,
            ],
            publicationRecoveryGate: {
              prioritySpreadPending: true,
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
                  readyReplicaCount: PRIORITY_RECOVERY_READY_REPLICA_COUNT,
                  readyDistinctNodeCount:
                  PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
                  spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
                }],
              },
            },
          };
        },
      };

      const rebalancer = createTestRebalancer({
        entityId: NON_PRIORITY_SYSTEM_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        nodes: [
          {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
          {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
          {node_id: REBALANCER_TEST_NODE_ID_C, status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;

      try {
        const decision = rebalancer.resolvePrioritySpreadPlanningGateDecision();

        t.equal(
          decision?.decision,
          TEST_REBALANCE_PLANNING_GATE_DECISION.DEFER_PLANNING,
          'non-priority system work should yield to active priority recovery',
        );
        t.equal(
          decision?.gate,
          TEST_REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
          'system topology work should use the canonical priority-spread gate',
        );
        t.equal(
          decision?.blocker?.blockedPartitions?.[0]?.partitionId,
          REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          'the gate should retain the priority partition blocking recovery',
        );
      } finally {
        rebalancer.shutdown();
      }
    });

  test('UnifiedRebalancer lets blocked priority recovery partitions plan through transport backpressure',
    async (t) => {
      initializeTestEnvironment();

      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
          {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService(
          [REBALANCER_TEST_NODE_ID_A, REBALANCER_TEST_NODE_ID_B],
          PRIORITY_RECOVERY_PUBLICATION_EPOCH,
          {
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [{
                partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
                readyReplicaCount: PRIORITY_RECOVERY_READY_REPLICA_COUNT,
                readyDistinctNodeCount:
                PRIORITY_RECOVERY_READY_DISTINCT_NODE_COUNT,
                spreadGap: PRIORITY_RECOVERY_SPREAD_GAP,
              }],
            },
          },
        ),
      };
      const rebalancer = createTestRebalancer({
        entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        nodes: [
          {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
          {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
        ],
        partitions: [{
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        }],
        services: [{
          service_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID,
          service_type: SERVICE_TYPE.PARTITION,
          node_id: REBALANCER_TEST_NODE_ID_A,
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          replica_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID,
          status: ReplicaStatus.ACTIVE,
        }],
        controlPlaneReadinessService: readinessService,
        messageRouter: createBackpressuredMessageRouter(),
      });

      try {
        t.equal(
          rebalancer.resolveTransportBackpressurePlanningGateDecision(),
          null,
          'the partition named by priority recovery should not park behind ordinary transport backpressure',
        );
      } finally {
        rebalancer.shutdown();
      }
    });

  test('UnifiedRebalancer keeps transport backpressure gating for priority partitions outside the blocked recovery set',
    async (t) => {
      initializeTestEnvironment();

      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
          {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
        ])),
        membershipPublicationService: createMockMembershipPublicationService(
          [REBALANCER_TEST_NODE_ID_A, REBALANCER_TEST_NODE_ID_B],
          PRIORITY_RECOVERY_PUBLICATION_EPOCH,
          {
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitions: [],
            },
          },
        ),
      };
      const rebalancer = createTestRebalancer({
        entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        nodes: [
          {node_id: REBALANCER_TEST_NODE_ID_A, status: NodeStatus.ACTIVE},
          {node_id: REBALANCER_TEST_NODE_ID_B, status: NodeStatus.ACTIVE},
        ],
        partitions: [{
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        }],
        controlPlaneReadinessService: readinessService,
        messageRouter: createBackpressuredMessageRouter(),
      });

      try {
        const decision =
        rebalancer.resolveTransportBackpressurePlanningGateDecision();
        t.equal(
          decision?.gate,
          TEST_REBALANCE_PLANNING_GATE.TRANSPORT_BACKPRESSURE,
          'priority partitions should only bypass backpressure when they own the active recovery gap',
        );
      } finally {
        rebalancer.shutdown();
      }
    });

  test('UnifiedRebalancer does not park non-system entities behind published convergence local mutation backoff',
    async (t) => {
      initializeTestEnvironment();

      const readinessService = {
        ...createMockReadinessService(createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ])),
        getNodeReadinessSync() {
          return {
            nodeId: 'node-1',
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
              [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
            },
            reasons: [],
            priorityControlPlaneRecovery: {
              active: true,
              reasonCodes: ['priority_partitions_not_spread'],
            },
          };
        },
        membershipPublicationService: createMockMembershipPublicationService(
          ['node-1', 'node-2', 'node-3'],
          7,
          {
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitions: [{
                partitionId: 'replica_operations-p1',
                readyReplicaCount: 2,
                readyDistinctNodeCount: 1,
                spreadGap: 1,
              }],
            },
          },
        ),
      };

      const rebalancer = createTestRebalancer({
        entityId: 'mg-node-1',
        entityType: EntityType.MESSAGE_GROUP,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
          {node_id: 'node-2', status: NodeStatus.ACTIVE},
          {node_id: 'node-3', status: NodeStatus.ACTIVE},
        ],
        controlPlaneReadinessService: readinessService,
      });

      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isStabilized = () => true;

      let evaluateCalls = 0;
      rebalancer.evaluateState = async () => {
        evaluateCalls += 1;
        return false;
      };

      rebalancer.scheduleNextCheck = () => {};

      const mutationWaitLogs = [];
      rebalancer.logger = {
        ...rebalancer.logger,
        info: (message, payload) => {
          if (message === REBALANCER_LOG_MSG.WAIT_LOCAL_MUTATION_READINESS) {
            mutationWaitLogs.push(payload);
          }
        },
        debug: () => {},
        warn: () => {},
        error: () => {},
      };

      try {
        t.equal(
          rebalancer.getLocalControlPlaneMutationReadinessBlocker(),
          null,
          'non-system entities should not treat published convergence as a local mutation-readiness blocker',
        );

        await rebalancer.checkRebalance();

        t.equal(
          evaluateCalls,
          1,
          'non-system work should continue evaluating once the broad local mutation backoff is removed',
        );
        t.equal(
          mutationWaitLogs.length,
          0,
          'non-system work should not use the broad local mutation readiness backoff',
        );
      } finally {
        rebalancer.shutdown();
      }
    });

  test('UnifiedRebalancer budget queries use injected control-plane ' +
  'system-table gateway', async (t) => {
    initializeTestEnvironment();

    const gatewayCalls = [];
    const rebalancer = createTestRebalancer({
      sqlQueryEngine: {
        async executeQuery() {
          throw new Error('raw SQL path should not be used');
        },
      },
      controlPlaneSystemTableGateway: {
        async executeQuery(sql, params, queryOptions) {
          gatewayCalls.push({sql, params, queryOptions});
          if (sql.includes('SELECT config_value FROM config')) {
            return {success: true, rows: [{config_value: '7'}]};
          }
          return {success: true, rows: [{total_count: 2}]};
        },
      },
    });

    const configuredBudget = await rebalancer.getConfiguredRebalanceBudget();
    const inFlightCount = await rebalancer.getGlobalInFlightOperationCount();

    t.equal(configuredBudget, 7, 'gateway should provide config-backed budget');
    t.equal(inFlightCount, 2, 'gateway should provide in-flight count');
    t.equal(gatewayCalls.length, 2, 'gateway should own both budget reads');
    t.equal(
      gatewayCalls[0]?.queryOptions?.workClass,
      'background',
      'ordinary rebalancers should continue using background pressure class for budget reads',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_BACKGROUND_VISIBILITY,
      'ordinary rebalancers should emit the shared background workload class',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.deliveryPriority,
      'background',
      'ordinary rebalancers should continue using background delivery for budget reads',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.allowPressureDefer,
      true,
      'ordinary rebalancers should remain deferrable under pressure',
    );
  });

  test('UnifiedRebalancer budget queries stay critical for priority control-plane partitions', async (t) => {
    initializeTestEnvironment();

    const gatewayCalls = [];
    const rebalancer = createTestRebalancer({
      entityId: 'replica_operations-p1',
      entityType: EntityType.PARTITION,
      controlPlaneSystemTableGateway: {
        async executeQuery(sql, params, queryOptions) {
          gatewayCalls.push({sql, params, queryOptions});
          if (sql.includes('SELECT config_value FROM config')) {
            return {success: true, rows: [{config_value: '5'}]};
          }
          return {success: true, rows: [{total_count: 1}]};
        },
      },
    });

    const configuredBudget = await rebalancer.getConfiguredRebalanceBudget();
    const inFlightCount = await rebalancer.getGlobalInFlightOperationCount();

    t.equal(configuredBudget, 5, 'gateway should provide config-backed budget');
    t.equal(inFlightCount, 1, 'gateway should provide in-flight count');
    t.equal(gatewayCalls.length, 2, 'gateway should own both budget reads');
    t.equal(
      gatewayCalls[0]?.queryOptions?.workClass,
      'critical',
      'priority control-plane partitions should bypass background pressure gating for budget reads',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY,
      'priority rebalancers should emit the shared priority workload class',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.deliveryPriority,
      'critical',
      'priority control-plane partitions should route budget reads at critical delivery priority',
    );
    t.equal(
      gatewayCalls[0]?.queryOptions?.allowPressureDefer,
      false,
      'priority control-plane partitions should not defer budget reads under pressure',
    );
    t.equal(
      gatewayCalls[1]?.queryOptions?.workClass,
      'critical',
      'priority control-plane partitions should keep in-flight reads on the critical path',
    );
    t.equal(
      gatewayCalls[1]?.queryOptions?.workloadClass,
      CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY,
      'priority in-flight reads should use the same shared workload class',
    );
    t.equal(
      gatewayCalls[1]?.queryOptions?.deliveryPriority,
      'critical',
      'priority control-plane partitions should route in-flight reads at critical delivery priority',
    );
    t.equal(
      gatewayCalls[1]?.queryOptions?.allowPressureDefer,
      false,
      'priority control-plane partitions should not defer in-flight reads under pressure',
    );
  });
}
