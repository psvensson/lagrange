import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATION,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  applyCDCIntegrationServiceCacheVisibilityWait,
} from '../../src/cdc/cdc-integration-service-cache-visibility-wait.js';
import {
  createOperation,
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {UNIFIED_SERVICE_TYPE} from
  '../../src/constants/unified-service-lifecycle.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_NODE_ID = 'active-cache-handoff-owner';
const TEST_OPERATION_ID = 'active-cache-handoff-operation';
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_SOURCE_NODE_ID = 'active-cache-handoff-source';
const TEST_REPLACE_OPERATION_ID =
  'active-cache-handoff-replace-operation';

class ActiveCacheRefreshHost {}
applyCDCIntegrationServiceCacheVisibilityWait(ActiveCacheRefreshHost);

function buildSyncingAddOperation() {
  const operation = createOperation({
    operationId: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_NODE_ID,
    targetNodeId: TEST_NODE_ID,
  });
  operation.status = ReplicaStatus.SYNCING;
  operation.workflowStep = WORKFLOW_STEP.SYNCING;
  operation.stepsHistory.push({
    step: WORKFLOW_STEP.SYNCING,
    timestamp: operation.updatedAt,
    previousStep: WORKFLOW_STEP.PENDING,
  });
  return operation;
}

function buildSyncingReplaceOperation() {
  const operation = createOperation({
    operationId: TEST_REPLACE_OPERATION_ID,
    type: OperationType.REPLACE,
    partitionId: TEST_PARTITION_ID,
    replicaId: TEST_REPLICA_ID,
    sourceNodeId: TEST_SOURCE_NODE_ID,
    targetNodeId: TEST_NODE_ID,
  });
  operation.status = ReplicaStatus.SYNCING;
  operation.workflowStep = WORKFLOW_STEP.SYNCING;
  operation.stepsHistory.push({
    step: WORKFLOW_STEP.SYNCING,
    timestamp: operation.updatedAt,
    previousStep: WORKFLOW_STEP.PENDING,
  });
  return operation;
}

function buildAuthoritativeServiceRow(overrides = {}) {
  return {
    service_id: TEST_REPLICA_ID,
    service_type: 'partition',
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    node_id: TEST_NODE_ID,
    address: `${TEST_NODE_ID}/partition/${TEST_REPLICA_ID}`,
    status: 'active',
    raft_role: 'follower',
    state_entered_at: 9,
    created_at: 3,
    updated_at: 9,
    ...overrides,
  };
}

function buildProductionCacheRefreshHost({
  cache,
  authoritativeRow,
  dropRepair = false,
}) {
  const host = new ActiveCacheRefreshHost();
  host.logger = {
    info: () => {},
    warn: () => {},
    debug: () => {},
    error: () => {},
  };
  host.systemTableCache = cache;
  host.cacheMutationTarget = dropRepair ? {
    applySystemTableChange() {
      return true;
    },
  } : cache;
  host.getPrimaryKeyField = () => 'service_id';
  host.shouldWaitForCacheUpdate = () => true;
  host.executeAuthoritativeSystemTableRead =
    async () => ({success: true, rows: [authoritativeRow]});
  host.insertSystemTableRow = async () => ({success: true});
  host.updateSystemTableRow = async () => ({success: true});
  return host;
}

test(
  'direct priority REPLACE ACTIVE outcome retains source retirement until ' +
    'the authoritative SERVICES row is aligned into cache',
  async (t) => {
    const cache = new SystemTableCache();
    const authoritativeRow = buildAuthoritativeServiceRow();
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      {...authoritativeRow, status: ReplicaStatus.SYNCING},
    );
    const cacheRefreshHost = buildProductionCacheRefreshHost({
      cache,
      authoritativeRow,
      dropRepair: true,
    });
    const timerHandles = [];
    const coordinator = createTestCoordinator({
      nodeId: TEST_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: cacheRefreshHost,
      setTimeoutFn(callback, delayMs) {
        const timerHandle = {callback, delayMs, cleared: false};
        timerHandles.push(timerHandle);
        return timerHandle;
      },
      clearTimeoutFn(timerHandle) {
        timerHandle.cleared = true;
      },
    });
    const operation = buildSyncingReplaceOperation();
    const sourceRetirementOperationIds = [];
    const observedRetryOperationIds = [];
    const outcome = Object.freeze({
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: TEST_REPLACE_OPERATION_ID,
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
        EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.ACTIVE,
      [EXECUTOR_OUTCOME_FIELD.REPLICA_ID]: TEST_REPLICA_ID,
      [EXECUTOR_OUTCOME_FIELD.PARTITION_ID]: TEST_PARTITION_ID,
      [EXECUTOR_OUTCOME_FIELD.TIMESTAMP]: Date.now(),
    });
    coordinator.repository.getOperationByIdVisibilityObservation =
      async () => ({
        state: 'present',
        operation,
        deferredOutcome: null,
        retryAfterMs: null,
      });
    coordinator.workflowOwner.reconcileReplaceActualActive =
      async (replaceOperation) => {
        sourceRetirementOperationIds.push(replaceOperation.operationId);
        return true;
      };
    coordinator.workflowOwner.scheduleObservedProgressRetry =
      (operationId) => {
        observedRetryOperationIds.push(operationId);
        return true;
      };

    try {
      const deferred = await coordinator.workflowOwner
        .reconcileExecutorOutcome(outcome);

      t.equal(deferred, true, 'the direct outcome remains owned progress');
      t.same(
        sourceRetirementOperationIds,
        [],
        'silently dropped cache repair cannot release source retirement',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID).status,
        ReplicaStatus.SYNCING,
        'the planning cache remains observably divergent',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId
          .get(TEST_REPLACE_OPERATION_ID)?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the direct ACTIVE evidence retains executor-outcome retry ownership',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryTimerByOperationId
          .has(TEST_REPLACE_OPERATION_ID),
        true,
        'the retained outcome has a bounded retry wake-up',
      );
      t.same(
        observedRetryOperationIds,
        [],
        'executor reconciliation keeps one retry owner instead of arming a ' +
          'second cache wake-up',
      );

      cacheRefreshHost.cacheMutationTarget = cache;
      const completed = await coordinator.workflowOwner
        .reconcileExecutorOutcome(outcome);

      t.equal(completed, true, 'aligned ACTIVE evidence resumes normally');
      t.same(
        sourceRetirementOperationIds,
        [TEST_REPLACE_OPERATION_ID],
        'source retirement resumes only after exact cache alignment',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID).status,
        ReplicaStatus.ACTIVE,
        'the exact authoritative target row is ACTIVE in planning cache',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId
          .has(TEST_REPLACE_OPERATION_ID),
        false,
        'successful alignment consumes the retained ACTIVE evidence',
      );
      t.equal(
        timerHandles.some((timerHandle) => timerHandle.cleared),
        true,
        'successful alignment clears the bounded outcome retry timer',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'ACTIVE target reconciliation retains the operation until its exact ' +
    'authoritative SERVICES row is aligned into cache',
  async (t) => {
    const cache = new SystemTableCache();
    const refreshCalls = [];
    let refreshAligned = false;
    const coordinator = createTestCoordinator({
      nodeId: TEST_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
        async updateSystemTableRow() {
          return {success: true};
        },
        async refreshAuthoritativeCacheRow(tableName, key, options) {
          refreshCalls.push({tableName, key, options});
          return refreshAligned;
        },
      },
    });
    const operation = buildSyncingAddOperation();
    const completedOperationIds = [];
    const scheduledOperationIds = [];
    coordinator.workflowOwner.completeOperation =
      async (completedOperation) => {
        completedOperationIds.push(completedOperation.operationId);
      };
    coordinator.workflowOwner.scheduleObservedProgressRetry =
      (operationId) => {
        scheduledOperationIds.push(operationId);
        return true;
      };

    try {
      const deferred = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);

      t.equal(
        deferred,
        true,
        'the unresolved cache handoff remains owned progress',
      );
      t.same(
        refreshCalls,
        [{
          tableName: SYSTEM_TABLE_NAME.SERVICES,
          key: TEST_REPLICA_ID,
          options: {
            expectedFields: {
              status: ReplicaStatus.ACTIVE,
              node_id: TEST_NODE_ID,
            },
          },
        }],
        'the handoff refreshes the exact target row on its intended node',
      );
      t.same(
        completedOperationIds,
        [],
        'the operation remains live while cache alignment is unavailable',
      );
      t.same(
        scheduledOperationIds,
        [TEST_OPERATION_ID],
        'the workflow owner retains a retry wake-up',
      );

      refreshAligned = true;
      cache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES,
        CDC_OPERATION.UPSERT,
        buildAuthoritativeServiceRow(),
      );
      const completed = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);

      t.equal(completed, true, 'aligned ACTIVE evidence completes normally');
      t.same(
        completedOperationIds,
        [TEST_OPERATION_ID],
        'the operation completes after the target row is cache-visible',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'authoritative ACTIVE on the wrong node cannot release terminal handoff',
  async (t) => {
    const cache = new SystemTableCache();
    const wrongNodeId = 'wrong-active-cache-handoff-target';
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      buildAuthoritativeServiceRow({
        service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        partition_id: null,
        node_id: wrongNodeId,
      }),
    );
    const refreshCalls = [];
    const coordinator = createTestCoordinator({
      nodeId: TEST_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
        async updateSystemTableRow() {
          return {success: true};
        },
        async refreshAuthoritativeCacheRow(tableName, key, options) {
          refreshCalls.push({tableName, key, options});
          return true;
        },
      },
    });
    const operation = buildSyncingAddOperation();
    operation.entityType = UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE;
    operation.entityId = TEST_PARTITION_ID;
    const completedOperationIds = [];
    const scheduledOperationIds = [];
    coordinator.workflowOwner.completeOperation =
      async (completedOperation) => {
        completedOperationIds.push(completedOperation.operationId);
      };
    coordinator.workflowOwner.scheduleObservedProgressRetry =
      (operationId) => {
        scheduledOperationIds.push(operationId);
        return true;
      };

    try {
      const deferred = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);

      t.equal(deferred, true, 'wrong-node authority remains owned progress');
      t.same(completedOperationIds, [], 'terminal state remains blocked');
      t.same(scheduledOperationIds, [TEST_OPERATION_ID]);
      t.same(
        refreshCalls[0]?.options,
        {
          expectedFields: {
            status: ReplicaStatus.ACTIVE,
            node_id: TEST_NODE_ID,
          },
        },
        'authoritative repair itself requires intended-node alignment',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID).node_id,
        wrongNodeId,
        'a truthy repair result is rechecked against the cache owner boundary',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'ACTIVE terminal handoff aligns lifecycle ownership without regressing a ' +
    'same-version role event carrying newer origin HLC',
  async (t) => {
    const cache = new SystemTableCache();
    const authoritativeRow = {
      ...buildAuthoritativeServiceRow(),
      raft_role: 'learner',
      state_entered_at: 2000,
      previous_state: 'syncing',
      trigger_reason: 'voter_ready',
      updated_at: 2000,
    };
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativeRow,
        status: 'syncing',
        raft_role: 'follower',
        state_entered_at: 1000,
        previous_state: 'creating',
        trigger_reason: 'replica_create',
        updated_at: 2000,
        updated_at_hlc: '2000-1-active-cache-handoff-owner',
      },
    );
    const coordinator = createTestCoordinator({
      nodeId: TEST_NODE_ID,
      cdcIntegrationService: buildProductionCacheRefreshHost({
        cache,
        authoritativeRow,
      }),
    });
    const operation = buildSyncingAddOperation();
    const completedOperationIds = [];
    coordinator.workflowOwner.completeOperation =
      async (completedOperation) => {
        completedOperationIds.push(completedOperation.operationId);
      };

    try {
      const completed = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);
      const cachedRow = cache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        TEST_REPLICA_ID,
      );

      t.equal(
        completed,
        true,
        'owner-scoped production alignment releases terminal state',
      );
      t.same(
        completedOperationIds,
        [TEST_OPERATION_ID],
        'the workflow completes only after exact lifecycle alignment',
      );
      t.equal(cachedRow.status, 'active', 'durable lifecycle state is exact');
      t.equal(
        cachedRow.state_entered_at,
        2000,
        'lifecycle ordering follows its owner timestamp',
      );
      t.equal(
        cachedRow.raft_role,
        'follower',
        'the older authoritative lifecycle read cannot regress live role evidence',
      );
      t.equal(
        cachedRow.updated_at,
        2000,
        'the equal composite row version does not justify a role regression',
      );
      t.equal(
        cachedRow.updated_at_hlc,
        '2000-1-active-cache-handoff-owner',
        'cache-local causal evidence survives authoritative replacement',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'authoritative SERVICES point repair rejects incomplete or non-ACTIVE truth',
  async (t) => {
    const cache = new SystemTableCache();
    const cachedRow = {
      ...buildAuthoritativeServiceRow(),
      status: 'syncing',
    };
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      cachedRow,
    );
    const host = buildProductionCacheRefreshHost({
      cache,
      authoritativeRow: {
        service_id: TEST_REPLICA_ID,
        status: 'active',
        updated_at: 9,
      },
    });

    const aligned = await host.refreshAuthoritativeCacheRow(
      SYSTEM_TABLE_NAME.SERVICES,
      TEST_REPLICA_ID,
    );

    t.equal(aligned, false, 'partial authority cannot release terminal state');
    t.same(
      cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID),
      cachedRow,
      'partial authority cannot delete cached identity or lifecycle fields',
    );

    for (const [fieldName, malformedValue] of [
      ['state_entered_at', null],
      ['state_entered_at', ''],
      ['state_entered_at', '   '],
      ['updated_at', null],
      ['updated_at', ''],
      ['updated_at', '   '],
      ['service_id', '   '],
      ['status', '   '],
    ]) {
      const beforeMalformedRepair = cache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        TEST_REPLICA_ID,
      );
      const malformedHost = buildProductionCacheRefreshHost({
        cache,
        authoritativeRow: {
          ...buildAuthoritativeServiceRow(),
          [fieldName]: malformedValue,
        },
      });
      const malformedAligned = await malformedHost.refreshAuthoritativeCacheRow(
        SYSTEM_TABLE_NAME.SERVICES,
        TEST_REPLICA_ID,
      );
      t.equal(
        malformedAligned,
        false,
        `${fieldName}=${JSON.stringify(malformedValue)} is incomplete`,
      );
      t.same(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID),
        beforeMalformedRepair,
        'malformed authority cannot mutate the cache',
      );
    }

    const failedRow = {
      ...buildAuthoritativeServiceRow(),
      status: 'failed',
      state_entered_at: 3000,
      updated_at: 3000,
    };
    const failedHost = buildProductionCacheRefreshHost({
      cache,
      authoritativeRow: failedRow,
    });
    const activeAligned = await failedHost.refreshAuthoritativeCacheRow(
      SYSTEM_TABLE_NAME.SERVICES,
      TEST_REPLICA_ID,
      {expectedFields: {status: ReplicaStatus.ACTIVE}},
    );

    t.equal(activeAligned, false, 'newer FAILED truth cannot satisfy ACTIVE');
    t.equal(
      cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID).status,
      'failed',
      'the cache may align to newer truth without releasing ACTIVE completion',
    );
  },
);

