import {
  OPERATION_TRANSITION_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';

const NON_PRIORITY_SYSTEM_REPLACE_OPERATION_ID =
  'op-system-replace-target-owner';
const NON_PRIORITY_SYSTEM_PARTITION_ID = 'service_timers-p1';
const NON_PRIORITY_SYSTEM_REPLICA_ID = 'service_timers-p1-r4';
const PRIORITY_PENDING_REARM_NODE_ID = 'node-local';
const PRIORITY_PENDING_REARM_SOURCE_NODE_ID = 'node-remote';
const PRIORITY_PENDING_REARM_OPERATION_ID = 'op-critical-pending-timeout-rearm';
const PRIORITY_PENDING_REARM_PARTITION_ID = 'sql_transactions-p1';
const PRIORITY_PENDING_REARM_REPLICA_ID = 'sql_transactions-p1-r4';
const PRIORITY_PENDING_REARM_TIMEOUT_OVERRUN_MS = 1000;

export function registerRebalanceCoordinatorOperationOwnershipTailMoreTests({
  test,
  RebalanceCoordinator,
  WORKFLOW_STEP,
  REBALANCER_SKIP_REASON,
  OperationType,
  ReplicaStatus,
  createWorkflowCoordinatorSpy,
  createStorageOwners,
  createTransactionCoordinator,
  createCoordinator,
  disablePersistenceConfirmation,
}) {
  test('RebalanceCoordinator executeOperation uses injected workflow coordinator single-flight',
    async (t) => {
      const workflowCoordinator = createWorkflowCoordinatorSpy();
      const coordinator = createCoordinator({
        nodeId: 'node-local',
        transactionCoordinator: createTransactionCoordinator(),
        operationWorkflowCoordinator: workflowCoordinator,
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
            return {acknowledged: true, status: 'initiated'};
          },
        },
        sqlQueryEngine: {
          async executeQuery(_sql, _params) {
            return {success: true, rows: [], changes: 1};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });
      coordinator.initialize();
      disablePersistenceConfirmation(coordinator);

      try {
        const operation = {
          operationId: 'op-single-flight',
          type: 'ADD',
          partitionId: 'partition-1',
          entityType: 'partition',
          entityId: 'partition-1',
          replicaId: 'partition-1-r2',
          sourceNodeId: 'node-local',
          targetNodeId: 'node-remote',
          status: 'pending',
          workflowStep: WORKFLOW_STEP.PENDING,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: null,
          errorMessage: null,
          stepsHistory: [],
        };

        await coordinator.executeOperation(operation);

        t.equal(
          workflowCoordinator.ownerKeys.length,
          1,
          'executeOperation should be guarded by shared workflow single-flight',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  test('RebalanceCoordinator executeReplicaOperationsRead uses injected ' +
  'control-plane system-table gateway', async (t) => {
    const gatewayCalls = [];
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
      controlPlaneSystemTableGateway: {
        async readRows(tableName, sql, params) {
          gatewayCalls.push({tableName, sql, params});
          return {success: true, rows: [{operation_id: 'op-gateway'}]};
        },
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
          throw new Error('raw SQL path should not be used');
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      const result = await coordinator.executeReplicaOperationsRead(
        'SELECT * FROM replica_operations WHERE operation_id = ?',
        ['op-gateway'],
      );

      t.equal(result.success, true, 'gateway read should succeed');
      t.equal(gatewayCalls.length, 1, 'gateway should own the read');
      t.equal(
        gatewayCalls[0].tableName,
        'replica_operations',
        'replica_operations reads should go through the gateway',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator checkTimeouts reconciles only local-owner operations',
    async (t) => {
      const now = Date.now();
      const reconciledOperationIds = [];
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
            return {acknowledged: true, status: 'initiated'};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });
      coordinator.initialize();

      coordinator.workflowOwner.repository.queryIncompleteOperations =
      async () => {
        return [
          {
            operationId: 'op-remote-owner',
            type: 'ADD',
            partitionId: 'partition-1',
            replicaId: 'partition-1-r1',
            sourceNodeId: 'node-remote',
            targetNodeId: 'node-local',
            status: 'creating',
            workflowStep: WORKFLOW_STEP.CREATING,
            createdAt: now - 1000,
            updatedAt: now - 50,
            completedAt: null,
            errorMessage: null,
            stepsHistory: [],
          },
          {
            operationId: 'op-replace-target-owner',
            type: OperationType.REPLACE,
            partitionId: 'sql_transactions-p1',
            replicaId: 'sql_transactions-p1-r4',
            sourceNodeId: 'node-remote',
            targetNodeId: 'node-local',
            status: 'syncing',
            workflowStep: WORKFLOW_STEP.SYNCING,
            createdAt: now - 1000,
            updatedAt: now - 50,
            completedAt: null,
            errorMessage: null,
            stepsHistory: [],
          },
          {
            operationId: 'op-local-owner',
            type: 'ADD',
            partitionId: 'partition-1',
            replicaId: 'partition-1-r2',
            sourceNodeId: 'node-local',
            targetNodeId: 'node-local',
            status: 'creating',
            workflowStep: WORKFLOW_STEP.CREATING,
            createdAt: now - 1000,
            updatedAt: now - 50,
            completedAt: null,
            errorMessage: null,
            stepsHistory: [],
          },
          {
            operationId: NON_PRIORITY_SYSTEM_REPLACE_OPERATION_ID,
            type: OperationType.REPLACE,
            partitionId: NON_PRIORITY_SYSTEM_PARTITION_ID,
            replicaId: NON_PRIORITY_SYSTEM_REPLICA_ID,
            sourceNodeId: 'node-remote',
            targetNodeId: 'node-local',
            status: 'creating',
            workflowStep: WORKFLOW_STEP.CREATING,
            createdAt: now - 1000,
            updatedAt: now - 50,
            completedAt: null,
            errorMessage: null,
            stepsHistory: [],
          },
        ];
      };
      coordinator.workflowOwner.reconcileOperationProgress =
      async (operation) => {
        reconciledOperationIds.push(operation.operationId);
        return false;
      };
      coordinator.workflowOwner.reconcileReservations = async () => {
        return {expired: 0, orphansReleased: 0};
      };
      coordinator.workflowOwner.failOperation = async () => {};
      const expectedReconciledOperationIds = Object.freeze([
        'op-replace-target-owner',
        'op-local-owner',
        NON_PRIORITY_SYSTEM_REPLACE_OPERATION_ID,
      ]);

      try {
        await coordinator.checkTimeouts();
        t.same(
          [...reconciledOperationIds].sort(),
          [...expectedReconciledOperationIds].sort(),
          'timeout reconciliation must skip non-owner operations but keep target-owned system REPLACE reconciliation',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  test('RebalanceCoordinator re-arms critical PENDING operations when ' +
  'observed replica status remains pending',
  async (t) => {
    const coordinator = new RebalanceCoordinator({
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
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], affectedRows: 0};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    const operation = {
      operationId: 'op-critical-pending-status',
      type: OperationType.REPLACE,
      partitionId: 'sql_transactions-p1',
      entityType: 'partition',
      entityId: 'sql_transactions-p1',
      replicaId: 'sql_transactions-p1-r4',
      sourceNodeId: 'node-remote',
      targetNodeId: 'node-local',
      status: 'pending',
      workflowStep: WORKFLOW_STEP.PENDING,
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 2000,
      completedAt: null,
      errorMessage: null,
      stepsHistory: [],
    };

    let executeFromReconcileCalls = 0;
    coordinator.workflowOwner.getReconciledReplicaStatus = async () =>
      ReplicaStatus.PENDING;
    coordinator.workflowOwner.executeOperationFromReconcilePath =
    async () => {
      executeFromReconcileCalls += 1;
      return {
        success: false,
        skipped: true,
        reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        operationId: operation.operationId,
      };
    };

    try {
      const progressed =
      await coordinator.reconcileOperationProgress(operation);
      t.equal(
        progressed,
        true,
        'critical pending-status operations should be treated as re-armed progress',
      );
      t.equal(
        executeFromReconcileCalls,
        1,
        'reconciliation should re-enter dispatch when observed status is pending',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator re-arms overdue critical PENDING operations ' +
  'while operation budget remains active',
  async (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: PRIORITY_PENDING_REARM_NODE_ID,
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
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], affectedRows: 0};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    const now = Date.now();
    const pendingTimeoutMs = coordinator.getTimeoutForStep(
      WORKFLOW_STEP.PENDING,
      {partitionId: PRIORITY_PENDING_REARM_PARTITION_ID},
    );
    const expiredStepUpdatedAt =
      now - pendingTimeoutMs - PRIORITY_PENDING_REARM_TIMEOUT_OVERRUN_MS;
    const operation = {
      operationId: PRIORITY_PENDING_REARM_OPERATION_ID,
      type: OperationType.REPLACE,
      partitionId: PRIORITY_PENDING_REARM_PARTITION_ID,
      entityType: 'partition',
      entityId: PRIORITY_PENDING_REARM_PARTITION_ID,
      replicaId: PRIORITY_PENDING_REARM_REPLICA_ID,
      sourceNodeId: PRIORITY_PENDING_REARM_SOURCE_NODE_ID,
      targetNodeId: PRIORITY_PENDING_REARM_NODE_ID,
      status: ReplicaStatus.PENDING,
      workflowStep: WORKFLOW_STEP.PENDING,
      createdAt: expiredStepUpdatedAt,
      updatedAt: expiredStepUpdatedAt,
      completedAt: null,
      errorMessage: null,
      stepsHistory: [],
    };

    let executeFromReconcileCalls = 0;
    let failOperationCalls = 0;
    coordinator.workflowOwner.getReconciledReplicaStatus = async () => null;
    coordinator.workflowOwner.executeOperationFromReconcilePath =
    async () => {
      executeFromReconcileCalls += 1;
      return {
        success: false,
        skipped: true,
        reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        operationId: operation.operationId,
      };
    };
    coordinator.workflowOwner.failOperation = async () => {
      failOperationCalls += 1;
    };

    try {
      await coordinator.reconcileTimeoutOperation(operation, now);
      t.equal(
        executeFromReconcileCalls,
        1,
        'timeout reconciliation should re-enter dispatch before failing the pending step',
      );
      t.equal(
        failOperationCalls,
        0,
        'timeout reconciliation must not fail the critical operation while the operation budget remains active',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator dispatchOperation falls back to the sync planning ' +
  'snapshot when async priority refresh stalls',
  async (t) => {
    const deliveries = [];
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
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              controlPlaneRecoveryEligible: true,
              repairEligible: true,
              serveEligible: true,
            },
          };
        },
        async getMembershipPublicationPlanningSnapshotBestEffort(nodeId) {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: Object.freeze(['node-a', 'node-local']),
            recoveryActiveNodeIds: Object.freeze(['node-a', 'node-local']),
            projectedServingNodeIds: Object.freeze(['node-a', 'node-local']),
            locallyEligibleNodeIds: Object.freeze(['node-a', 'node-local']),
            publishedMembershipIncludesTargetNode: nodeId === 'node-local',
            priorityPartitionSummary: Object.freeze({
              satisfied: false,
              requiredDistinctNodeCount: 2,
              missingPartitionIds: ['sql_write_operations-p1'],
            }),
          };
        },
      },
      messageRouter: {
        async deliver(target, request) {
          deliveries.push({target, request});
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (String(sql).trim().toLowerCase().startsWith('select')) {
            return {success: true, rows: [], affectedRows: 0};
          }
          return {success: true, rows: [], affectedRows: 1, changes: 1};
        },
      },
      ...createStorageOwners(),
      setTimeoutFn(fn) {
        fn();
        return {cancelled: false};
      },
      clearTimeoutFn() {},
      enableTimeouts: false,
    });
    coordinator.initialize();
    disablePersistenceConfirmation(coordinator);

    try {
      const operation = {
        operationId: 'op-priority-planning-sync-fallback',
        type: OperationType.REPLACE,
        partitionId: 'sql_write_operations-p1',
        entityType: 'partition',
        entityId: 'sql_write_operations-p1',
        replicaId: 'sql_write_operations-p1-r4',
        sourceReplicaId: 'sql_write_operations-p1-r1',
        sourceNodeId: 'node-remote',
        targetNodeId: 'node-local',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.SENDING,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 500,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      const result = await coordinator.dispatchOperation(operation);

      t.equal(
        result.success,
        true,
        'dispatch should keep progressing when the async planning refresh stalls',
      );
      t.equal(
        deliveries.length,
        1,
        'dispatch should still reach the replica handler through the sync fallback snapshot',
      );
      t.equal(
        deliveries[0]?.target,
        'node-local/service/replica-handler',
        'dispatch should still route to the local replica handler',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.CREATING,
        'the owner path should continue past SENDING when sync planning evidence is already sufficient',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('OperationWorkflowOwner prefers canonical priority-recovery planning answers',
    async (t) => {
      const canonicalCalls = [];
      const legacyCalls = [];
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
        controlPlaneReadinessService: {
          getNodeReadinessSync(nodeId) {
            return {
              nodeId,
              dimensions: {
                controlPlaneRecoveryEligible: true,
                repairEligible: true,
                serveEligible: true,
              },
            };
          },
          getPriorityRecoveryPlanningAnswerBestEffort(nodeId) {
            canonicalCalls.push(nodeId);
            return Promise.resolve({
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze([
                'node-a',
                'node-local',
              ]),
              recoveryActiveNodeIds: Object.freeze(['node-a', 'node-local']),
              projectedServingNodeIds: Object.freeze(['node-a', 'node-local']),
              locallyEligibleNodeIds: Object.freeze(['node-a', 'node-local']),
              publishedMembershipIncludesTargetNode: nodeId === 'node-local',
              priorityPartitionSummary: Object.freeze({
                satisfied: false,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: ['sql_write_operations-p1'],
              }),
            });
          },
          async getMembershipPublicationPlanningAnswerBestEffort() {
            legacyCalls.push(1);
            return {
              publishedActiveNodeIdsPresent: true,
              publishedActiveNodeIds: Object.freeze([
                'legacy-node-a',
                'legacy-node-local',
              ]),
              recoveryActiveNodeIds: Object.freeze([
                'legacy-node-a',
                'legacy-node-local',
              ]),
              projectedServingNodeIds: Object.freeze([
                'legacy-node-a',
                'legacy-node-local',
              ]),
              locallyEligibleNodeIds: Object.freeze([
                'legacy-node-a',
                'legacy-node-local',
              ]),
              publishedMembershipIncludesTargetNode: false,
              priorityPartitionSummary: Object.freeze({
                satisfied: false,
                requiredDistinctNodeCount: 2,
                missingPartitionIds: ['sql_write_operations-p1'],
              }),
            };
          },
        },
        messageRouter: {
          async deliver() {
            return {acknowledged: true, status: 'initiated'};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).trim().toLowerCase().startsWith('select')) {
              return {success: true, rows: [], affectedRows: 0};
            }
            return {success: true, rows: [], affectedRows: 1, changes: 1};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });

      const operation = {
        operationId: 'op-priority-canonical-planning',
        type: 'REPLACE',
        partitionId: 'sql_write_operations-p1',
        entityType: 'partition',
        entityId: 'sql_write_operations-p1',
        replicaId: 'sql_write_operations-p1-r4',
        sourceReplicaId: 'sql_write_operations-p1-r1',
        sourceNodeId: 'node-a',
        targetNodeId: 'node-remote',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 500,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      try {
        const snapshot =
        await coordinator.workflowOwner.getPriorityRecoveryPlanningSnapshot(
          operation,
        );

        t.equal(
          snapshot?.priorityPartitionSummary?.missingPartitionIds?.[0],
          'sql_write_operations-p1',
          'canonical planning answer should be used for priority gates',
        );
        t.equal(
          canonicalCalls.length,
          1,
          'canonical priority planning answer surface should be the first choice',
        );
        t.equal(
          canonicalCalls[0],
          'node-local',
          'priority create-budget gates should read the local canonical planning view instead of a remote operation participant snapshot',
        );
        t.equal(
          legacyCalls.length,
          0,
          'legacy fallback planning surface should not be called when canonical answer exists',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  test('RebalanceCoordinator dispatchOperation still demotes superseded ' +
  'priority targets when the async planning refresh stalls',
  async (t) => {
    const deliveries = [];
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
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              controlPlaneRecoveryEligible: true,
              repairEligible: true,
              serveEligible: true,
            },
          };
        },
        async getMembershipPublicationPlanningSnapshotBestEffort() {
          return {
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: Object.freeze(['node-a', 'node-b']),
            recoveryActiveNodeIds: Object.freeze(['node-a', 'node-b']),
            projectedServingNodeIds: Object.freeze(['node-a', 'node-b']),
            locallyEligibleNodeIds: Object.freeze(['node-a', 'node-b']),
            publishedMembershipIncludesTargetNode: false,
            priorityPartitionSummary: Object.freeze({
              satisfied: false,
              requiredDistinctNodeCount: 2,
              missingPartitionIds: ['sql_write_operations-p1'],
            }),
          };
        },
      },
      messageRouter: {
        async deliver(target, request) {
          deliveries.push({target, request});
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (String(sql).trim().toLowerCase().startsWith('select')) {
            return {success: true, rows: [], affectedRows: 0};
          }
          return {success: true, rows: [], affectedRows: 1, changes: 1};
        },
      },
      ...createStorageOwners(),
      setTimeoutFn(fn) {
        fn();
        return {cancelled: false};
      },
      clearTimeoutFn() {},
      enableTimeouts: false,
    });
    coordinator.initialize();
    disablePersistenceConfirmation(coordinator);

    try {
      const operation = {
        operationId: 'op-priority-planning-sync-superseded',
        type: OperationType.REPLACE,
        partitionId: 'sql_write_operations-p1',
        entityType: 'partition',
        entityId: 'sql_write_operations-p1',
        replicaId: 'sql_write_operations-p1-r4',
        sourceReplicaId: 'sql_write_operations-p1-r1',
        sourceNodeId: 'node-remote',
        targetNodeId: 'node-local',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.SENDING,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 500,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      const result = await coordinator.dispatchOperation(operation);

      t.equal(
        result.success,
        false,
        'dispatch should still fail when the sync fallback proves the target is superseded',
      );
      t.equal(
        deliveries.length,
        0,
        'superseded targets should not dispatch any replica work',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.FAILED,
        'the operation should become an explicit failed next action',
      );
      t.match(
        String(result.error || operation.errorMessage || ''),
        /eligible cohort/i,
        'failure should still explain that the target is outside the recovery cohort',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator timeout sweeps fail overdue operations before verify windows',
    async (t) => {
      const originalDateNow = Date.now;
      const baseNowMs = 5_000_000;
      let nowMs = baseNowMs;
      Date.now = () => nowMs;

      const operation = {
        operationId: 'op-timeout-window-gap',
        type: 'REPLACE',
        partitionId: 'partition-1',
        replicaId: 'partition-1-r1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.SENDING,
        createdAt: baseNowMs - 40_000,
        updatedAt: baseNowMs - 29_900,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };
      let failedCount = 0;

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
            return {acknowledged: true, status: 'initiated'};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });
      coordinator.initialize();

      coordinator.workflowOwner.repository.queryIncompleteOperations =
      async () => {
        if (failedCount > 0) {
          return [];
        }
        return [operation];
      };
      coordinator.workflowOwner.reconcileOperationProgress =
      async () => false;
      coordinator.workflowOwner.reconcileReservations = async () => ({
        expired: 0,
        orphansReleased: 0,
      });
      coordinator.workflowOwner.failOperation = async () => {
        failedCount += 1;
        operation.workflowStep = WORKFLOW_STEP.FAILED;
        operation.status = 'failed';
        operation.completedAt = nowMs;
        operation.updatedAt = nowMs;
      };

      try {
        const verifyWindowAtMs = baseNowMs + 4_100;
        for (
          let sweepAtMs = baseNowMs + coordinator.timeoutCheckIntervalMs;
          sweepAtMs <= verifyWindowAtMs;
          sweepAtMs += coordinator.timeoutCheckIntervalMs
        ) {
          nowMs = sweepAtMs;
          await coordinator.checkTimeouts();
        }

        nowMs = verifyWindowAtMs;
        t.equal(
          failedCount > 0,
          true,
          'overdue operation should be failed before verification snapshot window',
        );
      } finally {
        Date.now = originalDateNow;
        await coordinator.shutdown();
      }
    });

  test('RebalanceCoordinator updateStep persists durable transition fields',
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
            return {acknowledged: true, status: 'initiated'};
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
      disablePersistenceConfirmation(coordinator);

      try {
        const operation = {
          operationId: 'op-durable-step',
          type: 'ADD',
          partitionId: 'partition-1',
          entityType: 'partition',
          entityId: 'partition-1',
          replicaId: 'partition-1-r1',
          sourceNodeId: 'node-local',
          targetNodeId: 'node-remote',
          status: 'pending',
          workflowStep: WORKFLOW_STEP.PENDING,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: null,
          errorMessage: null,
          stepsHistory: [],
        };

        await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

        t.equal(operation.workflowStep, WORKFLOW_STEP.SENDING);
        t.equal(operation.stepsHistory.length, 1);

        const entry = operation.stepsHistory[0];
        t.equal(entry.step, WORKFLOW_STEP.SENDING, 'step field present');
        t.equal(
          entry.previousStep,
          WORKFLOW_STEP.PENDING,
          'previousStep must be persisted',
        );
        t.equal(
          entry.reason,
          OPERATION_TRANSITION_REASON.DISPATCH_SENDING,
          'reason must be persisted',
        );
        t.ok(
          typeof entry.timestamp === 'number' && entry.timestamp > 0,
          'timestamp must be persisted',
        );
        t.equal(
          entry.ownerKey,
          'op-durable-step',
          'ownerKey must be persisted',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  test('RebalanceCoordinator completeOperation persists durable transition ' +
  'fields', async (t) => {
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
    disablePersistenceConfirmation(coordinator);

    try {
      const operation = {
        operationId: 'op-complete-durable',
        type: 'ADD',
        partitionId: 'partition-1',
        entityType: 'partition',
        entityId: 'partition-1',
        replicaId: 'partition-1-r1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote',
        status: 'syncing',
        workflowStep: WORKFLOW_STEP.SYNCING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      await coordinator.completeOperation(operation);

      t.equal(operation.workflowStep, WORKFLOW_STEP.ACTIVE);
      t.equal(operation.stepsHistory.length, 1);

      const entry = operation.stepsHistory[0];
      t.equal(
        entry.previousStep,
        WORKFLOW_STEP.SYNCING,
        'previousStep must be persisted on completion',
      );
      t.equal(
        entry.reason,
        OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
        'reason must be persisted on completion',
      );
      t.ok(entry.timestamp > 0, 'timestamp must be persisted');
      t.equal(entry.ownerKey, 'op-complete-durable');
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator failOperation persists durable transition ' +
  'fields', async (t) => {
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
          return {acknowledged: false, error: 'test error'};
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
    disablePersistenceConfirmation(coordinator);

    try {
      const operation = {
        operationId: 'op-fail-durable',
        type: 'ADD',
        partitionId: 'partition-1',
        entityType: 'partition',
        entityId: 'partition-1',
        replicaId: 'partition-1-r1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote',
        status: 'creating',
        workflowStep: WORKFLOW_STEP.CREATING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      await coordinator.failOperation(operation, 'test failure reason');

      t.equal(operation.workflowStep, WORKFLOW_STEP.FAILED);
      t.equal(operation.stepsHistory.length, 1);

      const entry = operation.stepsHistory[0];
      t.equal(
        entry.previousStep,
        WORKFLOW_STEP.CREATING,
        'previousStep must be persisted on failure',
      );
      t.equal(
        entry.reason,
        OPERATION_TRANSITION_REASON.OPERATION_FAILED,
        'reason must be persisted on failure',
      );
      t.ok(entry.timestamp > 0, 'timestamp must be persisted');
      t.equal(entry.ownerKey, 'op-fail-durable');
    } finally {
      await coordinator.shutdown();
    }
  });

  test('RebalanceCoordinator updateStep routes through workflow ' +
  'coordinator transitionStep', async (t) => {
    const workflowCoordinator = createWorkflowCoordinatorSpy();
    const transitionCalls = [];
    const originalTransitionStep =
    workflowCoordinator.transitionStep.bind(workflowCoordinator);
    workflowCoordinator.transitionStep = async (...args) => {
      transitionCalls.push(args);
      return originalTransitionStep(...args);
    };

    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      transactionCoordinator: createTransactionCoordinator(),
      operationWorkflowCoordinator: workflowCoordinator,
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
          return {acknowledged: true, status: 'initiated'};
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
    disablePersistenceConfirmation(coordinator);

    try {
      const operation = {
        operationId: 'op-route-check',
        type: 'ADD',
        partitionId: 'partition-1',
        entityType: 'partition',
        entityId: 'partition-1',
        replicaId: 'partition-1-r1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.equal(
        transitionCalls.length,
        1,
        'updateStep must route through workflow coordinator transitionStep',
      );
      t.equal(transitionCalls[0][0], 'op-route-check');
      t.equal(transitionCalls[0][1].nextStep, WORKFLOW_STEP.SENDING);
      t.ok(transitionCalls[0][1].reason);
    } finally {
      await coordinator.shutdown();
    }
  });
}
