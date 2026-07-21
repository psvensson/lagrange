export function registerUnifiedRebalancerPlanningGateDecisionsTests(context) {
  const {
    CONTROL_PLANE_READINESS_DIMENSION,
    CONTROL_PLANE_WORKLOAD_CLASS,
    createBackpressuredMessageRouter,
    createMockCache,
    createMockCoordinator,
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
      rebalancer.randomSource = {random: () => 0.25};

      try {
        const decision = rebalancer.resolvePrioritySpreadPlanningGateDecision();
        const expectedReleaseDelayMs =
          rebalancer.periodicCheckIntervalMs +
          rebalancer.periodicCheckJitterMs +
          Math.floor(rebalancer.periodicCheckJitterMs * 0.25);

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
          expectedReleaseDelayMs,
          'background work should wait one ordinary cadence plus deterministic jitter',
        );
        t.ok(
          decision.scheduleDelayMs > rebalancer.periodicCheckIntervalMs,
          'background release must leave a full ordinary quiet interval',
        );
        t.not(
          decision.scheduleDelayMs,
          rebalancer.getPriorityRetryDelayMs(),
          'background partitions must not synchronize on the priority retry',
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

  test('UnifiedRebalancer shares priority-clear stabilization across background entities',
    async (t) => {
      initializeTestEnvironment();

      let nowMs = 1000;
      const sharedReadinessOwner = {};
      const replacementReadinessOwner = {};
      const independentReadinessOwner = {};
      const observer = createTestRebalancer({
        entityId: 'observer-p1',
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        controlPlaneReadinessService: sharedReadinessOwner,
        nowFn: () => nowMs,
      });
      const originalOwnerBackgroundEntity = createTestRebalancer({
        entityId: 'original-owner-background-p1',
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        controlPlaneReadinessService: sharedReadinessOwner,
        nowFn: () => nowMs,
      });
      const independentObserver = createTestRebalancer({
        entityId: 'independent-observer-p1',
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        controlPlaneReadinessService: independentReadinessOwner,
        nowFn: () => nowMs,
      });
      const lateBackgroundEntity = createTestRebalancer({
        entityId: 'late-background-p1',
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        controlPlaneReadinessService: sharedReadinessOwner,
        nowFn: () => nowMs,
      });
      const priorityEntity = createTestRebalancer({
        entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        controlPlaneReadinessService: sharedReadinessOwner,
        nowFn: () => nowMs,
      });
      observer.getControlPlanePrioritySpreadBlocker = () => ({
        requiredDistinctNodeCount: 3,
        requiredQuorumDistinctNodeCount: 2,
        blockedPartitions: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          readyReplicaCount: 2,
          readyDistinctNodeCount: 1,
          spreadGap: 1,
        }],
      });
      lateBackgroundEntity.getControlPlanePrioritySpreadBlocker = () => null;
      originalOwnerBackgroundEntity.getControlPlanePrioritySpreadBlocker =
        () => null;
      independentObserver.getControlPlanePrioritySpreadBlocker =
        observer.getControlPlanePrioritySpreadBlocker;
      priorityEntity.getControlPlanePrioritySpreadBlocker = () => null;
      observer.randomSource = {random: () => 0};
      lateBackgroundEntity.randomSource = {random: () => 0};
      originalOwnerBackgroundEntity.randomSource = {random: () => 0};
      independentObserver.randomSource = {random: () => 0};

      try {
        const blockedDecision =
          observer.resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          blockedDecision.gate,
          TEST_REBALANCE_PLANNING_GATE.CONTROL_PLANE_PRIORITY_SPREAD,
          'one background observer should arm the shared priority fence',
        );

        const replacementCoordinator = createMockCoordinator();
        replacementCoordinator.controlPlaneReadinessService =
          replacementReadinessOwner;
        lateBackgroundEntity.setRebalanceCoordinator(
          replacementCoordinator,
        );
        t.equal(
          lateBackgroundEntity.controlPlaneReadinessService,
          replacementReadinessOwner,
          'the test should traverse the production readiness-owner rebind',
        );

        t.equal(
          priorityEntity.resolvePrioritySpreadPlanningGateDecision(),
          null,
          'the shared ordinary-work fence must never defer a priority partition',
        );

        const firstClearDecision =
          lateBackgroundEntity.resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          firstClearDecision.decision,
          TEST_REBALANCE_PLANNING_GATE_DECISION.DEFER_PLANNING,
          'an owner-rebound entity must not release on its first clear sample',
        );
        t.equal(
          firstClearDecision.blocker.state,
          'stabilizing',
          'the shared fence should expose its sampled-clear state',
        );
        t.equal(
          firstClearDecision.logMessage,
          REBALANCER_LOG_MSG.WAIT_CONTROL_PLANE_PRIORITY_STABILITY,
          'the clear-window hold should be distinguishable from an active spread deficit',
        );

        independentObserver.resolvePrioritySpreadPlanningGateDecision();
        const convergenceCoordinator = createMockCoordinator();
        convergenceCoordinator.controlPlaneReadinessService =
          replacementReadinessOwner;
        independentObserver.setRebalanceCoordinator(convergenceCoordinator);
        const convergedOwnerDecision =
          originalOwnerBackgroundEntity
            .resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          convergedOwnerDecision.blocker.stableElapsedMs,
          0,
          'A-to-B and C-to-B rebinds must converge on one rearmed fence',
        );

        const invalidCoordinator = createMockCoordinator();
        invalidCoordinator.controlPlaneReadinessService =
          'invalid-readiness-owner';
        lateBackgroundEntity.setRebalanceCoordinator(invalidCoordinator);
        t.equal(
          lateBackgroundEntity.controlPlaneReadinessService,
          replacementReadinessOwner,
          'an invalid owner rebind must retain the valid fenced owner',
        );
        const invalidRebindDecision =
          lateBackgroundEntity.resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          invalidRebindDecision.blocker.stableElapsedMs,
          0,
          'an invalid owner value cannot drop the active shared fence',
        );

        const admissionStableWindowMs =
          lateBackgroundEntity.periodicCheckIntervalMs;
        const observationHandoffMs =
          lateBackgroundEntity
            .getBackgroundPrioritySpreadObservationHandoffMs();
        const stableWindowMs =
          lateBackgroundEntity.getBackgroundPrioritySpreadStableWindowMs();
        t.equal(
          stableWindowMs,
          admissionStableWindowMs + observationHandoffMs,
          'the shared fence should include the configured observation handoff',
        );
        t.equal(
          convergedOwnerDecision.scheduleDelayMs,
          stableWindowMs,
          'the first clear sample should schedule the exact shared maturity deadline',
        );

        nowMs += admissionStableWindowMs;
        const admissionBoundaryDecision =
          lateBackgroundEntity.resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          admissionBoundaryDecision.blocker.stableRemainingMs,
          observationHandoffMs,
          'an unchanged 60-second admission candidate must mature before ordinary release',
        );
        t.equal(
          admissionBoundaryDecision.scheduleDelayMs,
          observationHandoffMs,
          'a boundary recheck must preserve the existing maturity deadline',
        );

        nowMs += observationHandoffMs - 1;
        const lastHeldDecision =
          lateBackgroundEntity.resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          lastHeldDecision.blocker.stableRemainingMs,
          1,
          'the shared fence should remain closed through the observation handoff',
        );
        t.equal(
          lastHeldDecision.scheduleDelayMs,
          1000,
          'late progress should use the scheduler floor without restarting a full cadence',
        );

        nowMs += 1;
        t.equal(
          lateBackgroundEntity.resolvePrioritySpreadPlanningGateDecision(),
          null,
          'a clear sample after the observation handoff should release ordinary planning',
        );
      } finally {
        observer.shutdown();
        lateBackgroundEntity.shutdown();
        originalOwnerBackgroundEntity.shutdown();
        independentObserver.shutdown();
        priorityEntity.shutdown();
      }
    });

  test('UnifiedRebalancer priority leader arms release before a late background observer',
    async (t) => {
      initializeTestEnvironment();

      let nowMs = 1000;
      const readyLeaseExpiresAt = Date.now() + 100_000;
      const nodes = [
        {
          node_id: REBALANCER_TEST_NODE_ID_A,
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: readyLeaseExpiresAt,
        },
        {
          node_id: REBALANCER_TEST_NODE_ID_B,
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: readyLeaseExpiresAt,
        },
        {
          node_id: REBALANCER_TEST_NODE_ID_C,
          status: NodeStatus.ACTIVE,
          ready_lease_expires_at: readyLeaseExpiresAt,
        },
      ];
      const readinessService = {
        ...createMockReadinessService(createMockCache(nodes)),
        getMembershipPublicationPlanningAnswerSync() {
          return {
            publishedActiveNodeIds: nodes.map((node) => node.node_id),
            publicationRecoveryGate: {
              prioritySpreadPending: false,
              priorityPartitionSummary: {
                satisfied: true,
                blockedPartitions: [],
              },
            },
          };
        },
      };
      const priorityTableIds = [
        SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
        SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
        SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
        SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
      ];
      const clearPriorityPartitions = priorityTableIds.map((tableId) => ({
        partition_id: `${tableId}-p1`,
        table_id: tableId,
        leader_node_id: REBALANCER_TEST_NODE_ID_A,
        replica_count: 3,
      }));
      const clearPriorityServices = priorityTableIds.flatMap((tableId) => {
        const partitionId = `${tableId}-p1`;
        return nodes.map((node, index) => ({
          service_id: `${partitionId}-r${index + 1}`,
          partition_id: partitionId,
          service_type: EntityType.PARTITION,
          node_id: node.node_id,
          status: ReplicaStatus.ACTIVE,
          raft_role: index === 0 ? 'leader' : 'follower',
          address:
            `${node.node_id}/partition/${partitionId}-r${index + 1}`,
        }));
      });
      const priorityEntity = createTestRebalancer({
        entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        nodes,
        partitions: [{
          partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        }],
        services: [
          {
            service_id: REPLICA_OPERATION_PRIORITY_REPLICA_ID,
            partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
            service_type: EntityType.PARTITION,
            node_id: REBALANCER_TEST_NODE_ID_A,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
            address:
              `${REBALANCER_TEST_NODE_ID_A}/partition/` +
              `${REPLICA_OPERATION_PRIORITY_PARTITION_ID}-r1`,
          },
          {
            service_id: `${REPLICA_OPERATION_PRIORITY_PARTITION_ID}-r2`,
            partition_id: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
            service_type: EntityType.PARTITION,
            node_id: REBALANCER_TEST_NODE_ID_A,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
            address:
              `${REBALANCER_TEST_NODE_ID_A}/partition/` +
              `${REPLICA_OPERATION_PRIORITY_PARTITION_ID}-r2`,
          },
        ],
        controlPlaneReadinessService: readinessService,
        nowFn: () => nowMs,
      });
      const independentBackgroundEntity = createTestRebalancer({
        entityId: NON_PRIORITY_SYSTEM_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        nodes,
        partitions: clearPriorityPartitions,
        services: clearPriorityServices,
        controlPlaneReadinessService: {...readinessService},
        nowFn: () => nowMs,
      });
      const lateBackgroundEntity = createTestRebalancer({
        entityId: NON_PRIORITY_SYSTEM_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        nodes,
        partitions: clearPriorityPartitions,
        services: clearPriorityServices,
        controlPlaneReadinessService: readinessService,
        nowFn: () => nowMs,
      });

      try {
        const canonicalPlanningAnswer =
          readinessService.getMembershipPublicationPlanningAnswerSync;
        readinessService.getMembershipPublicationPlanningAnswerSync =
          () => ({});
        t.equal(
          priorityEntity.resolvePrioritySpreadPlanningGateDecision(),
          null,
          'malformed publication evidence must not defer priority planning',
        );
        t.equal(
          lateBackgroundEntity.resolvePrioritySpreadPlanningGateDecision(),
          null,
          'malformed publication evidence must not arm the shared release owner',
        );
        readinessService.getMembershipPublicationPlanningAnswerSync =
          canonicalPlanningAnswer;
        const priorityBlocker =
          priorityEntity.getControlPlanePrioritySpreadBlocker();
        t.match(
          priorityBlocker?.blockedPartitions.find(
            (partition) =>
              partition.partitionId ===
                REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          ),
          {
            readyReplicaCount: 2,
            readyDistinctNodeCount: 1,
            spreadGap: 2,
          },
          'the priority leader must derive the live gap despite a sticky clear publication',
        );
        t.equal(
          priorityEntity.resolvePrioritySpreadPlanningGateDecision(),
          null,
          'priority planning must remain exempt while observing its own gap',
        );

        nowMs += 10_000;
        t.equal(
          independentBackgroundEntity
            .resolvePrioritySpreadPlanningGateDecision(),
          null,
          'the priority observation must not leak into an independent owner scope',
        );
        t.equal(
          lateBackgroundEntity.getControlPlanePrioritySpreadBlocker(),
          null,
          'the later cache snapshot must prove every priority partition clear',
        );
        const lateClearDecision =
          lateBackgroundEntity.resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          lateClearDecision?.blocker?.state,
          'stabilizing',
          'the first ordinary check after clear must inherit the priority owner observation',
        );
        t.equal(
          lateClearDecision?.blocker?.stableElapsedMs,
          0,
          'a late ordinary observer must start the existing clear window, not release work',
        );
      } finally {
        priorityEntity.shutdown();
        lateBackgroundEntity.shutdown();
        independentBackgroundEntity.shutdown();
      }
    });

  test('UnifiedRebalancer anchors active background release to global topology quiescence',
    async (t) => {
      initializeTestEnvironment();

      let nowMs = 1000;
      const sharedReadinessOwner = {};
      const visibleReplicaOperations = [];
      const systemTableCache = createMockCache();
      const filterCachedRows = systemTableCache.filter;
      systemTableCache.filter = (tableName, predicate) => {
        if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
          return visibleReplicaOperations.filter(predicate);
        }
        return filterCachedRows(tableName, predicate);
      };
      const schemaOperation = {
        operation_id: 'schema-provisioning-add-p1-r4',
        type: 'ADD',
        partition_id: 'schema-provisioning-p1',
        replica_id: 'schema-provisioning-p1-r4',
        source_node_id: REBALANCER_TEST_NODE_ID_A,
        target_node_id: REBALANCER_TEST_NODE_ID_B,
        status: 'syncing',
        workflow_step: 'SYNCING',
        created_at: nowMs,
        updated_at: nowMs,
        completed_at: null,
        error_message: null,
        steps_history: '[]',
        entity_type: EntityType.PARTITION,
        entity_id: 'schema-provisioning-p1',
      };
      visibleReplicaOperations.push({
        ...schemaOperation,
        operation_id: 'pre-clear-completed-add-p1-r3',
        replica_id: 'pre-clear-completed-p1-r3',
        status: 'active',
        workflow_step: 'ACTIVE',
        created_at: nowMs - 500,
        updated_at: nowMs - 1,
        completed_at: nowMs - 1,
      });
      const observer = createTestRebalancer({
        entityId: 'priority-spread-observer-p1',
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        controlPlaneReadinessService: sharedReadinessOwner,
        nowFn: () => nowMs,
      });
      const backgroundEntity = createTestRebalancer({
        entityId: 'ordinary-background-p1',
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        systemTableCache,
        controlPlaneReadinessService: sharedReadinessOwner,
        nowFn: () => nowMs,
      });
      const priorityEntity = createTestRebalancer({
        entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
        entityType: EntityType.PARTITION,
        nodeId: REBALANCER_TEST_NODE_ID_A,
        systemTableCache,
        controlPlaneReadinessService: sharedReadinessOwner,
        nowFn: () => nowMs,
      });
      observer.getControlPlanePrioritySpreadBlocker = () => ({
        requiredDistinctNodeCount: 3,
        requiredQuorumDistinctNodeCount: 2,
        blockedPartitions: [{
          partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          readyReplicaCount: 2,
          readyDistinctNodeCount: 1,
          spreadGap: 1,
        }],
      });
      backgroundEntity.getControlPlanePrioritySpreadBlocker = () => null;
      priorityEntity.getControlPlanePrioritySpreadBlocker = () => null;
      observer.randomSource = {random: () => 0};
      backgroundEntity.randomSource = {random: () => 0};

      try {
        observer.resolvePrioritySpreadPlanningGateDecision();
        const firstClearDecision =
          backgroundEntity.resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          firstClearDecision.blocker.stableElapsedMs,
          0,
          'the first priority-clear sample should start the active release clock',
        );

        nowMs += 20_000;
        schemaOperation.created_at = nowMs;
        schemaOperation.updated_at = nowMs;
        visibleReplicaOperations.push(schemaOperation);
        t.equal(
          priorityEntity.resolvePrioritySpreadPlanningGateDecision(),
          null,
          'global topology work must not defer a priority partition',
        );

        nowMs += 39_000;
        schemaOperation.status = 'active';
        schemaOperation.workflow_step = 'ACTIVE';
        schemaOperation.updated_at = nowMs;
        schemaOperation.completed_at = nowMs;

        nowMs += 11_000;
        const missedIntervalDecision =
          backgroundEntity.resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          missedIntervalDecision.blocker.stableElapsedMs,
          11_000,
          'a retained terminal row should recover work missed between evaluations',
        );
        t.equal(
          missedIntervalDecision.blocker.stableRemainingMs,
          59_000,
          'the scheduled recheck should preserve the post-drain maturity deadline',
        );

        const admissionStableWindowMs =
          backgroundEntity.periodicCheckIntervalMs;
        const observationHandoffMs =
          backgroundEntity
            .getBackgroundPrioritySpreadObservationHandoffMs();
        nowMs = schemaOperation.completed_at + admissionStableWindowMs;
        const admissionBoundaryDecision =
          backgroundEntity.resolvePrioritySpreadPlanningGateDecision();
        t.equal(
          admissionBoundaryDecision.blocker.stableRemainingMs,
          observationHandoffMs,
          'ordinary work should remain fenced through the observation handoff',
        );

        nowMs += observationHandoffMs;
        t.equal(
          backgroundEntity.resolvePrioritySpreadPlanningGateDecision(),
          null,
          'ordinary work should release after full post-drain stability',
        );

        visibleReplicaOperations.push({
          ...schemaOperation,
          operation_id: 'post-release-ordinary-add-p1-r5',
          replica_id: 'post-release-ordinary-p1-r5',
          status: 'syncing',
          workflow_step: 'SYNCING',
          created_at: nowMs,
          updated_at: nowMs,
          completed_at: null,
        });
        t.equal(
          backgroundEntity.resolvePrioritySpreadPlanningGateDecision(),
          null,
          'later ordinary work must not re-arm a completed formation release',
        );
      } finally {
        observer.shutdown();
        backgroundEntity.shutdown();
        priorityEntity.shutdown();
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
  });
}
