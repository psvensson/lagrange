import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {
  RebalanceCoordinator as ProductionRebalanceCoordinator,
} from '../../src/rebalancer/rebalance-coordinator.js';
import {fixtureCommittedReadCoordinator} from
  './committed-membership-fixture.js';

// Joins are stamped from the committed-membership read, answered here by
// the fixture world (owner decision O1).
const CommittedReadRebalanceCoordinator =
  fixtureCommittedReadCoordinator(ProductionRebalanceCoordinator);
class RebalanceCoordinator extends CommittedReadRebalanceCoordinator {
  constructor(options) {
    super(options);
    // Operation-ownership assertions count only the read under test. Startup
    // cleanup-release recovery is covered by its dedicated owner witnesses.
    this.workflowOwner.repository
      .queryTerminalFailedCreateCleanupOperations = async () => [];
  }
}
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
import {
  registerRebalanceCoordinatorOperationOwnershipCriticalAdmissionTests,
} from './rebalance-coordinator-operation-ownership-critical-admission-test-cases.js';

const EMERGENCY_TRANSPORT_PARTITION_ID = 'control_plane_publications-p1';
const REPLICA_OPERATION_EMERGENCY_PARTITION_ID = 'replica_operations-p1';
const ORDINARY_PRIORITY_TRANSACTION_PARTITION_ID = 'sql_transactions-p1';
const ORDINARY_PRIORITY_WRITE_PARTITION_ID = 'sql_write_operations-p1';
const CRITICAL_REMOVE_LANE_CONFLICT_OPERATION_ID =
  'op-critical-remove-lane-conflict';
const CRITICAL_REMOVE_LANE_TARGET_REPLICA_ID =
  `${EMERGENCY_TRANSPORT_PARTITION_ID}-r4`;
const CRITICAL_REMOVE_LANE_CONFLICT_REPLICA_ID =
  `${EMERGENCY_TRANSPORT_PARTITION_ID}-r5`;
const SINGLE_CONCURRENT_ADD_LIMIT = 1;
const SINGLE_SPREAD_GAP = 1;

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

function withAuthoritativeOperationRows(sqlQueryEngine) {
  const trackedOperations = new Map();
  const trackedReservations = new Map();
  const fixtureEngine = {
    ...sqlQueryEngine,
    seedStorageIncreasingOperation(operation, reasonCode) {
      const now = Date.now();
      trackedOperations.set(operation.operationId, {
        operation_id: operation.operationId,
        type: operation.type,
        partition_id: operation.partitionId,
        replica_id: operation.replicaId,
        target_claim_key: operation.targetClaimKey ?? null,
        source_node_id: operation.sourceNodeId ?? null,
        target_node_id: operation.targetNodeId,
        status: operation.status,
        workflow_step: operation.workflowStep,
        created_at: operation.createdAt,
        updated_at: operation.updatedAt,
        completed_at: operation.completedAt,
        error_message: operation.errorMessage,
        steps_history: JSON.stringify(operation.stepsHistory || []),
        entity_type: operation.entityType,
        entity_id: operation.entityId,
        membership_publication_epoch:
          operation.membershipPublicationEpoch ?? null,
      });
      trackedReservations.set(operation.operationId, {
        reservation_id: `res-${operation.operationId}`,
        operation_id: operation.operationId,
        entity_type: operation.entityType,
        entity_id: operation.entityId,
        partition_id: operation.partitionId,
        target_node_id: operation.targetNodeId,
        estimated_bytes: 1,
        amplification_factor: 1,
        status: 'active',
        reason_code: reasonCode,
        created_at: now,
        updated_at: now,
        expires_at: now + 300000,
        released_at: null,
      });
    },
    async executeQuery(sql, params = [], options = {}) {
      if (sql.includes('FROM replica_operations') &&
          sql.includes('operation_id = ?')) {
        const row = trackedOperations.get(params[0]);
        if (row) {
          return {success: true, rows: [row]};
        }
      }
      const result = await sqlQueryEngine.executeQuery(sql, params, options);
      if (result?.success !== false &&
          sql.includes('INSERT INTO replica_operations')) {
        const [
          operationId, type, partitionId, replicaId, targetClaimKey,
          sourceNodeId, targetNodeId, status, workflowStep, createdAt,
          updatedAt, completedAt, errorMessage, stepsHistory, entityType,
          entityId, membershipPublicationEpoch,
        ] = params;
        trackedOperations.set(operationId, {
          operation_id: operationId,
          type,
          partition_id: partitionId,
          replica_id: replicaId,
          target_claim_key: targetClaimKey,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
          status,
          workflow_step: workflowStep,
          created_at: createdAt,
          updated_at: updatedAt,
          completed_at: completedAt,
          error_message: errorMessage,
          steps_history: stepsHistory,
          entity_type: entityType,
          entity_id: entityId,
          membership_publication_epoch: membershipPublicationEpoch,
        });
      }
      return result;
    },
  };
  const executeOperationQuery = fixtureEngine.executeQuery.bind(fixtureEngine);
  return {
    ...fixtureEngine,
    async executeQuery(sql, params = [], options = {}) {
      if (sql.includes('FROM storage_reservations') &&
          sql.includes('operation_id = ?')) {
        const row = trackedReservations.get(params[0]);
        return {
          success: true,
          rows: row && row.status === params[1] ? [row] : [],
        };
      }
      return executeOperationQuery(sql, params, options);
    },
  };
}