test(
  'ACTIVE terminal handoff rejects a silently dropped production cache repair',
  async (t) => {
    const cache = new SystemTableCache();
    const authoritativeRow = buildAuthoritativeServiceRow();
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      {...authoritativeRow, status: 'syncing'},
    );
    const coordinator = createTestCoordinator({
      nodeId: TEST_NODE_ID,
      cdcIntegrationService: buildProductionCacheRefreshHost({
        cache,
        authoritativeRow,
        dropRepair: true,
      }),
    });
    const operation = buildSyncingAddOperation();
    const completedOperationIds = [];
    const scheduledOperationIds = [];
    coordinator.workflowOwner.completeOperation =
      async (completedOperation) => {
        completedOperationIds.push(completedOperation.operationId);
      };
    coordinator.workflowOwner.scheduleObservedProgressRetry =
      (operationId) => {
        scheduledOperationIds.push(operationId);
        return true;
      };

    try {
      const deferred = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);

      t.equal(deferred, true, 'a dropped repair remains owned progress');
      t.same(
        completedOperationIds,
        [],
        'an invoked mutation is not accepted as proof of cache alignment',
      );
      t.same(
        scheduledOperationIds,
        [TEST_OPERATION_ID],
        'the workflow retains an independent retry wake-up',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID).status,
        'syncing',
        'the unchanged cache remains observably divergent',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'ACTIVE target reconciliation fails closed without the cache repair port',
  async (t) => {
    const coordinator = createTestCoordinator({
      nodeId: TEST_NODE_ID,
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
        async updateSystemTableRow() {
          return {success: true};
        },
      },
    });
    const operation = buildSyncingAddOperation();
    const completedOperationIds = [];
    const scheduledOperationIds = [];
    coordinator.workflowOwner.completeOperation =
      async (completedOperation) => {
        completedOperationIds.push(completedOperation.operationId);
      };
    coordinator.workflowOwner.scheduleObservedProgressRetry =
      (operationId) => {
        scheduledOperationIds.push(operationId);
        return true;
      };

    try {
      const deferred = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);

      t.equal(deferred, true, 'missing repair remains owned progress');
      t.same(
        completedOperationIds,
        [],
        'missing capability cannot release terminal workflow state',
      );
      t.same(
        scheduledOperationIds,
        [TEST_OPERATION_ID],
        'the owner retains a retry instead of accepting ambiguous absence',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'runtime ACTIVE outcome retains bounded retry ownership and cannot retire its ' +
    'source before exact SERVICES visibility',
  async (t) => {
    const entityId = 'svc-runtime-active-handoff';
    const targetReplicaId = `${entityId}-r3`;
    const operation = buildSyncingReplaceOperation();
    operation.operationId = 'runtime-active-cache-handoff-replace';
    operation.partitionId = entityId;
    operation.entityType = UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE;
    operation.entityId = entityId;
    operation.replicaId = targetReplicaId;
    const cache = new SystemTableCache();
    const authoritativeRow = {
      ...buildAuthoritativeServiceRow({
        service_id: targetReplicaId,
        replica_id: targetReplicaId,
        service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        partition_id: null,
      }),
    };
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      {...authoritativeRow, status: ReplicaStatus.SYNCING},
    );
    const cacheRefreshHost = buildProductionCacheRefreshHost({
      cache,
      authoritativeRow,
      dropRepair: true,
    });
    const coordinator = createTestCoordinator({
      nodeId: TEST_SOURCE_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: cacheRefreshHost,
    });
    const sourceRetirementOperationIds = [];
    coordinator.repository.getOperationByIdVisibilityObservation =
      async () => ({
        state: 'present',
        operation,
        deferredOutcome: null,
        retryAfterMs: null,
      });
    coordinator.workflowOwner.reconcileReplaceActualActive =
      async (replaceOperation) => {
        sourceRetirementOperationIds.push(replaceOperation.operationId);
        return true;
      };
    const outcome = Object.freeze({
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: operation.operationId,
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.ACTIVE,
      [EXECUTOR_OUTCOME_FIELD.REPLICA_ID]: targetReplicaId,
      [EXECUTOR_OUTCOME_FIELD.PARTITION_ID]: entityId,
      [EXECUTOR_OUTCOME_FIELD.TIMESTAMP]: Date.now(),
    });

    try {
      coordinator.workflowOwner.retainDeliveredCreateProgress(
        {
          ...operation,
          status: ReplicaStatus.PENDING,
          workflowStep: WORKFLOW_STEP.SENDING,
        },
        {status: ReplicaOperationResponseStatus.IN_PROGRESS},
      );
      t.equal(
        coordinator.workflowOwner.observedProgressRetryTimerByOperationId.size,
        1,
        'production dispatch already owns delivered-create progress',
      );
      await coordinator.workflowOwner.reconcileExecutorOutcome(outcome);

      t.same(
        sourceRetirementOperationIds,
        [],
        'executor evidence cannot retire the source early',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryTimerByOperationId.size,
        1,
        'one bounded executor-outcome retry owns delayed visibility',
      );
      t.equal(
        coordinator.workflowOwner.observedProgressRetryTimerByOperationId.size,
        0,
        'executor evidence consumes the earlier dispatch retry owner',
      );

      cache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES,
        CDC_OPERATION.UPSERT,
        authoritativeRow,
      );
      await coordinator.workflowOwner.reconcileExecutorOutcome(outcome);
      t.same(
        sourceRetirementOperationIds,
        [operation.operationId],
        'the source retires once after exact target visibility',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryTimerByOperationId.size,
        0,
        'successful handoff consumes retry ownership',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'runtime recovery fails an opaque ACTIVE target and does not treat source ' +
    'FAILED as retirement proof',
  async (t) => {
    const coordinator = createTestCoordinator({
      nodeId: TEST_SOURCE_NODE_ID,
      enableTimeouts: false,
    });
    const operation = buildSyncingReplaceOperation();
    operation.entityType = UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE;
    operation.entityId = 'svc-runtime-legacy-recovery';
    operation.replicaId = 'replace-replica-legacy-runtime';
    const failedOperationIds = [];
    const sourceRetirementOperationIds = [];
    coordinator.workflowOwner.failOperation =
      async (failedOperation) => {
        failedOperationIds.push(failedOperation.operationId);
      };
    coordinator.workflowOwner.reconcileReplaceActualActive =
      async (replaceOperation) => {
        sourceRetirementOperationIds.push(replaceOperation.operationId);
        return true;
      };

    try {
      await coordinator.workflowOwner.reconcileActiveReplicaStatus(operation);

      t.same(
        failedOperationIds,
        [operation.operationId],
        'the operation owner fails the invalid legacy workflow',
      );
      t.same(
        sourceRetirementOperationIds,
        [],
        'invalid target evidence never starts source retirement',
      );
      t.equal(
        coordinator.workflowOwner.isActiveReplaceSourceRetirementObserved(
          operation,
          `${operation.entityId}-r1`,
          {
            state: 'present',
            lifecycleStatus: ReplicaStatus.FAILED,
          },
        ),
        false,
        'generic runtime FAILED is not authoritative retirement evidence',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);
