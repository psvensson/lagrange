export function registerUnifiedRebalancerLifecycleAndRecoveryProgressEventsTests(context) {
  const {
    CONTROL_PLANE_READINESS_DIMENSION,
    createEventedMockCoordinator,
    createMockCache,
    createMockCdcService,
    createMockCoordinator,
    createMockMessageRouter,
    createMockPolicyService,
    createMockReadinessService,
    createTestRebalancer,
    EntityType,
    initializeTestEnvironment,
    MoveType,
    NO_PROGRESS_LISTENERS,
    NodeStatus,
    ONE_MEMBERSHIP_PUBLICATION_RECONCILE_CALL,
    ONE_PROGRESS_LISTENER,
    ORDINARY_PROGRESS_PARTITION_ID,
    PRESSURE_BEHAVIOR_DECISION,
    PRESSURE_STATE,
    PRIORITY_PROGRESS_NODE_ID,
    PRIORITY_PROGRESS_OPERATION_ID,
    PRIORITY_PROGRESS_PARTITION_ID,
    PRIORITY_VISIBILITY_CDC_OPERATION,
    PRIORITY_VISIBILITY_NON_TERMINAL_OPERATION_ID,
    PRIORITY_VISIBILITY_OPERATION_STATUS_FAILED,
    PRIORITY_VISIBILITY_OPERATION_STATUS_SYNCING,
    PRIORITY_VISIBILITY_OPERATION_TYPE,
    PRIORITY_VISIBILITY_OPERATION_WORKFLOW_STEP_FAILED,
    PRIORITY_VISIBILITY_OPERATION_WORKFLOW_STEP_SYNCING,
    PRIORITY_VISIBILITY_SERVICE_ID,
    PRIORITY_VISIBILITY_SERVICE_STATUS_ACTIVE,
    PRIORITY_VISIBILITY_TARGET_NODE_ID,
    PRIORITY_VISIBILITY_TERMINAL_OPERATION_ID,
    REBALANCE_COORDINATOR_EVENT,
    RECONCILE_REASON,
    REPLICA_OPERATION_PRIORITY_PARTITION_ID,
    SERVICE_TYPE,
    SYSTEM_TABLE_NAME,
    test,
    TriggerType,
    UnifiedRebalancer,
    WORKFLOW_STEP,
  } = context;

  test('UnifiedRebalancer - Basic Initialization', async (t) => {
    initializeTestEnvironment();

    await t.test('creates rebalancer with default options', async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        nodes: [
          {node_id: 'node-1', status: NodeStatus.ACTIVE},
        ],
      });

      t.equal(rebalancer.entityId, 'partition-1');
      t.equal(rebalancer.entityType, EntityType.PARTITION);
      t.equal(rebalancer.isLeader, false);
      t.equal(rebalancer.initialized, false);
    });

    await t.test('classifies split child system partitions using canonical table ownership',
      async (t) => {
        const rebalancer = createTestRebalancer({
          entityId: 'replica_operations_p_deadbeef_left',
          entityType: EntityType.PARTITION,
          nodeId: 'node-1',
          nodes: [
            {node_id: 'node-1', status: NodeStatus.ACTIVE},
          ],
          partitions: [
            {
              partition_id: 'replica_operations_p_deadbeef_left',
              table_id: 'replica_operations',
              replica_count: 3,
            },
          ],
        });

        t.equal(
          rebalancer.isSystemPartitionEntity(),
          true,
          'split child partitions of system tables should remain system entities',
        );
        t.equal(
          rebalancer.isCriticalSystemPartition(),
          true,
          'critical classification should follow the partition owner row table id',
        );
        t.equal(
          rebalancer.isControlPlanePriorityPartition(),
          true,
          'priority classification should include split descendants of priority tables',
        );
      });

    await t.test('initializes rebalancer', async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();

      t.equal(rebalancer.initialized, true);
    });

    await t.test('inherits admission/accounting owners from coordinator',
      async (t) => {
        const rebalancer = createTestRebalancer({
          entityId: 'partition-1',
          entityType: EntityType.PARTITION,
          nodeId: 'node-1',
          nodes: [
            {node_id: 'node-1', status: NodeStatus.ACTIVE},
          ],
        });

        t.equal(
          rebalancer.storageAdmissionService,
          rebalancer.rebalanceCoordinator.storageAdmissionService,
        );
        t.equal(
          rebalancer.storageAccountingService,
          rebalancer.rebalanceCoordinator.storageAccountingService,
        );
        t.equal(
          rebalancer.movePlanner.storageAdmissionService,
          rebalancer.storageAdmissionService,
        );
        t.equal(
          rebalancer.movePlanner.storagePressureBehavior.accountingService,
          rebalancer.storageAccountingService,
        );
      });

    await t.test('setRebalanceCoordinator refreshes owner dependencies',
      async (t) => {
        const rebalancer = createTestRebalancer({
          entityId: 'partition-1',
          entityType: EntityType.PARTITION,
          nodeId: 'node-1',
        });
        const replacementCoordinator = createMockCoordinator();

        rebalancer.storageAdmissionService = null;
        rebalancer.storageAccountingService = null;
        rebalancer.movePlanner.storageAdmissionService = null;
        rebalancer.movePlanner.accountingService = null;

        rebalancer.setRebalanceCoordinator(replacementCoordinator);

        t.equal(
          rebalancer.storageAdmissionService,
          replacementCoordinator.storageAdmissionService,
        );
        t.equal(
          rebalancer.storageAccountingService,
          replacementCoordinator.storageAccountingService,
        );
        t.equal(
          rebalancer.movePlanner.storageAdmissionService,
          replacementCoordinator.storageAdmissionService,
        );
        t.equal(
          rebalancer.movePlanner.accountingService,
          replacementCoordinator.storageAccountingService,
        );
        t.equal(
          rebalancer.movePlanner.storagePressureBehavior.accountingService,
          replacementCoordinator.storageAccountingService,
        );
      });

    await t.test('rebalance applies storage pressure gating through the ' +
    'canonical pressure owner', async (t) => {
      const now = Date.now();
      const pressureCalls = [];
      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        systemTableCache: createMockCache(
          [{
            node_id: 'node-1',
            status: 'active',
            ready_lease_expires_at: now + 10000,
          }, {
            node_id: 'node-2',
            status: 'active',
            ready_lease_expires_at: now + 10000,
          }],
          [{
            service_id: 'svc-1',
            partition_id: 'partition-1',
            node_id: 'node-1',
            status: 'active',
            address: 'node-1/partition/partition-1',
          }],
          [{
            partition_id: 'partition-1',
            table_id: 'tbl-1',
            leader_node_id: 'node-1',
            replica_count: 2,
          }],
          [{
            table_id: 'tbl-1',
            table_name: 'users',
            table_policies: JSON.stringify({targetReplicaCount: 2}),
          }],
          [],
        ),
        cdcIntegrationService: createMockCdcService(),
        tablePolicyService: {
          getPolicyForPartition: () => ({
            targetReplicaCount: 2,
            placementConstraints: {},
          }),
        },
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: createMockCoordinator(),
        sqlQueryEngine: {
          async executeQuery() {
            return {success: true, rows: []};
          },
        },
        controlPlaneReadinessService: {
          getNodeReadinessSync: () => ({
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            },
          }),
          getNodeReadiness: async () => ({
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            },
          }),
        },
        storagePressureBehavior: {
          async shouldAllowMove(nodeId, criticality) {
            pressureCalls.push({nodeId, criticality});
            return {
              decision: PRESSURE_BEHAVIOR_DECISION.ALLOW,
              pressureState: nodeId === 'node-2' ?
                PRESSURE_STATE.HARD :
                PRESSURE_STATE.NORMAL,
            };
          },
        },
      });

      rebalancer.setLeader(true);
      try {
        const result = await rebalancer.rebalance(
          TriggerType.PERIODIC,
          {
            targetReplicaCount: 2,
            placementConstraints: {},
          },
        );

        t.equal(result.success, true);
        t.ok(
          pressureCalls.some((call) =>
            call.nodeId === 'node-2' &&
            call.criticality === 'critical'),
          'active rebalance path must consult the injected pressure owner ' +
          'for the storage-increasing target node',
        );
      } finally {
        rebalancer.setLeader(false);
        await rebalancer.shutdown();
      }
    });

    await t.test('sets leader status', async (t) => {
      const rebalancer = createTestRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
      });

      rebalancer.initialize();
      t.equal(rebalancer.isLeader, false);

      rebalancer.setLeader(true);
      t.equal(rebalancer.isLeader, true);

      rebalancer.setLeader(false);
      t.equal(rebalancer.isLeader, false);

      rebalancer.shutdown();
    });

    await t.test(
      'priority recovery coordinator progress re-enters partition planning',
      async (t) => {
        const coordinator = createEventedMockCoordinator();
        const rebalancer = createTestRebalancer({
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: PRIORITY_PROGRESS_NODE_ID,
          rebalanceCoordinator: coordinator,
        });
        const enqueuedReasons = [];
        rebalancer.isLeader = true;
        rebalancer.enqueueRebalanceCheck = (reason) => {
          enqueuedReasons.push(reason);
          return true;
        };

        coordinator.emit(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, {
          operation: {
            operationId: PRIORITY_PROGRESS_OPERATION_ID,
            entityType: EntityType.PARTITION,
            entityId: PRIORITY_PROGRESS_PARTITION_ID,
            partitionId: PRIORITY_PROGRESS_PARTITION_ID,
          },
          newStep: WORKFLOW_STEP.ACTIVE,
        });

        t.same(
          enqueuedReasons,
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'spread-changing coordinator progress should enqueue one priority planning pass',
        );

        rebalancer.shutdown();
      },
    );

    await t.test(
      'priority recovery terminal progress re-enters membership publication planning',
      async (t) => {
        const coordinator = createEventedMockCoordinator();
        const membershipPublicationReconcileCalls = [];
        const controlPlaneReadinessService = {
          ...createMockReadinessService(createMockCache()),
          membershipPublicationService: {
            enqueueClusterMembershipReconcile(reason, context) {
              membershipPublicationReconcileCalls.push({reason, context});
              return true;
            },
          },
        };
        const rebalancer = createTestRebalancer({
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: PRIORITY_PROGRESS_NODE_ID,
          rebalanceCoordinator: coordinator,
          controlPlaneReadinessService,
        });
        rebalancer.isLeader = true;
        rebalancer.enqueueRebalanceCheck = () => true;

        coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
          operation: {
            operationId: PRIORITY_PROGRESS_OPERATION_ID,
            entityType: EntityType.PARTITION,
            entityId: PRIORITY_PROGRESS_PARTITION_ID,
            partitionId: PRIORITY_PROGRESS_PARTITION_ID,
          },
        });

        t.equal(
          membershipPublicationReconcileCalls.length,
          ONE_MEMBERSHIP_PUBLICATION_RECONCILE_CALL,
          'terminal priority progress should wake the publication owner once',
        );
        t.equal(
          membershipPublicationReconcileCalls[0].reason,
          RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS,
          'publication planning should use the canonical priority progress reason',
        );

        coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
          operation: {
            operationId: PRIORITY_PROGRESS_OPERATION_ID,
            entityType: EntityType.PARTITION,
            entityId: ORDINARY_PROGRESS_PARTITION_ID,
            partitionId: ORDINARY_PROGRESS_PARTITION_ID,
          },
        });

        t.equal(
          membershipPublicationReconcileCalls.length,
          ONE_MEMBERSHIP_PUBLICATION_RECONCILE_CALL,
          'non-matching progress should not wake publication planning',
        );

        rebalancer.shutdown();
      },
    );

    await t.test(
      'priority recovery coordinator rebind re-enters partition planning',
      async (t) => {
        const initialCoordinator = createEventedMockCoordinator();
        const replacementCoordinator = createEventedMockCoordinator();
        const membershipPublicationReconcileCalls = [];
        const controlPlaneReadinessService = {
          ...createMockReadinessService(createMockCache()),
          membershipPublicationService: {
            enqueueClusterMembershipReconcile(reason, context) {
              membershipPublicationReconcileCalls.push({reason, context});
              return true;
            },
          },
        };
        const rebalancer = createTestRebalancer({
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: PRIORITY_PROGRESS_NODE_ID,
          rebalanceCoordinator: initialCoordinator,
          controlPlaneReadinessService,
        });
        const rebalanceReasons = [];
        rebalancer.isLeader = true;
        rebalancer.enqueueRebalanceCheck = (reason) => {
          rebalanceReasons.push(reason);
          return true;
        };

        rebalancer.setRebalanceCoordinator(replacementCoordinator);

        t.same(
          rebalanceReasons,
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'priority coordinator replacement should wake the recovery planner',
        );
        t.same(
          membershipPublicationReconcileCalls.map((call) => call.reason),
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'coordinator replacement should wake publication planning too',
        );

        rebalancer.shutdown();
      },
    );

    await t.test(
      'sibling priority recovery progress re-enters partition planning',
      async (t) => {
        const coordinator = createEventedMockCoordinator();
        const rebalanceReasons = [];
        const rebalancer = createTestRebalancer({
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: PRIORITY_PROGRESS_NODE_ID,
          rebalanceCoordinator: coordinator,
        });
        rebalancer.isLeader = true;
        rebalancer.enqueueRebalanceCheck = (reason) => {
          rebalanceReasons.push(reason);
          return true;
        };

        coordinator.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, {
          operation: {
            operationId: PRIORITY_PROGRESS_OPERATION_ID,
            entityType: EntityType.PARTITION,
            entityId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
            partitionId: REPLICA_OPERATION_PRIORITY_PARTITION_ID,
          },
        });

        t.same(
          rebalanceReasons,
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'terminal sibling priority progress should rearm blocked priority partitions',
        );

        rebalancer.shutdown();
      },
    );

    await t.test(
      'priority recovery active service visibility wakes membership publication planning',
      async (t) => {
        const membershipPublicationReconcileCalls = [];
        const rebalanceReasons = [];
        const controlPlaneReadinessService = {
          ...createMockReadinessService(createMockCache()),
          membershipPublicationService: {
            enqueueClusterMembershipReconcile(reason, context) {
              membershipPublicationReconcileCalls.push({reason, context});
              return true;
            },
          },
        };
        const rebalancer = createTestRebalancer({
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: PRIORITY_PROGRESS_NODE_ID,
          controlPlaneReadinessService,
        });
        rebalancer.isLeader = true;
        rebalancer.enqueueRebalanceCheck = (reason) => {
          rebalanceReasons.push(reason);
          return true;
        };

        const handled = rebalancer.handlePriorityRecoveryVisibilityEvent({
          tableName: SYSTEM_TABLE_NAME.SERVICES,
          operation: PRIORITY_VISIBILITY_CDC_OPERATION,
          data: {
            service_id: PRIORITY_VISIBILITY_SERVICE_ID,
            node_id: PRIORITY_VISIBILITY_TARGET_NODE_ID,
            partition_id: PRIORITY_PROGRESS_PARTITION_ID,
            service_type: SERVICE_TYPE.PARTITION,
            status: PRIORITY_VISIBILITY_SERVICE_STATUS_ACTIVE,
          },
        });

        t.equal(
          handled,
          true,
          'active priority service visibility should be handled as recovery progress',
        );
        t.same(
          rebalanceReasons,
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'visibility progress should wake the priority partition rebalance queue',
        );
        t.same(
          membershipPublicationReconcileCalls.map((call) => call.reason),
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'visibility progress should wake the publication owner through the canonical reason',
        );

        rebalancer.shutdown();
      },
    );

    await t.test(
      'priority recovery terminal operation visibility wakes membership publication planning',
      async (t) => {
        const membershipPublicationReconcileCalls = [];
        const rebalanceReasons = [];
        const controlPlaneReadinessService = {
          ...createMockReadinessService(createMockCache()),
          membershipPublicationService: {
            enqueueClusterMembershipReconcile(reason, context) {
              membershipPublicationReconcileCalls.push({reason, context});
              return true;
            },
          },
        };
        const rebalancer = createTestRebalancer({
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: PRIORITY_PROGRESS_NODE_ID,
          controlPlaneReadinessService,
        });
        rebalancer.isLeader = true;
        rebalancer.enqueueRebalanceCheck = (reason) => {
          rebalanceReasons.push(reason);
          return true;
        };

        const nonTerminalHandled =
        rebalancer.handlePriorityRecoveryVisibilityEvent({
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          operation: PRIORITY_VISIBILITY_CDC_OPERATION,
          data: {
            operation_id: PRIORITY_VISIBILITY_NON_TERMINAL_OPERATION_ID,
            partition_id: PRIORITY_PROGRESS_PARTITION_ID,
            type: PRIORITY_VISIBILITY_OPERATION_TYPE,
            status: PRIORITY_VISIBILITY_OPERATION_STATUS_SYNCING,
            workflow_step: PRIORITY_VISIBILITY_OPERATION_WORKFLOW_STEP_SYNCING,
          },
        });

        t.equal(
          nonTerminalHandled,
          false,
          'non-terminal priority operation visibility should not re-enter planning',
        );

        const terminalHandled =
        rebalancer.handlePriorityRecoveryVisibilityEvent({
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          operation: PRIORITY_VISIBILITY_CDC_OPERATION,
          data: {
            operation_id: PRIORITY_VISIBILITY_TERMINAL_OPERATION_ID,
            partition_id: PRIORITY_PROGRESS_PARTITION_ID,
            type: PRIORITY_VISIBILITY_OPERATION_TYPE,
            status: PRIORITY_VISIBILITY_OPERATION_STATUS_FAILED,
            workflow_step: PRIORITY_VISIBILITY_OPERATION_WORKFLOW_STEP_FAILED,
          },
        });

        t.equal(
          terminalHandled,
          true,
          'terminal priority operation visibility should be handled as recovery progress',
        );
        t.same(
          rebalanceReasons,
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'terminal operation visibility should wake the priority partition rebalance queue',
        );
        t.same(
          membershipPublicationReconcileCalls.map((call) => call.reason),
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'terminal operation visibility should wake the publication owner',
        );

        rebalancer.shutdown();
      },
    );

    await t.test(
      'priority recovery service cache visibility is wired to publication planning',
      async (t) => {
        const cacheChangeListeners = new Set();
        const systemTableCache = {
          ...createMockCache(),
          onCacheChange(listener) {
            cacheChangeListeners.add(listener);
          },
          offCacheChange(listener) {
            cacheChangeListeners.delete(listener);
          },
        };
        const membershipPublicationReconcileCalls = [];
        const rebalanceReasons = [];
        const controlPlaneReadinessService = {
          ...createMockReadinessService(systemTableCache),
          membershipPublicationService: {
            enqueueClusterMembershipReconcile(reason, context) {
              membershipPublicationReconcileCalls.push({reason, context});
              return true;
            },
          },
        };
        const rebalancer = createTestRebalancer({
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: PRIORITY_PROGRESS_NODE_ID,
          systemTableCache,
          controlPlaneReadinessService,
        });
        rebalancer.isLeader = true;
        rebalancer.enqueueRebalanceCheck = (reason) => {
          rebalanceReasons.push(reason);
          return true;
        };

        t.equal(
          cacheChangeListeners.size,
          ONE_PROGRESS_LISTENER,
          'priority partition rebalancers should subscribe to service visibility',
        );

        for (const listener of cacheChangeListeners) {
          listener(
            SYSTEM_TABLE_NAME.SERVICES,
            PRIORITY_VISIBILITY_CDC_OPERATION,
            {
              service_id: PRIORITY_VISIBILITY_SERVICE_ID,
              node_id: PRIORITY_VISIBILITY_TARGET_NODE_ID,
              partition_id: PRIORITY_PROGRESS_PARTITION_ID,
              service_type: SERVICE_TYPE.PARTITION,
              status: PRIORITY_VISIBILITY_SERVICE_STATUS_ACTIVE,
            },
          );
        }

        t.same(
          rebalanceReasons,
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'cache visibility progress should wake the priority partition queue',
        );
        t.same(
          membershipPublicationReconcileCalls.map((call) => call.reason),
          [RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS],
          'cache visibility progress should wake the publication owner',
        );

        rebalancer.shutdown();

        t.equal(
          cacheChangeListeners.size,
          NO_PROGRESS_LISTENERS,
          'shutdown should release priority visibility cache subscriptions',
        );
      },
    );

    await t.test(
      'coordinator progress listeners are scoped to priority partitions',
      async (t) => {
        const coordinator = createEventedMockCoordinator();
        const ordinaryRebalancer = createTestRebalancer({
          entityId: ORDINARY_PROGRESS_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: PRIORITY_PROGRESS_NODE_ID,
          rebalanceCoordinator: coordinator,
        });

        t.equal(
          coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED),
          NO_PROGRESS_LISTENERS,
          'ordinary partition rebalancers should not subscribe to priority progress events',
        );

        const priorityRebalancer = createTestRebalancer({
          entityId: PRIORITY_PROGRESS_PARTITION_ID,
          entityType: EntityType.PARTITION,
          nodeId: PRIORITY_PROGRESS_NODE_ID,
          rebalanceCoordinator: coordinator,
        });

        t.equal(
          coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED),
          ONE_PROGRESS_LISTENER,
          'priority partition rebalancers should own the progress trigger subscription',
        );

        priorityRebalancer.shutdown();
        ordinaryRebalancer.shutdown();

        t.equal(
          coordinator.listenerCount(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED),
          NO_PROGRESS_LISTENERS,
          'shutdown should release priority progress event listeners',
        );
      },
    );

    await t.test('returns budget_exceeded when coordinator create gate blocks scheduling',
      async (t) => {
        const mockCache = createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
        ]);
        const rebalancer = new UnifiedRebalancer({
          entityId: 'partition-1',
          entityType: EntityType.PARTITION,
          nodeId: 'node-0',
          systemTableCache: mockCache,
          cdcIntegrationService: createMockCdcService(),
          tablePolicyService: createMockPolicyService(),
          messageRouter: createMockMessageRouter(),
          rebalanceCoordinator: {
            ...createMockCoordinator(),
            async createOperation(move) {
              t.equal(
                move.enforceConcurrentOperationBudget,
                true,
                'rebalancer should request coordinator-side create gating',
              );
              const error = new Error('budget exceeded');
              error.rebalanceSkipReason = 'budget_exceeded';
              throw error;
            },
          },
        });

        const result = await rebalancer.executeMoveViaCoordinator({
          type: MoveType.ADD,
          nodeId: 'node-1',
          replicaId: 'partition-1-r4',
        });

        t.same(result, {
          success: false,
          skipped: true,
          reason: 'budget_exceeded',
          operation: MoveType.ADD,
          nodeId: 'node-1',
          replicaId: 'partition-1-r4',
        });

        rebalancer.shutdown();
      });

    await t.test('binds coordinator move creation to the published membership epoch',
      async (t) => {
        const mockCache = createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
        ]);
        const rebalancer = new UnifiedRebalancer({
          entityId: 'partition-1',
          entityType: EntityType.PARTITION,
          nodeId: 'node-0',
          systemTableCache: mockCache,
          cdcIntegrationService: createMockCdcService(),
          tablePolicyService: createMockPolicyService(),
          messageRouter: createMockMessageRouter(),
          controlPlaneReadinessService: {
            getCurrentPublishedMembershipEpochSync() {
              return 11;
            },
          },
          rebalanceCoordinator: {
            ...createMockCoordinator(),
            async createOperation(move) {
              t.equal(
                move.membershipPublicationEpoch,
                11,
                'rebalancer should bind created moves to the published membership epoch',
              );
              return {
                operationId: 'op-epoch-bound',
                replicaId: move.replicaId,
              };
            },
          },
        });

        const result = await rebalancer.executeMoveViaCoordinator({
          type: MoveType.ADD,
          nodeId: 'node-1',
          replicaId: 'partition-1-r4',
        });

        t.equal(result.success, true, 'epoch-bound move should still execute');

        rebalancer.shutdown();
      });

    await t.test('binds coordinator move creation to the shared publication planning snapshot epoch',
      async (t) => {
        const mockCache = createMockCache([
          {node_id: 'node-1', status: NodeStatus.ACTIVE, connection_state: 'ready'},
        ]);
        const rebalancer = new UnifiedRebalancer({
          entityId: 'partition-1',
          entityType: EntityType.PARTITION,
          nodeId: 'node-0',
          systemTableCache: mockCache,
          cdcIntegrationService: createMockCdcService(),
          tablePolicyService: createMockPolicyService(),
          messageRouter: createMockMessageRouter(),
          controlPlaneReadinessService: {
            getCurrentPublishedMembershipEpochSync() {
              return 12;
            },
          },
          rebalanceCoordinator: {
            ...createMockCoordinator(),
            async createOperation(move) {
              t.equal(
                move.membershipPublicationEpoch,
                12,
                'rebalancer should use the shared planning snapshot epoch when available',
              );
              return {
                operationId: 'op-shared-epoch-bound',
                replicaId: move.replicaId,
              };
            },
          },
        });

        const result = await rebalancer.executeMoveViaCoordinator({
          type: MoveType.ADD,
          nodeId: 'node-1',
          replicaId: 'partition-1-r4',
        });

        t.equal(
          result.success,
          true,
          'shared planning snapshot epoch should still allow move creation',
        );

        rebalancer.shutdown();
      });
  });
}