function seedStorageIncreasingOperation(coordinator, operation) {
  coordinator.sqlQueryEngine.seedStorageIncreasingOperation(
    operation,
    coordinator.getReservationReasonCode(operation.type),
  );
}

function createCoordinator(overrides = {}) {
  const sqlQueryEngine = withAuthoritativeOperationRows(
    overrides.sqlQueryEngine || {
      async executeQuery() {
        return {success: true, rows: [], affectedRows: 0};
      },
    },
  );
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

test('RebalanceCoordinator admits the second emergency recovery owner while ' +
  'ordinary priority work and one emergency owner are already in flight',
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
        return {minReplicaCount: SINGLE_CONCURRENT_ADD_LIMIT};
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
    maxConcurrentAdds: SINGLE_CONCURRENT_ADD_LIMIT,
    priorityPartitionSummary: {
      satisfied: false,
      blockedPartitions: [{
        partitionId: EMERGENCY_TRANSPORT_PARTITION_ID,
        spreadGap: SINGLE_SPREAD_GAP,
      }, {
        partitionId: REPLICA_OPERATION_EMERGENCY_PARTITION_ID,
        spreadGap: SINGLE_SPREAD_GAP,
      }],
    },
    isPriorityPartition: (partitionId) => (
      partitionId === EMERGENCY_TRANSPORT_PARTITION_ID ||
      partitionId === REPLICA_OPERATION_EMERGENCY_PARTITION_ID ||
      partitionId === ORDINARY_PRIORITY_TRANSACTION_PARTITION_ID ||
      partitionId === ORDINARY_PRIORITY_WRITE_PARTITION_ID
    ),
    isEmergencyPriorityPartition: (partitionId) => (
      partitionId === EMERGENCY_TRANSPORT_PARTITION_ID ||
      partitionId === REPLICA_OPERATION_EMERGENCY_PARTITION_ID
    ),
  });
  coordinator.queryIncompleteOperations = async () => ([
    {
      type: OperationType.REPLACE,
      partitionId: ORDINARY_PRIORITY_TRANSACTION_PARTITION_ID,
      workflowStep: WORKFLOW_STEP.SENDING,
    },
    {
      type: OperationType.REPLACE,
      partitionId: EMERGENCY_TRANSPORT_PARTITION_ID,
      workflowStep: WORKFLOW_STEP.SENDING,
    },
  ]);

  try {
    const canStartReplicaOperationRecovery = await coordinator
      .canStartPriorityAddOperation({
        partitionId: REPLICA_OPERATION_EMERGENCY_PARTITION_ID,
      });

    t.equal(
      canStartReplicaOperationRecovery,
      true,
      'replica-operation recovery should keep its emergency owner slot while publication recovery is already in flight',
    );

    const canStartSecondOrdinaryPriority = await coordinator
      .canStartPriorityAddOperation({
        partitionId: ORDINARY_PRIORITY_WRITE_PARTITION_ID,
      });

    t.equal(
      canStartSecondOrdinaryPriority,
      false,
      'ordinary priority work should still be serialized by the configured lane',
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
        operationIntentId: 'schema-job-1:operation:node-remote',
        replicaIntentId: 'schema-job-1:replica:node-remote',
      });

      t.equal(
        operation.membershipPublicationEpoch,
        7,
        'epoch-bound operation should persist its planning publication epoch ' +
          'on the operation record',
      );
      t.equal(
        operation.stepsHistory[0]?.membershipPublicationEpoch,
        undefined,
        'the planning epoch no longer duplicates into stepsHistory ' +
          '(audit finding 7)',
      );
      t.equal(
        operation.operationId,
        'schema-job-1:operation:node-remote',
        'replica-operation owner preserves deterministic parent intent identity',
      );
      t.equal(
        operation.replicaId,
        'schema-job-1:replica:node-remote',
        'replica allocation converges on the deterministic child replica intent',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

registerRebalanceCoordinatorOperationOwnershipCriticalAdmissionTests({
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
  seedStorageIncreasingOperation,
  disablePersistenceConfirmation,
});
