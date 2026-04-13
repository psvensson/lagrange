// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {REBALANCER_SKIP_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {
  buildPriorityRecoveryAdmissionPlan,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';

function createWorkflowCoordinatorSpy() {
  const coordinator = new DurableWorkflowCoordinator();
  const ownerKeys = [];
  const originalRunExclusive =
    coordinator.runExclusive.bind(coordinator);

  coordinator.ownerKeys = ownerKeys;
  coordinator.runExclusive = (ownerKey, executionFactory) => {
    ownerKeys.push(ownerKey);
    return originalRunExclusive(ownerKey, executionFactory);
  };

  return coordinator;
}

function createStorageOwners() {
  return {
    storageAccountingService: {
      estimateReplicaBytes: () => 1,
    },
    storageAdmissionService: {
      async checkAdd() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
  };
}

function createTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

function createCoordinator(overrides = {}) {
  const sqlQueryEngine = overrides.sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: [], affectedRows: 0};
    },
  };
  const hasExplicitGateway =
    overrides.controlPlaneSystemTableGateway &&
    typeof overrides.controlPlaneSystemTableGateway === 'object';

  return new RebalanceCoordinator({
    ...overrides,
    sqlQueryEngine,
    controlPlaneSystemTableGateway: hasExplicitGateway ?
      overrides.controlPlaneSystemTableGateway :
      {
        async readAuthoritativeRows(_tableName, sql, params = [], options = {}) {
          return sqlQueryEngine.executeQuery(sql, params, options);
        },
        async readRows(_tableName, sql, params = [], options = {}) {
          return sqlQueryEngine.executeQuery(sql, params, options);
        },
        async executeQuery(sql, params = [], options = {}) {
          return sqlQueryEngine.executeQuery(sql, params, options);
        },
      },
  });
}

function disablePersistenceConfirmation(coordinator) {
  coordinator.repository.confirmReplicaOperationPersistence = async () => {};
  return coordinator;
}

