import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
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
import {registerRebalanceCoordinatorOperationOwnershipTailTests} from './rebalance-coordinator-operation-ownership-tail-test-cases.js';

const EMERGENCY_TRANSPORT_PARTITION_ID = 'control_plane_publications-p1';

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


registerRebalanceCoordinatorOperationOwnershipTailTests({
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
