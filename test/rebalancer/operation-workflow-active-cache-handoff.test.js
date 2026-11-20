import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATION,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {areAuthoritativeSystemTableCacheRowsAligned} from
  '../../src/cache/system-table-cache-authoritative-reconciliation.js';
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
import {
  buildDerivedPriorityPartitionSummary,
  isPrioritySpreadHolderServiceRow,
} from
  '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  normalizeNodeIdList,
  normalizePositiveInteger,
} from '../../src/control-plane/membership-publication-row-helpers.js';

const TEST_NODE_ID = 'active-cache-handoff-owner';
const TEST_OPERATION_ID = 'active-cache-handoff-operation';
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_SOURCE_NODE_ID = 'active-cache-handoff-source';
const TEST_REPLACE_OPERATION_ID =
  'active-cache-handoff-replace-operation';
const TEST_COMMITTED_OUTCOME = Object.freeze({
  committed: true,
  disposition: 'updated',
});

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
  host.executeAuthoritativeSystemTableRead =
    async () => ({success: true, rows: [authoritativeRow]});
  host.insertSystemTableRow = async () => ({success: true});
  host.updateSystemTableRow = async () => ({success: true});
  return host;
}

function createDroppedRepairHandoffFixture() {
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
  return {cache, cacheRefreshHost, coordinator, timerHandles};
}

function createDeferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return {promise, resolve: resolvePromise};
}