test('RebalanceCoordinator executeOperation skips operations owned by another node',
  async (t) => {
    let deliverCalls = 0;
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
          deliverCalls += 1;
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
    disablePersistenceConfirmation(coordinator);

    try {
      const operation = {
        operationId: 'op-owned-remote',
        type: 'ADD',
        partitionId: 'partition-1',
        entityType: 'partition',
        entityId: 'partition-1',
        replicaId: 'partition-1-r2',
        sourceNodeId: 'node-remote',
        targetNodeId: 'node-local',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      const result = await coordinator.executeOperation(operation);

      t.equal(result.success, false);
      t.equal(result.skipped, true);
      t.equal(
        result.reason,
        REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE,
      );
      t.equal(
        deliverCalls,
        0,
        'non-owner coordinator must not dispatch operation requests',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.PENDING,
        'workflow step should remain unchanged when non-owner skips execution',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator keeps priority control-plane REPLACE ownership on ' +
  'the target during SENDING',
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
        return {success: true, rows: [], affectedRows: 0};
      },
    },
    ...createStorageOwners(),
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = {
      operationId: 'op-priority-target-owner-sending',
      type: OperationType.REPLACE,
      partitionId: 'control_plane_publications-p1',
      sourceNodeId: 'node-remote',
      targetNodeId: 'node-local',
      workflowStep: WORKFLOW_STEP.SENDING,
    };

    t.equal(
      coordinator.resolveOperationOwnerNodeId(operation),
      'node-local',
      'priority control-plane replace must remain target-owned while dispatch is in SENDING',
    );
    t.equal(
      coordinator.isOperationLocallyOwned(operation),
      true,
      'local target node should keep ownership across deferred dispatch retries',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator keeps the ordinary priority lane available while ' +
  'an emergency priority replace is already in flight',
async (t) => {
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
    },
    enableTimeouts: false,
  });
  coordinator.initialize();

  coordinator.isLocalRouterBackpressured = () => false;
  coordinator.shouldDelayEmptyIncompleteOperationQuery = () => false;
  coordinator.clearEmptyIncompleteOperationQueryDelay = () => {};
  coordinator.markEmptyIncompleteOperationQueryAt = () => {};
  coordinator.getPriorityRecoveryAdmissionPlan = () => buildPriorityRecoveryAdmissionPlan({
    maxConcurrentAdds: 1,
    priorityPartitionSummary: {
      satisfied: false,
      blockedPartitions: [{
        partitionId: 'control_plane_publications-p1',
        spreadGap: 1,
      }],
    },
    isPriorityPartition: (partitionId) => (
      partitionId === 'control_plane_publications-p1' ||
      partitionId === 'sql_write_operations-p1'
    ),
    isEmergencyPriorityPartition: (partitionId) =>
      partitionId === 'control_plane_publications-p1',
  });
  coordinator.queryIncompleteOperations = async () => ([
    {
      type: OperationType.REPLACE,
      partitionId: 'control_plane_publications-p1',
      workflowStep: WORKFLOW_STEP.SENDING,
    },
  ]);

  try {
    const canStartOrdinaryPriority = await coordinator
      .canStartPriorityAddOperation({
        partitionId: 'sql_write_operations-p1',
      });

    t.equal(
      canStartOrdinaryPriority,
      true,
      'ordinary priority work should retain its configured lane while one emergency replace uses the overflow slot',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator preserves the emergency overflow slot from ' +
  'ordinary priority work',
async (t) => {
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
    },
    enableTimeouts: false,
  });
  coordinator.initialize();

  coordinator.isLocalRouterBackpressured = () => false;
  coordinator.shouldDelayEmptyIncompleteOperationQuery = () => false;
  coordinator.clearEmptyIncompleteOperationQueryDelay = () => {};
  coordinator.markEmptyIncompleteOperationQueryAt = () => {};
  coordinator.getPriorityRecoveryAdmissionPlan = () => buildPriorityRecoveryAdmissionPlan({
    maxConcurrentAdds: 1,
    priorityPartitionSummary: {
      satisfied: false,
      blockedPartitions: [{
        partitionId: 'control_plane_publications-p1',
        spreadGap: 1,
      }],
    },
    isPriorityPartition: (partitionId) => (
      partitionId === 'control_plane_publications-p1' ||
      partitionId === 'sql_transactions-p1' ||
      partitionId === 'sql_write_operations-p1'
    ),
    isEmergencyPriorityPartition: (partitionId) =>
      partitionId === 'control_plane_publications-p1',
  });
  coordinator.queryIncompleteOperations = async () => ([
    {
      type: OperationType.REPLACE,
      partitionId: 'sql_transactions-p1',
      workflowStep: WORKFLOW_STEP.SENDING,
    },
    {
      type: OperationType.REPLACE,
      partitionId: 'control_plane_publications-p1',
      workflowStep: WORKFLOW_STEP.SENDING,
    },
  ]);

  try {
    const canStartSecondOrdinaryPriority = await coordinator
      .canStartPriorityAddOperation({
        partitionId: 'sql_write_operations-p1',
      });

    t.equal(
      canStartSecondOrdinaryPriority,
      false,
      'ordinary priority work should not consume the reserved emergency overflow slot once its own lane is full',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator createOperation uses injected workflow coordinator single-flight',
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

    try {
      await coordinator.createOperation({
        type: 'ADD',
        partitionId: 'partition-1',
        nodeId: 'node-remote',
      });

      t.equal(
        workflowCoordinator.ownerKeys.some((ownerKey) =>
          String(ownerKey).startsWith('create:'),
        ),
        true,
        'createOperation should be guarded by the shared create single-flight lane',
      );
      t.equal(
        workflowCoordinator.ownerKeys.some((ownerKey) =>
          String(ownerKey).startsWith('operation:'),
        ),
        true,
        'createOperation should re-enter the shared owner lane when priming a newly created local operation',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator createOperation defers background mutation when local control-plane publication is unhealthy',
  async (t) => {
    let executeQueryCalls = 0;
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
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            nodeId: 'node-local',
            lifecycleState: 'warming',
            nodeEvidence: {
              connectionState: 'ready',
            },
            capacity: {},
            dimensions: {
              controlPlaneWritable: false,
              metadataPublicationHealthy: false,
              repairEligible: true,
            },
            reasons: [
              {code: 'control_plane_write_unhealthy'},
              {code: 'metadata_publication_degraded'},
            ],
          };
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
          executeQueryCalls += 1;
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      try {
        await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'partition-1',
          entityType: 'partition',
          entityId: 'partition-1',
          nodeId: 'node-remote',
          controlPlaneMutationWorkClass: 'background',
        });
        t.fail('background creation should be deferred while local publication is unhealthy');
      } catch (error) {
        t.equal(
          error?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY,
          'background creation should expose a typed rebalance skip reason',
        );
        t.equal(
          error?.admissionResult?.decisionType,
          'deferred',
          'background creation should defer rather than fail open',
        );
        t.same(
          error?.admissionResult?.blockingReasons?.map((entry) => entry?.code),
          [
            'control_plane_write_unhealthy',
            'metadata_publication_degraded',
          ],
          'defer diagnostics should carry readiness reason codes',
        );
      }
      t.equal(
        executeQueryCalls,
        0,
        'background mutation must not hit SQL when local publication is unhealthy',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator createOperation enforces concurrent add budget when requested',
  async (t) => {
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
    coordinator.canStartAddOperation = async () => false;

    try {
      try {
        await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'partition-1',
          entityType: 'partition',
          entityId: 'partition-1',
          nodeId: 'node-remote',
          enforceConcurrentOperationBudget: true,
        });
        t.fail('requested create should fail with a typed budget error');
      } catch (error) {
        t.equal(
          error?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
          'requested create should fail with a typed budget error',
        );
      }
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator createOperation rejects stale membership publication epoch plans',
  async (t) => {
    let executeQueryCalls = 0;
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
        getCurrentPublishedMembershipEpochSync() {
          return 7;
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
          executeQueryCalls += 1;
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      try {
        await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'partition-1',
          entityType: 'partition',
          entityId: 'partition-1',
          nodeId: 'node-remote',
          membershipPublicationEpoch: 6,
        });
        t.fail('stale epoch-bound placement should be rejected');
      } catch (error) {
        t.equal(
          error?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_CHANGED,
          'stale epoch-bound placement should expose a typed skip reason',
        );
        t.equal(
          error?.requestedMembershipPublicationEpoch,
          6,
          'error should expose requested publication epoch',
        );
        t.equal(
          error?.currentMembershipPublicationEpoch,
          7,
          'error should expose current publication epoch',
        );
      }
      t.equal(
        executeQueryCalls,
        0,
        'stale epoch-bound placement must not persist any operation row',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator createOperation rejects stale membership plans using the shared publication planning snapshot',
  async (t) => {
    let executeQueryCalls = 0;
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
        getCurrentPublishedMembershipEpochSync() {
          return 9;
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
          executeQueryCalls += 1;
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      try {
        await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'partition-1',
          entityType: 'partition',
          entityId: 'partition-1',
          nodeId: 'node-remote',
          membershipPublicationEpoch: 8,
        });
        t.fail('stale epoch-bound placement should be rejected');
      } catch (error) {
        t.equal(
          error?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_CHANGED,
          'shared publication planning snapshot should drive stale-epoch rejection',
        );
        t.equal(
          error?.currentMembershipPublicationEpoch,
          9,
          'shared publication planning snapshot should define the current epoch',
        );
      }
      t.equal(
        executeQueryCalls,
        0,
        'stale snapshot-bound placement must not persist any operation row',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator createOperation persists membership publication epoch metadata',
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
      controlPlaneReadinessService: {
        getCurrentPublishedMembershipEpochSync() {
          return 7;
        },
        getNodeReadinessSync() {
          return {
            nodeId: 'node-remote',
            dimensions: {
              repairEligible: true,
            },
          };
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
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();
    disablePersistenceConfirmation(coordinator);

    try {
      const operation = await coordinator.createOperation({
        type: 'ADD',
        partitionId: 'partition-1',
        entityType: 'partition',
        entityId: 'partition-1',
        nodeId: 'node-remote',
        membershipPublicationEpoch: 7,
      });

      t.equal(
        operation.stepsHistory[0]?.membershipPublicationEpoch,
        7,
        'epoch-bound operation should persist its planning publication epoch',
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

    try {
      await coordinator.checkTimeouts();
      t.same(
        reconciledOperationIds,
        ['op-replace-target-owner', 'op-local-owner'],
        'timeout reconciliation must skip non-owner operations but keep target-owned REPLACE reconciliation',
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
      targetNodeId: 'node-local',
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

import {
  OPERATION_TRANSITION_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';

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
