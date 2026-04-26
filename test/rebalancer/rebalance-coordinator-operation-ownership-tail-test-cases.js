import {registerRebalanceCoordinatorOperationOwnershipTailMoreTests} from './rebalance-coordinator-operation-ownership-tail-more-test-cases.js';

export function registerRebalanceCoordinatorOperationOwnershipTailTests({
  test,
  assert,
  RebalanceCoordinator,
  WORKFLOW_STEP,
  REBALANCER_SKIP_REASON,
  DurableWorkflowCoordinator,
  buildPriorityRecoveryAdmissionPlan,
  OperationType,
  ReplicaStatus,
  EMERGENCY_TRANSPORT_PARTITION_ID,
  createWorkflowCoordinatorSpy,
  createStorageOwners,
  createTransactionCoordinator,
  createCoordinator,
  disablePersistenceConfirmation,
}) {
  const REBALANCE_OPERATION_BUDGET_MS = 300000;

  test('RebalanceCoordinator bypasses empty-cache admission backoff for critical partition create',
    async (t) => {
      let sqlQueryCalls = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-local',
        transactionCoordinator: createTransactionCoordinator(),
        systemTableCache: {
          get() {
            return null;
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
        },
        sqlQueryEngine: {
          async executeQuery() {
            sqlQueryCalls += 1;
            return {success: true, rows: [], changes: 1};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });
      coordinator.initialize();
      coordinator.repository.getOperationsByEntityAuthoritative = async () => [];
      coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 60_000;
      coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs = Date.now();

      try {
        let nonCriticalError = null;
        try {
          await coordinator.ensureConcurrentOperationBudgetAllowed(
            OperationType.REPLACE,
            {
              partitionId: 'users-p1',
            },
          );
        } catch (error) {
          nonCriticalError = error;
        }
        t.equal(
          nonCriticalError?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'non-critical partitions should still respect empty-cache admission backoff',
        );

        await coordinator.ensureConcurrentOperationBudgetAllowed(
          OperationType.REPLACE,
          {
            partitionId: 'control_plane_publications-p1',
          },
        );
        t.ok(
          sqlQueryCalls > 0,
          'critical partition create admission should issue authoritative operation-count reads',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  test(
    'RebalanceCoordinator keeps priority add budget independent from ' +
    'non-priority in-flight adds',
    async (t) => {
      const coordinator = new RebalanceCoordinator({
        nodeId: 'node-local',
        transactionCoordinator: createTransactionCoordinator(),
        systemTableCache: {
          get() {
            return null;
          },
          filter(tableName) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return [{
              operation_id: 'op-non-priority',
              type: 'REPLACE',
              partition_id: 'users-p1',
              source_node_id: 'node-local',
              target_node_id: 'node-remote',
              replica_id: 'users-p1-r2',
              status: 'syncing',
              workflow_step: 'SYNCING',
              created_at: 100,
              updated_at: 101,
              completed_at: null,
              error_message: null,
              steps_history: '[]',
            }];
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
      coordinator.config.maxConcurrentAdds = 1;

      try {
        let nonPriorityError = null;
        try {
          await coordinator.ensureConcurrentOperationBudgetAllowed(
            OperationType.REPLACE,
            {
              partitionId: 'users-p2',
            },
          );
        } catch (error) {
          nonPriorityError = error;
        }
        t.equal(
          nonPriorityError?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'non-priority add/replace should still respect shared add budget',
        );

        await coordinator.ensureConcurrentOperationBudgetAllowed(
          OperationType.REPLACE,
          {
            partitionId: 'control_plane_publications-p1',
          },
        );
        t.pass(
          'priority control-plane add/replace should use its dedicated add budget lane',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator lets repeated critical dispatch retry grace consume the enclosing operation budget',
    async (t) => {
      const TRANSITION_GRACE_OPERATION_ID = 'op-priority-sending-grace-budget';
      const PRIORITY_PARTITION_ID = 'replica_operations-p1';
      const BASE_CREATED_AT_MS = 1_000_000;
      const BASE_UPDATED_AT_MS = BASE_CREATED_AT_MS + 10_000;
      const FIRST_GRACE_RECORDED_AT_MS = BASE_UPDATED_AT_MS + 10_000;
      const SECOND_GRACE_RECORDED_AT_MS = BASE_UPDATED_AT_MS + 55_000;
      const RETRY_DELAY_MS = 5_000;
      const originalDateNow = Date.now;
      let nowMs = FIRST_GRACE_RECORDED_AT_MS;
      Date.now = () => nowMs;

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

      try {
        coordinator.workflowOwner.recordTransitionRetryGrace(
          TRANSITION_GRACE_OPERATION_ID,
          {
            workflowStep: WORKFLOW_STEP.SENDING,
            partitionId: PRIORITY_PARTITION_ID,
            updatedAt: BASE_UPDATED_AT_MS,
            createdAt: BASE_CREATED_AT_MS,
          },
          RETRY_DELAY_MS,
        );

        nowMs = SECOND_GRACE_RECORDED_AT_MS;
        coordinator.workflowOwner.recordTransitionRetryGrace(
          TRANSITION_GRACE_OPERATION_ID,
          {
            workflowStep: WORKFLOW_STEP.SENDING,
            partitionId: PRIORITY_PARTITION_ID,
            updatedAt: BASE_UPDATED_AT_MS,
            createdAt: BASE_CREATED_AT_MS,
          },
          RETRY_DELAY_MS,
        );

        const sendingTimeoutMs = coordinator.getTimeoutForStep(
          WORKFLOW_STEP.SENDING,
          {partitionId: PRIORITY_PARTITION_ID},
        );

        t.equal(
          coordinator.workflowOwner.hasActiveTransitionRetryGrace(
            TRANSITION_GRACE_OPERATION_ID,
            BASE_UPDATED_AT_MS + sendingTimeoutMs + 1,
          ),
          true,
        );
        t.equal(
          coordinator.workflowOwner.hasActiveTransitionRetryGrace(
            TRANSITION_GRACE_OPERATION_ID,
            BASE_CREATED_AT_MS + REBALANCE_OPERATION_BUDGET_MS + 1,
          ),
          false,
        );
      } finally {
        Date.now = originalDateNow;
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator reserves one shared add slot for priority recovery ' +
    'while non-priority scheduling remains capped below the full add budget',
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
      coordinator.config.maxConcurrentAdds = 2;
      coordinator.controlPlaneReadinessService.membershipPublicationService = {
        getLatestClusterPublicationSync() {
          return {
            status: 'PUBLISHED',
            priorityPartitionSummary: {
              satisfied: false,
            },
          };
        },
      };
      coordinator.queryIncompleteOperations = async () => ([{
        operationId: 'op-non-priority-inflight',
        type: OperationType.ADD,
        partitionId: 'users-p1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote-a',
        replicaId: 'users-p1-r2',
        workflowStep: WORKFLOW_STEP.CREATING,
        status: 'creating',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      }]);

      try {
        let nonPriorityError = null;
        try {
          await coordinator.ensureConcurrentOperationBudgetAllowed(
            OperationType.ADD,
            {
              partitionId: 'users-p2',
            },
          );
        } catch (error) {
          nonPriorityError = error;
        }
        t.equal(
          nonPriorityError?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'non-priority add scheduling should preserve one reserved slot for priority recovery',
        );

        await coordinator.ensureConcurrentOperationBudgetAllowed(
          OperationType.ADD,
          {
            partitionId: 'control_plane_publications-p1',
          },
        );
        t.pass(
          'priority control-plane add scheduling should still consume the reserved recovery slot',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator keeps reserved priority add capacity during transient publication-summary gaps and after immediate summary recovery',
    async (t) => {
      let now = 10_000;
      let publicationRow = {
        status: 'PUBLISHED',
        priorityPartitionSummary: {
          satisfied: false,
        },
      };
      const coordinator = new RebalanceCoordinator({
        nodeId: 'node-local',
        transactionCoordinator: createTransactionCoordinator(),
        nowFn: () => now,
        priorityRecoveryActivityStaleGraceMs: 15_000,
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
      coordinator.config.maxConcurrentAdds = 2;
      coordinator.getLatestMembershipPublicationRow = () => publicationRow;
      coordinator.queryIncompleteOperations = async () => ([{
        operationId: 'op-non-priority-inflight',
        type: OperationType.ADD,
        partitionId: 'users-p1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote-a',
        replicaId: 'users-p1-r2',
        workflowStep: WORKFLOW_STEP.CREATING,
        status: 'creating',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      }]);

      try {
        let activeRecoveryError = null;
        try {
          await coordinator.ensureConcurrentOperationBudgetAllowed(
            OperationType.ADD,
            {
              partitionId: 'users-p2',
            },
          );
        } catch (error) {
          activeRecoveryError = error;
        }
        t.equal(
          activeRecoveryError?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'active recovery should reserve one shared add slot from non-priority scheduling',
        );

        publicationRow = null;
        now += 5_000;

        let staleSummaryError = null;
        try {
          await coordinator.ensureConcurrentOperationBudgetAllowed(
            OperationType.ADD,
            {
              partitionId: 'users-p3',
            },
          );
        } catch (error) {
          staleSummaryError = error;
        }
        t.equal(
          staleSummaryError?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'transient summary loss should keep the reserved slot active during stale-grace window',
        );

        publicationRow = {
          status: 'PUBLISHED',
          priorityPartitionSummary: {
            satisfied: true,
          },
        };
        now += 1_000;
        let satisfiedSummaryError = null;
        try {
          await coordinator.ensureConcurrentOperationBudgetAllowed(
            OperationType.ADD,
            {
              partitionId: 'users-p4',
            },
          );
        } catch (error) {
          satisfiedSummaryError = error;
        }
        t.equal(
          satisfiedSummaryError?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'an immediately satisfied summary does not clear the reserved slot while the in-flight recovery signal is still active',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator caps repeated transition retry grace at the durable creating timeout ceiling',
    async (t) => {
      const TRANSITION_GRACE_OPERATION_ID = 'op-priority-creating-grace-cap';
      const PRIORITY_PARTITION_ID = 'replica_operations-p1';
      const BASE_UPDATED_AT_MS = 1_000_000;
      const FIRST_GRACE_RECORDED_AT_MS = BASE_UPDATED_AT_MS + 10_000;
      const SECOND_GRACE_RECORDED_AT_MS = BASE_UPDATED_AT_MS + 55_000;
      const RETRY_DELAY_MS = 5_000;
      const originalDateNow = Date.now;
      let nowMs = FIRST_GRACE_RECORDED_AT_MS;
      Date.now = () => nowMs;

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

      try {
        coordinator.workflowOwner.recordTransitionRetryGrace(
          TRANSITION_GRACE_OPERATION_ID,
          {
            workflowStep: WORKFLOW_STEP.CREATING,
            partitionId: PRIORITY_PARTITION_ID,
            updatedAt: BASE_UPDATED_AT_MS,
          },
          RETRY_DELAY_MS,
        );

        nowMs = SECOND_GRACE_RECORDED_AT_MS;
        coordinator.workflowOwner.recordTransitionRetryGrace(
          TRANSITION_GRACE_OPERATION_ID,
          {
            workflowStep: WORKFLOW_STEP.CREATING,
            partitionId: PRIORITY_PARTITION_ID,
            updatedAt: BASE_UPDATED_AT_MS,
          },
          RETRY_DELAY_MS,
        );

        const creatingTimeoutMs = coordinator.getTimeoutForStep(
          WORKFLOW_STEP.CREATING,
          {partitionId: PRIORITY_PARTITION_ID},
        );

        t.equal(
          coordinator.workflowOwner.hasActiveTransitionRetryGrace(
            TRANSITION_GRACE_OPERATION_ID,
            BASE_UPDATED_AT_MS + creatingTimeoutMs - 1,
          ),
          true,
        );
        t.equal(
          coordinator.workflowOwner.hasActiveTransitionRetryGrace(
            TRANSITION_GRACE_OPERATION_ID,
            BASE_UPDATED_AT_MS + creatingTimeoutMs + 1,
          ),
          false,
        );
      } finally {
        Date.now = originalDateNow;
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator reserves one emergency priority add slot for ' +
    'transport-critical recovery while ordinary priority work is already in flight',
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
      coordinator.config.maxConcurrentAdds = 1;
      coordinator.controlPlaneReadinessService.membershipPublicationService = {
        getLatestClusterPublicationSync() {
          return {
            status: 'PUBLISHED',
            priorityPartitionSummary: {
              satisfied: false,
            },
          };
        },
      };
      coordinator.queryIncompleteOperations = async () => ([{
        operationId: 'op-priority-sql-write',
        type: OperationType.ADD,
        partitionId: 'sql_write_operations-p1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote-a',
        replicaId: 'sql_write_operations-p1-r4',
        workflowStep: WORKFLOW_STEP.CREATING,
        status: 'creating',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      }]);

      try {
        let ordinaryPriorityError = null;
        try {
          await coordinator.ensureConcurrentOperationBudgetAllowed(
            OperationType.ADD,
            {
              partitionId: 'sql_transactions-p1',
            },
          );
        } catch (error) {
          ordinaryPriorityError = error;
        }
        t.equal(
          ordinaryPriorityError?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'ordinary priority add scheduling should preserve the emergency transport recovery slot',
        );

        await coordinator.ensureConcurrentOperationBudgetAllowed(
          OperationType.ADD,
          {
            partitionId: 'control_plane_publications-p1',
          },
        );
        t.pass(
          'transport-critical control-plane add scheduling should still use the reserved emergency slot',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator keeps priority add admission on the critical pressure lane',
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
          getStats() {
            return {
              outboundQueues: {
                'node-remote-a': {
                  pending: 10,
                  pendingCritical: 0,
                  pendingBackground: 10,
                  maxPending: 10,
                  criticalReserve: 1,
                  backgroundPendingLimit: 9,
                },
              },
            };
          },
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

      try {
        let ordinaryAddError = null;
        try {
          await coordinator.ensureConcurrentOperationBudgetAllowed(
            OperationType.ADD,
            {
              partitionId: 'users-p1',
            },
          );
        } catch (error) {
          ordinaryAddError = error;
        }

        t.equal(
          ordinaryAddError?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'ordinary add admission should still defer when the local router is saturated',
        );

        await coordinator.ensureConcurrentOperationBudgetAllowed(
          OperationType.ADD,
          {
            partitionId: 'control_plane_publications-p1',
          },
        );
        t.pass(
          'priority control-plane add admission should bypass background router pressure',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator uses a dedicated emergency create-budget scope for ' +
    'transport-critical priority recovery',
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
            return {acknowledged: true, status: 'completed'};
          },
        },
        sqlQueryEngine: {
          async executeQuery(_sql) {
            return {success: true, rows: [], changes: 1};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });
      coordinator.initialize();
      disablePersistenceConfirmation(coordinator);
      coordinator.getLatestMembershipPublicationRow = () => ({
        priorityPartitionSummary: {
          satisfied: false,
        },
      });

      try {
        await coordinator.createOperation({
          type: OperationType.ADD,
          partitionId: 'control_plane_publications-p1',
          entityType: 'partition',
          entityId: 'control_plane_publications-p1',
          nodeId: 'node-remote',
          enforceConcurrentOperationBudget: true,
        });

        t.equal(
          workflowCoordinator.ownerKeys.includes(
            'create-budget:emergency_priority_add',
          ),
          true,
          'transport-critical priority recovery should bypass the shared add budget gate',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator does not treat REPLACE STOPPING phase as ' +
    'add-budget in-flight for priority recovery',
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
      coordinator.config.maxConcurrentAdds = 1;
      coordinator.queryIncompleteOperations = async () => ([{
        operationId: 'op-priority-remove-phase',
        type: 'REPLACE',
        partitionId: 'sql_write_operations-p1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote-a',
        replicaId: 'sql_write_operations-p1-r4',
        status: 'removing',
        workflowStep: 'STOPPING',
        createdAt: 100,
        updatedAt: 101,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      }]);

      try {
        await coordinator.ensureConcurrentOperationBudgetAllowed(
          OperationType.REPLACE,
          {
            partitionId: 'sql_transaction_participants-p1',
          },
        );
        t.pass(
          'priority recovery should continue while prior REPLACE source-removal is still reconciling',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator does not let spread-satisfied priority REPLACE rows ' +
    'monopolize the priority add budget',
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
      coordinator.config.maxConcurrentAdds = 1;

      const activePriorityReplaceOperation = {
        operationId: 'op-priority-spread-satisfied',
        type: 'REPLACE',
        partitionId: 'control_plane_publications-p1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote-a',
        replicaId: 'control_plane_publications-p1-r4',
        status: 'active',
        workflowStep: 'ACTIVE',
        createdAt: 100,
        updatedAt: 101,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };
      const planningSnapshot = {
        publishedActiveNodeIds: Object.freeze([
          'node-local',
          'node-remote-a',
          'node-remote-b',
        ]),
        projectedServingNodeIds: Object.freeze([
          'node-local',
          'node-remote-a',
          'node-remote-b',
        ]),
        locallyEligibleNodeIds: Object.freeze([
          'node-local',
          'node-remote-a',
          'node-remote-b',
        ]),
        priorityPartitionSummary: Object.freeze({
          satisfied: false,
          requiredDistinctNodeCount: 3,
          blockedPartitions: Object.freeze([Object.freeze({
            partitionId: 'control_plane_publications-p1',
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 2,
            spreadGap: 1,
          })]),
          missingPartitionIds: Object.freeze([
            'control_plane_publications-p1',
          ]),
        }),
      };

      coordinator.queryCachedIncompleteOperations = async () => (
        [activePriorityReplaceOperation]
      );
      coordinator.queryIncompleteOperations = async () => (
        [activePriorityReplaceOperation]
      );
      coordinator.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation =
      async () => planningSnapshot;

      try {
        const canStartPriorityOperation =
        await coordinator.canStartPriorityAddOperation({
          partitionId: 'sql_transaction_participants-p1',
        });

        t.equal(
          canStartPriorityOperation,
          true,
          'priority add budget should stay open for the next partition once the existing REPLACE already satisfies spread on an eligible target',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator does not let combined spread-satisfied priority ' +
    'REPLACE rows monopolize the priority add budget',
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
      coordinator.config.maxConcurrentAdds = 1;

      const firstActivePriorityReplaceOperation = {
        operationId: 'op-priority-spread-satisfied-1',
        type: 'REPLACE',
        partitionId: 'sql_transaction_participants-p1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote-a',
        replicaId: 'sql_transaction_participants-p1-r4',
        status: 'active',
        workflowStep: 'ACTIVE',
        createdAt: 100,
        updatedAt: 101,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [{
          step: 'ACTIVE',
          timestamp: 101,
        }],
      };
      const secondActivePriorityReplaceOperation = {
        operationId: 'op-priority-spread-satisfied-2',
        type: 'REPLACE',
        partitionId: 'sql_transaction_participants-p1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote-b',
        replicaId: 'sql_transaction_participants-p1-r5',
        status: 'active',
        workflowStep: 'ACTIVE',
        createdAt: 102,
        updatedAt: 103,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [{
          step: 'ACTIVE',
          timestamp: 103,
        }],
      };
      const planningSnapshot = {
        publishedActiveNodeIds: Object.freeze([
          'node-local',
          'node-remote-a',
          'node-remote-b',
        ]),
        projectedServingNodeIds: Object.freeze([
          'node-local',
          'node-remote-a',
          'node-remote-b',
        ]),
        locallyEligibleNodeIds: Object.freeze([
          'node-local',
          'node-remote-a',
          'node-remote-b',
        ]),
        priorityPartitionSummary: Object.freeze({
          satisfied: false,
          requiredDistinctNodeCount: 3,
          blockedPartitions: Object.freeze([Object.freeze({
            partitionId: 'sql_transaction_participants-p1',
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 1,
            spreadGap: 2,
          })]),
          missingPartitionIds: Object.freeze([
            'sql_transaction_participants-p1',
          ]),
        }),
      };

      coordinator.queryCachedIncompleteOperations = async () => (
        [
          firstActivePriorityReplaceOperation,
          secondActivePriorityReplaceOperation,
        ]
      );
      coordinator.queryIncompleteOperations = async () => (
        [
          firstActivePriorityReplaceOperation,
          secondActivePriorityReplaceOperation,
        ]
      );
      coordinator.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation =
      async () => planningSnapshot;

      try {
        const canStartPriorityOperation =
        await coordinator.canStartPriorityAddOperation({
          partitionId: 'control_plane_publications-p1',
        });

        t.equal(
          canStartPriorityOperation,
          true,
          'priority add budget should stay open once combined REPLACE targets already satisfy spread for one partition',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator reuses the workflow-owner priority decision snapshot ' +
    'before falling back to planning snapshots for grouped priority add budget',
    async (t) => {
      const spreadSatisfiedInFlightState = 'spread_satisfied_in_flight';
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
      coordinator.config.maxConcurrentAdds = 1;

      const activePriorityReplaceOperation = {
        operationId: 'op-priority-runtime-snapshot',
        type: 'REPLACE',
        partitionId: 'sql_transaction_participants-p1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote-a',
        replicaId: 'sql_transaction_participants-p1-r4',
        status: 'active',
        workflowStep: 'ACTIVE',
        createdAt: 100,
        updatedAt: 101,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [{
          step: 'ACTIVE',
          timestamp: 101,
        }],
      };
      let planningSnapshotCalls = 0;

      coordinator.queryCachedIncompleteOperations = async () => (
        [activePriorityReplaceOperation]
      );
      coordinator.queryIncompleteOperations = async () => (
        [activePriorityReplaceOperation]
      );
      coordinator.workflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations =
      async () => ({
        partitionId: 'sql_transaction_participants-p1',
        semanticState: spreadSatisfiedInFlightState,
        completion: {
          state: spreadSatisfiedInFlightState,
          blocked: false,
        },
        spreadCompletion: {
          satisfied: true,
        },
        coordinator: {
          operationCount: 1,
          operationIds: ['op-priority-runtime-snapshot'],
          operation: null,
        },
      });
      coordinator.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation =
      async () => {
        planningSnapshotCalls += 1;
        return null;
      };

      try {
        const canStartPriorityOperation =
        await coordinator.canStartPriorityAddOperation({
          partitionId: 'control_plane_publications-p1',
        });

        t.equal(
          canStartPriorityOperation,
          true,
          'priority add budget should consume the runtime decision snapshot directly when grouped in-flight work is already spread-satisfied',
        );
        t.equal(
          planningSnapshotCalls,
          0,
          'the grouped priority add-budget path should not fall back to planning snapshots when the workflow owner already exposes the canonical decision snapshot',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator accepts planning-owned priority spread completion ' +
    'when transition rows are stale',
    async (t) => {
      const spreadSatisfiedInFlightState = 'spread_satisfied_in_flight';
      const staleOperationId = 'op-priority-planning-spread-satisfied';
      const stalePartitionId = 'sql_transactions-p1';
      const nextPartitionId = 'sql_write_operations-p1';
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
      coordinator.config.maxConcurrentAdds = 1;

      const stalePriorityReplaceOperation = {
        operationId: staleOperationId,
        type: OperationType.REPLACE,
        partitionId: stalePartitionId,
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote-a',
        replicaId: `${stalePartitionId}-r4`,
        status: ReplicaStatus.PENDING,
        workflowStep: WORKFLOW_STEP.SENDING,
        createdAt: 100,
        updatedAt: 101,
        completedAt: null,
        errorMessage: null,
        stepsHistory: [{
          step: WORKFLOW_STEP.SENDING,
          timestamp: 101,
        }],
      };
      const planningSnapshot = {
        priorityPartitionSummary: {
          satisfied: false,
          requiredDistinctNodeCount: 3,
          blockedPartitions: [{
            partitionId: nextPartitionId,
            requiredDistinctNodeCount: 3,
            readyDistinctNodeCount: 1,
            spreadGap: 2,
          }],
          missingPartitionIds: [nextPartitionId],
        },
        priorityRecoveryDecisionSnapshots: {
          snapshots: [{
            partitionId: stalePartitionId,
            operationId: staleOperationId,
            semanticState: spreadSatisfiedInFlightState,
            completion: {
              state: spreadSatisfiedInFlightState,
              blocked: false,
            },
            spreadCompletion: {
              satisfied: true,
              satisfyingOperationIds: [staleOperationId],
            },
            coordinator: {
              operationCount: 1,
              operationIds: [staleOperationId],
              operation: null,
            },
          }],
        },
      };

      coordinator.getPriorityRecoveryAdmissionPlan = () =>
        buildPriorityRecoveryAdmissionPlan({
          maxConcurrentAdds: 1,
          priorityPartitionSummary: planningSnapshot.priorityPartitionSummary,
          isPriorityPartition: (partitionId) =>
            partitionId === stalePartitionId ||
            partitionId === nextPartitionId,
          isEmergencyPriorityPartition: () => false,
        });
      coordinator.queryCachedIncompleteOperations = async () => (
        [stalePriorityReplaceOperation]
      );
      coordinator.queryIncompleteOperations = async () => (
        [stalePriorityReplaceOperation]
      );
      coordinator.workflowOwner.getPriorityRecoveryPlanningSnapshot =
      async () => planningSnapshot;

      try {
        const canStartPriorityOperation =
        await coordinator.canStartPriorityAddOperation({
          partitionId: nextPartitionId,
        });

        t.equal(
          canStartPriorityOperation,
          true,
          'stale SENDING rows should not consume the ordinary priority lane once the planning snapshot proves spread completion',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator releases priority add budget from admission ' +
    'blocked-partition evidence when workflow snapshots are unavailable',
    async (t) => {
      const stalePartitionId = 'sql_transaction_participants-p1';
      const blockedPartitionId = 'sql_write_operations-p1';
      const staleOperationId = 'op-priority-admission-released';
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
      coordinator.config.maxConcurrentAdds = 1;

      const stalePriorityReplaceOperation = {
        operation_id: staleOperationId,
        type: OperationType.REPLACE,
        partition_id: stalePartitionId,
        source_node_id: 'node-local',
        target_node_id: 'node-remote-a',
        replica_id: `${stalePartitionId}-r4`,
        status: ReplicaStatus.PENDING,
        workflow_step: WORKFLOW_STEP.SENDING,
        created_at: 100,
        updated_at: 101,
        completed_at: null,
        error_message: null,
        steps_history: JSON.stringify([{
          step: WORKFLOW_STEP.SENDING,
          timestamp: 101,
        }]),
      };
      const priorityPartitionSummary = {
        satisfied: false,
        requiredDistinctNodeCount: 3,
        blockedPartitions: [{
          partitionId: blockedPartitionId,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 1,
          spreadGap: 2,
        }],
        missingPartitionIds: [blockedPartitionId],
      };

      coordinator.getPriorityRecoveryAdmissionPlan = () =>
        buildPriorityRecoveryAdmissionPlan({
          maxConcurrentAdds: 1,
          priorityPartitionSummary,
          isPriorityPartition: (partitionId) =>
            partitionId === stalePartitionId ||
            partitionId === blockedPartitionId,
          isEmergencyPriorityPartition: () => false,
        });
      coordinator.queryCachedIncompleteOperations = async () => (
        [stalePriorityReplaceOperation]
      );
      coordinator.queryIncompleteOperations = async () => (
        [stalePriorityReplaceOperation]
      );
      coordinator.workflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations =
      async () => null;
      coordinator.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation =
      async () => null;

      try {
        const canStartPriorityOperation =
        await coordinator.canStartPriorityAddOperation({
          partitionId: blockedPartitionId,
        });

        t.equal(
          canStartPriorityOperation,
          true,
          'current blocked partition should retain the ordinary priority lane when stale rows belong to partitions outside the blocked set',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'RebalanceCoordinator lets a different blocked priority partition use ' +
    'the add lane when a stale priority row timed out',
    async (t) => {
      const stalePartitionId = 'sql_transaction_participants-p1';
      const requestedPartitionId = 'sql_transactions-p1';
      const staleOperationId = 'op-priority-stale-yields-to-next';
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
      coordinator.config.maxConcurrentAdds = 1;

      const stalePriorityReplaceOperation = {
        operation_id: staleOperationId,
        type: OperationType.REPLACE,
        partition_id: stalePartitionId,
        source_node_id: 'node-local',
        target_node_id: 'node-remote-a',
        replica_id: `${stalePartitionId}-r5`,
        status: ReplicaStatus.PENDING,
        workflow_step: WORKFLOW_STEP.SENDING,
        created_at: 100,
        updated_at: 101,
        completed_at: null,
        error_message: null,
        steps_history: JSON.stringify([{
          step: WORKFLOW_STEP.SENDING,
          timestamp: 101,
        }]),
      };
      const priorityPartitionSummary = {
        satisfied: false,
        requiredDistinctNodeCount: 3,
        blockedPartitions: [{
          partitionId: stalePartitionId,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 2,
          spreadGap: 1,
        }, {
          partitionId: requestedPartitionId,
          requiredDistinctNodeCount: 3,
          readyDistinctNodeCount: 1,
          spreadGap: 2,
        }],
        missingPartitionIds: [stalePartitionId, requestedPartitionId],
      };

      coordinator.getPriorityRecoveryAdmissionPlan = () =>
        buildPriorityRecoveryAdmissionPlan({
          maxConcurrentAdds: 1,
          priorityPartitionSummary,
          isPriorityPartition: (partitionId) =>
            partitionId === stalePartitionId ||
            partitionId === requestedPartitionId,
          isEmergencyPriorityPartition: () => false,
        });
      coordinator.queryCachedIncompleteOperations = async () => (
        [stalePriorityReplaceOperation]
      );
      coordinator.queryIncompleteOperations = async () => (
        [stalePriorityReplaceOperation]
      );
      coordinator.workflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations =
      async () => null;
      coordinator.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation =
      async () => null;

      try {
        const stalePartitionCanStart =
          await coordinator.canStartPriorityAddOperation({
            partitionId: stalePartitionId,
          });
        const requestedPartitionCanStart =
          await coordinator.canStartPriorityAddOperation({
            partitionId: requestedPartitionId,
          });

        t.equal(
          stalePartitionCanStart,
          false,
          'a stale row should still reserve its own blocked partition lane',
        );
        t.equal(
          requestedPartitionCanStart,
          true,
          'a different blocked priority partition should not be stranded behind the stale row',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );


  registerRebalanceCoordinatorOperationOwnershipTailMoreTests({
    test,
    assert,
    RebalanceCoordinator,
    WORKFLOW_STEP,
    REBALANCER_SKIP_REASON,
    DurableWorkflowCoordinator,
    buildPriorityRecoveryAdmissionPlan,
    OperationType,
    ReplicaStatus,
    EMERGENCY_TRANSPORT_PARTITION_ID,
    createWorkflowCoordinatorSpy,
    createStorageOwners,
    createTransactionCoordinator,
    createCoordinator,
    disablePersistenceConfirmation,
  });
}