function buildCreateOutcome(
  operationId,
  outcomeType,
  workflowStep,
  timestamp,
) {
  return Object.freeze({
    [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: operationId,
    [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]: outcomeType,
    [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: workflowStep,
    [EXECUTOR_OUTCOME_FIELD.REPLICA_ID]: TEST_REPLICA_ID,
    [EXECUTOR_OUTCOME_FIELD.PARTITION_ID]: TEST_PARTITION_ID,
    [EXECUTOR_OUTCOME_FIELD.TIMESTAMP]: timestamp,
    [EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE]:
      outcomeType === EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED ?
        'definitive ACTIVE persistence failure' :
        null,
  });
}

async function assertFailureSupersedesBlockedActive(
  t,
  {
    operation,
    operationId,
    activeHandoffReady = false,
    activeHandoffThrows = false,
  },
) {
  const {
    coordinator,
    timerHandles,
  } = createDroppedRepairHandoffFixture();
  const activeHandoffStarted = createDeferred();
  const releaseActiveHandoff = createDeferred();
  const completedOperationIds = [];
  const failedOperationIds = [];
  const sourceRetirementOperationIds = [];
  const activeOutcome = buildCreateOutcome(
    operationId,
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
    WORKFLOW_STEP.ACTIVE,
    1,
  );
  const failedOutcome = buildCreateOutcome(
    operationId,
    EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
    WORKFLOW_STEP.FAILED,
    2,
  );
  coordinator.repository.getOperationByIdVisibilityObservation =
    async () => ({
      state: 'present',
      operation,
      deferredOutcome: null,
      retryAfterMs: null,
    });
  coordinator.workflowOwner.confirmActiveReplicaTerminalHandoff =
    async () => {
      activeHandoffStarted.resolve();
      await releaseActiveHandoff.promise;
      if (activeHandoffThrows) {
        throw new Error('non-retryable ACTIVE owner reconcile failure');
      }
      return activeHandoffReady;
    };
  coordinator.workflowOwner.completeOperation = async (completedOperation) => {
    completedOperationIds.push(completedOperation.operationId);
    return TEST_COMMITTED_OUTCOME;
  };
  coordinator.workflowOwner.reconcileReplaceActualActive =
    async (replaceOperation) => {
      sourceRetirementOperationIds.push(replaceOperation.operationId);
      return true;
    };
  coordinator.workflowOwner.failOperation = async (failedOperation) => {
    failedOperationIds.push(failedOperation.operationId);
    return TEST_COMMITTED_OUTCOME;
  };

  try {
    coordinator.workflowOwner.retainExecutorOutcomeRetryPayload(
      operationId,
      activeOutcome,
    );
    const activeRedrive =
      coordinator.workflowOwner.redriveExecutorOutcomeReconcile(operationId);
    await activeHandoffStarted.promise;

    coordinator.workflowOwner.retainExecutorOutcomeRetryPayload(
      operationId,
      failedOutcome,
    );
    await coordinator.workflowOwner
      .redriveExecutorOutcomeReconcile(operationId);
    t.equal(
      coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId
        .get(operationId)?.outcomeType,
      EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
      'newer definitive failure is retained while ACTIVE owns the lane',
    );

    releaseActiveHandoff.resolve();
    await activeRedrive;

    if (activeHandoffReady) {
      t.same(
        failedOperationIds,
        [operationId],
        'newer failure is applied instead of stale ready ACTIVE',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId
          .has(operationId),
        false,
        'applied failure consumes retry ownership',
      );
      t.equal(
        timerHandles.length,
        0,
        'the owner immediately re-drives newer evidence without a timer',
      );
      t.same(
        completedOperationIds,
        [],
        'stale ready ACTIVE does not complete the operation',
      );
      t.same(
        sourceRetirementOperationIds,
        [],
        'stale ready ACTIVE does not release REPLACE source retirement',
      );
      return;
    }

    t.equal(
      coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId
        .get(operationId)?.outcomeType,
      EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
      'stale ACTIVE reconcile exit preserves the retained failure',
    );
    t.equal(
      timerHandles.length,
      1,
      'the current retained evidence has exactly one retry timer',
    );
    t.same(
      completedOperationIds,
      [],
      'stale ACTIVE does not complete the operation',
    );
    t.same(
      sourceRetirementOperationIds,
      [],
      'stale ACTIVE does not release REPLACE source retirement',
    );

    await timerHandles[0].callback();

    t.same(
      failedOperationIds,
      [operationId],
      'the retry applies the definitive failure',
    );
    t.equal(
      coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId
        .has(operationId),
      false,
      'applied failure consumes the retained evidence',
    );
  } finally {
    releaseActiveHandoff.resolve();
    await coordinator.shutdown();
  }
}

test(
  'direct priority REPLACE ACTIVE outcome retains source retirement until ' +
    'the authoritative SERVICES row is aligned into cache',
  async (t) => {
    const {
      cache,
      cacheRefreshHost,
      coordinator,
      timerHandles,
    } = createDroppedRepairHandoffFixture();
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
  'direct priority ADD ACTIVE outcome retains completion ownership until ' +
    'the authoritative SERVICES row is aligned into cache',
  async (t) => {
    const {
      cache,
      cacheRefreshHost,
      coordinator,
      timerHandles,
    } = createDroppedRepairHandoffFixture();
    const operation = buildSyncingAddOperation();
    const completedOperationIds = [];
    const outcome = Object.freeze({
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: TEST_OPERATION_ID,
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
    coordinator.workflowOwner.completeOperation = async (completedOperation) => {
      completedOperationIds.push(completedOperation.operationId);
      return TEST_COMMITTED_OUTCOME;
    };

    try {
      await coordinator.workflowOwner.reconcileExecutorOutcome(outcome);

      t.same(
        completedOperationIds,
        [],
        'silently dropped cache repair cannot complete the ADD',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId
          .get(TEST_OPERATION_ID)?.workflowStep,
        WORKFLOW_STEP.ACTIVE,
        'the ADD retains provisional ACTIVE evidence under one retry owner',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryTimerByOperationId
          .has(TEST_OPERATION_ID),
        true,
        'the retained ADD evidence has a bounded retry wake-up',
      );

      cacheRefreshHost.cacheMutationTarget = cache;
      await coordinator.workflowOwner.reconcileExecutorOutcome(outcome);

      t.same(
        completedOperationIds,
        [TEST_OPERATION_ID],
        'the ADD completes only after exact authoritative cache alignment',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID).status,
        ReplicaStatus.ACTIVE,
        'the authoritative target row is ACTIVE before completion',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId
          .has(TEST_OPERATION_ID),
        false,
        'successful ADD alignment consumes retained executor evidence',
      );
      t.equal(
        timerHandles.some((timerHandle) => timerHandle.cleared),
        true,
        'successful ADD alignment clears its retry timer',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'newer FAILED evidence supersedes blocked provisional ACTIVE owner exits',
  async (t) => {
    await t.test('ADD completion remains blocked', async (t) => {
      await assertFailureSupersedesBlockedActive(t, {
        operation: buildSyncingAddOperation(),
        operationId: TEST_OPERATION_ID,
      });
    });
    await t.test('REPLACE source retirement remains blocked', async (t) => {
      await assertFailureSupersedesBlockedActive(t, {
        operation: buildSyncingReplaceOperation(),
        operationId: TEST_REPLACE_OPERATION_ID,
      });
    });
    await t.test(
      'non-retryable ACTIVE reconcile error preserves FAILED retry ownership',
      async (t) => {
        await assertFailureSupersedesBlockedActive(t, {
          operation: buildSyncingAddOperation(),
          operationId: TEST_OPERATION_ID,
          activeHandoffThrows: true,
        });
      },
    );
    await t.test('ready ADD handoff cannot consume newer FAILED', async (t) => {
      await assertFailureSupersedesBlockedActive(t, {
        operation: buildSyncingAddOperation(),
        operationId: TEST_OPERATION_ID,
        activeHandoffReady: true,
      });
    });
    await t.test(
      'ready REPLACE handoff cannot retire source over newer FAILED',
      async (t) => {
        await assertFailureSupersedesBlockedActive(t, {
          operation: buildSyncingReplaceOperation(),
          operationId: TEST_REPLACE_OPERATION_ID,
          activeHandoffReady: true,
        });
      },
    );
  },
);

test(
  'newer FAILED survives a stale ACTIVE empty-visibility stop',
  async (t) => {
    const {coordinator} = createDroppedRepairHandoffFixture();
    const operation = buildSyncingAddOperation();
    const firstVisibilityStarted = createDeferred();
    const releaseFirstVisibility = createDeferred();
    const failedOperationIds = [];
    const completedOperationIds = [];
    let visibilityReadCount = 0;
    coordinator.repository.getOperationByIdVisibilityObservation =
      async () => {
        visibilityReadCount += 1;
        if (visibilityReadCount === 1) {
          firstVisibilityStarted.resolve();
          return releaseFirstVisibility.promise;
        }
        return {
          state: 'present',
          operation,
          deferredOutcome: null,
          retryAfterMs: null,
        };
      };
    coordinator.workflowOwner.completeOperation = async (completedOperation) => {
      completedOperationIds.push(completedOperation.operationId);
      return TEST_COMMITTED_OUTCOME;
    };
    coordinator.workflowOwner.failOperation = async (failedOperation) => {
      failedOperationIds.push(failedOperation.operationId);
      return TEST_COMMITTED_OUTCOME;
    };
    const activeOutcome = buildCreateOutcome(
      TEST_OPERATION_ID,
      EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE,
      WORKFLOW_STEP.ACTIVE,
      1,
    );
    const failedOutcome = buildCreateOutcome(
      TEST_OPERATION_ID,
      EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED,
      WORKFLOW_STEP.FAILED,
      2,
    );

    try {
      coordinator.workflowOwner.retainExecutorOutcomeRetryPayload(
        TEST_OPERATION_ID,
        activeOutcome,
      );
      const activeRedrive = coordinator.workflowOwner
        .redriveExecutorOutcomeReconcile(TEST_OPERATION_ID);
      await firstVisibilityStarted.promise;
      coordinator.workflowOwner.retainExecutorOutcomeRetryPayload(
        TEST_OPERATION_ID,
        failedOutcome,
      );
      releaseFirstVisibility.resolve({
        state: 'empty',
        operation: null,
        deferredOutcome: null,
        retryAfterMs: null,
      });
      await activeRedrive;

      t.equal(
        visibilityReadCount,
        2,
        'the same owner re-drives newer evidence after the stale stop',
      );
      t.same(
        failedOperationIds,
        [TEST_OPERATION_ID],
        'newer definitive failure is applied after fresh visibility',
      );
      t.same(
        completedOperationIds,
        [],
        'stale empty visibility cannot complete the ADD',
      );
      t.equal(
        coordinator.workflowOwner.executorOutcomeRetryPayloadByOperationId
          .has(TEST_OPERATION_ID),
        false,
        'applied failure consumes retry ownership',
      );
    } finally {
      releaseFirstVisibility.resolve();
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
    coordinator.workflowOwner.completeOperation = async (completedOperation) => {
      completedOperationIds.push(completedOperation.operationId);
      return TEST_COMMITTED_OUTCOME;
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
        'waiting',
        'the unresolved cache handoff reports waiting while retaining retry ownership',
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

      t.equal(completed, 'completed', 'aligned ACTIVE evidence completes normally');
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
    coordinator.workflowOwner.completeOperation = async (completedOperation) => {
      completedOperationIds.push(completedOperation.operationId);
      return TEST_COMMITTED_OUTCOME;
    };
    coordinator.workflowOwner.scheduleObservedProgressRetry = (operationId) => {
      scheduledOperationIds.push(operationId);
      return true;
    };

    try {
      const deferred = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);
      t.equal(deferred, 'waiting', 'wrong-node authority reports waiting');
      t.same(completedOperationIds, [], 'terminal state remains blocked');
      t.same(scheduledOperationIds, [TEST_OPERATION_ID]);
      t.same(refreshCalls[0]?.options, {
        expectedFields: {status: ReplicaStatus.ACTIVE, node_id: TEST_NODE_ID},
      });
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID).node_id,
        wrongNodeId,
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
    coordinator.workflowOwner.completeOperation = async (completedOperation) => {
      completedOperationIds.push(completedOperation.operationId);
      return TEST_COMMITTED_OUTCOME;
    };

    try {
      const completed = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);
      const cachedRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID);
      t.equal(completed, 'completed');
      t.same(completedOperationIds, [TEST_OPERATION_ID]);
      t.equal(cachedRow.status, 'active');
      t.equal(cachedRow.state_entered_at, 2000);
      t.equal(cachedRow.raft_role, 'follower');
      t.equal(cachedRow.updated_at, 2000);
      t.equal(cachedRow.updated_at_hlc, '2000-1-active-cache-handoff-owner');
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
    coordinator.workflowOwner.completeOperation = async (completedOperation) => {
      completedOperationIds.push(completedOperation.operationId);
      return TEST_COMMITTED_OUTCOME;
    };
    coordinator.workflowOwner.scheduleObservedProgressRetry = (operationId) => {
      scheduledOperationIds.push(operationId);
      return true;
    };

    try {
      const deferred = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);
      t.equal(deferred, 'waiting', 'a dropped repair reports waiting');
      t.same(completedOperationIds, []);
      t.same(scheduledOperationIds, [TEST_OPERATION_ID]);
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID).status,
        'syncing',
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
    coordinator.workflowOwner.completeOperation = async (completedOperation) => {
      completedOperationIds.push(completedOperation.operationId);
      return TEST_COMMITTED_OUTCOME;
    };
    coordinator.workflowOwner.scheduleObservedProgressRetry =
      (operationId) => {
        scheduledOperationIds.push(operationId);
        return true;
      };

    try {
      const deferred = await coordinator.workflowOwner
        .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);
      t.equal(deferred, 'waiting', 'missing repair reports waiting');
      t.same(completedOperationIds, []);
      t.same(scheduledOperationIds, [TEST_OPERATION_ID]);
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
    coordinator.workflowOwner.failOperation = async (failedOperation) => {
      failedOperationIds.push(failedOperation.operationId);
      return TEST_COMMITTED_OUTCOME;
    };
    coordinator.workflowOwner.reconcileReplaceActualActive = async (
      replaceOperation,
    ) => {
      sourceRetirementOperationIds.push(replaceOperation.operationId);
      return true;
    };

    try {
      await coordinator.workflowOwner.reconcileActiveReplicaStatus(operation);
      t.same(failedOperationIds, [operation.operationId]);
      t.same(sourceRetirementOperationIds, []);
      t.equal(
        coordinator.workflowOwner.isActiveReplaceSourceRetirementObserved(
          operation,
          `${operation.entityId}-r1`,
          {state: 'present', lifecycleStatus: ReplicaStatus.FAILED},
        ),
        false,
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

const PEER_NODE_IDS = Object.freeze([
  'active-cache-handoff-peer-1',
  'active-cache-handoff-peer-2',
]);

function seedPrioritySpreadPeers(cache) {
  PEER_NODE_IDS.forEach((nodeId, index) => {
    const replicaId = `${TEST_PARTITION_ID}-r${index + 1}`;
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      buildAuthoritativeServiceRow({
        service_id: replicaId,
        replica_id: replicaId,
        node_id: nodeId,
        address: `${nodeId}/partition/${replicaId}`,
      }),
    );
  });
}

function projectTargetPartitionSpread(cache) {
  const summary = buildDerivedPriorityPartitionSummary(
    {
      partitionRows: [{partition_id: TEST_PARTITION_ID, replica_count: 3}],
      serviceRows: cache.getAll(SYSTEM_TABLE_NAME.SERVICES),
      locallyEligibleNodeIds: [...PEER_NODE_IDS, TEST_NODE_ID],
    },
    {normalizeNodeIdList, normalizePositiveInteger},
  );
  return {
    missing: summary.missingPartitionIds.includes(TEST_PARTITION_ID),
    block:
      summary.blockedPartitions.find(
        (entry) => entry.partitionId === TEST_PARTITION_ID,
      ) || null,
  };
}

function expectedExclusionBefore(cachedTargetRow) {
  if (cachedTargetRow.status !== 'active') {
    return {[`status_${cachedTargetRow.status}`]: 1};
  }
  return cachedTargetRow.raft_role ? null : {raft_role_missing: 1};
}

async function driveHandoffOverCachedTarget(
  t,
  cachedTargetRow,
  authorityRow,
  expectedRow = authorityRow,
  reconciliationOptions = {},
) {
  const cache = new SystemTableCache();
  seedPrioritySpreadPeers(cache);
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.SERVICES,
    CDC_OPERATION.UPSERT,
    cachedTargetRow,
  );
  t.same(
    projectTargetPartitionSpread(cache).block?.exclusionReasonCounts ?? null,
    expectedExclusionBefore(cachedTargetRow),
  );
  t.equal(
    areAuthoritativeSystemTableCacheRowsAligned(
      SYSTEM_TABLE_NAME.SERVICES,
      cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID),
      authorityRow,
      reconciliationOptions,
    ),
    false,
  );
  const coordinator = createTestCoordinator({
    nodeId: TEST_NODE_ID,
    cdcIntegrationService: buildProductionCacheRefreshHost({
      cache,
      authoritativeRow: authorityRow,
    }),
  });
  const operation = buildSyncingAddOperation();
  const completedOperationIds = [];
  coordinator.workflowOwner.completeOperation = async (completedOperation) => {
    completedOperationIds.push(completedOperation.operationId);
    return TEST_COMMITTED_OUTCOME;
  };
  try {
    await coordinator.workflowOwner
      .applyReconciledReplicaStatus(operation, ReplicaStatus.ACTIVE);
  } finally {
    await coordinator.shutdown();
  }
  const targetRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID);
  const spread = projectTargetPartitionSpread(cache);
  t.same(completedOperationIds, [TEST_OPERATION_ID]);
  t.same(targetRow, expectedRow);
  t.equal(isPrioritySpreadHolderServiceRow(targetRow), true);
  t.equal(spread.block, null);
  t.equal(spread.missing, false);
}

test(
  'ACTIVE terminal handoff installs the newer authoritative role over an ' +
    'older null-role cached target before the projection reads it',
  async (t) => {
    await driveHandoffOverCachedTarget(
      t,
      buildAuthoritativeServiceRow({
        status: ReplicaStatus.SYNCING,
        raft_role: null,
        state_entered_at: 5,
        previous_state: 'creating',
        updated_at: 5,
        updated_at_hlc: '5-0-services-p1-r1',
      }),
      buildAuthoritativeServiceRow({previous_state: 'syncing'}),
    );
  },
);

test(
  'ACTIVE terminal handoff repairs an ACTIVE cached target whose raft_role ' +
    'is absent instead of skipping it as already aligned',
  async (t) => {
    await driveHandoffOverCachedTarget(
      t,
      buildAuthoritativeServiceRow({raft_role: null}),
      buildAuthoritativeServiceRow({updated_at: 12}),
    );
    await driveHandoffOverCachedTarget(
      t,
      buildAuthoritativeServiceRow({raft_role: null}),
      buildAuthoritativeServiceRow(),
    );
  },
);

test(
  'ACTIVE terminal handoff keeps an owner-local voter seed held under an ' +
    'older label when authority still has no role at a newer version',
  async (t) => {
    const authorityRow = buildAuthoritativeServiceRow({raft_role: null});
    await driveHandoffOverCachedTarget(
      t,
      buildAuthoritativeServiceRow({state_entered_at: 5, updated_at: 5}),
      authorityRow,
      {...authorityRow, raft_role: 'follower'},
    );
  },
);

async function assertNullAppliedIndexRefreshScenarios(t, staleRow, rebornRow) {
  const nullWitness = {
    state: 'observed',
    role: 'LEADER',
    term: 2,
    appliedIndex: null,
    commitIndex: null,
  };
  const cache = new SystemTableCache();
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.SERVICES,
    CDC_OPERATION.UPSERT,
    staleRow,
    {sourceLogIndex: 10},
  );
  const host = buildProductionCacheRefreshHost({
    cache,
    authoritativeRow: rebornRow,
  });
  host.executeAuthoritativeSystemTableRead = async () => ({
    success: true,
    rows: [rebornRow],
    readAuthorityWitness: nullWitness,
  });
  t.equal(
    await host.refreshAuthoritativeCacheRow(
      SYSTEM_TABLE_NAME.SERVICES,
      TEST_REPLICA_ID,
      {expectedFields: {status: ReplicaStatus.ACTIVE, node_id: TEST_NODE_ID}},
    ),
    true,
  );
  t.same(cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID), rebornRow);
}

test(
  'ACTIVE terminal handoff repairs a stale cached incarnation after owner ' +
    'restart and wall-clock rollback and fences a delayed read when CDC ' +
    'installs a newer incarnation in flight',
  async (t) => {
    const rebornRow = buildAuthoritativeServiceRow({
      status: ReplicaStatus.ACTIVE,
      raft_role: 'follower',
      create_attempt_token: 'incarnation-after-restart',
      created_at: 1000,
      state_entered_at: 1000,
      updated_at: 1000,
    });
    const staleRow = buildAuthoritativeServiceRow({
      status: 'stopped',
      raft_role: 'learner',
      create_attempt_token: 'incarnation-before-restart',
      created_at: 2000,
      state_entered_at: 2000,
      updated_at: 2000,
    });
    await driveHandoffOverCachedTarget(t, staleRow, rebornRow, rebornRow, {
      authoritativeIncarnationSupersedes: true,
    });
    await assertNullAppliedIndexRefreshScenarios(t, staleRow, rebornRow);

    const oldRow = buildAuthoritativeServiceRow({
      status: ReplicaStatus.SYNCING,
      raft_role: 'learner',
      create_attempt_token: 'incarnation-old-in-flight',
      created_at: 1000,
      state_entered_at: 1000,
      updated_at: 1000,
    });
    const newCdcRow = buildAuthoritativeServiceRow({
      status: ReplicaStatus.ACTIVE,
      raft_role: 'follower',
      create_attempt_token: 'incarnation-new-cdc',
      created_at: 900,
      state_entered_at: 900,
      updated_at: 900,
      updated_at_hlc: '2000-0-services-owner',
    });
    for (const appliedIndex of [10, null]) {
      const cache = new SystemTableCache();
      cache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES,
        CDC_OPERATION.UPSERT,
        {...oldRow, updated_at_hlc: '1000-0-services-owner'},
      );
      const host = buildProductionCacheRefreshHost({
        cache,
        authoritativeRow: oldRow,
      });
      host.executeAuthoritativeSystemTableRead = async () => {
        cache.applySystemTableChange(
          SYSTEM_TABLE_NAME.SERVICES,
          CDC_OPERATION.UPSERT,
          newCdcRow,
          {sourceLogIndex: 20},
        );
        return {
          success: true,
          rows: [oldRow],
          readAuthorityWitness: {
            state: 'observed',
            role: 'LEADER',
            term: 2,
            appliedIndex,
            commitIndex: null,
            observedAtMs: 1000,
          },
        };
      };
      const aligned = await host.refreshAuthoritativeCacheRow(
        SYSTEM_TABLE_NAME.SERVICES,
        TEST_REPLICA_ID,
        {expectedFields: {status: ReplicaStatus.ACTIVE, node_id: TEST_NODE_ID}},
      );
      t.equal(aligned, true, `delayed read fenced (appliedIndex=${appliedIndex})`);
      t.same(cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REPLICA_ID), newCdcRow);
    }
  },
);
