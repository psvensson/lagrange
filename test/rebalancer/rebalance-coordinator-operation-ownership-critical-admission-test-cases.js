export function registerRebalanceCoordinatorOperationOwnershipCriticalAdmissionTests({
  test,
  assert,
  RebalanceCoordinator,
  WORKFLOW_STEP,
  REBALANCER_SKIP_REASON,
  buildPriorityRecoveryAdmissionPlan,
  OperationType,
  ReplicaStatus,
  EMERGENCY_TRANSPORT_PARTITION_ID,
  CRITICAL_REMOVE_LANE_CONFLICT_OPERATION_ID,
  CRITICAL_REMOVE_LANE_TARGET_REPLICA_ID,
  CRITICAL_REMOVE_LANE_CONFLICT_REPLICA_ID,
  createStorageOwners,
  createTransactionCoordinator,
  createCoordinator,
  disablePersistenceConfirmation,
}) {
  test('RebalanceCoordinator createOperation checks the critical create lane ' +
    'before the topology guard', async (_t) => {
    const coordinator = createCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], changes: 0};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    const invocationOrder = [];
    const topologyGuardSentinel = new Error('topology-guard-sentinel');
    coordinator.ensureOperationLedgerSelfMoveSerialized = async () => {};
    coordinator.ensureNoConflictingInFlightReplaceForRemove = async () => {};
    coordinator.ensurePriorityControlPlaneRemoveLaneAvailable = async () => {};
    coordinator.ensurePrioritySurplusRemovePlacementFenceAllowed =
      async () => {};
    coordinator.ensureEntityAddLikeCreateLaneAvailable = async () => {};
    coordinator.ensureCriticalPartitionCreateLaneAvailable = async () => {
      invocationOrder.push('critical-create-lane');
    };
    coordinator.ensureCreateTopologyGuardAllowed = async () => {
      invocationOrder.push('topology-guard');
      throw topologyGuardSentinel;
    };

    try {
      await assert.rejects(
        coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'config-p1',
          entityType: 'partition',
          entityId: 'config-p1',
          nodeId: 'node-remote',
          enforceConcurrentOperationBudget: true,
        }),
        (error) => error === topologyGuardSentinel,
      );
      assert.deepEqual(
        invocationOrder,
        ['critical-create-lane', 'topology-guard'],
        'spread-cure admission must run before downstream topology checks',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator limits critical partitions to one add-like operation in flight',
    async (t) => {
      const coordinator = new RebalanceCoordinator({
        nodeId: 'node-local',
        transactionCoordinator: createTransactionCoordinator(),
        systemTableCache: {
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
          async waitForCacheUpdate() {},
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            return {success: true, rows: [], changes: 1};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });
      coordinator.initialize();
      coordinator.repository.getOperationsByEntityAuthoritative = async () => ([
        {
          operationId: 'op-critical-existing',
          type: 'REPLACE',
          workflowStep: WORKFLOW_STEP.CREATING,
          status: 'creating',
        },
      ]);

      try {
        try {
          await coordinator.createOperation({
            type: 'REPLACE',
            partitionId: 'config-p1',
            entityType: 'partition',
            entityId: 'config-p1',
            nodeId: 'node-remote',
            enforceConcurrentOperationBudget: true,
          });
          t.fail('critical partition should reject a second add-like operation');
        } catch (error) {
          t.equal(
            error?.rebalanceSkipReason,
            REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
            'critical partition create should fail with a typed budget error',
          );
          t.equal(
            error?.conflictingOperationId,
            'op-critical-existing',
            'error should expose the conflicting in-flight operation',
          );
        }
      } finally {
        await coordinator.shutdown();
      }
    });

  test('RebalanceCoordinator critical add-like gate uses authoritative ' +
    'replica_operations reads when cache is empty', async (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();
    coordinator.repository.getOperationsByEntity = async () => [];
    coordinator.repository.getOperationsByEntityAuthoritative = async () => ([
      {
        operationId: 'op-authoritative-existing',
        type: 'REPLACE',
        workflowStep: WORKFLOW_STEP.CREATING,
        status: 'creating',
      },
    ]);

    try {
      try {
        await coordinator.createOperation({
          type: 'REPLACE',
          partitionId: 'config-p1',
          entityType: 'partition',
          entityId: 'config-p1',
          nodeId: 'node-remote',
          enforceConcurrentOperationBudget: true,
        });
        t.fail(
          'critical partition should reject a second add-like operation ' +
          'when only the authoritative read sees it',
        );
      } catch (error) {
        t.equal(
          error?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'critical partition create should still fail with a typed budget error',
        );
        t.equal(
          error?.conflictingOperationId,
          'op-authoritative-existing',
          'authoritative conflicting operation should surface through the gate',
        );
      }
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator defers critical add-like admission ' +
    'when authoritative operation visibility remains unresolved', async (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();
    coordinator.repository.getOperationsByEntityAuthoritativeObservation =
      async () => ({
        state: 'deferred',
        operationCount: 0,
        operations: [],
        deferredOutcome: {
          completionState: 'operation_visibility_deferred',
          reasonCode: 'operation_visibility_deferred',
          retryAfterMs: 250,
        },
        retryAfterMs: 250,
      });

    try {
      try {
        await coordinator.ensureCriticalPartitionCreateLaneAvailable({
          normalizedMoveType: 'REPLACE',
          partitionId: 'config-p1',
          entityType: 'partition',
          entityId: 'config-p1',
          move: {
            enforceConcurrentOperationBudget: true,
          },
        });
        t.fail(
          'critical partition create admission should defer instead of treating unresolved operation visibility as empty',
        );
      } catch (error) {
        assert.equal(
          error?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        );
        assert.equal(error?.retryAfterMs, 250);
        assert.equal(
          error?.completionState,
          'operation_visibility_deferred',
        );
      }
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator keeps emergency publication create admission moving ' +
    'when deferred visibility is caused only by contained background pressure',
  async (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
        getOutboundPressureSummary() {
          return {backpressured: true};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();
    coordinator.repository.getOperationsByEntityAuthoritativeObservation =
      async () => ({
        state: 'deferred',
        operationCount: 0,
        operations: [],
        deferredOutcome: {
          completionState: 'operation_visibility_deferred',
          reasonCode: 'operation_visibility_deferred',
          retryAfterMs: 250,
        },
        retryAfterMs: 250,
      });

    try {
      await coordinator.ensureCriticalPartitionCreateLaneAvailable({
        normalizedMoveType: 'REPLACE',
        partitionId: EMERGENCY_TRANSPORT_PARTITION_ID,
        entityType: 'partition',
        entityId: EMERGENCY_TRANSPORT_PARTITION_ID,
        move: {
          enforceConcurrentOperationBudget: true,
        },
      });
      t.pass(
        'emergency publication create admission should keep moving when only the reserved pressure lane is backpressured',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator creates blocked ordinary priority replace work ' +
    'when deferred visibility is caused only by contained background pressure',
  async (t) => {
    const BLOCKED_PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
    const coordinator = createCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
        filter() {
          return [];
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
        getOutboundPressureSummary() {
          return {backpressured: true};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], affectedRows: 1, changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();
    disablePersistenceConfirmation(coordinator);
    coordinator.getPriorityRecoveryAdmissionPlan = () =>
      buildPriorityRecoveryAdmissionPlan({
        maxConcurrentAdds: 1,
        priorityPartitionSummary: {
          satisfied: false,
          blockedPartitions: [{
            partitionId: BLOCKED_PRIORITY_PARTITION_ID,
            spreadGap: 1,
          }],
          missingPartitionIds: [BLOCKED_PRIORITY_PARTITION_ID],
        },
        isPriorityPartition: (partitionId) =>
          partitionId === BLOCKED_PRIORITY_PARTITION_ID,
        isEmergencyPriorityPartition: () => false,
      });
    coordinator.repository.getOperationsByEntityAuthoritativeObservation =
      async () => ({
        state: 'deferred',
        operationCount: 0,
        operations: [],
        deferredOutcome: {
          completionState: 'operation_visibility_deferred',
          reasonCode: 'operation_visibility_deferred',
          retryAfterMs: 125,
        },
        retryAfterMs: 125,
      });
    coordinator.queryCachedIncompleteOperations = async () => [];
    coordinator.getConcurrentAddCountByPriorityClass = async () => ({
      priorityCount: 0,
      ordinaryPriorityCount: 0,
      nonPriorityCount: 0,
    });
    coordinator.getIncompleteOperationObservation = () => ({
      state: 'deferred',
      operationCount: 0,
      operations: [],
      deferredOutcome: {
        completionState: 'operation_visibility_deferred',
        reasonCode: 'operation_visibility_deferred',
        retryAfterMs: 125,
      },
      retryAfterMs: 125,
    });

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: BLOCKED_PRIORITY_PARTITION_ID,
        entityType: 'partition',
        entityId: BLOCKED_PRIORITY_PARTITION_ID,
        nodeId: 'node-remote',
        replicaId: `${BLOCKED_PRIORITY_PARTITION_ID}-r4`,
        enforceConcurrentOperationBudget: true,
      });

      t.ok(
        operation?.operationId,
        'blocked ordinary priority partition should still admit the next replace step when only contained background pressure deferred visibility',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator defers conflicting-remove admission when ' +
    'authoritative operation visibility remains unresolved', async (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();
    coordinator.repository.getOperationsByEntityAuthoritativeObservation =
      async () => ({
        state: 'deferred',
        operationCount: 0,
        operations: [],
        deferredOutcome: {
          completionState: 'operation_visibility_deferred',
          reasonCode: 'operation_visibility_deferred',
          retryAfterMs: 125,
        },
        retryAfterMs: 125,
      });

    try {
      try {
        await coordinator.ensureNoConflictingInFlightReplaceForRemove({
          normalizedMoveType: OperationType.REMOVE,
          partitionId: 'config-p1',
          entityType: 'partition',
          entityId: 'config-p1',
          move: {
            replicaId: 'config-p1-r1',
          },
        });
        t.fail(
          'remove admission should defer while authoritative replace visibility is unresolved',
        );
      } catch (error) {
        assert.equal(
          error?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        );
        assert.equal(error?.retryAfterMs, 125);
        assert.equal(error?.replicaId, 'config-p1-r1');
      }
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator keeps emergency publication remove admission moving ' +
    'when deferred visibility is caused only by contained background pressure',
  async (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
        getOutboundPressureSummary() {
          return {backpressured: true};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();
    coordinator.repository.getOperationsByEntityAuthoritativeObservation =
      async () => ({
        state: 'deferred',
        operationCount: 0,
        operations: [],
        deferredOutcome: {
          completionState: 'operation_visibility_deferred',
          reasonCode: 'operation_visibility_deferred',
          retryAfterMs: 125,
        },
        retryAfterMs: 125,
      });

    try {
      await coordinator.ensureNoConflictingInFlightReplaceForRemove({
        normalizedMoveType: OperationType.REMOVE,
        partitionId: EMERGENCY_TRANSPORT_PARTITION_ID,
        entityType: 'partition',
        entityId: EMERGENCY_TRANSPORT_PARTITION_ID,
        move: {
          replicaId: `${EMERGENCY_TRANSPORT_PARTITION_ID}-r1`,
        },
      });
      t.pass(
        'emergency publication remove admission should keep moving when only the reserved pressure lane is backpressured',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator serializes critical publication removes behind ' +
    'in-flight source removal',
  async (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();
    coordinator.repository.getOperationsByEntityAuthoritativeObservation =
      async () => ({
        state: 'available',
        operationCount: 1,
        operations: [
          {
            operationId: CRITICAL_REMOVE_LANE_CONFLICT_OPERATION_ID,
            type: OperationType.REPLACE,
            partitionId: EMERGENCY_TRANSPORT_PARTITION_ID,
            entityType: 'partition',
            entityId: EMERGENCY_TRANSPORT_PARTITION_ID,
            replicaId: CRITICAL_REMOVE_LANE_CONFLICT_REPLICA_ID,
            sourceNodeId: 'node-old',
            targetNodeId: 'node-new',
            workflowStep: WORKFLOW_STEP.STOPPING,
            status: ReplicaStatus.REMOVING,
          },
        ],
      });

    try {
      try {
        await coordinator.ensureCriticalPartitionRemoveLaneAvailable({
          normalizedMoveType: OperationType.REMOVE,
          partitionId: EMERGENCY_TRANSPORT_PARTITION_ID,
          entityType: 'partition',
          entityId: EMERGENCY_TRANSPORT_PARTITION_ID,
          move: {
            replicaId: CRITICAL_REMOVE_LANE_TARGET_REPLICA_ID,
          },
        });
        t.fail(
          'critical publication trim should wait for existing source removal',
        );
      } catch (error) {
        assert.equal(
          error?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
        );
        assert.equal(
          error?.conflictingOperationId,
          CRITICAL_REMOVE_LANE_CONFLICT_OPERATION_ID,
        );
        assert.match(error?.message, /remove-like operation in flight/);
      }
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator critical add-like gate ignores replace remove-phase work',
    async (t) => {
      const coordinator = new RebalanceCoordinator({
        nodeId: 'node-local',
        transactionCoordinator: createTransactionCoordinator(),
        systemTableCache: {
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
          async waitForCacheUpdate() {},
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            return {success: true, rows: [], changes: 1};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });
      coordinator.initialize();
      coordinator.repository.getOperationsByEntityAuthoritative = async () => ([
        {
          operationId: 'op-critical-remove-phase',
          type: 'REPLACE',
          workflowStep: WORKFLOW_STEP.STOPPING,
          status: 'removing',
        },
      ]);

      try {
        await coordinator.ensureCriticalPartitionCreateLaneAvailable({
          normalizedMoveType: 'REPLACE',
          partitionId: 'config-p1',
          entityType: 'partition',
          entityId: 'config-p1',
          move: {
            enforceConcurrentOperationBudget: true,
          },
        });

        t.pass(
          'critical partitions should admit a new replace once the earlier replace is in remove dispatch',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  test('RebalanceCoordinator rejects a second add-like create while the same ' +
    'entity already has replace remove-phase work in flight',
  async (t) => {
    const ENTITY_ID = 'sql_write_operations-p1';
    const ACTIVE_STATUS = 'active';
    const REMOVING_STATUS = 'removing';

    const coordinator = createCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();
    coordinator.repository.getOperationsByEntityAuthoritativeObservation =
        async () => ({
          state: 'ready',
          operationCount: 1,
          operations: [{
            operationId: 'replace-op-remove-phase',
            type: OperationType.REPLACE,
            partitionId: ENTITY_ID,
            entityType: 'partition',
            entityId: ENTITY_ID,
            sourceNodeId: 'node-a',
            targetNodeId: 'node-b',
            sourceReplicaId: `${ENTITY_ID}-r1`,
            replicaId: `${ENTITY_ID}-r4`,
            workflowStep: WORKFLOW_STEP.ACTIVE,
            status: ACTIVE_STATUS,
            stepsHistory: [{
              step: WORKFLOW_STEP.STOPPING,
              status: REMOVING_STATUS,
              timestamp: Date.now(),
            }],
          }],
          deferredOutcome: null,
        });

    try {
      let conflictError = null;
      try {
        await coordinator.createOperation({
          type: OperationType.REPLACE,
          partitionId: ENTITY_ID,
          entityType: 'partition',
          entityId: ENTITY_ID,
          nodeId: 'node-c',
          replicaId: `${ENTITY_ID}-r5`,
        });
      } catch (error) {
        conflictError = error;
      }
      t.ok(
        conflictError,
        'same-entity add-like work should wait for replace remove-phase completion',
      );
      t.equal(
        conflictError?.rebalanceSkipReason,
        REBALANCER_SKIP_REASON.CONFLICTING_OPERATION_IN_FLIGHT,
        'same-entity add-like overlap should surface stable conflict skip reason',
      );
      t.equal(
        conflictError?.conflictingOperationId,
        'replace-op-remove-phase',
        'conflicting replace remove-phase operation id should be attached',
      );
      t.equal(
        conflictError?.entityId,
        ENTITY_ID,
        'entity-scoped conflict should report the blocked entity id',
      );
      t.equal(
        coordinator.stats.operationsCreated,
        0,
        'conflicting same-entity add-like create should not persist a new operation',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator critical add-like gate still counts superseded priority recovery rows outside the current eligible cohort',
    async (t) => {
      const coordinator = createCoordinator({
        nodeId: 'node-local',
        transactionCoordinator: createTransactionCoordinator(),
        controlPlaneReadinessService: {
          async getMembershipPublicationPlanningSnapshot() {
            return {
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: ['node-a', 'node-b'],
              projectedServingNodeIds: ['node-a', 'node-b'],
              locallyEligibleNodeIds: ['node-a', 'node-b'],
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: 'sql_write_operations-p1',
                  spreadGap: 1,
                }],
                missingPartitionIds: ['sql_write_operations-p1'],
                requiredDistinctNodeCount: 3,
              },
            };
          },
        },
        systemTableCache: {
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
          async waitForCacheUpdate() {},
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount: 1};
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            return {success: true, rows: [], changes: 1};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });
      coordinator.initialize();
      coordinator.repository.getOperationsByEntityAuthoritative = async () => ([
        {
          operationId: 'op-critical-superseded',
          type: 'REPLACE',
          partitionId: 'sql_write_operations-p1',
          entityType: 'partition',
          entityId: 'sql_write_operations-p1',
          sourceNodeId: 'node-a',
          targetNodeId: 'node-c',
          workflowStep: WORKFLOW_STEP.SENDING,
          status: 'pending',
          stepsHistory: [
            {step: 'PENDING', status: 'pending', inFlight: true},
            {step: 'SENDING', status: 'pending', inFlight: true},
          ],
        },
      ]);

      try {
        await t.rejects(
          coordinator.ensureCriticalPartitionCreateLaneAvailable({
            normalizedMoveType: 'REPLACE',
            partitionId: 'sql_write_operations-p1',
            entityType: 'partition',
            entityId: 'sql_write_operations-p1',
            move: {
              enforceConcurrentOperationBudget: true,
            },
          }),
          /already has an add-like operation in flight/,
          'critical add-like gating should continue to count the superseded priority recovery row',
        );
      } finally {
        await coordinator.shutdown();
      }
    });
}
