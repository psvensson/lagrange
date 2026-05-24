export function registerRebalanceCoordinatorOperationOwnershipPriorityPlanningTests({
  test,
  RebalanceCoordinator,
  WORKFLOW_STEP,
  buildPriorityRecoveryAdmissionPlan,
  OperationType,
  ReplicaStatus,
  createStorageOwners,
  createTransactionCoordinator,
}) {
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
    'RebalanceCoordinator accepts planning-owned priority spread completion ' +
    'from raw operation rows',
    async (t) => {
      const spreadSatisfiedInFlightState = 'spread_satisfied_in_flight';
      const staleOperationId = 'op-priority-raw-planning-spread-satisfied';
      const stalePartitionId = 'sql_write_operations-p1';
      const nextPartitionId = 'sql_transactions-p1';
      const requiredDistinctNodeCount = 3;
      const staleReadyDistinctNodeCount = 3;
      const nextReadyDistinctNodeCount = 1;
      const staleSpreadGap = 0;
      const nextSpreadGap = 2;
      const maxConcurrentAdds = 1;
      const minReplicaCount = 1;
      const nowMs = 1_000_000;
      const createdAtOffsetMs = 1_000;
      const updatedAtOffsetMs = 500;
      const createdAt = nowMs - createdAtOffsetMs;
      const updatedAt = nowMs - updatedAtOffsetMs;
      let planningSnapshotCalls = 0;
      let planningSnapshot = null;
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
        controlPlaneReadinessService: {
          getPriorityRecoveryPlanningSnapshotBestEffort() {
            planningSnapshotCalls += 1;
            return planningSnapshot;
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount};
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
        nowFn: () => nowMs,
        enableTimeouts: false,
      });
      coordinator.initialize();
      coordinator.config.maxConcurrentAdds = maxConcurrentAdds;

      const stalePriorityReplaceOperation = {
        operation_id: staleOperationId,
        type: OperationType.REPLACE,
        partition_id: stalePartitionId,
        source_node_id: 'node-local',
        target_node_id: 'node-remote-a',
        replica_id: `${stalePartitionId}-r4`,
        status: ReplicaStatus.PENDING,
        workflow_step: WORKFLOW_STEP.SENDING,
        created_at: createdAt,
        updated_at: updatedAt,
        completed_at: null,
        error_message: null,
        steps_history: JSON.stringify([{
          step: WORKFLOW_STEP.SENDING,
          timestamp: updatedAt,
        }]),
      };
      planningSnapshot = {
        priorityPartitionSummary: {
          satisfied: false,
          requiredDistinctNodeCount,
          blockedPartitions: [{
            partitionId: stalePartitionId,
            requiredDistinctNodeCount,
            readyDistinctNodeCount: staleReadyDistinctNodeCount,
            spreadGap: staleSpreadGap,
          }, {
            partitionId: nextPartitionId,
            requiredDistinctNodeCount,
            readyDistinctNodeCount: nextReadyDistinctNodeCount,
            spreadGap: nextSpreadGap,
          }],
          missingPartitionIds: [stalePartitionId, nextPartitionId],
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
              operationCount: maxConcurrentAdds,
              operationIds: [staleOperationId],
              operation: null,
            },
          }],
        },
      };

      coordinator.getPriorityRecoveryAdmissionPlan = () =>
        buildPriorityRecoveryAdmissionPlan({
          maxConcurrentAdds,
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

      try {
        const canStartPriorityOperation =
        await coordinator.canStartPriorityAddOperation({
          partitionId: nextPartitionId,
        });

        t.equal(
          canStartPriorityOperation,
          true,
          'raw priority rows should use planning snapshots before deciding whether they still consume the ordinary priority lane',
        );
        t.ok(
          planningSnapshotCalls > maxConcurrentAdds,
          'the grouped priority add-budget path should request planning evidence beyond the pressure gate',
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
    'RebalanceCoordinator keeps blocked priority add admission open when ' +
    'the critical reserve is exhausted',
    async (t) => {
      const pressuredNodeId = 'node-priority-pressure-admission';
      const blockedPartitionId = 'sql_write_operations-p1';
      const nonBlockedPriorityPartitionId = 'sql_transactions-p1';
      const maxConcurrentAdds = 1;
      const noCacheRow = null;
      const minReplicaCount = 1;
      const sqlChangeCount = 1;
      const requiredDistinctNodeCount = 3;
      const readyDistinctNodeCount = 1;
      const spreadGap = 2;
      const saturatedNodeCount = 1;
      const totalPending = 36;
      const totalPendingCritical = 36;
      const totalPendingBackground = 0;
      const maxPendingUtilization = 0.5625;
      const pressureSummary = Object.freeze({
        backpressured: true,
        saturatedNodeCount,
        totalPending,
        totalPendingCritical,
        totalPendingBackground,
        criticalReserveExhausted: true,
        maxPendingUtilization,
      });
      const priorityPartitionSummary = Object.freeze({
        satisfied: false,
        requiredDistinctNodeCount,
        blockedPartitions: Object.freeze([Object.freeze({
          partitionId: blockedPartitionId,
          requiredDistinctNodeCount,
          readyDistinctNodeCount,
          spreadGap,
        })]),
        missingPartitionIds: Object.freeze([blockedPartitionId]),
      });
      const coordinator = new RebalanceCoordinator({
        nodeId: pressuredNodeId,
        transactionCoordinator: createTransactionCoordinator(),
        systemTableCache: {
          get() {
            return noCacheRow;
          },
        },
        cdcIntegrationService: {
          async waitForCacheUpdate() {},
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {minReplicaCount};
          },
        },
        messageRouter: {
          getOutboundPressureSummary() {
            return pressureSummary;
          },
          async deliver() {
            return {acknowledged: true, status: 'completed'};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            return {success: true, rows: [], changes: sqlChangeCount};
          },
        },
        ...createStorageOwners(),
        enableTimeouts: false,
      });
      coordinator.initialize();
      coordinator.config.maxConcurrentAdds = maxConcurrentAdds;
      coordinator.getPriorityRecoveryAdmissionPlan = () =>
        buildPriorityRecoveryAdmissionPlan({
          maxConcurrentAdds,
          priorityPartitionSummary,
          isPriorityPartition: (partitionId) =>
            partitionId === blockedPartitionId ||
            partitionId === nonBlockedPriorityPartitionId,
          isEmergencyPriorityPartition: () => false,
        });
      coordinator.queryCachedIncompleteOperations = async () => [];
      coordinator.queryIncompleteOperations = async () => [];

      try {
        const blockedPartitionCanStart =
          await coordinator.canStartPriorityAddOperation({
            partitionId: blockedPartitionId,
            bypassEmptyQueryDelay: true,
          });
        const nonBlockedPartitionCanStart =
          await coordinator.canStartPriorityAddOperation({
            partitionId: nonBlockedPriorityPartitionId,
            bypassEmptyQueryDelay: true,
          });

        t.equal(
          blockedPartitionCanStart,
          true,
          'blocked priority recovery should retain its add lane under critical-reserve pressure',
        );
        t.equal(
          nonBlockedPartitionCanStart,
          false,
          'priority partitions outside the blocked recovery set should still pause under critical-reserve pressure',
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
}
